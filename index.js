// ==================== FILE: backend/index.js ====================
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import dotenv from "dotenv";
import path from 'path';
import { fileURLToPath } from 'url';
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
import csvService from './services/csvService.js'; // NEW

dotenv.config();
puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// ==================== HUMAN-LIKE MOUSE SCROLL ====================
async function humanLikeScroll(page, direction = 'down') {
  console.log(`🐭 Scrolling ${direction}...`);
  
  const randomX = randomDelay(400, 900);
  const randomY = randomDelay(300, 700);
  await page.mouse.move(randomX, randomY);
  
  const scrollDistance = direction === 'down' ? randomDelay(600, 1200) : -randomDelay(600, 1200);
  
  const increment = 100;
  const steps = Math.abs(scrollDistance / increment);
  
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel({ deltaY: scrollDistance > 0 ? increment : -increment });
    await sleep(randomDelay(30, 80));
  }
  
  await sleep(randomDelay(1500, 3000));
}

// ==================== GET ALL POSTS ====================
async function getAllPostElements(page) {
  const postSelectors = [
    'div[role="listitem"] div[data-view-name="feed-full-update"]',
    'div[role="listitem"][data-view-name="feed-full-update"]',
    'div.feed-shared-update-v2',
    'div[role="listitem"]'
  ];

  for (const selector of postSelectors) {
    const posts = await page.$$(selector);
    if (posts.length > 0) {
      console.log(`✅ Found ${posts.length} posts using selector: ${selector}`);
      return posts;
    }
  }
  
  console.log('⚠️ No posts found with any selector');
  return [];
}

// ==================== LIKE POST ====================
async function likePostButton(post) {
  try {
    const liked = await post.evaluate(el => {
      const buttons = el.querySelectorAll('button');
      
      for (const btn of buttons) {
        const ariaLabel = btn.getAttribute('aria-label') || '';
        const innerHTML = btn.innerHTML || '';
        
        if (ariaLabel.toLowerCase().includes('like') || 
            innerHTML.includes('thumbs-up') ||
            ariaLabel.includes('reaction')) {
          
          if (!ariaLabel.includes('already')) {
            btn.click();
            return true;
          }
        }
      }
      
      return false;
    });
    
    if (liked) {
      console.log('✅ Liked post');
    } else {
      console.log('⚠️ Could not like post (may already be liked)');
    }
    
    return liked;
  } catch (error) {
    console.log(`Error liking post: ${error.message}`);
    return false;
  }
}

// ==================== GET POST TEXT ====================
async function getPostText(post) {
  try {
    return await post.evaluate(el => {
      const contentSelectors = [
        'span[data-testid="expandable-text-box"]',
        'p[class*="commentary"]',
        'div[class*="commentary"]',
        '[data-view-name="feed-commentary"]'
      ];

      for (const selector of contentSelectors) {
        const elem = el.querySelector(selector);
        if (elem && elem.innerText && elem.innerText.length > 20) {
          return elem.innerText.substring(0, 1000);
        }
      }

      const allText = el.innerText;
      if (allText && allText.length > 50) {
        return allText.substring(0, 1000);
      }

      return '';
    });
  } catch (error) {
    return '';
  }
}

// ==================== GET POST URL ====================
async function getPostUrl(post) {
  try {
    return await post.evaluate(el => {
      const dataView = el.getAttribute('data-view-tracking-scope');
      if (dataView) {
        try {
          const parsed = JSON.parse(dataView);
          if (parsed[0]?.content) {
            const str = Buffer.from(parsed[0].content).toString();
            const match = str.match(/urn:li:activity:\d+/);
            if (match) return match[0];
          }
        } catch (e) {}
      }

      const link = el.querySelector('a[href*="linkedin.com"]');
      if (link) return link.href;

      return Math.random().toString(36);
    });
  } catch (error) {
    return Math.random().toString(36);
  }
}

// ==================== GET AUTHOR NAME ====================
async function getAuthorName(post) {
  try {
    return await post.evaluate(el => {
      const nameSelectors = [
        'a strong',
        'strong',
        '[data-view-name="feed-header-text"] strong'
      ];

      for (const selector of nameSelectors) {
        const elem = el.querySelector(selector);
        if (elem && elem.innerText) {
          return elem.innerText;
        }
      }

      return 'Unknown Author';
    });
  } catch (error) {
    return 'Unknown Author';
  }
}

// ==================== CHECK IF JOB POST ====================
async function isJobPost(post) {
  try {
    return await post.evaluate(el => {
      const text = el.innerText.toLowerCase();
      return text.includes('job') || 
             text.includes('hiring') || 
             text.includes('position') ||
             text.includes('application');
    });
  } catch (error) {
    return false;
  }
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
    console.log('🐭 Scrolling: Mouse-based Human-like');
    console.log('📁 CSV Storage: Enabled'); // NEW
    console.log('='.repeat(60));

    const username = process.env.LINKEDIN_USERNAME;
    const password = process.env.LINKEDIN_PASSWORD;
    const useSavedCookies = process.env.USE_SAVED_COOKIES !== 'false';

    let loggedIn = false;

    // ==================== TRY SAVED COOKIES ====================
    if (useSavedCookies && username) {
      console.log('\n🍪 Checking for saved session...');
      const savedCookies = await getCookies(username);
      
      if (savedCookies && savedCookies.length > 0) {
        console.log(`✅ Found ${savedCookies.length} saved cookies`);
        
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

          if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork')) {
            console.log('✅ Session restored successfully!');
            loggedIn = true;
          } else {
            console.log('⚠️ Cookies expired, need fresh login');
            loggedIn = false;
          }
        } catch (error) {
          console.log(`⚠️ Error restoring session: ${error.message}`);
          loggedIn = false;
        }
      }
    }

    // ==================== LOGIN IF NEEDED ====================
      if (!loggedIn) {
      if (!password) {
        console.error('❌ Password required for fresh login');
        await browser.close();
        return;
      }

      console.log('\n🔐 Starting fresh login...');
      loggedIn = await linkedInLogin(page, username, password, true);
      
      console.log('\n⏸️  Please complete all verification steps:');
      console.log('   1️⃣  Solve CAPTCHA (if shown)');
      console.log('   2️⃣  Enter OTP code (if requested)');
      console.log('   3️⃣  Wait for redirect to LinkedIn feed');
      console.log('\n⏳ Waiting up to 5 minutes...\n');
      
      // Wait for successful navigation to feed (up to 5 minutes)
      try {
        await page.waitForFunction(
          () => window.location.href.includes('/feed') || 
                window.location.href.includes('/mynetwork'),
          { timeout: 300000 } // 5 minutes
        );
        
        loggedIn = true;
        console.log('✅ Login verified successfully!');
        
      } catch (error) {
        console.log('⚠️  Timeout waiting for login completion');
        const currentUrl = page.url();
        if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork')) {
          loggedIn = true;
          console.log('✅ But you are logged in!');
        } else {
          loggedIn = false;
        }
      }
      
      if (!loggedIn) {
        console.log('❌ Login failed. Exiting...');
        await browser.close();
        return;
      }


      const cookies = await page.cookies();
      await saveCookies(username, cookies);
      console.log(`✅ Saved ${cookies.length} cookies`);
    }

    // ==================== NAVIGATE TO FEED ====================
    console.log('\n🏠 Navigating to LinkedIn feed...');
    const currentUrl = page.url();
    if (!currentUrl.includes('/feed')) {
      await page.goto('https://www.linkedin.com/feed/?locale=en_US', { 
        waitUntil: 'domcontentloaded', 
        timeout: 60000 
      });
    }
    
    console.log('⏳ Waiting 60 seconds for posts to load...');
    await sleep(60000);
    
    console.log('✅ Feed loaded! Starting analysis...');
    await sleep(randomDelay(3000, 5000));

    // ==================== MAIN LOOP ====================
    const maxPosts = parseInt(process.env.MAX_POSTS) || 10;
    let postsEvaluated = 0;
    let likesGiven = 0;
    let commentsPosted = 0;
    let jobPostsCommented = 0;

    const scoreDistribution = {
      likes: [],
      comments: []
    };

    console.log('\n' + '='.repeat(60));
    console.log(`🤖 Starting Analysis (Max: ${maxPosts} posts)`);
    console.log('='.repeat(60) + '\n');

    while (postsEvaluated < maxPosts) {
      try {
        let posts = await getAllPostElements(page);
        
        if (posts.length === 0) {
          console.log('⚠️ No posts found, scrolling to load more...');
          await humanLikeScroll(page, 'down');
          await sleep(randomDelay(3000, 5000));
          continue;
        }

        console.log(`📊 Found ${posts.length} posts, processing...`);

        const postsToProcess = Math.min(3, posts.length);
        
        for (let i = 0; i < postsToProcess; i++) {
          if (postsEvaluated >= maxPosts) break;

          const post = posts[i];

          console.log('\n' + '═'.repeat(60));
          console.log(`📖 Post ${postsEvaluated + 1}/${maxPosts}`);
          console.log('═'.repeat(60));

          try {
            await post.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
            await sleep(randomDelay(2000, 3500));

            const postUrl = await getPostUrl(post);
            const authorName = await getAuthorName(post);
            const postText = await getPostText(post);
            const isJob = await isJobPost(post); // NEW

            console.log(`👤 Author: ${authorName}`);
            console.log(`📝 Content: ${postText.substring(0, 100)}...`);
            if (isJob) console.log('💼 Job Post Detected');

            const alreadyInteracted = await hasInteractedWithPost(postUrl);
            if (alreadyInteracted) {
              console.log('⏭️ Already interacted, skipping...');
              continue;
            }

            if (!postText || postText.length < 20) {
              console.log('⚠️ Post too short, skipping...');
              continue;
            }

            console.log('\n🤖 AI analyzing...');
            await sleep(randomDelay(1500, 2500));
            
            const evaluation = await evaluatePost({ text: postText });

            console.log('\n📊 Results:');
            console.log(`   Like: ${evaluation.likeScore}/10 → ${evaluation.shouldLike ? '✅' : '❌'}`);
            console.log(`   Comment: ${evaluation.commentScore}/10 → ${evaluation.shouldComment ? '✅' : '❌'}`);

            await sleep(randomDelay(3000, 6000));

            scoreDistribution.likes.push(evaluation.likeScore);
            scoreDistribution.comments.push(evaluation.commentScore);

            // ==================== LIKE WITH CSV ====================
            if (evaluation.shouldLike) {
              console.log('\n👍 Liking...');
              await sleep(randomDelay(800, 1500));
              
              const liked = await likePostButton(post);
              if (liked) {
                likesGiven++;
                
                // NEW: Save to CSV
                await csvService.appendLikeActivity(username, {
                  timestamp: new Date().toISOString(),
                  authorName: authorName,
                  postPreview: postText.substring(0, 100),
                  likeScore: evaluation.likeScore,
                  isJobPost: isJob,
                  postUrl: postUrl
                });
                
                console.log('✅ Saved to CSV');
              }
              
              await sleep(randomDelay(1500, 3000));
            }

            // ==================== COMMENT WITH CSV ====================
            if (evaluation.shouldComment) {
              console.log('\n💬 Commenting...');
              await sleep(randomDelay(1500, 2500));
              
              const commentText = await generateComment({ text: postText }, evaluation);
              await sleep(randomDelay(1000, 2000));
              
              const commented = await commentOnPost(post, page, commentText);
              if (commented) {
                commentsPosted++;
                if (isJob) jobPostsCommented++;
                
                // NEW: Save to CSV
                await csvService.appendCommentActivity(username, {
                  timestamp: new Date().toISOString(),
                  authorName: authorName,
                  postPreview: postText.substring(0, 100),
                  commentText: commentText,
                  commentScore: evaluation.commentScore,
                  isJobPost: isJob,
                  postUrl: postUrl
                });
                
                console.log('✅ Saved to CSV');
              }
            }

            postsEvaluated++;

          } catch (error) {
            console.log(`Error processing post: ${error.message}`);
          }

          if (postsEvaluated < maxPosts && i < postsToProcess - 1) {
            await sleep(randomDelay(5000, 10000));
          }
        }

        if (postsEvaluated < maxPosts) {
          console.log('\n⏳ Scrolling for more posts...');
          await humanLikeScroll(page, 'down');
          await sleep(randomDelay(4000, 8000));
        }

      } catch (error) {
        console.error(`Main loop error: ${error.message}`);
        await sleep(3000);
      }
    }

    // ==================== STATS ====================
    const avgLikeScore = scoreDistribution.likes.length > 0 
      ? (scoreDistribution.likes.reduce((a, b) => a + b, 0) / scoreDistribution.likes.length).toFixed(1)
      : 0;
    
    const avgCommentScore = scoreDistribution.comments.length > 0
      ? (scoreDistribution.comments.reduce((a, b) => a + b, 0) / scoreDistribution.comments.length).toFixed(1)
      : 0;

    // NEW: Get stats from CSV
    const csvStats = await csvService.getUserStats(username);
    const userCSVPaths = await csvService.getUserCSVPaths(username);

    console.log('\n' + '═'.repeat(60));
    console.log('✅ COMPLETED!');
    console.log('═'.repeat(60));
    console.log('\n📊 Session Statistics:');
    console.log(`   Posts Evaluated: ${postsEvaluated}/${maxPosts}`);
    console.log(`   Avg Like Score: ${avgLikeScore}/10`);
    console.log(`   Avg Comment Score: ${avgCommentScore}/10`);
    console.log(`   Likes Given: ${likesGiven}`);
    console.log(`   Comments Posted: ${commentsPosted}`);
    console.log(`   Job Posts: ${jobPostsCommented}`);
    
    console.log('\n📁 All-Time Statistics:');
    console.log(`   Total Likes: ${csvStats.total_engagement_likes || 0}`);
    console.log(`   Total Comments: ${csvStats.total_engagement_comments || 0}`);
    console.log(`   Total Connections: ${csvStats.total_connections_sent || 0}`);
    console.log(`   Total Messages: ${csvStats.total_messages_sent || 0}`);
    console.log(`   Total Posts Created: ${csvStats.total_posts_created || 0}`);
    
    console.log('\n📂 CSV File Paths:');
    if (userCSVPaths?.csv_paths) {
      Object.entries(userCSVPaths.csv_paths).forEach(([key, value]) => {
        if (value) console.log(`   📄 ${key}: ${value}`);
      });
    }
    
    console.log('═'.repeat(60) + '\n');

    await sleep(15000);
    await browser.close();
    
  } catch (err) {
    console.error('\n❌ ERROR:');
    console.error(err.message);
    console.error(err.stack);
  }
}

console.log('\n🎯 LinkedIn AI Bot');
console.log('⚠️ Educational purposes only');
console.log('='.repeat(60) + '\n');

linkedInAutomation();
