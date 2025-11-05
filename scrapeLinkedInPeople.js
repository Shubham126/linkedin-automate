// ==================== FILE: scrape-profiles.js (FIXED) ====================
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

// ==================== PROFILE EXTRACTION FUNCTIONS ====================

/**
 * Find profile cards with multiple selector strategies
 */
async function findProfileCards(page) {
  const selectors = [
    // LinkedIn search people results
    'li.reusable-search-result-container',
    'li[data-test-reusable-search-result-item]',
    'div[class*="entity-result"]',
    'div.reusable-search__result-container',
    'li.entity-result',
    'div[class*="search-result"]'
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
 * Extract basic profile info from search result card
 */
async function extractSearchProfileData(card) {
  try {
    const profileInfo = await card.evaluate((el) => {
      try {
        // Extract name
        let name = 'Unknown';
        let nameElement = el.querySelector('a[href*="/in/"] span[aria-hidden="true"]');
        if (!nameElement) {
          nameElement = el.querySelector('span[class*="entity-result__title"] span[aria-hidden="true"]');
        }
        if (!nameElement) {
          const nameSpan = el.querySelectorAll('span[aria-hidden="true"]')[0];
          if (nameSpan && nameSpan.textContent.trim().length > 0) {
            nameElement = nameSpan;
          }
        }
        if (nameElement) {
          name = nameElement.textContent.trim();
        }

        // Extract profile URL
        let profileUrl = '';
        const profileLink = el.querySelector('a[href*="/in/"]');
        if (profileLink) {
          profileUrl = profileLink.href.split('?')[0];
        }

        // Extract headline
        let headline = '';
        const headlineElement = el.querySelector('[class*="entity-result__subtitle"]');
        if (!headlineElement) {
          const allSpans = el.querySelectorAll('span[aria-hidden="true"]');
          if (allSpans.length > 1) {
            headline = allSpans[1].textContent.trim();
          }
        } else {
          headline = headlineElement.textContent.trim();
        }

        // Extract location
        let location = '';
        const locationElement = el.querySelector('[class*="entity-result__meta"]');
        if (locationElement) {
          location = locationElement.textContent.trim();
        }

        // Extract connection degree
        let connectionDegree = '';
        const badgeElement = el.querySelector('.entity-result__badge-text');
        if (badgeElement) {
          connectionDegree = badgeElement.textContent.trim();
        }

        return {
          name,
          profileUrl,
          headline,
          location,
          connectionDegree
        };
      } catch (error) {
        console.error('Error in evaluate:', error.message);
        return null;
      }
    });

    return profileInfo;
  } catch (error) {
    console.error('Error extracting profile data:', error.message);
    return null;
  }
}

/**
 * Visit profile and extract detailed information
 */
async function extractDetailedProfileInfo(page, profileUrl) {
  try {
    console.log('   🌐 Navigating to profile...');
    
    try {
      await page.goto(profileUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
    } catch (navError) {
      console.log('   ⚠️ Navigation slow, continuing...');
    }
    
    const loadWait = randomDelay(5000, 8000);
    console.log(`   ⏳ Waiting ${Math.round(loadWait/1000)}s for profile to load...`);
    await sleep(loadWait);

    console.log('   📜 Scrolling profile to load content...');
    await page.evaluate(() => {
      window.scrollBy({ top: 500, behavior: 'smooth' });
    });
    await sleep(randomDelay(2000, 3000));

    // Try to expand About section
    try {
      const seeMoreButton = await page.$('button#line-clamp-show-more-button');
      if (seeMoreButton) {
        console.log('   📖 Expanding About section...');
        await seeMoreButton.click();
        await sleep(randomDelay(1500, 2500));
      }
    } catch (e) {
      // Button not found, continue
    }

    // Extract detailed profile data
    const detailedInfo = await page.evaluate(() => {
      try {
        // Extract name
        let name = 'Unknown';
        const nameElement = document.querySelector('h1');
        if (nameElement) {
          name = nameElement.textContent.trim();
        }

        // Extract headline
        let headline = '';
        const headlineElement = document.querySelector('.text-body-medium');
        if (headlineElement) {
          headline = headlineElement.textContent.trim();
        }

        // Extract about section
        let about = '';
        const aboutSelectors = [
          '.pv-about__summary-text span',
          'section[data-section="summary"] .inline-show-more-text',
          '#about ~ div span',
          '[class*="summary"] span[aria-hidden="true"]'
        ];

        for (const selector of aboutSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim().length > 10) {
            about = element.textContent.trim();
            break;
          }
        }

        // Extract location
        let location = '';
        const locationElement = document.querySelector('[class*="location"]');
        if (locationElement) {
          location = locationElement.textContent.trim();
        }

        // Extract URL
        let url = window.location.href;

        // Extract current job title
        let currentJob = '';
        const jobElements = document.querySelectorAll('[class*="experience"] h3');
        if (jobElements.length > 0) {
          currentJob = jobElements[0].textContent.trim();
        }

        // Extract follower count
        let followers = '0';
        const followerElements = document.querySelectorAll('[class*="follower"]');
        for (const elem of followerElements) {
          const text = elem.textContent;
          const match = text.match(/(\d+[KM]?)\s+followers?/);
          if (match) {
            followers = match[1];
            break;
          }
        }

        return {
          name,
          headline,
          about,
          location,
          url,
          currentJob,
          followers
        };
      } catch (error) {
        return null;
      }
    });

    if (detailedInfo && detailedInfo.about && detailedInfo.about.length > 10) {
      console.log(`   ✅ About section extracted (${detailedInfo.about.length} chars)`);
    }

    return detailedInfo;

  } catch (error) {
    console.error('   ❌ Error extracting detailed info:', error.message);
    return null;
  }
}

/**
 * Go to next page
 */
async function goToNextPage(page) {
  try {
    await sleep(randomDelay(2000, 3000));
    
    const nextButton = await page.$('button[aria-label="Next"]');
    
    if (nextButton) {
      const isDisabled = await nextButton.evaluate(el => el.disabled);
      
      if (isDisabled) {
        console.log('⚠️ Reached last page');
        return false;
      }

      console.log('📄 Clicking Next page...');
      await nextButton.click();
      
      const pageLoadWait = randomDelay(5000, 8000);
      console.log(`⏳ Waiting ${Math.round(pageLoadWait/1000)}s for next page...`);
      await sleep(pageLoadWait);
      
      // Wait for new results
      const selectors = [
        'li.reusable-search-result-container',
        'li[data-test-reusable-search-result-item]',
        'div[class*="entity-result"]'
      ];

      for (const selector of selectors) {
        try {
          await page.waitForSelector(selector, { timeout: 10000 });
          console.log(`✅ Results loaded on next page`);
          await sleep(randomDelay(2000, 3000));
          return true;
        } catch (e) {
          // Continue to next selector
        }
      }

      console.log('⚠️ Timeout waiting for results on next page, continuing...');
      return true;
    }

    return false;
  } catch (error) {
    console.error('❌ Error navigating to next page:', error.message);
    return false;
  }
}

/**
 * Main scraping function
 */
async function scrapeLinkedInPeopleProfiles() {
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
    page.setDefaultNavigationTimeout(90000);
    
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
    console.log('🎯 LinkedIn People Profile Scraper');
    console.log('═'.repeat(70));
    console.log('🔍 Searches for people and extracts detailed profile data');
    console.log('📊 Saves ALL data to MongoDB + CSV');
    console.log('📁 Creates CSV files for export');
    console.log('📥 Download CSV from dashboard');
    console.log('📄 Supports pagination across multiple pages');
    console.log('👤 Extracts: Name, Headline, About, Location, URL');
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
    const maxProfiles = parseInt(process.env.MAX_PROFILES_TO_SCRAPE) || 20;

    console.log(`🔍 Searching for: "${searchKeyword}"`);
    console.log(`🎯 Target: ${maxProfiles} profiles\n`);

    const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchKeyword)}`;
    
    try {
      await page.goto(searchUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 60000 
      });
    } catch (navError) {
      console.log('⚠️ Navigation timeout, trying to continue...');
      await sleep(5000);
    }
    
    console.log('⏳ Waiting for search results to load...');
    
    const searchLoadWait = randomDelay(8000, 12000);
    console.log(`⏳ Stabilizing search results (${Math.round(searchLoadWait/1000)}s)...`);
    await sleep(searchLoadWait);

    console.log('✅ Search results ready!\n');
    console.log('═'.repeat(70));

    let profilesScraped = 0;
    let currentPage = 1;
    let hasMorePages = true;

    // ==================== MAIN SCRAPING LOOP ====================
    while (profilesScraped < maxProfiles && hasMorePages) {
      console.log(`\n📄 Processing Page ${currentPage}`);
      console.log('─'.repeat(70));

      // Find profile cards
      const { cards, selector } = await findProfileCards(page);
      
      console.log(`📋 Found ${cards.length} profiles on page ${currentPage}\n`);

      if (cards.length === 0) {
        console.log('❌ No profiles found');
        break;
      }

      let processedOnThisPage = 0;
      
      while (processedOnThisPage < cards.length && profilesScraped < maxProfiles) {
        console.log(`👤 Profile ${profilesScraped + 1}/${maxProfiles} (Page ${currentPage}, Card ${processedOnThisPage + 1}/${cards.length})`);
        console.log('─'.repeat(70));

        try {
          // Re-fetch cards in case DOM changed
          const { cards: updatedCards } = await findProfileCards(page);
          
          if (processedOnThisPage >= updatedCards.length) {
            console.log('⚠️ No more cards available at this position');
            break;
          }

          const card = updatedCards[processedOnThisPage];

          // Scroll to card
          try {
            await card.evaluate(el => {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            await sleep(randomDelay(1500, 2500));
          } catch (scrollError) {
            console.log('⚠️ Could not scroll to element');
          }

          // Extract basic info from search result
          let profileData = await extractSearchProfileData(card);
          
          if (!profileData || !profileData.profileUrl) {
            console.log('⚠️ Could not extract profile data from search result');
            processedOnThisPage++;
            continue;
          }

          console.log(`   👤 Name: ${profileData.name}`);
          console.log(`   💼 Headline: ${profileData.headline.substring(0, 60)}...`);
          console.log(`   📍 Location: ${profileData.location}`);
          console.log(`   🔗 Connection: ${profileData.connectionDegree}`);

          // Click on profile to open detailed view
          console.log('\n   🖱️  Clicking profile to open...');
          try {
            const profileLink = await card.$('a[href*="/in/"]');
            if (profileLink) {
              await profileLink.click();
              await sleep(randomDelay(2000, 4000));
            } else {
              console.log('   ⚠️ Could not find profile link');
              processedOnThisPage++;
              continue;
            }
          } catch (clickError) {
            console.log(`   ⚠️ Error clicking profile: ${clickError.message}`);
            processedOnThisPage++;
            continue;
          }

          // Extract detailed profile information
          const detailedInfo = await extractDetailedProfileInfo(page, profileData.profileUrl);
          
          if (detailedInfo) {
            console.log('\n   📋 Detailed Profile Information:');
            console.log(`      Name: ${detailedInfo.name}`);
            console.log(`      Headline: ${detailedInfo.headline}`);
            console.log(`      Location: ${detailedInfo.location}`);
            console.log(`      Current Job: ${detailedInfo.currentJob}`);
            console.log(`      Followers: ${detailedInfo.followers}`);
            
            if (detailedInfo.about) {
              console.log(`      About: ${detailedInfo.about.substring(0, 100)}...`);
            }

            // ✅ LOG TO MONGODB
            try {
              await logActivity({
                action: 'profile_viewed',
                postUrl: profileData.profileUrl,
                authorName: detailedInfo.name || profileData.name,
                postPreview: detailedInfo.headline || profileData.headline,
                commentText: detailedInfo.about ? detailedInfo.about.substring(0, 200) : '',
                postType: 'profile_scrape',
                isJobPost: false,
                additionalData: {
                  location: detailedInfo.location,
                  currentJob: detailedInfo.currentJob,
                  followers: detailedInfo.followers
                }
              });
              console.log('   ✅ Saved to MongoDB');
            } catch (err) {
              console.log(`   ⚠️ MongoDB save failed: ${err.message}`);
            }

            profilesScraped++;
          }

          // Go back to search results
          console.log('   🔙 Returning to search results...');
          try {
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 20000 });
          } catch (backError) {
            console.log('   ⚠️ Back navigation slow, continuing...');
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
          }
          
          const postBackWait = randomDelay(4000, 7000);
          console.log(`   ⏳ Stabilizing after return (${Math.round(postBackWait/1000)}s)...`);
          await sleep(postBackWait);

          processedOnThisPage++;

          console.log(`\n   ✅ Profile #${profilesScraped} complete\n`);

        } catch (error) {
          console.log(`   ❌ Error processing profile: ${error.message}`);
          processedOnThisPage++;
          continue;
        }
      }

      // Check for next page
      if (profilesScraped < maxProfiles) {
        console.log('\n📄 Checking for next page...');
        hasMorePages = await goToNextPage(page);
        
        if (hasMorePages) {
          currentPage++;
          console.log(`✅ Successfully moved to page ${currentPage}`);
        }
      }
    }

    // ==================== FINAL STATS ====================
    const csvStats = await csvService.getUserStats(username);
    const userCSVPaths = await csvService.getUserCSVPaths(username);

    console.log('\n' + '═'.repeat(70));
    console.log('✅ SCRAPING COMPLETED!');
    console.log('═'.repeat(70));
    console.log(`\n📊 Session Statistics:`);
    console.log(`   • Profiles Scraped: ${profilesScraped}`);
    console.log(`   • Pages Processed: ${currentPage}`);
    console.log(`   • Search Keyword: "${searchKeyword}"`);
    
    console.log('\n📁 All-Time Statistics:');
    console.log(`      📄 CSV Files:`);
    console.log(`         • Total Likes: ${csvStats.total_engagement_likes || 0}`);
    console.log(`         • Total Comments: ${csvStats.total_engagement_comments || 0}`);
    console.log(`         • Total Connections: ${csvStats.total_connections_sent || 0}`);
    console.log(`         • Total Messages: ${csvStats.total_messages_sent || 0}`);
    
    console.log('\n📂 CSV File Locations:');
    if (userCSVPaths?.csv_paths) {
      Object.entries(userCSVPaths.csv_paths).forEach(([key, value]) => {
        if (value) console.log(`      • ${key}: ${value}`);
      });
    }
    
    console.log('\n💻 Frontend Dashboard:');
    console.log(`      • URL: http://localhost:5173`);
    console.log(`      • Analytics: View all CSV data`);
    console.log(`      • Download: Export CSV files`);
    console.log(`      • API: http://localhost:3000/api`);
    console.log('═'.repeat(70) + '\n');

    await sleep(10000);
    await browser.close();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    try {
      await browser.close();
    } catch (e) {
      console.error('Error closing browser:', e.message);
    }
  }
}

scrapeLinkedInPeopleProfiles();
