import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import dotenv from "dotenv";
import { linkedInLogin } from './actions/login.js';
import { saveProfileToSheet } from './services/googlePeopleSheetService.js';
import { sleep, randomDelay } from './utils/helpers.js';

dotenv.config();
puppeteer.use(StealthPlugin());

/**
 * Extract profile data from search results
 */
async function extractSearchProfileData(personCard) {
  try {
    // Extract profile URL
    const profileLink = await personCard.$('a[href*="/in/"]');
    const profileUrl = profileLink ? await profileLink.evaluate(el => el.href) : '';

    // Extract name
    const nameElement = await personCard.$('span[aria-hidden="true"]');
    const name = nameElement ? await nameElement.evaluate(el => el.textContent.trim()) : '';

    // Extract connection degree (2nd, 3rd, etc.)
    const degreeElement = await personCard.$('.entity-result__badge-text span[aria-hidden="true"]');
    const connectionDegree = degreeElement ? await degreeElement.evaluate(el => el.textContent.trim()) : '';

    // Extract headline
    const headlineElement = await personCard.$('.entity-result__primary-subtitle');
    const headline = headlineElement ? await headlineElement.evaluate(el => el.textContent.trim()) : '';

    // Extract location
    const locationElement = await personCard.$('.entity-result__secondary-subtitle');
    const location = locationElement ? await locationElement.evaluate(el => el.textContent.trim()) : '';

    return {
      profileUrl,
      name,
      connectionDegree,
      headline,
      location,
      about: '' // Will be filled when visiting profile
    };
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
    console.log('   🌐 Visiting profile...');
    await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(randomDelay(3000, 5000));

    // Look for About section
    const aboutElement = await page.$('section[data-section="summary"] .inline-show-more-text span[aria-hidden="true"]');
    
    if (aboutElement) {
      const about = await aboutElement.evaluate(el => el.textContent.trim());
      console.log(`   ✅ About section extracted (${about.length} chars)`);
      return about;
    } else {
      console.log('   ⚠️ No About section found');
      return '';
    }
  } catch (error) {
    console.error('   ❌ Error extracting About:', error.message);
    return '';
  }
}

/**
 * Main scraping function
 */
async function scrapeLinkedInPeopleProfiles() {
  console.log('\n🎯 LinkedIn People Profile Scraper');
  console.log('🔍 Searches for people and extracts profile data');
  console.log('📊 Saves to Google Sheets');
  console.log('═'.repeat(60) + '\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      "--start-maximized",
      "--no-sandbox",
      "--lang=en-US"
    ],
  });

  try {
    const page = (await browser.pages())[0];
    page.setDefaultNavigationTimeout(60000);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Login
    console.log('🔐 Logging in...');
    const loggedIn = await linkedInLogin(page);
    if (!loggedIn) {
      console.log('❌ Login failed');
      await browser.close();
      return;
    }

    const searchKeyword = process.env.SEARCH_KEYWORD || 'vibe coding';
    const maxProfiles = parseInt(process.env.MAX_PROFILES_TO_SCRAPE) || 20;

    // Search for people
    console.log(`\n🔍 Searching for: "${searchKeyword}"`);
    const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchKeyword)}`;
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(5000);

    console.log('✅ People search results loaded\n');
    console.log('═'.repeat(60));

    let profilesScraped = 0;
    let currentScrollPosition = 0;

    while (profilesScraped < maxProfiles) {
      // Get all person cards on current page
      const personCards = await page.$$('li.reusable-search__result-container');
      
      console.log(`\n📋 Found ${personCards.length} profiles on page`);

      for (let i = currentScrollPosition; i < personCards.length && profilesScraped < maxProfiles; i++) {
        const card = personCards[i];
        
        console.log(`\n👤 Profile ${profilesScraped + 1}/${maxProfiles}`);
        console.log('─'.repeat(60));

        // Scroll card into view
        await card.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await sleep(randomDelay(2000, 3000));

        // Extract basic data from search results
        const profileData = await extractSearchProfileData(card);
        
        if (!profileData || !profileData.profileUrl) {
          console.log('⚠️ Could not extract profile data, skipping...');
          continue;
        }

        console.log(`   👤 Name: ${profileData.name}`);
        console.log(`   🔗 URL: ${profileData.profileUrl}`);
        console.log(`   📊 Connection: ${profileData.connectionDegree}`);
        console.log(`   💼 Headline: ${profileData.headline.substring(0, 50)}...`);

        // Visit profile to get About section
        const about = await extractProfileAbout(page, profileData.profileUrl);
        profileData.about = about;

        // Save to Google Sheets
        await saveProfileToSheet(profileData);

        profilesScraped++;

        // Go back to search results
        await page.goBack();
        await sleep(randomDelay(2000, 3000));
      }

      currentScrollPosition = personCards.length;

      // Scroll to load more results
      if (profilesScraped < maxProfiles) {
        console.log('\n📜 Scrolling for more profiles...');
        await page.evaluate(() => window.scrollBy({ top: 1000, behavior: 'smooth' }));
        await sleep(randomDelay(3000, 5000));
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('✅ SCRAPING COMPLETED!');
    console.log('═'.repeat(60));
    console.log(`\n📊 Statistics:`);
    console.log(`   • Profiles Scraped: ${profilesScraped}`);
    console.log(`   • Search Keyword: "${searchKeyword}"`);
    console.log(`\n🔗 View Sheet: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_PEOPLE_SHEET_ID}`);
    console.log('═'.repeat(60));

    await sleep(10000);

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error(err.stack);
  }
}

scrapeLinkedInPeopleProfiles();
