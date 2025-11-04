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

    console.log('\n' + '═'.repeat(70));
    console.log('💬 LinkedIn Welcome Messages');
    console.log('═'.repeat(70));
    console.log('💬 Sends welcome messages to newly accepted connections');
    console.log('📊 Saves ALL data to MongoDB');
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
        
        // ✅ LOG TO MONGODB
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
        
        console.log(`   ✅ Message sent! (Total: ${messagesSent})`);
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

    console.log('\n' + '═'.repeat(70));
    console.log('✅ WELCOME MESSAGE AUTOMATION COMPLETED!');
    console.log('═'.repeat(70));
    console.log(`\n📊 Statistics:`);
    console.log(`   • Messages Sent: ${messagesSent}/${unmessaged.length}`);
    console.log(`\n📊 MongoDB Storage:`);
    console.log(`   • Database: linkedin-automation`);
    console.log(`   • Collection: activities`);
    console.log(`   • Records Saved: ${messagesSent}`);
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

console.log('\n🎯 LinkedIn Welcome Messages Automation\n');
sendWelcomeMessagesAutomation();
