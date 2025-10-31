import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { linkedInLogin } from './actions/login.js';
import { sendConnectionRequest } from './actions/sendConnectionRequest.js';
import { sleep, randomDelay } from './utils/helpers.js';
import { getCookies, saveCookies } from './services/cookieService.js';
import { getProxyArgs, authenticateProxy } from './utils/proxyHelper.js';
import { logConnectionRequest } from './services/googleConnectionsSheetService.js';

dotenv.config();
puppeteer.use(StealthPlugin());

/**
 * Human-like click function (inline implementation)
 */
async function humanLikeClick(page, element, options = {}) {
  const {
    minDelay = 300,
    maxDelay = 800,
    moveSteps = 10,
    jitter = true
  } = options;

  try {
    const boundingBox = await element.boundingBox();
    if (!boundingBox) {
      await element.click();
      return true;
    }

    let targetX = boundingBox.x + boundingBox.width / 2;
    let targetY = boundingBox.y + boundingBox.height / 2;

    if (jitter) {
      targetX += (Math.random() - 0.5) * 10;
      targetY += (Math.random() - 0.5) * 10;
    }

    const currentPos = { x: 960, y: 540 };
    const steps = moveSteps;

    for (let i = 0; i < steps; i++) {
      const progress = i / steps;
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const x = currentPos.x + (targetX - currentPos.x) * easeProgress;
      const y = currentPos.y + (targetY - currentPos.y) * easeProgress;

      await page.mouse.move(x, y);
      await sleep(randomDelay(10, 30));
    }

    await page.mouse.move(targetX, targetY);
    await sleep(randomDelay(minDelay, maxDelay));
    await page.mouse.click(targetX, targetY);
    await sleep(randomDelay(200, 400));

    return true;

  } catch (error) {
    try {
      await element.click();
      return true;
    } catch (e) {
      return false;
    }
  }
}

/**
 * Extract profile data from search results
 */
async function extractSearchProfileData(personCard) {
  try {
    const profileData = await personCard.evaluate((card) => {
      try {
        // Get profile URL from first 'a' tag with /in/
        let profileUrl = '';
        const profileLink = card.querySelector('a[href*="/in/"]');
        if (profileLink) {
          profileUrl = profileLink.href.split('?')[0];
        }

        // Get name from the profile link text
        let name = 'Unknown';
        const nameSpan = card.querySelector('a[href*="/in/"] span[aria-hidden="true"]');
        if (nameSpan) {
          name = nameSpan.textContent.trim();
        }

        // Get connection degree (1st, 2nd, 3rd, Open Network)
        let connectionDegree = '';
        const degreeSpan = card.querySelector('.entity-result__badge-text span[aria-hidden="true"]');
        if (degreeSpan) {
          connectionDegree = degreeSpan.textContent.trim();
        }

        // Get headline
        let headline = '';
        const headlineDiv = card.querySelector('div.OiirvpInMLuzeczYhJxvFuDuiuHxENkKTCg');
        if (headlineDiv) {
          headline = headlineDiv.textContent.trim();
        }

        // Get location
        let location = '';
        const locationDiv = card.querySelector('div.GsHgiSLvYaZkNpDqOEblEZZtsuotYRBZQtc');
        if (locationDiv) {
          location = locationDiv.textContent.trim();
        }

        return { profileUrl, name, connectionDegree, headline, location };
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
 * Get connection type for display
 */
function getConnectionType(connectionDegree) {
  if (connectionDegree.includes('1st')) return '1st Degree (Connected)';
  if (connectionDegree.includes('2nd')) return '2nd Degree (Friend of Friend)';
  if (connectionDegree.includes('3rd')) return '3rd Degree';
  if (connectionDegree.includes('Open Network')) return 'Open Network';
  return 'Unknown';
}

/**
 * Main automation function
 */
async function sendConnectionRequestsAutomation() {
  const proxyArgs = getProxyArgs();

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--lang=en-US',
      '--accept-lang=en-US,en;q=0.9',
      ...proxyArgs
    ]
  });

  try {
    const page = (await browser.pages())[0];
    page.setDefaultNavigationTimeout(120000);
    
    await authenticateProxy(page);

    console.log('\n🎯 LinkedIn Connection Requests Automation');
    console.log('🤝 Sends to 1st, 2nd, 3rd degree connections');
    console.log('🖱️  Human-like clicking behavior');
    console.log('📊 Saves to Google Sheets');
    console.log('⚠️  Educational purposes only - violates LinkedIn ToS');
    console.log('═'.repeat(60) + '\n');

    // Get credentials from environment
    const username = process.env.LINKEDIN_USERNAME;
    const password = process.env.LINKEDIN_PASSWORD;

    if (!username) {
      console.error('❌ LINKEDIN_USERNAME is required');
      await browser.close();
      return;
    }

    console.log(`👤 Using account: ${username}`);

    let loggedIn = false;

    // ==================== TRY SHARED COOKIES FIRST ====================
    console.log('🍪 Checking for shared cookies...');
    const savedCookies = await getCookies(username);
    
    if (savedCookies && savedCookies.length > 0) {
      console.log(`✅ Found ${savedCookies.length} shared cookies`);
      console.log('🔄 Restoring session from shared cookies...');
      
      try {
        await page.setCookie(...savedCookies);
        await page.goto('https://www.linkedin.com/feed/', { 
          waitUntil: 'domcontentloaded',
          timeout: 120000 
        });

        await sleep(3000);

        const currentUrl = page.url();
        if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork')) {
          console.log('✅ Session restored! Using shared cookies.\n');
          loggedIn = true;
        }
      } catch (error) {
        console.log('⚠️ Shared cookies invalid, need fresh login');
      }
    }

    // ==================== LOGIN IF NEEDED ====================
    if (!loggedIn) {
      if (!password) {
        console.error('❌ LINKEDIN_PASSWORD required for login');
        await browser.close();
        return;
      }

      console.log('🔐 Logging in with credentials...');
      loggedIn = await linkedInLogin(page, username, password, true);
      
      if (!loggedIn) {
        console.log('❌ Login failed');
        await browser.close();
        return;
      }

      console.log('✅ Login successful!');
      console.log('💾 Saving session cookies for future use...\n');

      // Save cookies for future use
      const cookies = await page.cookies();
      await saveCookies(username, cookies);
    }

    // Set headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Get search parameters
    const searchKeyword = process.env.SEARCH_KEYWORD || 'developer';
    const maxActions = parseInt(process.env.MAX_CONNECTION_REQUESTS_PER_DAY) || 20;

    console.log(`🔍 Searching for: "${searchKeyword}"`);
    console.log(`🎯 Target: ${maxActions} connection requests\n`);

    // Navigate to search
    const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchKeyword)}`;
    
    console.log('🌐 Navigating to search page...');
    try {
      await page.goto(searchUrl, { 
        waitUntil: 'networkidle2',
        timeout: 120000 
      });
    } catch (navError) {
      console.log('⚠️ Navigation timeout, continuing...');
    }
    
    console.log('⏳ Waiting for search results to load...');
    
    // Wait for profile cards to appear
    try {
      await page.waitForSelector('li.KgcwjRyzPQRukDbnrBkCrvzjRiiRZrlNo', {
        timeout: 30000,
        visible: true
      });
      console.log('✅ Search results appeared!');
    } catch (e) {
      console.log('⚠️ Results not found, trying alternative selector...');
    }

    // Extra wait for lazy loading
    console.log('⏳ Waiting for lazy loading...');
    await sleep(randomDelay(5000, 8000));

    // Scroll to ensure content loads
    console.log('🔄 Scrolling to trigger lazy loading...');
    await page.evaluate(() => {
      window.scrollBy({ top: 500, behavior: 'smooth' });
    });
    await sleep(randomDelay(2000, 3000));

    console.log('✅ Search results ready!\n');
    console.log('═'.repeat(60));

    let actionsTaken = 0;
    let requestsSent = 0;
    let request1st = 0;
    let request2nd = 0;
    let request3rd = 0;
    let skipped = 0;
    let processedProfiles = 0;

    // ==================== PROCESS PROFILES ====================
    while (actionsTaken < maxActions) {
      console.log(`\n📋 Scanning for profiles... (Actions: ${actionsTaken}/${maxActions})`);

      // Scroll to load more
      await page.evaluate(() => {
        window.scrollBy({ top: 800, behavior: 'smooth' });
      });
      await sleep(randomDelay(2000, 4000));

      // Get all profile cards
      let personCards = await page.$$('li.KgcwjRyzPQRukDbnrBkCrvzjRiiRZrlNo');
      
      console.log(`📊 Found ${personCards.length} profile cards on page`);

      if (personCards.length === 0) {
        console.log('❌ No profiles found on this page');
        
        // Try one more scroll
        await page.evaluate(() => window.scrollBy(0, 600));
        await sleep(3000);
        
        personCards = await page.$$('li.KgcwjRyzPQRukDbnrBkCrvzjRiiRZrlNo');
        console.log(`📊 After scroll: Found ${personCards.length} cards`);
        
        if (personCards.length === 0) {
          console.log('❌ End of search results.');
          break;
        }
      }

      // Process each card
      for (let i = 0; i < personCards.length && actionsTaken < maxActions; i++) {
        processedProfiles++;
        console.log(`\n👤 Profile ${processedProfiles}`);
        console.log('─'.repeat(60));

        try {
          // Refresh card reference to avoid stale elements
          personCards = await page.$$('li.KgcwjRyzPQRukDbnrBkCrvzjRiiRZrlNo');
          
          if (i >= personCards.length) {
            console.log('⚠️ Card index out of range');
            continue;
          }

          const card = personCards[i];

          // Extract profile data
          let profileData = await extractSearchProfileData(card);

          if (!profileData || !profileData.profileUrl) {
            console.log('⚠️ Could not extract profile data');
            continue;
          }

          console.log(`   Name: ${profileData.name}`);
          console.log(`   Headline: ${profileData.headline.substring(0, 50)}...`);
          console.log(`   Connection: ${getConnectionType(profileData.connectionDegree)}`);

          // Scroll card into view
          await card.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
          await sleep(randomDelay(1000, 1500));

          // PRIORITY 1: Look for "Add" button (Invite to connect) on card
          console.log('   🔍 Looking for action button on card...');
          
          let actionButton = await card.$('button[aria-label*="Invite"][aria-label*="to connect"]');
          let actionType = 'invite';
          let foundOnCard = true;

          if (!actionButton) {
            // PRIORITY 2: Look for "Connect" button
            actionButton = await card.$('button[aria-label*="Connect"]');
            if (actionButton) {
              actionType = 'connect';
            } else {
              foundOnCard = false;
            }
          }

          // If not found on card, search through all buttons
          if (!actionButton) {
            const buttons = await card.$$('button');
            for (const btn of buttons) {
              const text = await btn.evaluate(el => el.textContent.trim());
              const ariaLabel = await btn.evaluate(el => el.getAttribute('aria-label')) || '';
              
              // Look for "Add" button
              if (text === 'Add' && ariaLabel.toLowerCase().includes('invite')) {
                actionButton = btn;
                actionType = 'add-invite';
                break;
              }
              
              // Look for "Connect" button
              if (text === 'Connect' && ariaLabel.toLowerCase().includes('connect')) {
                actionButton = btn;
                actionType = 'connect';
                break;
              }
            }
          }

          if (!actionButton) {
            console.log('   ⚠️ No action button found on card, visiting profile page...');
            
            // Visit profile page to get the full Connect button
            const profileLink = await card.$('a[href*="/in/"]');
            if (!profileLink) {
              console.log('   ⚠️ No profile link found');
              skipped++;
              continue;
            }

            // Click profile link with human-like behavior
            const profileClicked = await humanLikeClick(page, profileLink, {
              minDelay: 400,
              maxDelay: 800,
              moveSteps: 10,
              jitter: true
            });

            if (!profileClicked) {
              console.log('   ⚠️ Failed to click profile link');
              skipped++;
              continue;
            }

            console.log('   🌐 Visiting profile page...');
            await sleep(randomDelay(4000, 6000));

            // Send connection request from profile page
            const sent = await sendConnectionRequest(page, profileData.name, false, '');

            if (sent) {
              requestsSent++;
              actionsTaken++;

              // Track by connection degree
              if (profileData.connectionDegree.includes('1st')) {
                request1st++;
              } else if (profileData.connectionDegree.includes('2nd')) {
                request2nd++;
              } else {
                request3rd++;
              }

              // Log to Google Sheets
              await logConnectionRequest({
                profileUrl: profileData.profileUrl,
                name: profileData.name,
                headline: profileData.headline,
                location: profileData.location,
                connectionDegree: profileData.connectionDegree,
                action: 'connection_requested'
              });

              console.log(`   ✅ Connection request sent! (Total: ${requestsSent}/${maxActions})`);
            }

            // Go back to search results
            console.log('   🔙 Returning to search results...');
            try {
              await page.goBack({ waitUntil: 'domcontentloaded', timeout: 20000 });
            } catch (e) {
              console.log('   ⚠️ Back navigation failed, reloading search...');
              await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            }

            await sleep(randomDelay(3000, 5000));

          } else {
            // ==================== CLICK ACTION BUTTON ON CARD ====================
            console.log(`   ✅ Found ${actionType} button on card`);
            await sleep(randomDelay(500, 800));

            // Human-like click
            const clicked = await humanLikeClick(page, actionButton, {
              minDelay: 400,
              maxDelay: 900,
              moveSteps: 12,
              jitter: true
            });

            if (!clicked) {
              console.log('   ⚠️ Button click failed');
              skipped++;
              continue;
            }

            console.log('   👆 Button clicked successfully');
            await sleep(randomDelay(2000, 4000));

            // ==================== HANDLE MODAL ====================
            console.log('   📋 Looking for modal...');
            
            let modalFound = false;
            for (let j = 0; j < 5; j++) {
              const modal = await page.$('div[role="dialog"]');
              if (modal) {
                modalFound = true;
                console.log('   ✅ Modal appeared');
                break;
              }
              await sleep(800);
            }

            if (modalFound) {
              await sleep(randomDelay(1000, 2000));

              // ==================== FIND AND CLICK SEND BUTTON ====================
              console.log('   📤 Looking for Send button in modal...');

              // PRIORITY 1: "Send without a note" button
              let sendButton = await page.$('button[aria-label="Send without a note"]');
              
              if (!sendButton) {
                // PRIORITY 2: "Send now" button
                sendButton = await page.$('button[aria-label="Send now"]');
              }

              // PRIORITY 3: Any button with "Send" text
              if (!sendButton) {
                const allButtons = await page.$$('button');
                for (const btn of allButtons) {
                  const text = await btn.evaluate(el => el.textContent.trim());
                  const ariaLabel = await btn.evaluate(el => el.getAttribute('aria-label')) || '';
                  
                  if ((text === 'Send' || text === 'Send without a note') && 
                      !ariaLabel.toLowerCase().includes('dismiss')) {
                    sendButton = btn;
                    break;
                  }
                }
              }

              if (!sendButton) {
                console.log('   ⚠️ Send button not found in modal');
                skipped++;
                
                // Try to close modal
                const closeButton = await page.$('button[aria-label="Dismiss"]');
                if (closeButton) {
                  try {
                    await closeButton.click();
                    await sleep(500);
                  } catch (e) {
                    // Ignore
                  }
                }
              } else {
                console.log('   📤 Found Send button');
                await sleep(randomDelay(600, 1000));

                // Scroll into view
                await sendButton.evaluate(el => {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
                await sleep(randomDelay(300, 600));

                // Human-like click on send button
                const sendClicked = await humanLikeClick(page, sendButton, {
                  minDelay: 400,
                  maxDelay: 900,
                  moveSteps: 12,
                  jitter: true
                });

                if (sendClicked) {
                  console.log('   ✅ Connection request sent successfully!');
                  requestsSent++;
                  actionsTaken++;

                  // Track by connection degree
                  if (profileData.connectionDegree.includes('1st')) {
                    request1st++;
                  } else if (profileData.connectionDegree.includes('2nd')) {
                    request2nd++;
                  } else {
                    request3rd++;
                  }

                  // Log to Google Sheets
                  await logConnectionRequest({
                    profileUrl: profileData.profileUrl,
                    name: profileData.name,
                    headline: profileData.headline,
                    location: profileData.location,
                    connectionDegree: profileData.connectionDegree,
                    action: 'connection_requested'
                  });

                  console.log(`   ✅ Total sent: ${requestsSent}/${maxActions}`);
                  await sleep(randomDelay(2000, 3000));
                } else {
                  console.log('   ⚠️ Send button click failed');
                  skipped++;
                }
              }
            } else {
              console.log('   ⚠️ Modal did not appear');
              skipped++;
            }
          }

          // Pause before next profile
          const pauseTime = randomDelay(3000, 6000);
          console.log(`   ⏳ Pausing ${Math.round(pauseTime/1000)}s before next profile...`);
          await sleep(pauseTime);

        } catch (error) {
          console.log(`   ❌ Error: ${error.message}`);
          skipped++;
          continue;
        }
      }

      // Check for next page
      if (actionsTaken < maxActions) {
        console.log('\n📄 Checking for more results...');
        
        const nextButton = await page.$('button[aria-label="Next"]');
        if (nextButton) {
          const isDisabled = await nextButton.evaluate(el => el.disabled);
          if (!isDisabled) {
            console.log('📄 Loading next page...');
            
            // Human-like click on next
            await humanLikeClick(page, nextButton, {
              minDelay: 400,
              maxDelay: 800
            });

            await sleep(randomDelay(5000, 8000));
            
            // Wait for new results
            try {
              await page.waitForSelector('li.KgcwjRyzPQRukDbnrBkCrvzjRiiRZrlNo', {
                timeout: 20000,
                visible: true
              });
            } catch (e) {
              console.log('⚠️ Timeout waiting for next page');
            }
            
            await sleep(randomDelay(3000, 5000));
          } else {
            console.log('📄 No more pages');
            break;
          }
        } else {
          console.log('📄 Next button not found');
          break;
        }
      }
    }

    // ==================== SUMMARY ====================
    console.log('\n' + '═'.repeat(60));
    console.log('✅ AUTOMATION COMPLETED!');
    console.log('═'.repeat(60));
    console.log(`\n📊 Results:`);
    console.log(`   ✅ Total Requests Sent: ${requestsSent}/${maxActions}`);
    console.log(`   🤝 1st Degree Requests: ${request1st}`);
    console.log(`   🤝 2nd Degree Requests: ${request2nd}`);
    console.log(`   🤝 3rd Degree Requests: ${request3rd}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   👥 Profiles Processed: ${processedProfiles}`);
    console.log('═'.repeat(60));
    console.log(`\n📊 Saved to Google Sheets: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_CONNECTIONS_SHEET_ID}`);
    console.log('═'.repeat(60) + '\n');

    await sleep(10000);
    await browser.close();

  } catch (error) {
    console.error('\n❌ Critical Error:', error.message);
    console.error(error.stack);
    await browser.close();
  }
}

// Run automation
console.log('\n🚀 LinkedIn Connection Requests Automation Starting...\n');
sendConnectionRequestsAutomation();
