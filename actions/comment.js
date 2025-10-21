import { sleep, randomDelay } from '../utils/helpers.js';

/**
 * Comment on a post
 * @param {Object} post - Puppeteer element handle
 * @param {Object} page - Puppeteer page
 * @param {string} commentText - Comment to post
 * @returns {Promise<boolean>} True if commented successfully
 */
export async function commentOnPost(post, page, commentText) {
  try {
    console.log('💬 Attempting to comment on post...');
    
    const commentButton = await post.$('button[aria-label*="Comment"]');
    if (!commentButton) {
      console.log('❌ Comment button not found');
      return false;
    }
    
    await commentButton.click();
    console.log('✅ Comment box opened');
    await sleep(randomDelay(3500, 4500));

    await page.locator('div.ql-editor[contenteditable="true"]').wait({ timeout: 10000 });
    
    const commentBox = await post.$('div.ql-editor[contenteditable="true"]');
    if (!commentBox) {
      console.log('❌ Comment box not found');
      return false;
    }

    await commentBox.click();
    await sleep(randomDelay(1000, 1500));

    console.log(`⌨️ Typing comment: "${commentText}"`);
    await commentBox.type(commentText, { delay: randomDelay(100, 200) });
    await sleep(randomDelay(2500, 3500));

    console.log('🔍 Searching for submit button...');
    
    let submitButton = null;
    
    const buttons = await post.$$('button');
    for (const button of buttons) {
      const text = await button.evaluate(el => el.textContent.trim());
      const hasClass = await button.evaluate(el => 
        el.className.includes('submit-button') || 
        el.className.includes('artdeco-button--primary')
      );
      
      if (text === 'Comment' && hasClass) {
        submitButton = button;
        console.log('✅ Found submit button');
        break;
      }
    }

    if (!submitButton) {
      submitButton = await post.$('button.comments-comment-box__submit-button--cr');
    }

    if (!submitButton) {
      const primaryButtons = await post.$$('button.artdeco-button--primary');
      for (const button of primaryButtons) {
        const text = await button.evaluate(el => el.textContent.trim());
        if (text === 'Comment' || text === 'Post') {
          submitButton = button;
          break;
        }
      }
    }

    if (!submitButton) {
      console.log('❌ Submit button not found');
      return false;
    }

    console.log('⏳ Waiting for submit button to be enabled...');
    try {
      await page.waitForFunction(
        (btn) => !btn.disabled && btn.offsetParent !== null,
        { timeout: 8000 },
        submitButton
      );
    } catch (e) {
      console.log('⚠️ Button enable check timeout, attempting click anyway...');
    }

    const isEnabled = await submitButton.evaluate(el => !el.disabled);
    if (!isEnabled) {
      console.log('⚠️ Submit button is disabled, skipping...');
      return false;
    }

    console.log('🖱️ Clicking submit button...');
    await submitButton.click();
    console.log('✅ Comment posted successfully!');
    
    await sleep(randomDelay(3000, 5000));
    return true;
    
  } catch (error) {
    console.error('❌ Error commenting on post:', error.message);
    return false;
  }
}
