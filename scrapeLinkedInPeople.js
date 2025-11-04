// ==================== FILE: scrape-profiles.js ====================
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import { linkedInLogin } from './actions/login.js';
import { sleep, randomDelay } from './utils/helpers.js';
import { getCookies, saveCookies } from './services/cookieService.js';
import { getProxyArgs, authenticateProxy, testProxyConnection } from './utils/proxyHelper.js';
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

        let location = '';
        const locationElement = card.querySelector('.vROFeONyrzIYGuqcPKvKUOsZCObhJLhxV');
        if (locationElement) {
          location = locationElement.textContent.trim();
        }

        let followers = '';
        const followersElement = card.querySelector('.reusable-search-simple-insight__text--small');
        if (followersElement) {
          const followersText = followersElement.textContent.trim();
          const match = followersText.match(/(\d+[KM]?)\s+followers/);
          if (match) {
            followers = match[1];
          }
        }

        return {
          profileUrl,
          name,
          connectionDegree,
          headline,
          location,
          followers,
          about: ''
        };
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
 * Visit profile and extract About section
 */
async function extractProfileAbout(page, profileUrl) {
  try {
    console.log('   🌐 Navigating to profile...');
    
    try {
      await page.goto(profileUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
    } catch (navError) {
      console.log('   ⚠️ Navigation slow, continuing anyway...');
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
      // Ignore if button not found
    }

    // Extract About section
    const about = await page.evaluate(() => {
      const selectors = [
        'section[data-section="summary"] .inline-show-more-text span[aria-hidden="true"]',
        'div.pv-about__summary-text span[aria-hidden="true"]',
        '#about ~ div span[aria-hidden="true"]',
        '.pv-shared-text-with-see-more span[aria-hidden="true"]',
        'div[class*="summary"] span[aria-hidden="true"]'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim().length > 10) {
          return element.textContent.trim();
        }
      }
      return '';
    });

    if (about && about.length > 10) {
      console.log(`   ✅ About section extracted (${about.length} chars)`);
      
      const readTime = Math.min(about.length * 30, 10000);
      console.log(`   📚 Reading About section (${Math.round(readTime/1000)}s)...`);
      await sleep(readTime);
      
      return about;
    }

    console.log('   ⚠️ No About section found');
    return '';
  } catch (error) {
    console.error('   ❌ Error extracting About:', error.message);
    return '';
  }
}

/**
 * Check pagination and go to next page
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
      
      try {
        await page.waitForSelector('li.qTpSkRrerBcUqHivKtVbqVGnMhgMkDU, li.reusable-search__result-container', { timeout: 10000 });
      } catch (e) {
        console.log('⚠️ Timeout waiting for results, continuing...');
      }
      
      await sleep(randomDelay(2000, 3000));
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

    console.log('\n' + '═'.repeat(70));
    console.log('🎯 LinkedIn People Profile Scraper');
    console.log('═'.repeat(70));
    console.log('🔍 Searches for people and extracts profile data');
    console.log('📊 Saves ALL data to MongoDB');
    console.log('📥 Export as CSV from dashboard');
    console.log('📄 Supports pagination across multiple pages');
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

    // Try to use saved cookies first
    if (useSavedCookies) {
      console.log('🍪 Checking for saved session...');
      const savedCookies = await getCookies(username);
      
      if (savedCookies && savedCookies.length > 0) {
        console.log(`✅ Found ${savedCookies.length} saved cookies`);
        
        try {
          await page.setCookie(...savedCookies);
          await page.goto('https://www.linkedin.com/feed/', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
          });

          const currentUrl = page.url();
          if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork')) {
            console.log('✅ Session restored successfully!');
            loggedIn = true;
          }
        } catch (error) {
          console.log('⚠️ Error restoring session, will login fresh');
        }
      }
    }

    // Login if cookies didn't work
    if (!loggedIn) {
      if (!password) {
        console.error('❌ LINKEDIN_PASSWORD is required for fresh login');
        await browser.close();
        return;
      }

      console.log('🔐 Logging in...');
      loggedIn = await linkedInLogin(page, username, password, true);
      
      if (!loggedIn) {
        console.log('❌ Login failed');
        await browser.close();
        return;
      }

      const cookies = await page.cookies();
      await saveCookies(username, cookies);
      console.log(`✅ Saved ${cookies.length} cookies\n`);
    }

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
    
    try {
      await page.waitForSelector('li.qTpSkRrerBcUqHivKtVbqVGnMhgMkDU, li.reusable-search__result-container, div.fWXGuvpsxPqnAsjzXFvFtNbFaXDLZzKnEc', { 
        timeout: 30000 
      });
      console.log('✅ Search results container found');
    } catch (e) {
      console.log('⚠️ Could not find search results container');
    }

    const searchLoadWait = randomDelay(8000, 12000);
    console.log(`⏳ Stabilizing search results (${Math.round(searchLoadWait/1000)}s)...`);
    await sleep(searchLoadWait);

    console.log('✅ Search results ready!\n');
    console.log('═'.repeat(70));

    let profilesScraped = 0;
    let currentPage = 1;
    let hasMorePages = true;

    while (profilesScraped < maxProfiles && hasMorePages) {
      console.log(`\n📄 Processing Page ${currentPage}`);
      console.log('─'.repeat(70));

      console.log('📜 Scrolling to load all profiles...');
      for (let scroll = 0; scroll < 3; scroll++) {
        await page.evaluate(() => window.scrollBy({ top: 800, behavior: 'smooth' }));
        await sleep(randomDelay(2000, 3000));
      }

      let personCards = await page.$$('li.qTpSkRrerBcUqHivKtVbqVGnMhgMkDU');
      
      if (personCards.length === 0) {
        console.log('⚠️ Trying alternative selector...');
        personCards = await page.$$('li.reusable-search__result-container');
      }
      
      if (personCards.length === 0) {
        console.log('⚠️ Trying div selector...');
        personCards = await page.$$('div.fWXGuvpsxPqnAsjzXFvFtNbFaXDLZzKnEc');
      }
      
      console.log(`📋 Found ${personCards.length} profiles on page ${currentPage}\n`);

      if (personCards.length === 0) {
        console.log('❌ No profiles found');
        break;
      }

      let processedOnThisPage = 0;
      
      while (processedOnThisPage < personCards.length && profilesScraped < maxProfiles) {
        console.log(`👤 Profile ${profilesScraped + 1}/${maxProfiles} (Page ${currentPage}, Card ${processedOnThisPage + 1}/${personCards.length})`);
        console.log('─'.repeat(70));

        let currentCards = await page.$$('li.qTpSkRrerBcUqHivKtVbqVGnMhgMkDU');
        if (currentCards.length === 0) {
          currentCards = await page.$$('li.reusable-search__result-container');
        }
        if (currentCards.length === 0) {
          currentCards = await page.$$('div.fWXGuvpsxPqnAsjzXFvFtNbFaXDLZzKnEc');
        }

        if (processedOnThisPage >= currentCards.length) {
          console.log('⚠️ No more cards available at this position');
          break;
        }

        const card = currentCards[processedOnThisPage];

        try {
          await card.evaluate(el => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
          await sleep(randomDelay(1500, 2500));
        } catch (scrollError) {
          console.log('⚠️ Could not scroll to element, trying to continue...');
        }

        let profileData;
        try {
          profileData = await extractSearchProfileData(card);
        } catch (extractError) {
          console.log('⚠️ Error extracting data, skipping this profile...');
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
        console.log(`   📍 Location: ${profileData.location}`);
        console.log(`   💼 Headline: ${profileData.headline.substring(0, 60)}...`);
        if (profileData.followers) {
          console.log(`   👥 Followers: ${profileData.followers}`);
        }

        // Visit profile
        const about = await extractProfileAbout(page, profileData.profileUrl);
        profileData.about = about;

        // ✅ SAVE TO MONGODB
        try {
          await logActivity({
            action: 'profile_viewed',
            postUrl: profileData.profileUrl,
            authorName: profileData.name,
            postPreview: profileData.headline,
            commentText: about.substring(0, 200),
            postType: 'profile',
            isJobPost: false
          });
          
          profilesScraped++;
          console.log(`   ✅ Saved to MongoDB! (Total: ${profilesScraped}/${maxProfiles})`);
        } catch (err) {
          console.log('   ⚠️ MongoDB save failed');
        }

        processedOnThisPage++;

        const preBackWait = randomDelay(2000, 4000);
        console.log(`   ⏳ Pausing before going back (${Math.round(preBackWait/1000)}s)...`);
        await sleep(preBackWait);

        console.log('   🔙 Returning to search results...');
        try {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 20000 });
        } catch (backError) {
          console.log('   ⚠️ Back navigation slow, continuing...');
        }
        
        const postBackWait = randomDelay(4000, 7000);
        console.log(`   ⏳ Stabilizing after return (${Math.round(postBackWait/1000)}s)...`);
        await sleep(postBackWait);

        await page.evaluate((index) => {
          const cards = document.querySelectorAll('li.qTpSkRrerBcUqHivKtVbqVGnMhgMkDU, li.reusable-search__result-container');
          if (cards[index]) {
            cards[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, processedOnThisPage);
        await sleep(1000);
      }

      if (profilesScraped < maxProfiles) {
        console.log('\n📄 Checking for next page...');
        hasMorePages = await goToNextPage(page);
        
        if (hasMorePages) {
          currentPage++;
          console.log(`✅ Successfully moved to page ${currentPage}`);
        }
      }
    }

    console.log('\n' + '═'.repeat(70));
    console.log('✅ SCRAPING COMPLETED!');
    console.log('═'.repeat(70));
    console.log(`\n📊 Statistics:`);
    console.log(`   • Profiles Scraped: ${profilesScraped}`);
    console.log(`   • Pages Processed: ${currentPage}`);
    console.log(`   • Search Keyword: "${searchKeyword}"`);
    console.log(`\n📊 MongoDB Storage:`);
    console.log(`   • Database: linkedin-automation`);
    console.log(`   • Collection: activities`);
    console.log(`   • Records Saved: ${profilesScraped}`);
    console.log(`\n📥 Download Data:`);
    console.log(`   • API: GET http://localhost:3000/api/logs/user/${username}`);
    console.log(`   • CSV: GET http://localhost:3000/api/logs/download/${username}`);
    console.log('═'.repeat(70) + '\n');

    await sleep(10000);
    await browser.close();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await browser.close();
  }
}

scrapeLinkedInPeopleProfiles();
