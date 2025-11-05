// ==================== FILE: send-connection-requests.js ====================
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import { linkedInLogin } from './actions/login.js';
import { sleep, randomDelay } from './utils/helpers.js';
import { getCookies, saveCookies } from './services/cookieService.js';
import { getProxyArgs, authenticateProxy, testProxyConnection } from './utils/proxyHelper.js';
import { logActivity } from './utils/activityLogger.js';
import csvService from './services/csvService.js';

dotenv.config();
puppeteer.use(StealthPlugin());

// ==================== INITIALIZE MONGODB ====================
let mongoConnected = false;

async function initializeMongoDB() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    const result = await connectDB();
    
    if (result) {
      mongoConnected = true;
      console.log('✅ MongoDB connected successfully!');
    } else {
      console.log('⚠️ MongoDB connection returned false');
      mongoConnected = false;
    }
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    mongoConnected = false;
  }
}

await initializeMongoDB();

if (!mongoConnected) {
  console.error('❌ Cannot start bot without MongoDB connection');
  process.exit(1);
}

// ==================== FLEXIBLE SELECTORS ====================

/**
 * Find connect button with multiple selector strategies
 */
async function findConnectButton(card) {
  try {
    // Strategy 1: Direct aria-label match
    let button = await card.$('button[aria-label*="Connect"]');
    if (button) return button;

    // Strategy 2: Text content match
    button = await card.$('button');
    if (button) {
      const text = await card.evaluate(el => {
        const btn = el.querySelector('button');
        return btn ? btn.innerText : '';
      });
      if (text.includes('Connect')) return button;
    }

    // Strategy 3: Class-based selection
    const buttons = await card.$$('button.artdeco-button');
    for (const btn of buttons) {
      const label = await btn.evaluate(el => el.getAttribute('aria-label'));
      if (label && label.includes('Connect')) {
        return btn;
      }
    }

    console.log('⚠️ Connect button not found with standard selectors');
    return null;
  } catch (error) {
    console.error('Error finding connect button:', error.message);
    return null;
  }
}

/**
 * Extract profile info with flexible selectors
 */
async function extractProfileInfo(card) {
  try {
    const profileInfo = await card.evaluate((el) => {
      try {
        // Extract name - multiple strategies
        let name = 'Unknown';
        const nameLink = el.querySelector('a[href*="/in/"]');
        if (nameLink) {
          const span = nameLink.querySelector('span[aria-hidden="true"]');
          if (span) name = span.textContent.trim();
        }

        // Extract profile URL
        let profileUrl = '';
        if (nameLink) {
          profileUrl = nameLink.href.split('?')[0];
        }

        // Extract connection degree
        let connectionDegree = '';
        const badgeText = el.querySelector('.entity-result__badge-text span[aria-hidden="true"]');
        if (badgeText) {
          connectionDegree = badgeText.textContent.trim();
        }

        // Extract headline
        let headline = '';
        const headlineDiv = el.querySelector('[class*="t-14"][class*="t-black"][class*="t-normal"]');
        if (headlineDiv) {
          headline = headlineDiv.textContent.trim();
        }

        // Extract location
        let location = '';
        const locationDivs = el.querySelectorAll('[class*="t-14"][class*="t-normal"]');
        if (locationDivs.length > 1) {
          location = locationDivs[1].textContent.trim();
        }

        return { name, profileUrl, connectionDegree, headline, location };
      } catch (error) {
        return null;
      }
    });

    return profileInfo;
  } catch (error) {
    console.error('Error extracting profile info:', error.message);
    return null;
  }
}

/**
 * Find profile cards with multiple selector strategies
 */
async function findProfileCards(page) {
  const selectors = [
    'div[class*="YXDxfnjpPlixHYMnsZdH"]', // Direct class
    'li.entity-result__item',
    'li[data-test-reusable-search-result-item]',
    'div.reusable-search-simple-insight',
    'div[class*="entity-result"]'
  ];

  for (const selector of selectors) {
    try {
      const cards = await page.$$(selector);
      if (cards && cards.length > 0) {
        console.log(`✅ Found ${cards.length} profiles using selector: ${selector}`);
        return { cards, selector };
      }
    } catch (e) {
      // Continue to next selector
    }
  }

  console.log('⚠️ No profiles found with standard selectors');
  return { cards: [], selector: null };
}

/**
 * Handle connection modal
 */
async function handleConnectionModal(page) {
  try {
    console.log('   🔍 Looking for modal...');

    // Wait for modal to appear
    await page.waitForSelector('div[role="dialog"]', { timeout: 5000 }).catch(() => {});

    const modal = await page.$('div[role="dialog"]');
    if (!modal) {
      console.log('   ⚠️ Modal did not appear');
      return false;
    }

    console.log('   ✅ Modal appeared');
    await sleep(randomDelay(1000, 2000));

    // Find send button with multiple strategies
    let sendButton = await modal.$('button[aria-label="Send without a note"]');
    
    if (!sendButton) {
      sendButton = await modal.$('button[aria-label="Send now"]');
    }

    if (!sendButton) {
      // Find by text content
      const buttons = await modal.$$('button');
      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.innerText);
        if (text.includes('Send')) {
          sendButton = btn;
          break;
        }
      }
    }

    if (!sendButton) {
      console.log('   ⚠️ Send button not found');
      return false;
    }

    console.log('   📤 Found send button');
    await sleep(randomDelay(600, 1000));

    // Click send button with human-like movement
    await modal.evaluate(el => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await sleep(300);

    await sendButton.click();
    console.log('   ✅ Connection request sent!');
    await sleep(randomDelay(2000, 3000));

    return true;
  } catch (error) {
    console.error('   Error handling modal:', error.message);
    return false;
  }
}

/**
 * Check for next page button
 */
async function hasNextPage(page) {
  try {
    const nextButton = await page.$('button[aria-label="Next"]');
    if (!nextButton) {
      console.log('📄 No next page button found');
      return false;
    }

    const isDisabled = await nextButton.evaluate(el => el.disabled);
    if (isDisabled) {
      console.log('📄 Next button is disabled (reached end)');
      return false;
    }

    return true;
  } catch (error) {
    console.log('⚠️ Error checking next page:', error.message);
    return false;
  }
}

/**
 * Go to next page with proper waiting
 */
async function goToNextPage(page) {
  try {
    const nextButton = await page.$('button[aria-label="Next"]');
    if (!nextButton) return false;

    console.log('📄 Clicking next page button...');
    await nextButton.click();
    
    console.log('⏳ Waiting for next page to load...');
    await sleep(randomDelay(5000, 8000));

    // Wait for new results to appear
    const selectors = [
      'div[class*="YXDxfnjpPlixHYMnsZdH"]',
      'li.entity-result__item',
      'li[data-test-reusable-search-result-item]'
    ];

    let foundSelector = null;
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        foundSelector = selector;
        break;
      } catch (e) {
        // Continue to next selector
      }
    }

    if (foundSelector) {
      console.log(`✅ Results loaded on next page`);
      await sleep(randomDelay(2000, 3000));
      return true;
    }

    console.log('⚠️ Results not loaded on next page');
    return false;
  } catch (error) {
    console.error('Error going to next page:', error.message);
    return false;
  }
}

/**
 * Main connection requests automation
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
    if (proxyArgs.length > 0) {
      await testProxyConnection(page);
    }

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'language', {
        get: function() { return 'en-US'; }
      });
      Object.defineProperty(navigator, 'languages', {
        get: function() { return ['en-US', 'en']; }
      });
    });

    console.log('\n' + '═'.repeat(70));
    console.log('🎯 LinkedIn Connection Requests Automation');
    console.log('═'.repeat(70));
    console.log('🤝 Sends connection requests intelligently');
    console.log('🖱️  Handles modal popups automatically');
    console.log('📄 Supports pagination across multiple pages');
    console.log('📊 Saves data to MongoDB + CSV');
    console.log('⚠️  Educational purposes only');
    console.log('═'.repeat(70) + '\n');

    const username = process.env.LINKEDIN_USERNAME;
    const password = process.env.LINKEDIN_PASSWORD;
    const useSavedCookies = process.env.USE_SAVED_COOKIES !== 'false';

    if (!username) {
      console.error('❌ LINKEDIN_USERNAME is required');
      await browser.close();
      return;
    }

    console.log(`👤 Account: ${username}`);

    let loggedIn = false;

    // ==================== TRY SAVED COOKIES ====================
    if (useSavedCookies && username) {
      console.log('\n🍪 Checking for saved session...');
      const savedCookies = await getCookies(username);
      
      if (savedCookies && savedCookies.length > 0) {
        console.log(`✅ Found ${savedCookies.length} saved cookies`);
        
        try {
          await page.setCookie(...savedCookies);
          
          console.log('⏳ Navigating to LinkedIn...');
          await page.goto('https://www.linkedin.com/feed/?locale=en_US', { 
            waitUntil: 'domcontentloaded',
            timeout: 120000
          });

          await sleep(5000);

          const currentUrl = page.url();
          console.log(`📍 Current URL: ${currentUrl}`);

          if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork')) {
            console.log('✅ Session restored successfully!');
            loggedIn = true;
          } else {
            console.log('⚠️ Cookies expired, need fresh login');
            loggedIn = false;
          }
        } catch (error) {
          console.log(`⚠️ Error restoring session: ${error.message}`);
          loggedIn = false;
        }
      }
    }

    // ==================== LOGIN IF NEEDED ====================
    if (!loggedIn) {
      if (!password) {
        console.error('❌ Password required for fresh login');
        await browser.close();
        return;
      }

      console.log('\n🔐 Starting fresh login...');
      loggedIn = await linkedInLogin(page, username, password, true);
      
      console.log('\n⏸️  Please complete all verification steps:');
      console.log('   1️⃣  Solve CAPTCHA (if shown)');
      console.log('   2️⃣  Enter OTP code (if requested)');
      console.log('   3️⃣  Wait for redirect to LinkedIn feed');
      console.log('\n⏳ Waiting up to 5 minutes...\n');
      
      try {
        await page.waitForFunction(
          () => window.location.href.includes('/feed') || 
                window.location.href.includes('/mynetwork'),
          { timeout: 300000 }
        );
        
        loggedIn = true;
        console.log('✅ Login verified successfully!');
        
      } catch (error) {
        console.log('⚠️  Timeout waiting for login completion');
        const currentUrl = page.url();
        if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork')) {
          loggedIn = true;
          console.log('✅ But you are logged in!');
        } else {
          loggedIn = false;
        }
      }
      
      if (!loggedIn) {
        console.log('❌ Login failed. Exiting...');
        await browser.close();
        return;
      }

      const cookies = await page.cookies();
      await saveCookies(username, cookies);
      console.log(`✅ Saved ${cookies.length} cookies`);
    }

    console.log('✅ Logged in successfully!\n');

    const searchKeyword = process.env.SEARCH_KEYWORD || 'developer';
    const maxActions = parseInt(process.env.MAX_CONNECTION_REQUESTS_PER_DAY) || 20;

    console.log(`🔍 Searching for: "${searchKeyword}"`);
    console.log(`🎯 Target: ${maxActions} connection requests\n`);

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
    
    console.log('⏳ Waiting for search results...');
    await sleep(randomDelay(8000, 12000));

    console.log('✅ Search results ready!\n');
    console.log('═'.repeat(70));

    let actionsTaken = 0;
    let requestsSent = 0;
    let request1st = 0;
    let request2nd = 0;
    let request3rd = 0;
    let skipped = 0;
    let processedProfiles = 0;
    let currentPage = 1;

    // ==================== MAIN PROCESSING LOOP ====================
    while (actionsTaken < maxActions) {
      console.log(`\n📄 Page ${currentPage} | Processing profiles... (Sent: ${requestsSent}/${maxActions})`);

      // Find profile cards
      const { cards, selector } = await findProfileCards(page);
      
      if (cards.length === 0) {
        console.log('⚠️ No profiles found on this page');
        
        const hasNext = await hasNextPage(page);
        if (hasNext) {
          const moved = await goToNextPage(page);
          if (moved) {
            currentPage++;
            continue;
          }
        }
        break;
      }

      console.log(`📊 Found ${cards.length} profiles on page ${currentPage}\n`);

      // Process each card
      for (let i = 0; i < cards.length && actionsTaken < maxActions; i++) {
        processedProfiles++;
        
        try {
          // Re-fetch cards as DOM may have changed
          const { cards: updatedCards } = await findProfileCards(page);
          if (i >= updatedCards.length) {
            console.log('⚠️ Card index out of range, moving to next');
            continue;
          }

          const card = updatedCards[i];

          console.log(`\n👤 Profile ${processedProfiles}`);
          console.log('─'.repeat(70));

          // Extract profile info
          const profileInfo = await extractProfileInfo(card);
          if (!profileInfo || !profileInfo.profileUrl) {
            console.log('   ⚠️ Could not extract profile data');
            skipped++;
            continue;
          }

          console.log(`   Name: ${profileInfo.name}`);
          console.log(`   Headline: ${profileInfo.headline.substring(0, 50)}...`);
          console.log(`   Connection: ${profileInfo.connectionDegree}`);

          // Scroll into view
          await card.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
          await sleep(randomDelay(1000, 1500));

          // Find and click connect button
          const connectButton = await findConnectButton(card);
          if (!connectButton) {
            console.log('   ⚠️ Connect button not found');
            skipped++;
            continue;
          }

          console.log('   🔍 Found connect button');
          await sleep(randomDelay(500, 800));

          // Click connect button
          await connectButton.click();
          console.log('   👆 Button clicked');
          await sleep(randomDelay(2000, 4000));

          // Handle modal
          const sent = await handleConnectionModal(page);

          if (sent) {
            requestsSent++;
            actionsTaken++;

            // Track connection degree
            if (profileInfo.connectionDegree.includes('1st')) {
              request1st++;
            } else if (profileInfo.connectionDegree.includes('2nd')) {
              request2nd++;
            } else {
              request3rd++;
            }

            // Log to MongoDB
            try {
              await logActivity({
                action: 'connection_requested',
                postUrl: profileInfo.profileUrl,
                authorName: profileInfo.name,
                postPreview: profileInfo.headline,
                commentText: profileInfo.location,
                postType: 'connection_request',
                isJobPost: false
              });
            } catch (err) {
              console.log('   ⚠️ MongoDB save failed');
            }

            // Log to CSV
            try {
              await csvService.appendConnectionSent(username, {
                timestamp: new Date().toISOString(),
                recipientName: profileInfo.name,
                recipientProfileUrl: profileInfo.profileUrl,
                message: `Connection request via ${searchKeyword} search`,
                status: 'sent'
              });
            } catch (err) {
              console.log('   ⚠️ CSV save failed');
            }

            console.log('   ✅ Logged (MongoDB + CSV)');
            console.log(`   Total sent: ${requestsSent}/${maxActions}`);
          } else {
            skipped++;
          }

          // Pause before next
          const pauseTime = randomDelay(3000, 6000);
          console.log(`   ⏳ Pausing ${Math.round(pauseTime/1000)}s...`);
          await sleep(pauseTime);

        } catch (error) {
          console.log(`   ❌ Error: ${error.message}`);
          skipped++;
          continue;
        }
      }

      // Check for next page
      if (actionsTaken < maxActions) {
        const hasNext = await hasNextPage(page);
        if (hasNext) {
          const moved = await goToNextPage(page);
          if (moved) {
            currentPage++;
            console.log(`\n✅ Successfully moved to page ${currentPage}`);
          } else {
            console.log('\n⚠️ Could not load next page');
            break;
          }
        } else {
          console.log('\n📄 No more pages available');
          break;
        }
      }
    }

    // ==================== FINAL STATS ====================
    const csvStats = await csvService.getUserStats(username);
    const userCSVPaths = await csvService.getUserCSVPaths(username);

    console.log('\n' + '═'.repeat(70));
    console.log('✅ AUTOMATION COMPLETED!');
    console.log('═'.repeat(70));
    console.log(`\n📊 Session Results:`);
    console.log(`   ✅ Total Requests Sent: ${requestsSent}/${maxActions}`);
    console.log(`   🤝 1st Degree: ${request1st}`);
    console.log(`   🤝 2nd Degree: ${request2nd}`);
    console.log(`   🤝 3rd+ Degree: ${request3rd}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   👥 Profiles Processed: ${processedProfiles}`);
    console.log(`   📄 Pages: ${currentPage}`);
    
    console.log('\n📁 All-Time Statistics:');
    console.log(`      📄 CSV Files:`);
    console.log(`         • Total Connections: ${csvStats.total_connections_sent || 0}`);
    console.log(`         • Total Likes: ${csvStats.total_engagement_likes || 0}`);
    console.log(`         • Total Comments: ${csvStats.total_engagement_comments || 0}`);
    
    console.log('\n📂 CSV File Locations:');
    if (userCSVPaths?.csv_paths) {
      Object.entries(userCSVPaths.csv_paths).forEach(([key, value]) => {
        if (value) console.log(`      • ${key}: ${value}`);
      });
    }
    
    console.log('\n💻 Frontend Dashboard:');
    console.log(`      • URL: http://localhost:5173`);
    console.log(`      • Analytics: View all CSV data`);
    console.log(`      • API: http://localhost:3000/api`);
    console.log('═'.repeat(70) + '\n');

    await sleep(10000);
    await browser.close();

  } catch (error) {
    console.error('\n❌ Critical Error:', error.message);
    console.error(error.stack);
    try {
      await browser.close();
    } catch (e) {
      console.error('Error closing browser:', e.message);
    }
  }
}

console.log('\n🚀 LinkedIn Connection Requests Automation Starting...\n');
sendConnectionRequestsAutomation();
