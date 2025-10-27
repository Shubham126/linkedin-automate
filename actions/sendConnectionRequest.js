import { sleep, randomDelay, humanLikeType } from '../utils/helpers.js';

/**
 * Send connection request from profile page
 */
export async function sendConnectionRequest(page, personName, addNote = false, noteText = '') {
  try {
    console.log('🤝 Looking for Connect button...');

    // Find Connect button
    let connectButton = await page.$('button[aria-label*="Invite"][aria-label*="to connect"]');
    
    if (!connectButton) {
      // Alternative selectors
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent.trim());
        const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label'));
        
        if (text === 'Connect' || (ariaLabel && ariaLabel.includes('connect'))) {
          connectButton = button;
          break;
        }
      }
    }

    if (!connectButton) {
      console.log('⚠️ Connect button not found (might already be connected)');
      return false;
    }

    console.log('✅ Found Connect button');
    await sleep(randomDelay(1000, 2000));
    
    await connectButton.click();
    console.log('👆 Clicked Connect button');
    
    await sleep(randomDelay(2000, 3000));

    // Check if "Add a note" dialog appeared
    if (addNote && noteText) {
      console.log('📝 Adding personalized note...');
      
      const addNoteButton = await page.$('button[aria-label="Add a note"]');
      if (addNoteButton) {
        await addNoteButton.click();
        await sleep(randomDelay(1500, 2500));

        const noteTextarea = await page.$('textarea[name="message"]');
        if (noteTextarea) {
          await humanLikeType(noteTextarea, noteText, {
            minDelay: 80,
            maxDelay: 200,
            pauseEvery: 12,
            pauseDelay: 400
          });
          
          console.log(`✅ Note added: "${noteText.substring(0, 50)}..."`);
          await sleep(randomDelay(1000, 2000));
        }
      }
    }

    // Click "Send" button
    console.log('📤 Looking for Send button...');
    const sendButton = await page.$('button[aria-label="Send now"]');
    
    if (sendButton) {
      await sleep(randomDelay(1000, 2000));
      await sendButton.click();
      console.log('✅ Connection request sent!');
      
      await sleep(randomDelay(3000, 5000));
      return true;
    } else {
      console.log('⚠️ Send button not found');
      return false;
    }

  } catch (error) {
    console.error('❌ Error sending connection request:', error.message);
    return false;
  }
}
