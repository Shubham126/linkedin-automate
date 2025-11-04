// ==================== FILE: search-and-engage.js ====================
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import { linkedInLogin } from './actions/login.js';
import { likePost } from './actions/like.js';
import { commentOnPost } from './actions/comment.js';
import { extractPostContent } from './services/extractPostContent.js';
import { evaluatePost, generateComment } from './services/aiService.js';
import { sleep, randomDelay, extractPostUrl, extractAuthorName } from './utils/helpers.js';
import { logActivity, getActivityStats, hasInteractedWithPost } from './utils/activityLogger.js';
import { getCookies, saveCookies } from './services/cookieService.js';
import { getProxyArgs, authenticateProxy, testProxyConnection } from './utils/proxyHelper.js';

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
 * Search for posts with specific keyword
 */
async function searchLinkedIn(page, keyword) {
  try {
    console.log(`\n🔍 Searching LinkedIn for: "${keyword}"`);
    
    const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(keyword)}`;
    
    await page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    await sleep(randomDelay(10000, 15000));
    
    console.log('✅ Search results loaded');
    return true;
    
  } catch (error) {
    console.error('❌ Error searching LinkedIn:', error.message);
    return false;
  }
}

/**
 * Scroll through search results with mouse
 */
async function scrollSearchResults(page) {
  console.log('🐭 Scrolling through search results...');
  
  // Move mouse to random position
  const randomX = randomDelay(400, 900);
  const randomY = randomDelay(300, 700);
  await page.mouse.move(randomX, randomY);
  
  // Scroll with mouse wheel
  const scrollDistance = randomDelay(600, 1200);
  const increment = 100;
  const steps = Math.abs(scrollDistance / increment);
  
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel({ deltaY: increment });
    await sleep(randomDelay(30, 80));
  }
  
  // Wait after scroll
  await sleep(randomDelay(2000, 3500));
}

/**
 * Main search and engage function
 */
async function searchAndEngageAutomation() {
  const proxyArgs = getProxyArgs();

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--lang=en-US',
      '--accept-lang=en-US,en;q=0.9',
      ...proxyArgs
    ]
  });

  try {
    const page = (await browser.pages())[0];
    page.setDefaultNavigationTimeout(90000);
    
    await authenticateProxy(page);
    if (proxyArgs.length > 0) {
      await testProxyConnection(page);
    }

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('\n' + '═'.repeat(70));
    console.log('🎯 LinkedIn Search & Engage Automation');
    console.log('═'.repeat(70));
    console.log('🔍 Searches for specific keywords and engages intelligently');
    console.log('🤖 AI evaluates each post before engaging');
    console.log('📊 Saves ALL data to MongoDB');
    console.log('📥 Export as CSV from dashboard');
    console.log('⚠️  Educational purposes only');
    console.log('═'.repeat(70) + '\n');

    const username = process.env.LINKEDIN_USERNAME;
    const password = process.env.LINKEDIN_PASSWORD;
    const useSavedCookies = process.env.USE_SAVED_COOKIES !== 'false';

    if (!username) {
      console.error('❌ LINKEDIN_USERNAME is required in .env');
      await browser.close();
      return;
    }

    console.log(`👤 Account: ${username}`);

    let loggedIn = false;

    // Try to use saved cookies first
    if (useSavedCookies) {
      console.log('🍪 Checking for saved session...');
      const savedCookies = await getCookies(username);
      
      if (savedCookies && savedCookies.length > 0) {
        console.log(`✅ Found ${savedCookies.length} saved cookies`);
        
        try {
          await page.setCookie(...savedCookies);
          await page.goto('https://www.linkedin.com/feed/', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
          });

          const currentUrl = page.url();
          if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork')) {
            console.log('✅ Session restored successfully!');
            loggedIn = true;
          }
        } catch (error) {
          console.log('⚠️ Error restoring session, will login fresh');
        }
      }
    }

    // Login if cookies didn't work
    if (!loggedIn) {
      if (!password) {
        console.error('❌ LINKEDIN_PASSWORD is required for fresh login');
        await browser.close();
        return;
      }

      console.log('🔐 Logging in to LinkedIn...');
      loggedIn = await linkedInLogin(page, username, password, true);
      
      if (!loggedIn) {
        console.log('❌ Login failed. Exiting...');
        await browser.close();
        return;
      }

      const cookies = await page.cookies();
      await saveCookies(username, cookies);
      console.log(`✅ Saved ${cookies.length} cookies for future use`);
    }

    console.log('✅ Logged in successfully!\n');

    const searchKeyword = process.env.SEARCH_KEYWORD || 'developer';
    
    const searchSuccess = await searchLinkedIn(page, searchKeyword);
    if (!searchSuccess) {
      console.log('❌ Search failed. Exiting...');
      await browser.close();
      return;
    }

    const maxPosts = parseInt(process.env.MAX_SEARCH_POSTS) || 10;
    let postsViewed = 0;
    let postsEvaluated = 0;
    let likesGiven = 0;
    let commentsPosted = 0;
    let skippedPrevious = 0;

    const scoreDistribution = {
      likes: [],
      comments: []
    };

    console.log('═'.repeat(70));
    console.log(`🤖 Starting Search Results Analysis`);
    console.log(`🔍 Keyword: "${searchKeyword}"`);
    console.log(`📊 Target: ${maxPosts} posts`);
    console.log('═'.repeat(70) + '\n');

    while (postsEvaluated < maxPosts) {
      try {
        const posts = await page.$$('div.feed-shared-update-v2');
        
        if (posts.length === 0) {
          console.log('❌ No posts found in search results');
          break;
        }

        const post = posts[postsViewed];
        
        if (!post) {
          console.log('⚠️ No more posts to process, scrolling for more...');
          await scrollSearchResults(page);
          await sleep(randomDelay(2000, 3000));
          
          const newPosts = await page.$$('div.feed-shared-update-v2');
          if (newPosts.length <= postsViewed) {
            console.log('⚠️ Reached end of search results');
            break;
          }
          continue;
        }

        console.log('\n' + '═'.repeat(70));
        console.log(`📖 Search Result ${postsViewed + 1} (Evaluated: ${postsEvaluated}/${maxPosts})`);
        console.log('═'.repeat(70));

        // Scroll to post
        await post.evaluate(el => el.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        }));
        await sleep(randomDelay(2500, 3500));

        // Extract info
        const postUrl = await extractPostUrl(post);
        const authorName = await extractAuthorName(post);
        
        console.log(`👤 Author: ${authorName}`);

        // Check if already interacted
        const alreadyInteracted = await hasInteractedWithPost(postUrl);
        if (alreadyInteracted) {
          console.log('⏭️ Already interacted with this post, skipping...');
          skippedPrevious++;
          postsViewed++;
          await scrollSearchResults(page);
          continue;
        }

        // Extract content
        console.log('\n📄 Extracting post content...');
        const postContent = await extractPostContent(post);
        
        if (!postContent.text || postContent.text.length < 20) {
          console.log('⚠️ Post content too short or empty, skipping...');
          postsViewed++;
          await scrollSearchResults(page);
          continue;
        }

        console.log(`📝 Content (${postContent.wordCount} words):`);
        console.log(`   "${postContent.text.substring(0, 150)}..."`);
        
        if (postContent.hashtags.length > 0) {
          console.log(`🏷️  Hashtags: ${postContent.hashtags.join(', ')}`);
        }

        const containsKeyword = postContent.text.toLowerCase().includes(searchKeyword.toLowerCase());
        console.log(`🔍 Contains keyword "${searchKeyword}": ${containsKeyword ? '✅ YES' : '❌ NO'}`);

        // AI Analysis
        console.log('\n🤖 AI analyzing this post...');
        await sleep(randomDelay(1500, 2500));
        
        const evaluation = await evaluatePost(postContent);

        console.log('\n📊 AI Evaluation:');
        console.log(`   📈 Like Score: ${evaluation.likeScore}/10 → ${evaluation.shouldLike ? '✅ LIKE' : '❌ SKIP'}`);
        console.log(`   💬 Comment Score: ${evaluation.commentScore}/10 → ${evaluation.shouldComment ? '✅ COMMENT' : '❌ SKIP'}`);
        console.log(`   💼 Job Post: ${evaluation.isJobPost ? '✅ YES' : '❌ NO'}`);
        console.log(`   📑 Type: ${evaluation.postType}`);
        console.log(`   💭 Reason: ${evaluation.reasoning}`);

        scoreDistribution.likes.push(evaluation.likeScore);
        scoreDistribution.comments.push(evaluation.commentScore);

        // Simulate reading
        const readingTime = Math.min(5000, postContent.wordCount * 50);
        console.log(`\n📚 Simulating reading time: ${Math.round(readingTime/1000)}s...`);
        await sleep(readingTime);

        // LIKE ACTION
        if (evaluation.shouldLike) {
          console.log('\n👍 Liking this post...');
          await sleep(randomDelay(800, 1500));
          
          const liked = await likePost(post);
          if (liked) {
            likesGiven++;
            
            // ✅ LOG TO MONGODB
            await logActivity({
              action: 'like',
              postUrl: postUrl,
              authorName: authorName,
              postPreview: postContent.text.substring(0, 100),
              likeScore: evaluation.likeScore,
              postType: evaluation.postType,
              isJobPost: evaluation.isJobPost
            });
            
            console.log('   ✅ Liked and logged to MongoDB');
          }
          
          await sleep(randomDelay(1500, 3000));
        } else {
          console.log(`\n⏭️ Not liking (score ${evaluation.likeScore}/10 < 6)`);
        }

        // COMMENT ACTION
        if (evaluation.shouldComment) {
          console.log(`\n💬 Commenting on this post...`);
          await sleep(randomDelay(1500, 2500));
          
          if (evaluation.isJobPost) {
            console.log('   💼 Detected job post - expressing interest!');
          }
          
          console.log('🤖 Generating contextual comment...');
          const commentText = await generateComment(postContent, evaluation);
          await sleep(randomDelay(1000, 2000));
          
          const commented = await commentOnPost(post, page, commentText);
          
          if (commented) {
            commentsPosted++;
            
            // ✅ LOG TO MONGODB
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
            
            console.log('   ✅ Commented and logged to MongoDB');
          }
        } else {
          console.log(`\n⏭️ Not commenting (score ${evaluation.commentScore}/10 < 9)`);
        }

        if (!evaluation.shouldLike && !evaluation.shouldComment) {
          console.log('\n👀 Just viewing this post (no engagement)');
        }

        postsEvaluated++;
        postsViewed++;

        await scrollSearchResults(page);
        
        console.log(`\n⏳ Pause before next post...`);
        await sleep(randomDelay(6000, 10000));

      } catch (error) {
        console.error(`Error processing post: ${error.message}`);
        postsViewed++;
        await scrollSearchResults(page);
      }
    }

    // ==================== FINAL STATS ====================
    const avgLikeScore = scoreDistribution.likes.length > 0 
      ? (scoreDistribution.likes.reduce((a, b) => a + b, 0) / scoreDistribution.likes.length).toFixed(1)
      : 0;
    const avgCommentScore = scoreDistribution.comments.length > 0
      ? (scoreDistribution.comments.reduce((a, b) => a + b, 0) / scoreDistribution.comments.length).toFixed(1)
      : 0;
    const activityStats = await getActivityStats();

    console.log('\n' + '═'.repeat(70));
    console.log('✅ SEARCH & ENGAGE AUTOMATION COMPLETED!');
    console.log('═'.repeat(70));
    console.log('\n📊 Session Statistics:');
    console.log(`\n   🔍 Search Results:`);
    console.log(`      • Keyword: "${searchKeyword}"`);
    console.log(`      • Posts Viewed: ${postsViewed}`);
    console.log(`      • Posts Evaluated: ${postsEvaluated}/${maxPosts}`);
    console.log(`      • Skipped (Previously Seen): ${skippedPrevious}`);
    console.log(`\n   📈 Average Scores:`);
    console.log(`      • Average Like Score: ${avgLikeScore}/10`);
    console.log(`      • Average Comment Score: ${avgCommentScore}/10`);
    console.log(`\n   🎯 Engagement:`);
    console.log(`      • Likes Given: ${likesGiven}/${postsEvaluated} (${postsEvaluated > 0 ? Math.round((likesGiven/postsEvaluated)*100) : 0}%)`);
    console.log(`      • Comments Posted: ${commentsPosted}/${postsEvaluated} (${postsEvaluated > 0 ? Math.round((commentsPosted/postsEvaluated)*100) : 0}%)`);
    console.log('\n📁 All-Time Statistics (from MongoDB):');
    console.log(`      • Total Activities: ${activityStats.total}`);
    console.log(`      • Total Likes: ${activityStats.likes}`);
    console.log(`      • Total Comments: ${activityStats.comments}`);
    console.log(`      • Unique Posts: ${activityStats.uniquePostCount}`);
    console.log('\n📊 Data Storage:');
    console.log(`      • MongoDB: ✅ Connected (localhost:27017)`);
    console.log(`      • Database: linkedin-automation`);
    console.log(`      • Collection: activities`);
    console.log('\n💻 Frontend Dashboard:');
    console.log(`      • URL: http://localhost:5173`);
    console.log(`      • CSV Download: Data Dashboard → Download button`);
    console.log(`      • API: http://localhost:3000/api`);
    console.log('═'.repeat(70) + '\n');

    console.log('⏳ Browser will remain open for 15 seconds...');
    await sleep(15000);

    console.log('👋 Closing browser...');
    await browser.close();

  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:');
    console.error('═'.repeat(70));
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
    console.error('═'.repeat(70));
    try {
      await browser.close();
    } catch (e) {
      console.error('Error closing browser:', e.message);
    }
  }
}

console.log('\n🎯 LinkedIn Search & Engage Automation Bot');
console.log('🔍 Searches for keywords and engages intelligently');
console.log('🤖 AI-powered post evaluation and commenting');
console.log('📊 MongoDB + CSV Data Storage');
console.log('⚠️  Educational purposes only');
console.log('═'.repeat(70) + '\n');

searchAndEngageAutomation();
