import { sleep, randomDelay, humanLikeType } from '../utils/helpers.js';

/**
 * Create a LinkedIn post
 * @param {Object} page - Puppeteer page
 * @param {string} postText - Text content of the post
 * @param {Object} options - Additional options (hashtags, image, etc.)
 * @returns {Promise<boolean>} Success status
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
    
    // Find and click "Start a post" button
    console.log('🔍 Looking for "Start a post" button...');
    
    const startPostButton = await page.$('button.artdeco-button[aria-label*="Start a post"]');
    
    if (!startPostButton) {
      // Alternative selector
      const alternativeButton = await page.$('button[class*="share-box-feed-entry__trigger"]');
      if (alternativeButton) {
        await alternativeButton.click();
      } else {
        console.log('❌ Could not find "Start a post" button');
        return false;
      }
    } else {
      await startPostButton.click();
    }
    
    console.log('✅ Clicked "Start a post" button');
    await sleep(randomDelay(2000, 3000));
    
    // Wait for post editor to appear
    console.log('⏳ Waiting for post editor...');
    await page.waitForSelector('div.ql-editor[contenteditable="true"]', { timeout: 10000 });
    await sleep(1000);
    
    // Find the editor
    const editor = await page.$('div.ql-editor[contenteditable="true"]');
    
    if (!editor) {
      console.log('❌ Post editor not found');
      return false;
    }
    
    console.log('✅ Post editor opened');
    
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
    
    // Add image if provided
    if (options.imagePath) {
      console.log('🖼️ Adding image...');
      
      const imageButton = await page.$('button[aria-label*="Add a photo"]');
      if (imageButton) {
        await imageButton.click();
        await sleep(1500);
        
        // Upload image
        const fileInput = await page.$('input[type="file"][accept*="image"]');
        if (fileInput) {
          await fileInput.uploadFile(options.imagePath);
          console.log('✅ Image uploaded');
          await sleep(3000); // Wait for image to process
        }
      }
    }
    
    // Review what we wrote
    console.log('📖 Re-reading post before publishing...');
    await sleep(randomDelay(3000, 5000));
    
    // Find and click Post button
    console.log('🔍 Looking for Post button...');
    
    let postButton = null;
    
    // Try multiple selectors
    const postButtons = await page.$$('button.share-actions__primary-action');
    for (const button of postButtons) {
      const buttonText = await button.evaluate(el => el.textContent.trim());
      if (buttonText === 'Post') {
        postButton = button;
        break;
      }
    }
    
    if (!postButton) {
      postButton = await page.$('button[aria-label="Post"]');
    }
    
    if (!postButton) {
      console.log('❌ Post button not found');
      return false;
    }
    
    // Check if button is enabled
    const isEnabled = await postButton.evaluate(el => !el.disabled);
    
    if (!isEnabled) {
      console.log('⚠️ Post button is disabled (content may be empty)');
      return false;
    }
    
    // Final pause before posting
    console.log('👀 About to publish post...');
    await sleep(randomDelay(1000, 2000));
    
    console.log('🚀 Publishing post...');
    await postButton.click();
    
    console.log('✅ Post published successfully!');
    await sleep(randomDelay(3000, 5000));
    
    return true;
    
  } catch (error) {
    console.error('❌ Error creating post:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

/**
 * Schedule multiple posts
 * @param {Object} page - Puppeteer page
 * @param {Array} posts - Array of post objects {text, hashtags, imagePath}
 * @param {number} delayBetweenPosts - Delay in ms between posts
 */
export async function scheduleMultiplePosts(page, posts, delayBetweenPosts = 600000) {
  console.log(`\n📅 Scheduling ${posts.length} posts`);
  console.log(`⏱️ Delay between posts: ${Math.round(delayBetweenPosts/60000)} minutes`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    
    console.log('\n' + '═'.repeat(60));
    console.log(`📝 Creating Post ${i + 1}/${posts.length}`);
    console.log('═'.repeat(60));
    
    const success = await createLinkedInPost(page, post.text, {
      hashtags: post.hashtags || [],
      imagePath: post.imagePath || null
    });
    
    if (success) {
      successCount++;
      console.log(`✅ Post ${i + 1} published successfully!`);
    } else {
      failCount++;
      console.log(`❌ Post ${i + 1} failed to publish`);
    }
    
    // Wait before next post (if not last post)
    if (i < posts.length - 1) {
      const waitMinutes = Math.round(delayBetweenPosts / 60000);
      console.log(`\n⏳ Waiting ${waitMinutes} minutes before next post...`);
      await sleep(delayBetweenPosts);
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 Post Creation Summary');
  console.log('═'.repeat(60));
  console.log(`✅ Successful: ${successCount}/${posts.length}`);
  console.log(`❌ Failed: ${failCount}/${posts.length}`);
  console.log('═'.repeat(60));
}
