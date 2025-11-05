// ==================== FILE: send-welcome-messages.js ====================
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import { linkedInLogin } from './actions/login.js';
import { sendLinkedInMessage } from './actions/sendMessage.js';
import { sleep, randomDelay } from './utils/helpers.js';
import { getCookies, saveCookies } from './services/cookieService.js';
import { getProxyArgs, authenticateProxy, testProxyConnection } from './utils/proxyHelper.js';
import { logActivity, getUserLogs } from './utils/activityLogger.js';
import csvService from './services/csvService.js'; // NEW

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
 * Get accepted but unmessaged connections from MongoDB
 */
async function getAcceptedUnmessaged() {
  try {
    const username = process.env.LINKEDIN_USERNAME;
    const logs = await getUserLogs(username);

    // Filter for accepted connections that haven't been messaged
    const messaged = logs
      .filter(log => log.action === 'message_sent')
      .map(log => log.postUrl);

    // Get unique profiles that were added
    const added = logs.filter(log => log.action === 'connection_requested');
    
    return added.filter(log => !messaged.includes(log.postUrl)).slice(0, 10);
  } catch (error) {
    console.error('Error fetching accepted connections:', error);
    return [];
  }
}

/**
 * Main function - Send welcome messages
 */
async function sendWelcomeMessagesAutomation() {
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
    console.log('💬 LinkedIn Welcome Messages');
    console.log('═'.repeat(70));
    console.log('💬 Sends welcome messages to newly accepted connections');
    console.log('📊 Saves ALL data to MongoDB + CSV');
    console.log('📁 Creates CSV files for export');
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

    // Get accepted but unmessaged connections
    console.log('📊 Fetching connections to message...');
    const unmessaged = await getAcceptedUnmessaged();

    console.log(`📋 Found ${unmessaged.length} connections to message\n`);
    console.log('═'.repeat(70));

    if (unmessaged.length === 0) {
      console.log('\n✅ No new connections to message');
      await browser.close();
      return;
    }

    const messageTemplate = process.env.WELCOME_MESSAGE_TEMPLATE || 
      'Hi {name}! Thanks for connecting. Looking forward to staying in touch!';

    let messagesSent = 0;

    for (let i = 0; i < unmessaged.length; i++) {
      const connection = unmessaged[i];

      console.log(`\n💬 Message ${i + 1}/${unmessaged.length}`);
      console.log('─'.repeat(70));
      console.log(`   Name: ${connection.authorName}`);
      console.log(`   URL: ${connection.postUrl}`);

      // Generate personalized message
      const firstName = connection.authorName.split(' ')[0];
      const messageText = messageTemplate.replace('{name}', firstName);

      console.log(`   📝 Message: "${messageText}"`);

      // Send message
      const sent = await sendLinkedInMessage(page, connection.postUrl, messageText);

      if (sent) {
        messagesSent++;
        
        // ✅ MONGODB LOGGING
        try {
          await logActivity({
            action: 'message_sent',
            postUrl: connection.postUrl,
            authorName: connection.authorName,
            commentText: messageText,
            postType: 'message',
            isJobPost: false
          });
        } catch (err) {
          console.log('   ⚠️ MongoDB save failed');
        }

        // ✅ CSV LOGGING (NEW)
        try {
          await csvService.appendMessageSent(username, {
            timestamp: new Date().toISOString(),
            recipientName: connection.authorName,
            recipientProfileUrl: connection.postUrl,
            messageText: messageText,
            status: 'sent'
          });
        } catch (err) {
          console.log('   ⚠️ CSV save failed');
        }
        
        console.log('   ✅ Message sent & logged (MongoDB + CSV)');
        console.log(`   Total: ${messagesSent}/${unmessaged.length}`);
      } else {
        console.log('   ❌ Failed to send message');
      }

      // Delay between messages
      if (i < unmessaged.length - 1) {
        const delay = randomDelay(10000, 15000);
        console.log(`   ⏳ Waiting ${Math.round(delay/1000)}s before next message...`);
        await sleep(delay);
      }
    }

    // ==================== FINAL STATS WITH CSV ====================
    const csvStats = await csvService.getUserStats(username);
    const userCSVPaths = await csvService.getUserCSVPaths(username);

    console.log('\n' + '═'.repeat(70));
    console.log('✅ WELCOME MESSAGE AUTOMATION COMPLETED!');
    console.log('═'.repeat(70));
    console.log(`\n📊 Session Statistics:`);
    console.log(`   • Messages Sent: ${messagesSent}/${unmessaged.length}`);
    
    console.log('\n📁 All-Time Statistics:');
    console.log(`      📄 CSV Files:`);
    console.log(`         • Total Messages: ${csvStats.total_messages_sent || 0}`);
    console.log(`         • Total Likes: ${csvStats.total_engagement_likes || 0}`);
    console.log(`         • Total Comments: ${csvStats.total_engagement_comments || 0}`);
    console.log(`         • Total Connections: ${csvStats.total_connections_sent || 0}`);
    
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

console.log('\n🎯 LinkedIn Welcome Messages Automation\n');
sendWelcomeMessagesAutomation();
