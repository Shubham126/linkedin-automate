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

export function shouldPerformAction(probability) {
  return Math.random() * 100 < probability;
}

export async function extractPostUrl(post) {
  try {
    const linkElement = await post.$('a[href*="/posts/"], a[href*="/activity/"]');
    
    if (linkElement) {
      const url = await linkElement.evaluate(el => el.href);
      return url;
    }
    
    const urn = await post.evaluate(el => el.getAttribute('data-urn'));
    if (urn) return urn;
    
    return `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
  } catch (error) {
    console.error('⚠️ Could not extract post URL:', error.message);
    return `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

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

/**
 * Type text with human-like speed, pauses, and mistakes
 * @param {Object} element - Puppeteer element handle
 * @param {string} text - Text to type
 * @param {Object} options - Typing options
 */
export async function humanLikeType(element, text, options = {}) {
  const {
    minDelay = 80,
    maxDelay = 200,
    pauseEvery = 12,
    pauseDelay = 300,
    mistakeChance = 0.05 // 5% chance of typo
  } = options;
  
  await element.click();
  await sleep(randomDelay(400, 800));
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Simulate occasional typo and correction
    if (Math.random() < mistakeChance && i > 0) {
      // Type wrong character
      const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
      await element.type(wrongChar, { delay: randomDelay(minDelay, maxDelay) });
      await sleep(randomDelay(200, 400)); // Realize mistake
      await element.press('Backspace'); // Delete mistake
      await sleep(randomDelay(100, 300)); // Brief pause
    }
    
    // Type the correct character
    if (char === ' ') {
      // Longer pause for spaces
      await element.type(char, { delay: randomDelay(150, 350) });
    } else {
      // Normal typing with variation
      await element.type(char, { delay: randomDelay(minDelay, maxDelay) });
    }
    
    // Random pause during typing (like thinking)
    if (i > 0 && i % randomDelay(pauseEvery - 3, pauseEvery + 3) === 0) {
      await sleep(randomDelay(pauseDelay, pauseDelay + 400));
    }
  }
  
  await sleep(randomDelay(300, 600));
}
