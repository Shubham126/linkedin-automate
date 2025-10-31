import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { linkedInLogin } from './actions/login.js';
import { getPendingConnections, updateConnectionStatus } from './services/googleConnectionsSheetService.js';
import { sleep, randomDelay } from './utils/helpers.js';
import { getCookies, saveCookies } from './services/cookieService.js';
import { getProxyArgs, authenticateProxy, testProxyConnection } from './utils/proxyHelper.js';

dotenv.config();
puppeteer.use(StealthPlugin());

/**
 * Check if connection was accepted by visiting their profile
 */
async function checkConnectionStatus(page, profileUrl) {
  try {
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(randomDelay(3000, 5000));

    // Check for connection degree
    const connectionBadge = await page.evaluate(() => {
      const badges = document.querySelectorAll('span[class*="dist-value"]');
      for (const badge of badges) {
        const text = badge.textContent.trim();
        if (text.includes('1st') || text.includes('2nd') || text.includes('3rd')) {
          return text;
        }
      }
      return null;
    });

    if (connectionBadge && connectionBadge.includes('1st')) {
      return 'Accepted';
    } else if (connectionBadge && connectionBadge.includes('3rd')) {
      return 'Pending';
    }

    // Also check if "Message" button exists (indicates 1st degree connection)
    const messageButton = await page.$('button[aria-label*="Message"]');
    if (messageButton) {
      return 'Accepted';
    }

    // Check if "Pending" button exists
    const pendingButton = await page.$('button[aria-label*="Pending"]');
    if (pendingButton) {
      return 'Pending';
    }

    return 'Unknown';
  } catch (error) {
    console.error('⚠️ Error checking status:', error.message);
    return 'Unknown';
  }
}

/**
 * Main monitoring function
 */
async function monitorConnectionAcceptances() {
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

    console.log('\n👀 LinkedIn Connection Monitor');
    console.log('🔍 Checks pending connections for acceptances');
    console.log('📊 Updates Google Sheets automatically');
    console.log('═'.repeat(60) + '\n');

    // Get credentials from environment (passed by job manager from API)
    const username = process.env.LINKEDIN_USERNAME;
    const password = process.env.LINKEDIN_PASSWORD;
    const useSavedCookies = process.env.USE_SAVED_COOKIES !== 'false';

    if (!username) {
      console.error('❌ LINKEDIN_USERNAME is required');
      await browser.close();
      return;
    }

    console.log(`👤 Monitoring for: ${username}`);

    let loggedIn = false;

    // Try saved cookies first
    if (useSavedCookies) {
      console.log('🍪 Checking for saved session...');
      const savedCookies = await getCookies(username);
      
      if (savedCookies && savedCookies.length > 0) {
        console.log('✅ Found saved cookies, attempting to restore session...');
        
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

      // Save cookies after successful login
      const cookies = await page.cookies();
      await saveCookies(username, cookies);
    }

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Get pending connections from Google Sheets
    console.log('📊 Fetching pending connections from Google Sheets...');
    const pendingConnections = await getPendingConnections();

    console.log(`📋 Found ${pendingConnections.length} pending connections to check\n`);
    console.log('═'.repeat(60));

    if (pendingConnections.length === 0) {
      console.log('\n✅ No pending connections to monitor');
      await browser.close();
      return;
    }

    let acceptedCount = 0;
    let stillPendingCount = 0;

    for (let i = 0; i < pendingConnections.length; i++) {
      const connection = pendingConnections[i];

      console.log(`\n👤 Checking ${i + 1}/${pendingConnections.length}`);
      console.log('─'.repeat(60));
      console.log(`   Name: ${connection.name}`);
      console.log(`   URL: ${connection.profileUrl}`);
      console.log(`   Request Date: ${connection.requestDate}`);

      // Check status
      console.log('   🔍 Checking connection status...');
      const status = await checkConnectionStatus(page, connection.profileUrl);

      console.log(`   📊 Status: ${status}`);

      if (status === 'Accepted') {
        console.log('   🎉 Connection was ACCEPTED!');
        
        // Update Google Sheets
        await updateConnectionStatus(connection.profileUrl, 'Accepted', false);
        
        acceptedCount++;
      } else if (status === 'Pending') {
        console.log('   ⏳ Still pending...');
        stillPendingCount++;
      }

      // Delay between checks
      if (i < pendingConnections.length - 1) {
        const delay = randomDelay(5000, 8000);
        console.log(`   ⏳ Waiting ${Math.round(delay/1000)}s before next check...`);
        await sleep(delay);
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('✅ MONITORING COMPLETED!');
    console.log('═'.repeat(60));
    console.log(`\n📊 Results:`);
    console.log(`   • Newly Accepted: ${acceptedCount}`);
    console.log(`   • Still Pending: ${stillPendingCount}`);
    console.log(`   • Total Checked: ${pendingConnections.length}`);
    console.log(`\n🔗 View Sheet: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_CONNECTIONS_SHEET_ID}`);
    console.log('═'.repeat(60));

    await sleep(10000);
    await browser.close();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await browser.close();
  }
}

monitorConnectionAcceptances();
