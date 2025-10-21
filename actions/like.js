import { sleep, randomDelay } from '../utils/helpers.js';

/**
 * Like a post
 * @param {Object} post - Puppeteer element handle
 * @returns {Promise<boolean>} True if liked successfully
 */
export async function likePost(post) {
  try {
    const likeButton = await post.$('button[aria-label*="React Like"]');
    
    if (!likeButton) {
      console.log('❌ Like button not found');
      return false;
    }

    const isLiked = await likeButton.evaluate(el => el.getAttribute('aria-pressed') === 'true');

    if (isLiked) {
      console.log('⚠️ Post already liked, skipping...');
      return false;
    }

    await likeButton.click();
    console.log('👍 Post liked!');
    await sleep(randomDelay(2000, 4000));
    return true;
  } catch (error) {
    console.error('❌ Error liking post:', error.message);
    return false;
  }
}
