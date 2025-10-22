import { sleep, randomDelay } from '../utils/helpers.js';

/**
 * Like a post using multiple selector strategies
 * @param {Object} post - Puppeteer element handle
 * @returns {Promise<boolean>} True if liked successfully
 */
export async function likePost(post) {
  try {
    console.log('🔍 Looking for Like button...');
    
    let likeButton = null;
    
    // Strategy 1: Try aria-label with "React Like"
    likeButton = await post.$('button[aria-label*="React Like"]');
    
    // Strategy 2: Try aria-label with just "Like"
    if (!likeButton) {
      likeButton = await post.$('button[aria-label="Like"]');
      if (likeButton) {
        console.log('✅ Found Like button (aria-label="Like")');
      }
    } else {
      console.log('✅ Found Like button (aria-label="React Like")');
    }
    
    // Strategy 3: Try class-based selector with Like text
    if (!likeButton) {
      const buttons = await post.$$('button.react-button__trigger');
      for (const button of buttons) {
        const buttonText = await button.evaluate(el => {
          const textSpan = el.querySelector('.social-action-button__text');
          return textSpan ? textSpan.textContent.trim() : '';
        });
        
        if (buttonText === 'Like') {
          likeButton = button;
          console.log('✅ Found Like button (class-based selector)');
          break;
        }
      }
    }
    
    // Strategy 4: Try SVG icon + text combination
    if (!likeButton) {
      const socialButtons = await post.$$('button.social-actions-button');
      for (const button of socialButtons) {
        const hasLikeIcon = await button.evaluate(el => {
          const svg = el.querySelector('svg[data-test-icon*="thumbs-up"]');
          const text = el.textContent.trim();
          return svg && text.includes('Like');
        });
        
        if (hasLikeIcon) {
          likeButton = button;
          console.log('✅ Found Like button (icon + text match)');
          break;
        }
      }
    }
    
    if (!likeButton) {
      console.log('❌ Like button not found after trying all strategies');
      return false;
    }

    // Check if already liked
    const isLiked = await likeButton.evaluate(el => el.getAttribute('aria-pressed') === 'true');

    if (isLiked) {
      console.log('⚠️ Post already liked, skipping...');
      return false;
    }

    // Add slight delay before clicking (human-like)
    await sleep(randomDelay(500, 1000));
    
    await likeButton.click();
    console.log('👍 Post liked!');
    await sleep(randomDelay(2000, 4000));
    return true;
    
  } catch (error) {
    console.error('❌ Error liking post:', error.message);
    return false;
  }
}
