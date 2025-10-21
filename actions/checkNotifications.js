import { sleep, randomDelay } from '../utils/helpers.js';

/**
 * Navigate to notifications page
 */
export async function goToNotifications(page) {
  try {
    console.log('\n📬 Navigating to Notifications page...');
    
    await page.goto('https://www.linkedin.com/notifications/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    await sleep(3000);
    console.log('✅ Notifications page loaded');
    return true;
  } catch (error) {
    console.error('❌ Error navigating to notifications:', error.message);
    return false;
  }
}

/**
 * Find and extract reply notifications with their text
 */
export async function findCommentNotifications(page) {
  try {
    console.log('\n🔍 Scanning for "replied to your comment" notifications...');
    
    await sleep(2000);
    
    // Scroll to load notifications
    console.log('📜 Scrolling through notifications...');
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        window.scrollBy({ top: 800, behavior: 'smooth' });
      });
      await sleep(1500);
    }
    
    // Get all notification cards
    const notificationCards = await page.$$('article.nt-card');
    console.log(`📊 Found ${notificationCards.length} notification cards`);
    
    const replyNotifications = [];
    
    for (let i = 0; i < Math.min(notificationCards.length, 20); i++) {
      try {
        const card = notificationCards[i];
        
        // Check if it says "replied to your comment"
        const headlineText = await card.evaluate(el => {
          const headline = el.querySelector('.nt-card__text--3-line');
          return headline ? headline.textContent.trim() : '';
        });
        
        if (!headlineText.toLowerCase().includes('replied to your comment')) {
          continue;
        }
        
        console.log(`\n📬 Found reply notification ${i + 1}`);
        
        // Extract author name
        const author = await card.evaluate(el => {
          const strong = el.querySelector('strong');
          return strong ? strong.textContent.trim() : 'Unknown';
        });
        
        // Extract the reply text directly from notification card!
        const replyText = await card.evaluate(el => {
          const textDiv = el.querySelector('.nt-card__text--word-wrap.nt-card__text--2-line-large');
          return textDiv ? textDiv.textContent.trim() : '';
        });
        
        // Extract post URL
        const postUrl = await card.evaluate(el => {
          const link = el.querySelector('a.nt-card__headline');
          return link ? link.href : '';
        });
        
        // Extract time
        const time = await card.evaluate(el => {
          const timeEl = el.querySelector('.nt-card__time-ago');
          return timeEl ? timeEl.textContent.trim() : '';
        });
        
        if (replyText && replyText.length > 0) {
          replyNotifications.push({
            author,
            replyText,
            postUrl,
            time,
            cardElement: card
          });
          
          console.log(`   👤 Author: ${author}`);
          console.log(`   💬 Reply: "${replyText.substring(0, 60)}..."`);
          console.log(`   🕐 Time: ${time}`);
        }
        
      } catch (error) {
        console.log(`⚠️ Error parsing notification ${i}:`, error.message);
      }
    }
    
    console.log(`\n📝 Found ${replyNotifications.length} reply notifications with text`);
    return replyNotifications;
    
  } catch (error) {
    console.error('❌ Error finding notifications:', error.message);
    return [];
  }
}

/**
 * Check if we need to navigate to post or can reply from notification
 * Returns the reply element if found
 */
export async function findReplyElement(page, postUrl) {
  try {
    console.log(`\n🔍 Checking if post is already open...`);
    
    // Check current URL
    const currentUrl = page.url();
    
    // If we're already on the right post, no need to navigate
    if (currentUrl.includes(postUrl) || postUrl.includes(currentUrl.split('?')[0])) {
      console.log('✅ Post is already open!');
    } else {
      console.log('🌐 Navigating to post...');
      await page.goto(postUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      await sleep(3000);
    }
    
    // Scroll to comments
    console.log('📜 Scrolling to comments...');
    await page.evaluate(() => {
      const commentsSection = document.querySelector('.comments-comments-list');
      if (commentsSection) {
        commentsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollBy({ top: 800, behavior: 'smooth' });
      }
    });
    
    await sleep(3000);
    
    // Find all reply elements
    const replyElements = await page.$$('article.comments-comment-entity--reply');
    console.log(`💬 Found ${replyElements.length} replies on post`);
    
    // Return the first visible reply element (usually the newest)
    if (replyElements.length > 0) {
      return replyElements[replyElements.length - 1]; // Last one is usually newest
    }
    
    return null;
    
  } catch (error) {
    console.error('❌ Error finding reply element:', error.message);
    return null;
  }
}
