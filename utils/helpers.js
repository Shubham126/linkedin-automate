export async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function cleanText(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractHashtags(text) {
  const hashtags = text.match(/#\w+/g) || [];
  return hashtags.slice(0, 5);
}

/**
 * Generate random decision based on probability
 * @param {number} probability - Probability percentage (0-100)
 * @returns {boolean} True if should perform action
 */
export function shouldPerformAction(probability) {
  return Math.random() * 100 < probability;
}

/**
 * Extract post URL or ID from post element
 * @param {Object} post - Puppeteer element handle
 * @returns {Promise<string>} Post URL or ID
 */
export async function extractPostUrl(post) {
  try {
    // Try to find the post link
    const linkElement = await post.$('a[href*="/posts/"], a[href*="/activity/"]');
    
    if (linkElement) {
      const url = await linkElement.evaluate(el => el.href);
      return url;
    }
    
    // Fallback: try to get data-urn attribute
    const urn = await post.evaluate(el => el.getAttribute('data-urn'));
    if (urn) return urn;
    
    // Last resort: generate unique ID from timestamp
    return `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
  } catch (error) {
    console.error('⚠️ Could not extract post URL:', error.message);
    return `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Extract author name from post
 */
export async function extractAuthorName(post) {
  try {
    const authorElement = await post.$('.update-components-actor__title');
    if (authorElement) {
      const name = await authorElement.evaluate(el => el.textContent.trim());
      return name;
    }
    return 'Unknown';
  } catch (error) {
    return 'Unknown';
  }
}
