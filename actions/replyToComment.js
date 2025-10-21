import { sleep, randomDelay, humanLikeType } from '../utils/helpers.js';

export async function likeReply(replyElement) {
  try {
    console.log('👍 Attempting to like the reply...');
    
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
    await sleep(randomDelay(2000, 3500)); // Longer pause after liking
    return true;
    
  } catch (error) {
    console.error('❌ Error liking reply:', error.message);
    return false;
  }
}

export async function replyToComment(replyElement, page, replyText) {
  try {
    console.log('💬 Attempting to reply...');
    
    const replyButton = await replyElement.$('button[aria-label*="Reply"]');
    
    if (!replyButton) {
      console.log('❌ Reply button not found');
      return false;
    }
    
    await replyButton.click();
    console.log('✅ Reply box opened');
    await sleep(randomDelay(3000, 4500)); // Longer wait for reply box

    await sleep(2000);
    
    const replyInput = await page.$('div.ql-editor[contenteditable="true"]');
    
    if (!replyInput) {
      console.log('❌ Reply input box not found');
      return false;
    }

    // Pause before typing (thinking time)
    console.log('💭 Thinking before replying...');
    await sleep(randomDelay(1500, 2500));

    console.log(`⌨️ Typing reply slowly: "${replyText}"`);
    
    // Human-like typing with slower speed
    await humanLikeType(replyInput, replyText, {
      minDelay: 90,       // Slower typing
      maxDelay: 220,      // Even slower max
      pauseEvery: 12,     // Pause frequently
      pauseDelay: 500,    // Longer pauses
      mistakeChance: 0.04 // 4% chance of typo
    });

    console.log('📖 Re-reading reply...');
    await sleep(randomDelay(2500, 4000)); // Read what we wrote

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

    const isEnabled = await submitButton.evaluate(el => !el.disabled);
    
    if (!isEnabled) {
      console.log('⚠️ Reply button is disabled');
      return false;
    }

    console.log('👀 About to post reply...');
    await sleep(randomDelay(1000, 1800)); // Final pause

    console.log('🖱️ Clicking Reply button...');
    await submitButton.click();
    console.log('✅ Reply posted!');
    await sleep(randomDelay(3500, 5000));
    return true;
    
  } catch (error) {
    console.error('❌ Error replying to comment:', error.message);
    return false;
  }
}
