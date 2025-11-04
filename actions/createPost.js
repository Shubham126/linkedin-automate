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
 * Create a LinkedIn post with AI-generated content
 */
export async function createLinkedInPost(page, postText, options = {}) {
  try {
    console.log('\n📝 Starting post creation...');
    
    // Navigate to feed if not already there
    const currentUrl = page.url();
    if (!currentUrl.includes('/feed/')) {
      console.log('🏠 Navigating to LinkedIn feed...');
      await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      await sleep(3000);
    }

    // PRIORITY 1: "Start a post" button (aria-label)
    console.log('🔍 Looking for "Start a post" button...');
    let startPostButton = await page.$('button[aria-label*="Start a post"]');
    
    if (!startPostButton) {
      // PRIORITY 2: Search through all buttons for "Start a post" text
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent.trim());
        const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label')) || '';
        
        if (text.includes('Start a post') || ariaLabel.includes('Start a post')) {
          startPostButton = button;
          break;
        }
      }
    }

    if (!startPostButton) {
      console.log('❌ Could not find "Start a post" button');
      return false;
    }

    console.log('✅ Found "Start a post" button');

    // Scroll button into view
    await startPostButton.evaluate(el => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await sleep(randomDelay(500, 1000));

    // Human-like click
    console.log('👆 Clicking with human-like movement...');
    let clicked = await humanLikeClick(page, startPostButton, {
      minDelay: 300,
      maxDelay: 800,
      moveSteps: 15,
      jitter: true
    });

    if (!clicked) {
      console.log('⚠️ Click failed');
      return false;
    }

    console.log('✅ Button clicked successfully');
    await sleep(randomDelay(2000, 4000));

    // ==================== WAIT FOR POST EDITOR ====================
    console.log('⏳ Waiting for post editor to appear...');
    
    try {
      await page.waitForSelector('div.ql-editor[contenteditable="true"]', { timeout: 10000 });
    } catch (e) {
      console.log('⚠️ Editor timeout, trying alternative selector...');
      await page.waitForSelector('[contenteditable="true"]', { timeout: 10000 });
    }

    await sleep(1000);

    // Find the editor
    let editor = await page.$('div.ql-editor[contenteditable="true"]');
    
    if (!editor) {
      editor = await page.$('[contenteditable="true"]');
    }

    if (!editor) {
      console.log('❌ Post editor not found');
      return false;
    }

    console.log('✅ Post editor opened');

    // ==================== TYPE POST CONTENT ====================
    
    // Add hashtags if provided
    let fullPostText = postText;
    if (options.hashtags && options.hashtags.length > 0) {
      const hashtagString = '\n\n' + options.hashtags.map(tag => 
        tag.startsWith('#') ? tag : `#${tag}`
      ).join(' ');
      fullPostText += hashtagString;
    }

    // Type the post content with human-like speed
    console.log('💭 Thinking before typing...');
    await sleep(randomDelay(1500, 2500));

    console.log('⌨️ Typing post content...');
    console.log(`📝 "${fullPostText.substring(0, 100)}..."`);

    await humanLikeType(editor, fullPostText, {
      minDelay: 90,
      maxDelay: 220,
      pauseEvery: 15,
      pauseDelay: 500,
      mistakeChance: 0.02
    });

    console.log('✅ Post content typed');

    // ==================== REVIEW POST ====================
    console.log('📖 Re-reading post before publishing...');
    await sleep(randomDelay(3000, 5000));

    // ==================== FIND AND CLICK POST BUTTON ====================
    console.log('🔍 Looking for Post button...');

    // PRIORITY 1: "Post" button (aria-label)
    let postButton = await page.$('button[aria-label="Post"]');

    if (!postButton) {
      // PRIORITY 2: Search through all buttons for "Post" text
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent.trim());
        const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label')) || '';
        
        if ((text === 'Post' || ariaLabel === 'Post') && 
            !ariaLabel.toLowerCase().includes('dismiss')) {
          postButton = button;
          break;
        }
      }
    }

    if (!postButton) {
      console.log('❌ Post button not found');
      return false;
    }

    console.log('✅ Found Post button');

    // Check if button is enabled
    const isEnabled = await postButton.evaluate(el => !el.disabled);

    if (!isEnabled) {
      console.log('⚠️ Post button is disabled (content may be empty)');
      return false;
    }

    // Scroll button into view
    await postButton.evaluate(el => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await sleep(randomDelay(500, 1000));

    // Final pause before posting
    console.log('👀 About to publish post...');
    await sleep(randomDelay(1000, 2000));

    // Human-like click on post button
    console.log('👆 Clicking Post button with human-like movement...');
    const postClicked = await humanLikeClick(page, postButton, {
      minDelay: 400,
      maxDelay: 900,
      moveSteps: 12,
      jitter: true
    });

    if (!postClicked) {
      console.log('⚠️ Post button click failed');
      return false;
    }

    console.log('✅ Post published successfully!');
    await sleep(randomDelay(3000, 5000));

    return true;

  } catch (error) {
    console.error('❌ Error creating post:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}
