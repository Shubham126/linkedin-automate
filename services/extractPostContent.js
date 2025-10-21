import { cleanText, extractHashtags } from '../utils/helpers.js';

/**
 * Extract text content from a LinkedIn post
 * @param {Object} post - Puppeteer element handle for the post
 * @returns {Promise<Object>} Post content with text and hashtags
 */
export async function extractPostContent(post) {
  try {
    // Try multiple selectors for post content
    const selectors = [
      '.update-components-text.update-components-update-v2__commentary',
      'span.break-words',
      '.feed-shared-inline-show-more-text'
    ];
    
    let textElement = null;
    for (const selector of selectors) {
      textElement = await post.$(selector);
      if (textElement) {
        console.log(`✅ Found content using selector: ${selector}`);
        break;
      }
    }
    
    if (!textElement) {
      console.log('⚠️ No text content found in post');
      return { text: '', hashtags: [], wordCount: 0 };
    }

    // Extract raw text
    const rawText = await textElement.evaluate(el => {
      // Remove hashtag links and get clean text
      const clone = el.cloneNode(true);
      const links = clone.querySelectorAll('a[href*="hashtag"]');
      links.forEach(link => link.remove());
      
      // Get text content
      return clone.textContent || clone.innerText || '';
    });

    const cleanedText = cleanText(rawText);
    const hashtags = extractHashtags(rawText); // Extract from original to get hashtags

    // Truncate text to first 600 characters for AI processing
    const truncatedText = cleanedText.length > 600 
      ? cleanedText.substring(0, 600) + '...' 
      : cleanedText;

    const wordCount = truncatedText.split(/\s+/).filter(w => w.length > 0).length;

    console.log(`📄 Extracted: ${truncatedText.length} chars, ${wordCount} words`);
    console.log(`🏷️ Hashtags found: ${hashtags.join(', ') || 'none'}`);
    
    return {
      text: truncatedText,
      hashtags: hashtags,
      wordCount: wordCount
    };

  } catch (error) {
    console.error('❌ Error extracting post content:', error.message);
    return { text: '', hashtags: [], wordCount: 0 };
  }
}
