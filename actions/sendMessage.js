import { sleep, randomDelay, humanLikeType } from '../utils/helpers.js';

/**
 * Send message to 1st degree connection or Open Profile
 */
export async function sendLinkedInMessage(page, profileUrl, messageText) {
  try {
    console.log('💬 Preparing to send message...');

    // Navigate to profile if not already there
    const currentUrl = page.url();
    if (!currentUrl.includes(profileUrl)) {
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(randomDelay(3000, 5000));
    }

    // Find Message button
    console.log('🔍 Looking for Message button...');
    let messageButton = await page.$('button[aria-label*="Message"]');
    
    if (!messageButton) {
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent.trim());
        const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label'));
        if (text === 'Message' || (ariaLabel && ariaLabel.includes('Message'))) {
          messageButton = button;
          break;
        }
      }
    }

    if (!messageButton) {
      console.log('⚠️ Message button not found (not connected?)');
      return false;
    }

    console.log('✅ Found Message button');
    await sleep(randomDelay(1500, 2500));
    
    await messageButton.click();
    console.log('👆 Clicked Message button');
    
    await sleep(randomDelay(4000, 6000));

    // Wait for messaging panel to appear - Try multiple selectors
    console.log('📝 Looking for message input...');
    
    let messageInput = null;
    
    // Try multiple selectors for the message input
    const inputSelectors = [
      'div.msg-form__contenteditable[contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]',
      'div.msg-form__msg-content-container div[contenteditable="true"]',
      'div[aria-label*="Write a message"]',
      'p[data-placeholder*="Write a message"]'
    ];

    for (const selector of inputSelectors) {
      messageInput = await page.$(selector);
      if (messageInput) {
        console.log(`✅ Found message input with selector: ${selector}`);
        break;
      }
    }

    if (!messageInput) {
      console.log('⚠️ Message input not found with any selector');
      
      // Debug: Show what's on the page
      const pageContent = await page.evaluate(() => {
        const msgElements = document.querySelectorAll('[class*="msg"]');
        return Array.from(msgElements).map(el => ({
          class: el.className,
          tag: el.tagName
        })).slice(0, 5);
      });
      console.log('Debug - Message elements found:', JSON.stringify(pageContent, null, 2));
      
      return false;
    }

    console.log('⌨️ Typing message...');
    
    // Click to focus
    await messageInput.click();
    await sleep(1000);
    
    // Type message character by character
    for (const char of messageText) {
      await page.keyboard.type(char);
      await sleep(randomDelay(80, 200));
    }

    console.log('✅ Message typed');
    await sleep(randomDelay(2000, 3000));

    // Find and click Send button
    console.log('📤 Looking for Send button...');
    
    let sendButton = await page.$('button[type="submit"].msg-form__send-button');
    
    if (!sendButton) {
      // Try alternative selectors
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent.trim());
        const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label'));
        
        if (text === 'Send' || (ariaLabel && ariaLabel.includes('Send'))) {
          sendButton = button;
          break;
        }
      }
    }
    
    if (!sendButton) {
      console.log('⚠️ Send button not found');
      return false;
    }

    const isDisabled = await sendButton.evaluate(el => el.disabled);
    
    if (isDisabled) {
      console.log('⚠️ Send button disabled (message too short?)');
      return false;
    }

    await sleep(randomDelay(1000, 2000));
    await sendButton.click();
    console.log('✅ Message sent!');
    
    await sleep(randomDelay(3000, 5000));
    
    // Close messaging panel if it's still open
    const closeButton = await page.$('button[aria-label*="Close"]');
    if (closeButton) {
      await closeButton.click();
      await sleep(1000);
    }
    
    return true;

  } catch (error) {
    console.error('❌ Error sending message:', error.message);
    return false;
  }
}
