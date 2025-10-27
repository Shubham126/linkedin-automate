import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import dotenv from "dotenv";
import { linkedInLogin } from './actions/login.js';
import { sendLinkedInMessage } from './actions/sendMessage.js';
import { getAcceptedUnmessaged, updateConnectionStatus } from './services/googleConnectionsSheetService.js';
import { sleep, randomDelay } from './utils/helpers.js';

dotenv.config();
puppeteer.use(StealthPlugin());

/**
 * Main function - Send welcome messages
 */
async function sendWelcomeMessagesAutomation() {
  console.log('\n🎯 LinkedIn Welcome Message Automation');
  console.log('💬 Sends welcome messages to newly accepted connections');
  console.log('📊 Updates Google Sheets tracking');
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
    page.setDefaultNavigationTimeout(90000);

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
    console.log('✅ Login successful!\n');

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

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error(err.stack);
  }
}

sendWelcomeMessagesAutomation();
