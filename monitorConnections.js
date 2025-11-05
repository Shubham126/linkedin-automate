// ==================== FILE: monitorConnections.js (CSV-FIRST APPROACH) ====================
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import { linkedInLogin } from './actions/login.js';
import { sleep, randomDelay } from './utils/helpers.js';
import { getCookies, saveCookies } from './services/cookieService.js';
import { getProxyArgs, authenticateProxy, testProxyConnection } from './utils/proxyHelper.js';
import csvService from './services/csvService.js';
import UserCSV from './models/UserCSV.js'; // NEW: Only log CSV metadata
import Activity from './models/Activity.js';

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

// ==================== GET PENDING CONNECTIONS ====================

/**
 * Get pending connections from MongoDB
 */
async function getPendingConnections(username) {
  try {
    const logs = await Activity.find({
      username: username,
      action: 'connection_requested'
    }).limit(10);

    return logs;
  } catch (error) {
    console.error('Error fetching pending connections:', error.message);
    return [];
  }
}

// ==================== CONNECTION STATUS CHECK ====================

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

// ==================== UPDATE MONGODB WITH CSV METADATA ====================

/**
 * Update MongoDB with CSV file references and statistics
 */
async function updateMongoDBWithCSVMetadata(username, acceptedCount, totalChecked) {
  try {
    // Get CSV paths and stats
    const csvStats = await csvService.getUserStats(username);
    const csvPaths = await csvService.getUserCSVPaths(username);

    // Update or create UserCSV record in MongoDB
    const updatedRecord = await UserCSV.findOneAndUpdate(
      { user_email: username },
      {
        user_email: username,
        csv_paths: csvPaths?.csv_paths || {},
        summary_stats: {
          total_engagement_likes: csvStats.total_engagement_likes || 0,
          total_engagement_comments: csvStats.total_engagement_comments || 0,
          total_connections_sent: csvStats.total_connections_sent || 0,
          total_messages_sent: csvStats.total_messages_sent || 0,
          total_posts_created: 0,
          total_accepted_connections: acceptedCount,
          total_checked_connections: totalChecked
        },
        updated_at: new Date()
      },
      { new: true, upsert: true }
    );

    console.log('   ✅ MongoDB updated with CSV metadata');
    return updatedRecord;
  } catch (error) {
    console.error('   ⚠️ Error updating MongoDB:', error.message);
    return null;
  }
}

// ==================== MAIN FUNCTION ====================

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

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'language', {
        get: function() { return 'en-US'; }
      });
      Object.defineProperty(navigator, 'languages', {
        get: function() { return ['en-US', 'en']; }
      });
    });

    console.log('\n' + '═'.repeat(70));
    console.log('👀 LinkedIn Connection Monitor');
    console.log('═'.repeat(70));
    console.log('🔍 Checks pending connections for acceptances');
    console.log('📊 Saves ALL data to CSV files');
    console.log('📁 Stores CSV file paths in MongoDB');
    console.log('📥 Download CSV from dashboard');
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

    // Get pending connections from MongoDB
    console.log('📊 Fetching pending connections from MongoDB...');
    const pendingConnections = await getPendingConnections(username);

    console.log(`📋 Found ${pendingConnections.length} pending connections to check\n`);
    console.log('═'.repeat(70));

    if (pendingConnections.length === 0) {
      console.log('\n✅ No pending connections to monitor');
      await browser.close();
      return;
    }

    let acceptedCount = 0;
    let stillPendingCount = 0;
    let unknownCount = 0;

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
        
        // ✅ SAVE TO CSV ONLY (not MongoDB)
        try {
          await csvService.appendConnectionSent(username, {
            timestamp: new Date().toISOString(),
            recipientName: connection.authorName,
            recipientProfileUrl: connection.postUrl,
            message: 'Connection accepted',
            status: 'accepted'
          });
          console.log('   ✅ Logged to CSV');
        } catch (err) {
          console.log(`   ⚠️ CSV save failed: ${err.message}`);
        }
        
        acceptedCount++;
      } else if (status === 'Pending') {
        console.log('   ⏳ Still pending...');
        
        // ✅ SAVE TO CSV
        try {
          await csvService.appendConnectionSent(username, {
            timestamp: new Date().toISOString(),
            recipientName: connection.authorName,
            recipientProfileUrl: connection.postUrl,
            message: 'Still pending',
            status: 'pending'
          });
        } catch (err) {
          console.log(`   ⚠️ CSV save failed: ${err.message}`);
        }
        
        stillPendingCount++;
      } else {
        console.log('   ❓ Status unknown, may need manual review');
        
        // ✅ SAVE TO CSV
        try {
          await csvService.appendConnectionSent(username, {
            timestamp: new Date().toISOString(),
            recipientName: connection.authorName,
            recipientProfileUrl: connection.postUrl,
            message: 'Status unknown',
            status: 'unknown'
          });
        } catch (err) {
          console.log(`   ⚠️ CSV save failed: ${err.message}`);
        }
        
        unknownCount++;
      }

      // Delay between checks
      if (i < pendingConnections.length - 1) {
        const delay = randomDelay(5000, 8000);
        console.log(`   ⏳ Waiting ${Math.round(delay/1000)}s before next check...`);
        await sleep(delay);
      }
    }

    // ==================== UPDATE MONGODB WITH CSV METADATA ====================
    console.log('\n📝 Updating MongoDB with CSV metadata...');
    await updateMongoDBWithCSVMetadata(username, acceptedCount, pendingConnections.length);

    // ==================== FINAL STATS ====================
    const csvStats = await csvService.getUserStats(username);
    const userCSVPaths = await csvService.getUserCSVPaths(username);

    console.log('\n' + '═'.repeat(70));
    console.log('✅ MONITORING COMPLETED!');
    console.log('═'.repeat(70));
    console.log(`\n📊 Session Statistics:`);
    console.log(`   • Newly Accepted: ${acceptedCount}`);
    console.log(`   • Still Pending: ${stillPendingCount}`);
    console.log(`   • Unknown Status: ${unknownCount}`);
    console.log(`   • Total Checked: ${pendingConnections.length}`);
    
    console.log('\n📁 CSV Statistics:');
    console.log(`      📄 All-Time Data:`);
    console.log(`         • Total Connections: ${csvStats.total_connections_sent || 0}`);
    console.log(`         • Total Likes: ${csvStats.total_engagement_likes || 0}`);
    console.log(`         • Total Comments: ${csvStats.total_engagement_comments || 0}`);
    console.log(`         • Total Messages: ${csvStats.total_messages_sent || 0}`);
    
    console.log('\n📂 CSV File Locations:');
    if (userCSVPaths?.csv_paths) {
      Object.entries(userCSVPaths.csv_paths).forEach(([key, value]) => {
        if (value) console.log(`      ✅ ${key}: ${value}`);
      });
    }
    
    console.log('\n🗄️  MongoDB Storage:');
    console.log(`      ✅ Database: linkedin-automation`);
    console.log(`      ✅ Collection: usercsv`);
    console.log(`      ✅ CSV Metadata: Stored`);
    console.log(`      ✅ CSV Paths: Stored`);
    
    console.log('\n💻 Frontend Dashboard:');
    console.log(`      • URL: http://localhost:5173`);
    console.log(`      • View: All CSV data with analytics`);
    console.log(`      • Download: Export any CSV file`);
    console.log(`      • API: http://localhost:3000/api/csv`);
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

console.log('\n🎯 LinkedIn Connection Monitor Automation\n');
monitorConnectionAcceptances();
