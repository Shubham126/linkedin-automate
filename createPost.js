import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import dotenv from "dotenv";
import { linkedInLogin } from './actions/login.js';
import { generateLinkedInPost, generateHashtags, generatePostIdeas } from './services/aiService.js';
import { sleep, randomDelay, humanLikeType } from './utils/helpers.js';

dotenv.config();
puppeteer.use(StealthPlugin());

/**
 * Create a LinkedIn post
 * @param {Object} page - Puppeteer page
 * @param {string} postText - Text content of the post
 * @param {Object} options - Additional options (hashtags, image, etc.)
 * @returns {Promise<boolean>} Success status
 */
async function createLinkedInPost(page, postText, options = {}) {
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
    
    let startPostButton = await page.$('button[aria-label*="Start a post"]');
    
    if (!startPostButton) {
      // Try alternative selectors
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent.trim());
        if (text.includes('Start a post')) {
          startPostButton = button;
          break;
        }
      }
    }
    
    if (!startPostButton) {
      console.log('❌ Could not find "Start a post" button');
      return false;
    }
    
    await startPostButton.click();
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
    
    // Review what we wrote
    console.log('📖 Re-reading post before publishing...');
    await sleep(randomDelay(3000, 5000));
    
    // Find and click Post button
    console.log('🔍 Looking for Post button...');
    
    let postButton = null;
    
    // Try multiple selectors
    const postButtons = await page.$$('button');
    for (const button of postButtons) {
      const buttonText = await button.evaluate(el => el.textContent.trim());
      const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label'));
      
      if (buttonText === 'Post' || ariaLabel === 'Post') {
        postButton = button;
        console.log('✅ Found Post button');
        break;
      }
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
 * @param {Array} posts - Array of post objects {text, hashtags}
 * @param {number} delayBetweenPosts - Delay in ms between posts
 */
async function scheduleMultiplePosts(page, posts, delayBetweenPosts = 600000) {
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
      hashtags: post.hashtags || []
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

async function automatedAIPostCreation() {
  console.log('\n🎯 LinkedIn AI-Powered Post Creator');
  console.log('🤖 Generates posts using AI');
  console.log('⚠️  Educational purposes only');
  console.log('═'.repeat(60) + '\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      "--start-maximized",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--lang=en-US"
    ],
  });

  try {
    const page = (await browser.pages())[0];
    page.setDefaultNavigationTimeout(60000);

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Login
    console.log('🔐 Logging in...');
    const loggedIn = await linkedInLogin(page);
    if (!loggedIn) {
      console.log('❌ Login failed');
      await browser.close();
      return;
    }

    console.log('✅ Logged in!\n');

    // ===== OPTION 1: Generate Single AI Post =====
    console.log('═'.repeat(60));
    console.log('🤖 AI Post Generation Mode');
    console.log('═'.repeat(60));

    const topic = "the future of remote work and hybrid teams";
    
    console.log(`\n📝 Generating post about: "${topic}"`);
    
    const aiPostText = await generateLinkedInPost(topic, {
      tone: 'professional',
      length: 'medium',
      includeQuestion: true,
      style: 'thought-leadership'
    });

    console.log('\n✅ AI Generated Post:');
    console.log('─'.repeat(60));
    console.log(aiPostText);
    console.log('─'.repeat(60));

    // Generate hashtags
    const hashtags = await generateHashtags(aiPostText, 5);
    console.log(`\n🏷️ Suggested hashtags: ${hashtags.join(' ')}`);

    // Post it
    console.log('\n🚀 Publishing AI-generated post...');
    const success = await createLinkedInPost(page, aiPostText, {
      hashtags: hashtags.map(tag => tag.replace('#', ''))
    });

    if (success) {
      console.log('\n🎉 AI post published successfully!');
    }

    // ===== OPTION 2: Generate Post Ideas First =====
    /*
    console.log('\n💡 Generating post ideas...');
    const ideas = await generatePostIdeas("artificial intelligence in business", 3);
    console.log('\n' + ideas);
    
    // Then pick one and generate full post
    const selectedTopic = "how AI is transforming customer service";
    const post = await generateLinkedInPost(selectedTopic);
    const tags = await generateHashtags(post);
    
    await createLinkedInPost(page, post, { hashtags: tags });
    */

    // ===== OPTION 3: Multiple AI Posts on Different Topics =====
    /*
    const topics = [
      "career growth tips for software developers",
      "the importance of continuous learning in tech",
      "building a personal brand on LinkedIn"
    ];

    const aiPosts = [];
    
    for (const topic of topics) {
      console.log(`\n🤖 Generating post about: "${topic}"`);
      const postText = await generateLinkedInPost(topic, {
        tone: 'inspirational',
        length: 'short',
        includeQuestion: true
      });
      
      const hashtags = await generateHashtags(postText, 4);
      
      aiPosts.push({
        text: postText,
        hashtags: hashtags.map(tag => tag.replace('#', ''))
      });
      
      await sleep(2000); // Delay between API calls
    }

    // Schedule them with 15-minute intervals
    await scheduleMultiplePosts(page, aiPosts, 900000);
    */

    console.log('\n⏳ Browser open for 10 seconds...');
    await sleep(10000);

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error(err.stack);
  }
}

automatedAIPostCreation();
