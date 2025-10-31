import { sleep, randomDelay, humanLikeType } from '../utils/helpers.js';

/**
 * Human-like mouse movement and click (inline implementation)
 */
async function humanLikeClick(page, element, options = {}) {
  const {
    minDelay = 300,
    maxDelay = 800,
    moveSteps = 10,
    jitter = true
  } = options;

  try {
    // Get element position
    const boundingBox = await element.boundingBox();
    if (!boundingBox) {
      console.log('   ⚠️ Element not visible, trying direct click');
      await element.click();
      return true;
    }

    // Calculate target position with small randomization
    let targetX = boundingBox.x + boundingBox.width / 2;
    let targetY = boundingBox.y + boundingBox.height / 2;

    if (jitter) {
      targetX += (Math.random() - 0.5) * 10;
      targetY += (Math.random() - 0.5) * 10;
    }

    // Get current mouse position (approximate - center of screen)
    const currentPos = { x: 960, y: 540 };

    // Move mouse in human-like pattern with easing
    const steps = moveSteps;
    for (let i = 0; i < steps; i++) {
      const progress = i / steps;
      
      // Ease-out function for natural deceleration
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const x = currentPos.x + (targetX - currentPos.x) * easeProgress;
      const y = currentPos.y + (targetY - currentPos.y) * easeProgress;

      await page.mouse.move(x, y);
      await sleep(randomDelay(10, 30));
    }

    // Final position
    await page.mouse.move(targetX, targetY);
    await sleep(randomDelay(minDelay, maxDelay));

    // Click with random button (always left for now)
    await page.mouse.click(targetX, targetY);
    await sleep(randomDelay(200, 400));

    return true;

  } catch (error) {
    console.log(`   ⚠️ Human-like click failed: ${error.message}, trying direct click`);
    try {
      await element.click();
      return true;
    } catch (e) {
      console.log('   ❌ Direct click also failed');
      return false;
    }
  }
}

/**
 * Send connection request from profile page (handles 1st, 2nd, 3rd connections)
 */
export async function sendConnectionRequest(page, personName, addNote = false, noteText = '') {
  try {
    console.log('   🔍 Looking for Connect button on profile...');
    await sleep(randomDelay(1000, 2000));

    // PRIORITY 1: "Invite to connect" button (3rd degree)
    let connectButton = await page.$('button[aria-label*="Invite"][aria-label*="to connect"]');
    let connectionType = 'invite';
    
    if (!connectButton) {
      // PRIORITY 2: "Connect" button (1st/2nd degree or available to message)
      connectButton = await page.$('button[aria-label*="Connect"]');
      connectionType = 'connect';
    }

    // PRIORITY 3: "Add" button with "Invite" aria-label
    if (!connectButton) {
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent.trim());
        const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label')) || '';
        
        if (text === 'Add' && ariaLabel.toLowerCase().includes('invite')) {
          connectButton = button;
          connectionType = 'add-invite';
          break;
        }
      }
    }

    // PRIORITY 4: Any "Connect" text button
    if (!connectButton) {
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent.trim());
        if (text === 'Connect') {
          connectButton = button;
          connectionType = 'connect-text';
          break;
        }
      }
    }

    if (!connectButton) {
      console.log('   ⚠️ Connect button not found');
      return false;
    }

    console.log(`   ✅ Found ${connectionType} button`);
    
    // Scroll button into view
    await connectButton.evaluate(el => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await sleep(randomDelay(500, 1000));

    // Human-like click
    console.log('   👆 Clicking with human-like movement...');
    const clicked = await humanLikeClick(page, connectButton, {
      minDelay: 300,
      maxDelay: 800,
      moveSteps: 15,
      jitter: true
    });

    if (!clicked) {
      console.log('   ⚠️ Click failed');
      return false;
    }

    console.log('   ✅ Button clicked successfully');
    await sleep(randomDelay(2000, 4000));

    // ==================== HANDLE MODAL ====================
    console.log('   📋 Waiting for modal to appear...');
    
    let modalFound = false;
    let retries = 5;

    while (!modalFound && retries > 0) {
      const modal = await page.$('div[role="dialog"]');
      
      if (modal) {
        modalFound = true;
        console.log('   ✅ Modal appeared');
        break;
      }

      console.log(`   ⏳ Modal not found, waiting... (${retries} retries left)`);
      await sleep(1000);
      retries--;
    }

    if (!modalFound) {
      console.log('   ⚠️ Modal did not appear');
      return false;
    }

    await sleep(randomDelay(1000, 2000));

    // ==================== SEND WITHOUT NOTE (DEFAULT) ====================
    console.log('   📤 Looking for Send button...');

    // PRIORITY 1: "Send without a note" button
    let sendButton = await page.$('button[aria-label="Send without a note"]');
    
    if (!sendButton) {
      // PRIORITY 2: "Send now" button
      sendButton = await page.$('button[aria-label="Send now"]');
    }

    // PRIORITY 3: Any button with "Send" text (but not dismiss)
    if (!sendButton) {
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent.trim());
        const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label')) || '';
        
        if ((text === 'Send' || text === 'Send without a note') && 
            !ariaLabel.toLowerCase().includes('dismiss')) {
          sendButton = button;
          break;
        }
      }
    }

    if (!sendButton) {
      console.log('   ⚠️ Send button not found');
      return false;
    }

    console.log('   ✅ Found Send button');
    await sleep(randomDelay(800, 1500));

    // Scroll send button into view
    await sendButton.evaluate(el => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await sleep(randomDelay(300, 600));

    // Human-like click on send button
    console.log('   👆 Clicking Send button with human-like movement...');
    const sendClicked = await humanLikeClick(page, sendButton, {
      minDelay: 400,
      maxDelay: 900,
      moveSteps: 12,
      jitter: true
    });

    if (!sendClicked) {
      console.log('   ⚠️ Send button click failed');
      return false;
    }

    console.log('   ✅ Connection request sent successfully!');
    await sleep(randomDelay(2000, 4000));
    
    return true;

  } catch (error) {
    console.error('   ❌ Error:', error.message);
    return false;
  }
}
