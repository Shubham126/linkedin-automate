import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import dotenv from "dotenv";
import { linkedInLogin } from './actions/login.js';
import { likePost } from './actions/like.js';
import { commentOnPost } from './actions/comment.js';
import { extractPostContent } from './services/extractPostContent.js';
import { evaluatePost, generateComment } from './services/aiService.js';
import { sleep, randomDelay, extractPostUrl, extractAuthorName } from './utils/helpers.js';
import { logActivity, getActivityStats, hasInteractedWithPost } from './utils/activityLogger.js';

dotenv.config();
puppeteer.use(StealthPlugin());

/**
 * Search for posts with specific keyword
 */
async function searchLinkedIn(page, keyword) {
  try {
    console.log(`\n🔍 Searching LinkedIn for: "${keyword}"`);
    
    // Navigate to search page
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
 * Scroll through search results
 */
async function scrollSearchResults(page) {
  console.log('🐭 Scrolling through search results...');
  
  await page.evaluate(() => {
    window.scrollBy({ top: 800, behavior: 'smooth' });
  });
  
  await sleep(randomDelay(3000, 4500));
}

/**
 * Main search and engage function
 */
async function searchAndEngageAutomation() {
  console.log('\n🎯 LinkedIn Search & Engage Automation');
  console.log('🔍 Searches for specific keywords and engages intelligently');
  console.log('🤖 AI evaluates each post before engaging');
  console.log('⚠️  Educational purposes only - violates LinkedIn ToS');
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
    console.log('🔐 Logging in to LinkedIn...');
    const loggedIn = await linkedInLogin(page);
    if (!loggedIn) {
      console.log('❌ Login failed. Exiting...');
      await browser.close();
      return;
    }
    console.log('✅ Logged in successfully!\n');

    // Get search keyword from environment or use default
    const searchKeyword = process.env.SEARCH_KEYWORD || 'vibe coding';
    
    // Search for keyword
    const searchSuccess = await searchLinkedIn(page, searchKeyword);
    if (!searchSuccess) {
      console.log('❌ Search failed. Exiting...');
      await browser.close();
      return;
    }

    // Configuration
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

    console.log('\n' + '═'.repeat(60));
    console.log(`🤖 Starting Search Results Analysis`);
    console.log(`🔍 Keyword: "${searchKeyword}"`);
    console.log(`📊 Target: ${maxPosts} posts`);
    console.log('═'.repeat(60) + '\n');

    while (postsEvaluated < maxPosts) {
      // Find posts in search results
      const posts = await page.$$('div.feed-shared-update-v2');
      
      if (posts.length === 0) {
        console.log('❌ No posts found in search results');
        break;
      }

      const post = posts[postsViewed];
      
      if (!post) {
        console.log('⚠️ No more posts to process, scrolling for more...');
        await scrollSearchResults(page);
        await sleep(3000);
        
        // Check again after scrolling
        const newPosts = await page.$$('div.feed-shared-update-v2');
        if (newPosts.length <= postsViewed) {
          console.log('⚠️ Reached end of search results');
          break;
        }
        continue;
      }

      console.log('\n' + '═'.repeat(60));
      console.log(`📖 Reading Search Result ${postsViewed + 1} (Evaluated: ${postsEvaluated}/${maxPosts})`);
      console.log('═'.repeat(60));

      // Scroll post into view
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
        await scrollSearchResults(page);
        await sleep(randomDelay(2000, 3000));
        continue;
      }

      // Extract post content
      console.log('\n📄 Extracting post content...');
      const postContent = await extractPostContent(post);
      
      if (!postContent.text || postContent.text.length < 20) {
        console.log('⚠️ Post content too short or empty, skipping...');
        postsViewed++;
        await scrollSearchResults(page);
        continue;
      }

      console.log(`📝 Post Preview (${postContent.wordCount} words):`);
      console.log(`   "${postContent.text.substring(0, 150)}..."`);
      if (postContent.hashtags.length > 0) {
        console.log(`🏷️  Hashtags: ${postContent.hashtags.join(', ')}`);
      }

      // Check if post contains search keyword
      const containsKeyword = postContent.text.toLowerCase().includes(searchKeyword.toLowerCase());
      console.log(`🔍 Contains "${searchKeyword}": ${containsKeyword ? '✅ YES' : '❌ NO'}`);

      // AI evaluates the post
      console.log('\n🤖 AI is analyzing this post...');
      await sleep(1000);
      
      const evaluation = await evaluatePost(postContent);

      console.log('\n📊 AI Evaluation Results:');
      console.log(`   📈 Like Score: ${evaluation.likeScore}/10 → ${evaluation.shouldLike ? '✅ WILL LIKE' : '❌ Skip'}`);
      console.log(`   💬 Comment Score: ${evaluation.commentScore}/10 → ${evaluation.shouldComment ? '✅ WILL COMMENT' : '❌ Skip'}`);
      console.log(`   💼 Job Post: ${evaluation.isJobPost ? '✅ YES' : '❌ NO'}`);
      console.log(`   📑 Type: ${evaluation.postType}`);
      console.log(`   💭 Reason: ${evaluation.reasoning}`);

      scoreDistribution.likes.push(evaluation.likeScore);
      scoreDistribution.comments.push(evaluation.commentScore);

      // Simulate reading time
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

      await scrollSearchResults(page);
      
      console.log(`\n⏳ Pausing before next post...`);
      await sleep(randomDelay(6000, 10000));
    }

    // Statistics
    const avgLikeScore = scoreDistribution.likes.length > 0 
      ? scoreDistribution.likes.reduce((a, b) => a + b, 0) / scoreDistribution.likes.length 
      : 0;
    const avgCommentScore = scoreDistribution.comments.length > 0
      ? scoreDistribution.comments.reduce((a, b) => a + b, 0) / scoreDistribution.comments.length
      : 0;
    const activityStats = await getActivityStats();

    console.log('\n' + '═'.repeat(60));
    console.log('✅ SEARCH & ENGAGE AUTOMATION COMPLETED!');
    console.log('═'.repeat(60));
    console.log('\n📊 Session Statistics:');
    console.log(`\n   🔍 Search Query:`);
    console.log(`      • Keyword: "${searchKeyword}"`);
    console.log(`      • Posts Viewed: ${postsViewed}`);
    console.log(`      • Posts Evaluated: ${postsEvaluated}/${maxPosts}`);
    console.log(`      • Skipped (Previously Seen): ${skippedPrevious}`);
    console.log(`\n   📈 Average Scores:`);
    console.log(`      • Average Like Score: ${avgLikeScore.toFixed(1)}/10`);
    console.log(`      • Average Comment Score: ${avgCommentScore.toFixed(1)}/10`);
    console.log(`\n   🎯 Engagement:`);
    console.log(`      • Likes Given: ${likesGiven}/${postsEvaluated} (${Math.round((likesGiven/postsEvaluated)*100)}%)`);
    console.log(`      • Comments Posted: ${commentsPosted}/${postsEvaluated} (${Math.round((commentsPosted/postsEvaluated)*100)}%)`);
    console.log('\n📁 All-Time Statistics:');
    console.log(`      • Total Activities: ${activityStats.total}`);
    console.log(`      • Total Likes: ${activityStats.likes}`);
    console.log(`      • Total Comments: ${activityStats.comments}`);
    console.log(`      • Unique Posts: ${activityStats.uniquePosts}`);
    console.log('\n' + '═'.repeat(60));
    console.log('📝 Detailed log saved in: activity-log.json');
    console.log('═'.repeat(60));

    console.log('\n⏳ Browser will remain open for 15 seconds...');
    await sleep(15000);

    console.log('👋 Closing browser...');
    // await browser.close();

  } catch (err) {
    console.error('\n❌ CRITICAL ERROR:');
    console.error('═'.repeat(60));
    console.error('Error message:', err.message);
    console.error('Stack trace:', err.stack);
    console.error('═'.repeat(60));
  }
}

console.log('\n🎯 LinkedIn Search & Engage Automation Bot');
console.log('🔍 Searches for keywords and engages intelligently');
console.log('🤖 AI-powered post evaluation and commenting');
console.log('⚠️  Educational purposes only - violates LinkedIn ToS');
console.log('═'.repeat(60) + '\n');

searchAndEngageAutomation();
