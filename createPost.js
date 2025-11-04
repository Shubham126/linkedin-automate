// ==================== FILE: create-ai-posts.js ====================
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import dotenv from "dotenv";
import connectDB from './config/database.js'; 
import { linkedInLogin } from './actions/login.js';
import { generateLinkedInPost, generateHashtags } from './services/aiService.js';
import { sleep, randomDelay, humanLikeType } from './utils/helpers.js';
import { getCookies, saveCookies } from './services/cookieService.js';
import { getProxyArgs, authenticateProxy, testProxyConnection } from './utils/proxyHelper.js';
import { logActivity } from './utils/activityLogger.js';

dotenv.config();
puppeteer.use(StealthPlugin());

// ==================== INITIALIZE MONGODB ====================
let mongoConnected = false;

async function initializeMongoDB() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    const result = await connectDB();
    
    if (result) {
      mongoConnected = true;
      console.log('✅ MongoDB connected successfully!');
    } else {
      console.log('⚠️ MongoDB connection returned false');
      mongoConnected = false;
    }
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    mongoConnected = false;
  }
}

// Initialize MongoDB first
await initializeMongoDB();

if (!mongoConnected) {
  console.error('❌ Cannot start bot without MongoDB connection');
  process.exit(1);
}

/**
 * Human-like mouse movement and click
 */
async function humanLikeClick(page, element, options = {}) {
  const {
    minDelay = 300,
    maxDelay = 800,
    moveSteps = 10,
    jitter = true
  } = options;

  try {
    const boundingBox = await element.boundingBox();
    if (!boundingBox) {
      console.log('   ⚠️ Element not visible, trying direct click');
      await element.click();
      return true;
    }

    let targetX = boundingBox.x + boundingBox.width / 2;
    let targetY = boundingBox.y + boundingBox.height / 2;

    if (jitter) {
      targetX += (Math.random() - 0.5) * 10;
      targetY += (Math.random() - 0.5) * 10;
    }

    const currentPos = { x: 960, y: 540 };

    const steps = moveSteps;
    for (let i = 0; i < steps; i++) {
      const progress = i / steps;
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const x = currentPos.x + (targetX - currentPos.x) * easeProgress;
      const y = currentPos.y + (targetY - currentPos.y) * easeProgress;

      await page.mouse.move(x, y);
      await sleep(randomDelay(10, 30));
    }

    await page.mouse.move(targetX, targetY);
    await sleep(randomDelay(minDelay, maxDelay));
    await page.mouse.click(targetX, targetY);
    await sleep(randomDelay(200, 400));

    return true;

  } catch (error) {
    console.log(`   ⚠️ Human-like click failed: ${error.message}, trying direct click`);
    try {
      await element.click();
      return true;
    } catch (e) {
      console.log('   ❌ Direct click also failed');
      return false;
    }
  }
}

/**
 * Create a LinkedIn post
 */
async function createLinkedInPost(page, postText, options = {}) {
  try {
    console.log('\n📝 Starting post creation...');
    
    // Navigate to feed if not already there
    const currentUrl = page.url();
    if (!currentUrl.includes('/feed/')) {
      console.log('🏠 Navigating to LinkedIn feed...');
      await page.goto('https://www.linkedin.com/feed/?locale=en_US', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      await sleep(3000);
    }
    
    // Find and click "Start a post" button
    console.log('🔍 Looking for "Start a post" button...');
    
    let startPostButton = await page.$('button[aria-label*="Start a post"]');
    
    if (!startPostButton) {
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent.trim());
        const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label')) || '';
        
        if (text.includes('Start a post') || ariaLabel.includes('Start a post')) {
          startPostButton = button;
          break;
        }
      }
    }
    
    if (!startPostButton) {
      console.log('❌ Could not find "Start a post" button');
      return false;
    }

    console.log('✅ Found "Start a post" button');

    await startPostButton.evaluate(el => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await sleep(randomDelay(500, 1000));

    console.log('👆 Clicking with human-like movement...');
    const clicked = await humanLikeClick(page, startPostButton, {
      minDelay: 300,
      maxDelay: 800,
      moveSteps: 15,
      jitter: true
    });

    if (!clicked) {
      console.log('⚠️ Click failed');
      return false;
    }

    console.log('✅ Button clicked successfully');
    await sleep(randomDelay(2000, 3000));
    
    // Wait for post editor
    console.log('⏳ Waiting for post editor...');
    try {
      await page.waitForSelector('div.ql-editor[contenteditable="true"]', { timeout: 10000 });
    } catch (e) {
      console.log('⚠️ Editor timeout, trying alternative selector...');
      await page.waitForSelector('[contenteditable="true"]', { timeout: 10000 });
    }

    await sleep(1000);
    
    let editor = await page.$('div.ql-editor[contenteditable="true"]');
    
    if (!editor) {
      editor = await page.$('[contenteditable="true"]');
    }
    
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
    
    let postButton = await page.$('button[aria-label="Post"]');
    
    if (!postButton) {
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent.trim());
        const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label')) || '';
        
        if ((text === 'Post' || ariaLabel === 'Post') && !ariaLabel.includes('Dismiss')) {
          postButton = button;
          console.log('✅ Found Post button');
          break;
        }
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

    await postButton.evaluate(el => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await sleep(randomDelay(500, 1000));
    
    // Final pause before posting
    console.log('👀 About to publish post...');
    await sleep(randomDelay(1000, 2000));
    
    console.log('🚀 Publishing post with human-like click...');
    const postClicked = await humanLikeClick(page, postButton, {
      minDelay: 400,
      maxDelay: 900,
      moveSteps: 12,
      jitter: true
    });

    if (!postClicked) {
      console.log('⚠️ Post button click failed');
      return false;
    }
    
    console.log('✅ Post published successfully!');
    await sleep(randomDelay(3000, 5000));
    
    return true;
    
  } catch (error) {
    console.error('❌ Error creating post:', error.message);
    return false;
  }
}

async function automatedAIPostCreation() {
  const proxyArgs = getProxyArgs();

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      "--start-maximized", 
      "--no-sandbox", 
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--lang=en-US",
      "--accept-lang=en-US,en;q=0.9",
      ...proxyArgs
    ],
  });

  try {
    const page = (await browser.pages())[0];
    page.setDefaultNavigationTimeout(90000);

    await authenticateProxy(page);
    if (proxyArgs.length > 0) {
      await testProxyConnection(page);
    }

    // Set English user agent and language headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Override navigator.language and languages
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'language', {
        get: function() { return 'en-US'; }
      });
      Object.defineProperty(navigator, 'languages', {
        get: function() { return ['en-US', 'en']; }
      });
    });

    console.log('\n' + '═'.repeat(70));
    console.log('🎯 LinkedIn AI-Powered Post Creator');
    console.log('═'.repeat(70));
    console.log('🤖 Generates posts using AI');
    console.log('📊 Saves ALL data to MongoDB');
    console.log('📥 Export as CSV from dashboard');
    console.log('🍪 Session management - skips login after first time');
    console.log('⚠️  Educational purposes only');
    console.log('═'.repeat(70) + '\n');

    const username = process.env.LINKEDIN_USERNAME;
    const password = process.env.LINKEDIN_PASSWORD;
    const useSavedCookies = process.env.USE_SAVED_COOKIES !== 'false';

    if (!username) {
      console.error('❌ LINKEDIN_USERNAME not set in .env');
      await browser.close();
      return;
    }

    console.log(`👤 Account: ${username}`);

    let loggedIn = false;

    // Try to use saved cookies first
    if (useSavedCookies && username) {
      console.log('\n🍪 Checking for saved session...');
      const savedCookies = await getCookies(username);
      
      if (savedCookies && savedCookies.length > 0) {
        console.log(`✅ Found ${savedCookies.length} saved cookies`);
        console.log('🔄 Attempting to restore session...');
        
        try {
          await page.setCookie(...savedCookies);
          
          console.log('⏳ Navigating to LinkedIn...');
          await page.goto('https://www.linkedin.com/feed/?locale=en_US', { 
            waitUntil: 'domcontentloaded',
            timeout: 120000
          });

          await sleep(5000);

          const currentUrl = page.url();
          console.log(`📍 Current URL: ${currentUrl}`);

          if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork') || currentUrl.includes('/in/')) {
            console.log('✅ Session restored successfully! Skipping login.\n');
            loggedIn = true;
          } else if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
            console.log('⚠️ Cookies expired or invalid, need fresh login');
            loggedIn = false;
          }
        } catch (error) {
          console.log(`⚠️ Error restoring session: ${error.message}`);
          loggedIn = false;
        }
      }
    }

    // Login if cookies didn't work
    if (!loggedIn) {
      if (!password) {
        console.error('❌ Password required for fresh login');
        await browser.close();
        return;
      }

      console.log('\n🔐 Starting fresh login...');
      loggedIn = await linkedInLogin(page, username, password, true);
      
      if (!loggedIn) {
        console.log('❌ Login failed. Exiting...');
        await browser.close();
        return;
      }

      console.log('✅ Login successful!');
      
      // Save cookies after successful login
      console.log('💾 Saving session cookies...');
      const cookies = await page.cookies();
      await saveCookies(username, cookies);
      console.log(`✅ Saved ${cookies.length} cookies for future use\n`);
    }

    // Ensure we're on the feed
    console.log('🏠 Navigating to LinkedIn feed...');
    try {
      const currentUrl = page.url();
      if (!currentUrl.includes('/feed')) {
        await page.goto('https://www.linkedin.com/feed/?locale=en_US', { 
          waitUntil: 'networkidle2', 
          timeout: 60000 
        });
      }
    } catch (error) {
      if (error.message.includes('timeout')) {
        console.log('⚠️ Navigation timeout, continuing...');
      } else {
        throw error;
      }
    }
    
    console.log('✅ Feed loaded successfully!');
    await sleep(5000);

    // Generate and post
    console.log('═'.repeat(70));
    console.log('🤖 AI Post Generation Mode');
    console.log('═'.repeat(70));

    const topic = "the future of remote work and hybrid teams";
    
    console.log(`\n📝 Generating post about: "${topic}"`);
    
    const aiPostText = await generateLinkedInPost(topic, {
      tone: 'professional',
      length: 'medium',
      includeQuestion: true,
      style: 'thought-leadership'
    });

    console.log('\n✅ AI Generated Post:');
    console.log('─'.repeat(70));
    console.log(aiPostText);
    console.log('─'.repeat(70));

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
      
      // ✅ LOG TO MONGODB
      try {
        await logActivity({
          action: 'post_created',
          postUrl: `linkedin.com/feed/${Date.now()}`,
          authorName: username,
          postPreview: aiPostText.substring(0, 100),
          commentText: aiPostText,
          postType: 'ai_generated',
          isJobPost: false
        });
        
        console.log('✅ Post logged to MongoDB!');
      } catch (err) {
        console.log('⚠️ MongoDB logging failed');
      }

      console.log('\n' + '═'.repeat(70));
      console.log('📊 Post Statistics:`);
      console.log(`   • Content: AI-Generated`);
      console.log(`   • Length: ${aiPostText.length} characters`);
      console.log(`   • Hashtags: ${hashtags.length}`);
      console.log(`\n📥 Download Data:`);
      console.log(`   • API: GET http://localhost:3000/api/logs/user/${username}`);
      console.log(`   • CSV: GET http://localhost:3000/api/logs/download/${username}`);
      console.log('═'.repeat(70) + '\n');
    } else {
      console.log('\n❌ Failed to publish post');
    }

    console.log('\n⏳ Browser will remain open for 15 seconds...');
    await sleep(15000);

    console.log('👋 Closing browser...');
    await browser.close();
    
  } catch (err) {
    console.error('\n❌ CRITICAL ERROR:');
    console.error('═'.repeat(70));
    console.error('Error message:', err.message);
    console.error('═'.repeat(70));
    await browser.close();
  }
}

console.log('\n🎯 LinkedIn AI-Powered Post Creator\n');
automatedAIPostCreation();
