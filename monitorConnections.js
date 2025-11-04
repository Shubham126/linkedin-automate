// ==================== FILE: monitor-connections.js ====================
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import { linkedInLogin } from './actions/login.js';
import { sleep, randomDelay } from './utils/helpers.js';
import { getCookies, saveCookies } from './services/cookieService.js';
import { getProxyArgs, authenticateProxy, testProxyConnection } from './utils/proxyHelper.js';
import { logActivity, getUserLogs } from './utils/activityLogger.js';

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
 * Get pending connections from MongoDB
 */
async function getPendingConnections() {
  try {
    const username = process.env.LINKEDIN_USERNAME;
    const logs = await getUserLogs(username);
    
    // Return pending connections that haven't been checked for acceptance yet
    return logs
      .filter(log => log.action === 'connection_requested')
      .slice(0, 10);
  } catch (error) {
    console.error('Error fetching pending connections:', error);
    return [];
  }
}

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
    console.log('👀 LinkedIn Connection Monitor');
    console.log('═'.repeat(70));
    console.log('🔍 Checks pending connections for acceptances');
    console.log('📊 Updates MongoDB with results');
    console.log('📥 Export as CSV from dashboard');
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

    // Try saved cookies first
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

    // Get pending connections from MongoDB
    console.log('📊 Fetching pending connections from MongoDB...');
    const pendingConnections = await getPendingConnections();

    console.log(`📋 Found ${pendingConnections.length} pending connections to check\n`);
    console.log('═'.repeat(70));

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
      console.log('─'.repeat(70));
      console.log(`   Name: ${connection.authorName}`);
      console.log(`   URL: ${connection.postUrl}`);
      console.log(`   Added: ${new Date(connection.timestamp).toLocaleDateString()}`);

      // Check status
      console.log('   🔍 Checking connection status...');
      const status = await checkConnectionStatus(page, connection.postUrl);

      console.log(`   📊 Status: ${status}`);

      if (status === 'Accepted') {
        console.log('   🎉 Connection was ACCEPTED!');
        
        // ✅ LOG TO MONGODB
        try {
          await logActivity({
            action: 'connection_accepted',
            postUrl: connection.postUrl,
            authorName: connection.authorName,
            postPreview: `Status changed from pending to accepted`,
            postType: 'connection_status',
            isJobPost: false
          });
        } catch (err) {
          console.log('   ⚠️ MongoDB save failed');
        }
        
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

    console.log('\n' + '═'.repeat(70));
    console.log('✅ MONITORING COMPLETED!');
    console.log('═'.repeat(70));
    console.log(`\n📊 Results:`);
    console.log(`   • Newly Accepted: ${acceptedCount}`);
    console.log(`   • Still Pending: ${stillPendingCount}`);
    console.log(`   • Total Checked: ${pendingConnections.length}`);
    console.log(`\n📊 MongoDB Storage:`);
    console.log(`   • Database: linkedin-automation`);
    console.log(`   • Collection: activities`);
    console.log(`   • Records Updated: ${acceptedCount}`);
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

console.log('\n🎯 LinkedIn Connection Monitor Automation\n');
monitorConnectionAcceptances();
