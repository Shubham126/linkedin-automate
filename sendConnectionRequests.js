import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import dotenv from "dotenv";
import { linkedInLogin } from './actions/login.js';
import { sendConnectionRequest } from './actions/sendConnectionRequest.js';
import { sendLinkedInMessage } from './actions/sendMessage.js';
import { logConnectionRequest, updateConnectionStatus, connectionRequestExists } from './services/googleConnectionsSheetService.js';
import { sleep, randomDelay } from './utils/helpers.js';

dotenv.config();
puppeteer.use(StealthPlugin());

/**
 * Extract profile data from search results
 */
async function extractSearchProfileData(personCard) {
  try {
    const profileData = await personCard.evaluate((card) => {
      try {
        let profileUrl = '';
        const profileLink = card.querySelector('a[href*="/in/"]');
        if (profileLink) {
          profileUrl = profileLink.href.split('?')[0];
        }

        let name = '';
        const nameElement = card.querySelector('.nZnZPewNyCgelhNsWTDoAEVaxjUNeRjX span[aria-hidden="true"]');
        if (nameElement) {
          name = nameElement.textContent.trim();
        }

        let connectionDegree = '';
        const degreeElement = card.querySelector('.entity-result__badge-text span[aria-hidden="true"]');
        if (degreeElement) {
          connectionDegree = degreeElement.textContent.trim();
        }

        let headline = '';
        const headlineElement = card.querySelector('.IFwteLsnVaXDnppgYAFeYlxNsWmLbhSBIbAw');
        if (headlineElement) {
          headline = headlineElement.textContent.trim();
        }

        return { profileUrl, name, connectionDegree, headline };
      } catch (error) {
        return null;
      }
    });

    return profileData;
  } catch (error) {
    console.error('⚠️ Error extracting profile data:', error.message);
    return null;
  }
}

/**
 * Check profile actions available - UPDATED PRIORITY
 */
async function checkProfileActions(page) {
  try {
    // PRIORITY 1: Check for Connect button (highest priority)
    let connectButton = await page.$('button[aria-label*="Invite"][aria-label*="to connect"]');
    
    if (!connectButton) {
      // Try alternative Connect button selectors
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent.trim());
        const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label'));
        
        if (text === 'Connect' || (ariaLabel && ariaLabel.toLowerCase().includes('connect') && ariaLabel.toLowerCase().includes('invite'))) {
          connectButton = button;
          break;
        }
      }
    }

    if (connectButton) {
      return { action: 'connect', reason: 'Connect button found' };
    }

    // PRIORITY 2: Check for Pending button (already sent request)
    const pendingButton = await page.$('button[aria-label*="Pending"]');
    if (pendingButton) {
      return { action: 'pending', reason: 'Connection request already pending' };
    }

    // PRIORITY 3: Check for Message button (Open Profile or 1st degree)
    let messageButton = await page.$('button[aria-label*="Message"]');
    
    if (!messageButton) {
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent.trim());
        const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label'));
        
        if (text === 'Message' || (ariaLabel && ariaLabel.includes('Message'))) {
          messageButton = button;
          break;
        }
      }
    }

    if (messageButton) {
      return { action: 'message', reason: 'Message button found (Open Profile or already connected)' };
    }

    // No action available
    return { action: 'none', reason: 'No Connect or Message button found' };

  } catch (error) {
    console.error('⚠️ Error checking profile actions:', error.message);
    return { action: 'none', reason: 'Error checking buttons' };
  }
}

/**
 * Main function
 */
async function sendConnectionRequestsAutomation() {
  console.log('\n🎯 LinkedIn Connection & Messaging Automation');
  console.log('🤝 Priority 1: Send connection requests');
  console.log('💬 Priority 2: Message if no Connect button');
  console.log('📊 Tracks everything in Google Sheets');
  console.log('⚠️  Educational purposes only - violates LinkedIn ToS');
  console.log('═'.repeat(60) + '\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      "--start-maximized",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--lang=en-US"
    ],
  });

  try {
    const page = (await browser.pages())[0];
    page.setDefaultNavigationTimeout(90000);

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('🔐 Logging in...');
    const loggedIn = await linkedInLogin(page);
    if (!loggedIn) {
      console.log('❌ Login failed');
      await browser.close();
      return;
    }
    console.log('✅ Login successful!\n');

    const searchKeyword = process.env.SEARCH_KEYWORD || 'vibe coding';
    const maxActions = parseInt(process.env.MAX_CONNECTION_REQUESTS_PER_DAY) || 20;
    const addNote = process.env.ADD_NOTE_TO_CONNECTION === 'true';
    const noteTemplate = process.env.CONNECTION_NOTE_TEMPLATE || 'Hi {name}, I\'d love to connect!';
    const directMessageTemplate = process.env.DIRECT_MESSAGE_TEMPLATE || 
      'Hi {name}! I came across your profile while searching for {keyword} enthusiasts. Would love to connect and exchange ideas!';

    console.log(`🔍 Searching for: "${searchKeyword}"`);
    const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchKeyword)}`;
    
    try {
      await page.goto(searchUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 60000 
      });
    } catch (navError) {
      console.log('⚠️ Navigation timeout, continuing...');
      await sleep(5000);
    }
    
    console.log('⏳ Waiting for search results...');
    await sleep(randomDelay(8000, 12000));

    console.log('✅ Search results ready!\n');
    console.log('═'.repeat(60));

    let actionsTaken = 0;
    let requestsSent = 0;
    let messagesSent = 0;
    let skippedAlreadyContacted = 0;
    let skippedAlreadyConnected = 0;
    let skippedPending = 0;
    let currentPage = 1;
    let hasMorePages = true;

    while (actionsTaken < maxActions && hasMorePages) {
      console.log(`\n📄 Processing Page ${currentPage}`);
      console.log('─'.repeat(60));

      for (let scroll = 0; scroll < 3; scroll++) {
        await page.evaluate(() => window.scrollBy({ top: 800, behavior: 'smooth' }));
        await sleep(randomDelay(2000, 3000));
      }

      let personCards = await page.$$('li.qTpSkRrerBcUqHivKtVbqVGnMhgMkDU');
      if (personCards.length === 0) {
        personCards = await page.$$('li.reusable-search__result-container');
      }
      
      console.log(`📋 Found ${personCards.length} profiles\n`);

      if (personCards.length === 0) {
        console.log('❌ No profiles found');
        break;
      }

      let processedOnThisPage = 0;

      while (processedOnThisPage < personCards.length && actionsTaken < maxActions) {
        console.log(`👤 Profile Check ${processedOnThisPage + 1}/${personCards.length} (Actions: ${actionsTaken}/${maxActions})`);
        console.log('─'.repeat(60));

        let currentCards = await page.$$('li.qTpSkRrerBcUqHivKtVbqVGnMhgMkDU');
        if (currentCards.length === 0) {
          currentCards = await page.$$('li.reusable-search__result-container');
        }

        if (processedOnThisPage >= currentCards.length) {
          console.log('⚠️ No more cards at this position');
          break;
        }

        const card = currentCards[processedOnThisPage];

        let profileData;
        try {
          profileData = await extractSearchProfileData(card);
        } catch (e) {
          console.log('⚠️ Error extracting data, skipping...');
          processedOnThisPage++;
          continue;
        }

        if (!profileData || !profileData.profileUrl) {
          console.log('⚠️ Could not extract profile data, skipping...');
          processedOnThisPage++;
          continue;
        }

        console.log(`   👤 Name: ${profileData.name}`);
        console.log(`   🔗 URL: ${profileData.profileUrl}`);
        console.log(`   📊 Connection: ${profileData.connectionDegree}`);

        // Check if already 1st or 2nd degree
        if (profileData.connectionDegree.includes('1st') || profileData.connectionDegree.includes('2nd')) {
          console.log('   ⏭️ Already connected (1st/2nd degree), skipping...');
          skippedAlreadyConnected++;
          processedOnThisPage++;
          continue;
        }

        // Check if already contacted
        const alreadyContacted = await connectionRequestExists(profileData.profileUrl);
        if (alreadyContacted) {
          console.log('   ⏭️ Already contacted (found in tracking sheet), skipping...');
          skippedAlreadyContacted++;
          processedOnThisPage++;
          continue;
        }

        console.log('   🌐 Visiting profile...');
        try {
          await page.goto(profileData.profileUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
          });
        } catch (e) {
          console.log('   ⚠️ Navigation timeout, continuing...');
        }

        await sleep(randomDelay(4000, 6000));

        // Check what actions are available
        console.log('   🔍 Checking available actions...');
        const { action, reason } = await checkProfileActions(page);
        
        console.log(`   📋 Action: ${action.toUpperCase()} - ${reason}`);

        if (action === 'connect') {
          // SEND CONNECTION REQUEST
          console.log('   🤝 Sending connection request...');
          
          let noteText = '';
          if (addNote) {
            noteText = noteTemplate.replace('{name}', profileData.name.split(' ')[0]);
          }

          const sent = await sendConnectionRequest(page, profileData.name, addNote, noteText);

          if (sent) {
            requestsSent++;
            actionsTaken++;
            
            await logConnectionRequest(profileData, addNote ? noteText : '');
            
            console.log(`   ✅ Connection request sent! (Requests: ${requestsSent}, Messages: ${messagesSent})`);
          } else {
            console.log('   ❌ Failed to send connection request');
          }

        } else if (action === 'message') {
          // SEND DIRECT MESSAGE
          console.log('   💬 Sending direct message...');
          
          const firstName = profileData.name.split(' ')[0];
          let messageText = directMessageTemplate
            .replace('{name}', firstName)
            .replace('{keyword}', searchKeyword);

          const sent = await sendLinkedInMessage(page, profileData.profileUrl, messageText);

          if (sent) {
            messagesSent++;
            actionsTaken++;
            
            await logConnectionRequest({
              ...profileData,
              connectionDegree: 'Open Profile / Already Connected'
            }, messageText);
            
            await updateConnectionStatus(profileData.profileUrl, 'Direct Messaged', true, messageText);
            
            console.log(`   ✅ Direct message sent! (Requests: ${requestsSent}, Messages: ${messagesSent})`);
          } else {
            console.log('   ❌ Failed to send message');
          }

        } else if (action === 'pending') {
          console.log('   ⏭️ Connection request already pending, skipping...');
          skippedPending++;
          
        } else {
          console.log('   ⚠️ No action available on this profile');
        }

        processedOnThisPage++;

        const backDelay = randomDelay(5000, 8000);
        console.log(`   ⏳ Pausing ${Math.round(backDelay/1000)}s...`);
        await sleep(backDelay);

        if (actionsTaken < maxActions && processedOnThisPage < currentCards.length) {
          console.log('   🔙 Returning to search...');
          try {
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          } catch (e) {
            console.log('   ⚠️ Navigation slow...');
          }
          
          await sleep(randomDelay(4000, 6000));
        }
      }

      if (actionsTaken < maxActions) {
        console.log('\n📄 Checking for next page...');
        
        const nextButton = await page.$('button[aria-label="Next"]');
        if (nextButton) {
          const isDisabled = await nextButton.evaluate(el => el.disabled);
          
          if (!isDisabled) {
            console.log('📄 Going to next page...');
            await nextButton.click();
            await sleep(randomDelay(5000, 8000));
            currentPage++;
          } else {
            hasMorePages = false;
          }
        } else {
          hasMorePages = false;
        }
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('✅ AUTOMATION COMPLETED!');
    console.log('═'.repeat(60));
    console.log(`\n📊 Statistics:`);
    console.log(`   • Connection Requests Sent: ${requestsSent}`);
    console.log(`   • Direct Messages Sent: ${messagesSent}`);
    console.log(`   • Total Actions: ${actionsTaken}`);
    console.log(`\n⏭️  Skipped:`);
    console.log(`   • Already Contacted: ${skippedAlreadyContacted}`);
    console.log(`   • Already Connected: ${skippedAlreadyConnected}`);
    console.log(`   • Request Pending: ${skippedPending}`);
    console.log(`\n📄 Pages Processed: ${currentPage}`);
    console.log(`\n🔗 Tracking Sheet: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_CONNECTIONS_SHEET_ID}`);
    console.log('═'.repeat(60));

    await sleep(10000);

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error(err.stack);
  }
}

sendConnectionRequestsAutomation();
