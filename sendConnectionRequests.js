// ==================== FILE: send-connection-requests.js ====================
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import { linkedInLogin } from './actions/login.js';
import { sendConnectionRequest } from './actions/sendConnectionRequest.js';
import { sleep, randomDelay } from './utils/helpers.js';
import { getCookies, saveCookies } from './services/cookieService.js';
import { getProxyArgs, authenticateProxy } from './utils/proxyHelper.js';
import { logActivity } from './utils/activityLogger.js';

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

// Initialize MongoDB first
await initializeMongoDB();

if (!mongoConnected) {
  console.error('❌ Cannot start bot without MongoDB connection');
  process.exit(1);
}

/**
 * Human-like click function
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
        let profileUrl = '';
        const profileLink = card.querySelector('a[href*="/in/"]');
        if (profileLink) {
          profileUrl = profileLink.href.split('?')[0];
        }

        let name = 'Unknown';
        const nameSpan = card.querySelector('a[href*="/in/"] span[aria-hidden="true"]');
        if (nameSpan) {
          name = nameSpan.textContent.trim();
        }

        let connectionDegree = '';
        const degreeSpan = card.querySelector('.entity-result__badge-text span[aria-hidden="true"]');
        if (degreeSpan) {
          connectionDegree = degreeSpan.textContent.trim();
        }

        let headline = '';
        const headlineDiv = card.querySelector('div.OiirvpInMLuzeczYhJxvFuDuiuHxENkKTCg');
        if (headlineDiv) {
          headline = headlineDiv.textContent.trim();
        }

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

    console.log('\n' + '═'.repeat(70));
    console.log('🎯 LinkedIn Connection Requests Automation');
    console.log('═'.repeat(70));
    console.log('🤝 Sends to 1st, 2nd, 3rd degree connections');
    console.log('🖱️  Human-like clicking behavior');
    console.log('📊 Saves ALL data to MongoDB');
    console.log('📥 Export as CSV from dashboard');
    console.log('⚠️  Educational purposes only');
    console.log('═'.repeat(70) + '\n');

    const username = process.env.LINKEDIN_USERNAME;
    const password = process.env.LINKEDIN_PASSWORD;

    if (!username) {
      console.error('❌ LINKEDIN_USERNAME is required');
      await browser.close();
      return;
    }

    console.log(`👤 Account: ${username}`);

    let loggedIn = false;

    // Try saved cookies first
    console.log('🍪 Checking for saved session...');
    const savedCookies = await getCookies(username);
    
    if (savedCookies && savedCookies.length > 0) {
      console.log(`✅ Found ${savedCookies.length} saved cookies`);
      
      try {
        await page.setCookie(...savedCookies);
        await page.goto('https://www.linkedin.com/feed/', { 
          waitUntil: 'domcontentloaded',
          timeout: 120000 
        });

        await sleep(3000);

        const currentUrl = page.url();
        if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork')) {
          console.log('✅ Session restored!\n');
          loggedIn = true;
        }
      } catch (error) {
        console.log('⚠️ Cookies invalid, need fresh login');
      }
    }

    // Login if needed
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
      const cookies = await page.cookies();
      await saveCookies(username, cookies);
      console.log(`💾 Saved ${cookies.length} cookies\n`);
    }

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

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
    
    try {
      await page.waitForSelector('li.KgcwjRyzPQRukDbnrBkCrvzjRiiRZrlNo', {
        timeout: 30000,
        visible: true
      });
      console.log('✅ Search results appeared!');
    } catch (e) {
      console.log('⚠️ Results not found, trying alternative selector...');
    }

    console.log('⏳ Waiting for lazy loading...');
    await sleep(randomDelay(5000, 8000));

    console.log('🔄 Scrolling to trigger lazy loading...');
    await page.evaluate(() => {
      window.scrollBy({ top: 500, behavior: 'smooth' });
    });
    await sleep(randomDelay(2000, 3000));

    console.log('✅ Search results ready!\n');
    console.log('═'.repeat(70));

    let actionsTaken = 0;
    let requestsSent = 0;
    let request1st = 0;
    let request2nd = 0;
    let request3rd = 0;
    let skipped = 0;
    let processedProfiles = 0;

    // Process profiles
    while (actionsTaken < maxActions) {
      console.log(`\n📋 Scanning for profiles... (Sent: ${actionsTaken}/${maxActions})`);

      await page.evaluate(() => {
        window.scrollBy({ top: 800, behavior: 'smooth' });
      });
      await sleep(randomDelay(2000, 4000));

      let personCards = await page.$$('li.KgcwjRyzPQRukDbnrBkCrvzjRiiRZrlNo');
      
      console.log(`📊 Found ${personCards.length} profile cards`);

      if (personCards.length === 0) {
        console.log('❌ No profiles found');
        
        await page.evaluate(() => window.scrollBy(0, 600));
        await sleep(3000);
        
        personCards = await page.$$('li.KgcwjRyzPQRukDbnrBkCrvzjRiiRZrlNo');
        
        if (personCards.length === 0) {
          console.log('❌ End of search results.');
          break;
        }
      }

      for (let i = 0; i < personCards.length && actionsTaken < maxActions; i++) {
        processedProfiles++;
        console.log(`\n👤 Profile ${processedProfiles}`);
        console.log('─'.repeat(70));

        try {
          personCards = await page.$$('li.KgcwjRyzPQRukDbnrBkCrvzjRiiRZrlNo');
          
          if (i >= personCards.length) {
            console.log('⚠️ Card index out of range');
            continue;
          }

          const card = personCards[i];

          let profileData = await extractSearchProfileData(card);

          if (!profileData || !profileData.profileUrl) {
            console.log('⚠️ Could not extract profile data');
            continue;
          }

          console.log(`   Name: ${profileData.name}`);
          console.log(`   Headline: ${profileData.headline.substring(0, 50)}...`);
          console.log(`   Connection: ${getConnectionType(profileData.connectionDegree)}`);

          await card.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
          await sleep(randomDelay(1000, 1500));

          // Look for action button
          console.log('   🔍 Looking for action button...');
          
          let actionButton = await card.$('button[aria-label*="Invite"][aria-label*="to connect"]');
          let actionType = 'invite';

          if (!actionButton) {
            actionButton = await card.$('button[aria-label*="Connect"]');
            if (actionButton) {
              actionType = 'connect';
            }
          }

          if (actionButton) {
            console.log(`   ✅ Found ${actionType} button on card`);
            await sleep(randomDelay(500, 800));

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

            console.log('   👆 Button clicked');
            await sleep(randomDelay(2000, 4000));

            // Handle modal
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

              let sendButton = await page.$('button[aria-label="Send without a note"]');
              
              if (!sendButton) {
                sendButton = await page.$('button[aria-label="Send now"]');
              }

              if (sendButton) {
                console.log('   📤 Found Send button');
                await sleep(randomDelay(600, 1000));

                const sendClicked = await humanLikeClick(page, sendButton, {
                  minDelay: 400,
                  maxDelay: 900,
                  moveSteps: 12,
                  jitter: true
                });

                if (sendClicked) {
                  console.log('   ✅ Connection request sent!');
                  requestsSent++;
                  actionsTaken++;

                  if (profileData.connectionDegree.includes('1st')) {
                    request1st++;
                  } else if (profileData.connectionDegree.includes('2nd')) {
                    request2nd++;
                  } else {
                    request3rd++;
                  }

                  // ✅ LOG TO MONGODB
                  try {
                    await logActivity({
                      action: 'connection_requested',
                      postUrl: profileData.profileUrl,
                      authorName: profileData.name,
                      postPreview: profileData.headline,
                      commentText: profileData.location,
                      postType: 'connection_request',
                      isJobPost: false
                    });
                  } catch (err) {
                    console.log('   ⚠️ MongoDB save failed');
                  }

                  console.log(`   Total sent: ${requestsSent}/${maxActions}`);
                  await sleep(randomDelay(2000, 3000));
                } else {
                  console.log('   ⚠️ Send button click failed');
                  skipped++;
                }
              } else {
                console.log('   ⚠️ Send button not found');
                skipped++;
              }
            } else {
              console.log('   ⚠️ Modal did not appear');
              skipped++;
            }
          } else {
            console.log('   ⚠️ No action button on card');
            skipped++;
          }

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
        console.log('\n📄 Checking for more results...');
        
        const nextButton = await page.$('button[aria-label="Next"]');
        if (nextButton) {
          const isDisabled = await nextButton.evaluate(el => el.disabled);
          if (!isDisabled) {
            console.log('📄 Loading next page...');
            
            await humanLikeClick(page, nextButton, {
              minDelay: 400,
              maxDelay: 800
            });

            await sleep(randomDelay(5000, 8000));
            
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

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('✅ AUTOMATION COMPLETED!');
    console.log('═'.repeat(70));
    console.log(`\n📊 Results:`);
    console.log(`   ✅ Total Requests Sent: ${requestsSent}/${maxActions}`);
    console.log(`   🤝 1st Degree: ${request1st}`);
    console.log(`   🤝 2nd Degree: ${request2nd}`);
    console.log(`   🤝 3rd Degree: ${request3rd}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   👥 Profiles: ${processedProfiles}`);
    console.log('\n📊 MongoDB Data Saved!');
    console.log(`📥 API: GET http://localhost:3000/api/logs/user/${username}`);
    console.log(`📥 CSV: GET http://localhost:3000/api/logs/download/${username}`);
    console.log('═'.repeat(70) + '\n');

    await sleep(10000);
    await browser.close();

  } catch (error) {
    console.error('\n❌ Critical Error:', error.message);
    await browser.close();
  }
}

console.log('\n🚀 LinkedIn Connection Requests Automation Starting...\n');
sendConnectionRequestsAutomation();
