import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import dotenv from "dotenv";
import connectDB from './config/database.js'; 
import { linkedInLogin } from './actions/login.js';
import { likePost } from './actions/like.js';
import { commentOnPost } from './actions/comment.js';
import { extractPostContent } from './services/extractPostContent.js';
import { evaluatePost, generateComment } from './services/aiService.js';
import { sleep, randomDelay, extractPostUrl, extractAuthorName } from './utils/helpers.js';
import { logActivity, getActivityStats, hasInteractedWithPost } from './utils/activityLogger.js';
import { getCookies, saveCookies } from './services/cookieService.js';  // ← FIX THIS IMPORT
import { getProxyArgs, authenticateProxy, testProxyConnection } from './utils/proxyHelper.js';


dotenv.config();
puppeteer.use(StealthPlugin());

connectDB().catch(() => {
  console.log('⚠️ MongoDB unavailable - using file-based storage');
});

async function scrollOnce(page) {
  console.log('🐭 Scrolling down...');
  await page.evaluate(() => {
    window.scrollBy({ top: 800, behavior: 'smooth' });
  });
  await sleep(randomDelay(3000, 4500));
}

async function linkedInAutomation() {
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

    // Authenticate proxy if needed
    await authenticateProxy(page);

    // Test proxy connection
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

    console.log('\n🚀 LinkedIn AI-Powered Automation Bot Started\n');
    console.log('='.repeat(60));
    console.log('🌐 Language: English (en-US)');
    console.log('🌐 Proxy: ' + (proxyArgs.length > 0 ? 'Enabled' : 'Disabled'));
    console.log('🤖 AI Provider: ' + (process.env.AI_PROVIDER || 'openrouter').toUpperCase());
    console.log('🍪 Session Management: Enabled');
    console.log('🤖 AI will read each post and decide engagement');
    console.log('👍 Will LIKE posts scoring 6+ out of 10');
    console.log('💬 Will COMMENT on posts scoring 9+ out of 10');
    console.log('💼 Will always COMMENT on job posts');
    console.log('='.repeat(60));

    const username = process.env.LINKEDIN_USERNAME;
    const password = process.env.LINKEDIN_PASSWORD;
    const useSavedCookies = process.env.USE_SAVED_COOKIES !== 'false'; // Default to true

    let loggedIn = false;

    // ==================== TRY TO USE SAVED COOKIES FIRST ====================
    if (useSavedCookies && username) {
      console.log('\n🍪 Checking for saved session...');
      const savedCookies = await getCookies(username);
      
      if (savedCookies && savedCookies.length > 0) {
        console.log(`✅ Found ${savedCookies.length} saved cookies`);
        console.log('🔄 Attempting to restore session...');
        
        try {
          // Set cookies before navigation
          await page.setCookie(...savedCookies);
          
          // Navigate to LinkedIn feed
          await page.goto('https://www.linkedin.com/feed/?locale=en_US', { 
            waitUntil: 'networkidle2',
            timeout: 60000 
          });

          // Wait a bit for page to load
          await sleep(3000);

          const currentUrl = page.url();
          console.log(`📍 Current URL: ${currentUrl}`);

          // Check if we're logged in
          if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork') || currentUrl.includes('/in/')) {
            console.log('✅ Session restored successfully! Skipping login.');
            loggedIn = true;
          } else if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
            console.log('⚠️ Cookies expired or invalid, need fresh login');
            loggedIn = false;
          } else {
            console.log(`⚠️ Unexpected page: ${currentUrl}, will try login`);
            loggedIn = false;
          }
        } catch (error) {
          console.log(`⚠️ Error restoring session: ${error.message}`);
          loggedIn = false;
        }
      } else {
        console.log('ℹ️ No saved session found');
      }
    } else {
      console.log('ℹ️ Saved cookies disabled in config');
    }

    // ==================== LOGIN IF COOKIES DIDN'T WORK ====================
    if (!loggedIn) {
      console.log('\n🔐 Starting fresh login...');
      loggedIn = await linkedInLogin(page, username, password, true);
      
      if (!loggedIn) {
        console.log('❌ Login failed. Exiting...');
        await browser.close();
        return;
      }

      console.log('✅ Login successful!');
      
      // Save cookies after successful login
      console.log('💾 Saving session cookies to database...');
      const cookies = await page.cookies();
      await saveCookies(username, cookies);
      console.log(`✅ Saved ${cookies.length} cookies for future use`);
    }

    // ==================== ENSURE WE'RE ON THE FEED ====================
    console.log('\n🏠 Navigating to LinkedIn feed...');
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

    // ==================== YOUR EXISTING AUTOMATION CODE ====================
    const maxPosts = parseInt(process.env.MAX_POSTS) || 10;
    let postsViewed = 0;
    let postsEvaluated = 0;
    let likesGiven = 0;
    let commentsPosted = 0;
    let jobPostsCommented = 0;
    let aiEvaluations = 0;
    let heuristicEvaluations = 0;
    let skippedPrevious = 0;

    const scoreDistribution = {
      likes: [],
      comments: []
    };

    console.log('\n' + '='.repeat(60));
    console.log(`🤖 Starting Intelligent Post Analysis (Max: ${maxPosts} posts)`);
    console.log('='.repeat(60) + '\n');

    while (postsEvaluated < maxPosts) {
      const posts = await page.$$('div.feed-shared-update-v2');
      
      if (posts.length === 0) {
        console.log('❌ No posts found');
        break;
      }

      const post = posts[postsViewed];
      
      if (!post) {
        console.log('⚠️ No more posts to process');
        break;
      }

      console.log('\n' + '═'.repeat(60));
      console.log(`📖 Reading Post ${postsViewed + 1} (Evaluated: ${postsEvaluated}/${maxPosts})`);
      console.log('═'.repeat(60));

      await post.evaluate(el => el.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      }));
      await sleep(randomDelay(2500, 3500));

      // Extract post metadata
      const postUrl = await extractPostUrl(post);
      const authorName = await extractAuthorName(post);
      
      console.log(`👤 Author: ${authorName}`);

      // Check if already interacted
      const alreadyInteracted = await hasInteractedWithPost(postUrl);
      if (alreadyInteracted) {
        console.log('⏭️ Already interacted with this post, skipping...');
        skippedPrevious++;
        postsViewed++;
        await scrollOnce(page);
        await sleep(randomDelay(2000, 3000));
        continue;
      }

      // Extract and read the post content
      console.log('\n📄 Extracting post content...');
      const postContent = await extractPostContent(post);
      
      if (!postContent.text || postContent.text.length < 20) {
        console.log('⚠️ Post content too short or empty, skipping...');
        postsViewed++;
        await scrollOnce(page);
        continue;
      }

      console.log(`📝 Post Preview (${postContent.wordCount} words):`);
      console.log(`   "${postContent.text.substring(0, 150)}..."`);
      if (postContent.hashtags.length > 0) {
        console.log(`🏷️  Hashtags: ${postContent.hashtags.join(', ')}`);
      }

      // AI evaluates the post
      console.log('\n🤖 AI is analyzing this post...');
      await sleep(1000);
      
      const evaluation = await evaluatePost(postContent);
      
      if (evaluation.reasoning === 'Heuristic evaluation') {
        heuristicEvaluations++;
      } else {
        aiEvaluations++;
      }

      console.log('\n📊 AI Evaluation Results:');
      console.log(`   📈 Like Score: ${evaluation.likeScore}/10 → ${evaluation.shouldLike ? '✅ WILL LIKE' : '❌ Skip'}`);
      console.log(`   💬 Comment Score: ${evaluation.commentScore}/10 → ${evaluation.shouldComment ? '✅ WILL COMMENT' : '❌ Skip'}`);
      console.log(`   💼 Job Post: ${evaluation.isJobPost ? '✅ YES' : '❌ NO'}`);
      console.log(`   📑 Type: ${evaluation.postType}`);
      console.log(`   💭 Reason: ${evaluation.reasoning}`);

      scoreDistribution.likes.push(evaluation.likeScore);
      scoreDistribution.comments.push(evaluation.commentScore);

      // Simulate human reading time
      const readingTime = Math.min(5000, postContent.wordCount * 50);
      console.log(`\n📚 Simulating reading time: ${Math.round(readingTime/1000)}s...`);
      await sleep(readingTime);

      // LIKE ACTION
      if (evaluation.shouldLike) {
        console.log('\n👍 Decision: This post deserves a LIKE');
        const liked = await likePost(post);
        if (liked) {
          likesGiven++;
          
          await logActivity({
            action: 'like',
            postUrl: postUrl,
            authorName: authorName,
            postPreview: postContent.text.substring(0, 100),
            likeScore: evaluation.likeScore,
            postType: evaluation.postType,
            isJobPost: evaluation.isJobPost
          });
        }
        
        await sleep(randomDelay(2000, 4000));
      } else {
        console.log(`\n⏭️ Skipping like (score ${evaluation.likeScore}/10 < 6)`);
      }

      // COMMENT ACTION
      if (evaluation.shouldComment) {
        console.log(`\n💬 Decision: This post deserves a COMMENT`);
        if (evaluation.isJobPost) {
          console.log('   💼 Detected as JOB POST - will express interest!');
        }
        
        console.log('🤖 Generating contextual comment...');
        const commentText = await generateComment(postContent, evaluation);
        
        const commented = await commentOnPost(post, page, commentText);
        
        if (commented) {
          commentsPosted++;
          if (evaluation.isJobPost) {
            jobPostsCommented++;
          }
          
          await logActivity({
            action: 'comment',
            postUrl: postUrl,
            authorName: authorName,
            commentText: commentText,
            commentScore: evaluation.commentScore,
            postType: evaluation.postType,
            isJobPost: evaluation.isJobPost,
            postPreview: postContent.text.substring(0, 100)
          });
        }
      } else {
        console.log(`\n⏭️ Skipping comment (score ${evaluation.commentScore}/10 < 9)`);
      }

      if (!evaluation.shouldLike && !evaluation.shouldComment) {
        console.log('\n👀 Just viewing this post (not engaging)');
      }

      postsEvaluated++;
      postsViewed++;

      await scrollOnce(page);
      
      console.log(`\n⏳ Pausing before next post...`);
      await sleep(randomDelay(6000, 10000));
    }

    // Calculate statistics
    const avgLikeScore = scoreDistribution.likes.reduce((a, b) => a + b, 0) / scoreDistribution.likes.length;
    const avgCommentScore = scoreDistribution.comments.reduce((a, b) => a + b, 0) / scoreDistribution.comments.length;
    const activityStats = await getActivityStats();

    console.log('\n' + '═'.repeat(60));
    console.log('✅ AUTOMATION COMPLETED SUCCESSFULLY!');
    console.log('═'.repeat(60));
    console.log('\n📊 Session Statistics:');
    console.log(`\n   📖 Reading & Analysis:`);
    console.log(`      • Posts Viewed: ${postsViewed}`);
    console.log(`      • Posts Evaluated: ${postsEvaluated}/${maxPosts}`);
    console.log(`      • Skipped (Previously Seen): ${skippedPrevious}`);
    console.log(`      • AI Evaluations: ${aiEvaluations}`);
    console.log(`      • Heuristic Evaluations: ${heuristicEvaluations}`);
    console.log(`\n   📈 Average Scores:`);
    console.log(`      • Average Like Score: ${avgLikeScore.toFixed(1)}/10`);
    console.log(`      • Average Comment Score: ${avgCommentScore.toFixed(1)}/10`);
    console.log(`\n   🎯 Engagement:`);
    console.log(`      • Likes Given: ${likesGiven}/${postsEvaluated} (${Math.round((likesGiven/postsEvaluated)*100)}%)`);
    console.log(`      • Comments Posted: ${commentsPosted}/${postsEvaluated} (${Math.round((commentsPosted/postsEvaluated)*100)}%)`);
    console.log(`      • Job Posts Commented: ${jobPostsCommented}`);
    console.log('\n📁 All-Time Statistics:');
    console.log(`      • Total Activities: ${activityStats.total}`);
    console.log(`      • Total Likes: ${activityStats.likes}`);
    console.log(`      • Total Comments: ${activityStats.comments}`);
    console.log(`      • Unique Posts: ${activityStats.uniquePosts}`);
    console.log('\n' + '═'.repeat(60));
    console.log('📝 Detailed log saved in: activity-log.json');
    console.log('📊 Session cookies saved in: MongoDB');
    console.log('═'.repeat(60));

    console.log('\n⏳ Browser will remain open for 15 seconds...');
    await sleep(15000);

    console.log('👋 Closing browser...');
    await browser.close();
    
  } catch (err) {
    console.error('\n❌ CRITICAL ERROR:');
    console.error('='.repeat(60));
    console.error('Error message:', err.message);
    console.error('Stack trace:', err.stack);
    console.error('='.repeat(60));
  }
}

console.log('\n🎯 LinkedIn AI-Powered Automation Bot');
console.log('🤖 Reads every post like a human and decides engagement');
console.log('🍪 Session management - skips login after first time');
console.log('🌐 Proxy support enabled');
console.log('⚠️  Educational purposes only - violates LinkedIn ToS');
console.log('='.repeat(60) + '\n');

linkedInAutomation();
