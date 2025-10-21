import { sleep, randomDelay } from '../utils/helpers.js';

/**
 * Like a reply
 */
export async function likeReply(replyElement) {
  try {
    console.log('👍 Attempting to like the reply...');
    
    // Look for the Like button in the reply
    const likeButton = await replyElement.$('button[aria-label*="React Like"], button[aria-label*="Like"]');
    
    if (!likeButton) {
      console.log('❌ Like button not found');
      return false;
    }

    const isLiked = await likeButton.evaluate(el => el.getAttribute('aria-pressed') === 'true');

    if (isLiked) {
      console.log('⚠️ Reply already liked');
      return false;
    }

    await likeButton.click();
    console.log('✅ Reply liked!');
    await sleep(randomDelay(1500, 2500));
    return true;
    
  } catch (error) {
    console.error('❌ Error liking reply:', error.message);
    return false;
  }
}

/**
 * Reply to a comment/reply
 */
export async function replyToComment(replyElement, page, replyText) {
  try {
    console.log('💬 Attempting to reply...');
    
    // Find and click the Reply button
    const replyButton = await replyElement.$('button[aria-label*="Reply"]');
    
    if (!replyButton) {
      console.log('❌ Reply button not found');
      return false;
    }
    
    await replyButton.click();
    console.log('✅ Reply box opened');
    await sleep(randomDelay(2500, 3500));

    // Wait for the reply input box to appear
    await sleep(2000);
    
    // The reply box should appear right after the comment
    // Look for the contenteditable div near the reply element
    const replyInput = await page.$('div.ql-editor[contenteditable="true"]');
    
    if (!replyInput) {
      console.log('❌ Reply input box not found');
      return false;
    }

    await replyInput.click();
    await sleep(randomDelay(1000, 1500));

    console.log(`⌨️ Typing reply: "${replyText}"`);
    await replyInput.type(replyText, { delay: randomDelay(80, 150) });
    await sleep(randomDelay(2500, 3500));

    // Find the Reply submit button
    // It should have class comments-comment-box__submit-button--cr and text "Reply"
    const submitButtons = await page.$$('button.comments-comment-box__submit-button--cr');
    
    let submitButton = null;
    for (const button of submitButtons) {
      const buttonText = await button.evaluate(el => el.textContent.trim());
      if (buttonText === 'Reply') {
        submitButton = button;
        break;
      }
    }
    
    if (!submitButton) {
      console.log('❌ Reply submit button not found');
      return false;
    }

    // Check if enabled
    const isEnabled = await submitButton.evaluate(el => !el.disabled);
    
    if (!isEnabled) {
      console.log('⚠️ Reply button is disabled');
      return false;
    }

    console.log('🖱️ Clicking Reply button...');
    await submitButton.click();
    console.log('✅ Reply posted!');
    await sleep(randomDelay(3000, 4000));
    return true;
    
  } catch (error) {
    console.error('❌ Error replying to comment:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}
