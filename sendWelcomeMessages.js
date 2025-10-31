import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { linkedInLogin } from './actions/login.js';
import { sendLinkedInMessage } from './actions/sendMessage.js';
import { getAcceptedUnmessaged, updateConnectionStatus } from './services/googleConnectionsSheetService.js';
import { sleep, randomDelay } from './utils/helpers.js';
import { getCookies, saveCookies } from './services/cookieService.js';
import { getProxyArgs, authenticateProxy, testProxyConnection } from './utils/proxyHelper.js';

dotenv.config();
puppeteer.use(StealthPlugin());

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

    console.log('\n💬 LinkedIn Welcome Messages');
    console.log('💬 Sends welcome messages to newly accepted connections');
    console.log('📊 Updates Google Sheets tracking');
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

    console.log(`👤 Sending messages for: ${username}`);

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

    // Get accepted but unmessaged connections
    console.log('📊 Fetching accepted connections...');
    const unmessaged = await getAcceptedUnmessaged();

    console.log(`📋 Found ${unmessaged.length} connections to message\n`);
    console.log('═'.repeat(60));

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
      console.log('─'.repeat(60));
      console.log(`   Name: ${connection.name}`);
      console.log(`   Accepted: ${connection.acceptanceDate}`);

      // Generate personalized message
      const firstName = connection.name.split(' ')[0];
      const messageText = messageTemplate.replace('{name}', firstName);

      console.log(`   📝 Message: "${messageText}"`);

      // Send message
      const sent = await sendLinkedInMessage(page, connection.profileUrl, messageText);

      if (sent) {
        messagesSent++;
        
        // Update Google Sheets
        await updateConnectionStatus(connection.profileUrl, 'Accepted', true);
        
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

    console.log('\n' + '═'.repeat(60));
    console.log('✅ WELCOME MESSAGE AUTOMATION COMPLETED!');
    console.log('═'.repeat(60));
    console.log(`\n📊 Statistics:`);
    console.log(`   • Messages Sent: ${messagesSent}/${unmessaged.length}`);
    console.log(`\n🔗 View Sheet: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_CONNECTIONS_SHEET_ID}`);
    console.log('═'.repeat(60));

    await sleep(10000);
    await browser.close();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await browser.close();
  }
}

sendWelcomeMessagesAutomation();
