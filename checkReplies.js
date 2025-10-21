import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import dotenv from "dotenv";
import { linkedInLogin } from './actions/login.js';
import { goToNotifications, findCommentNotifications, findReplyElement } from './actions/checkNotifications.js';
import { analyzeReply, isSimpleAcknowledgment } from './services/replyAnalyzer.js';
import { likeReply, replyToComment } from './actions/replyToComment.js';
import { sleep, randomDelay } from './utils/helpers.js';
import { logActivity } from './utils/activityLogger.js';

dotenv.config();
puppeteer.use(StealthPlugin());

async function checkAndRespondToReplies() {
  console.log('\n🎯 LinkedIn Reply Checker with AI Pre-Analysis');
  console.log('🤖 Reads replies from notifications first');
  console.log('🧠 AI decides if action needed before opening post');
  console.log('⚡ Only navigates when necessary');
  console.log('═'.repeat(60) + '\n');

  let browser;
  
  try {
    console.log('🚀 Starting browser...');
    
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        "--start-maximized",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled"
      ],
    });

    const page = (await browser.pages())[0];
    page.setDefaultNavigationTimeout(60000);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('✅ Browser started');

    // Login
    console.log('\n📍 Step 1: Login');
    const loggedIn = await linkedInLogin(page);
    if (!loggedIn) {
      console.log('❌ Login failed');
      if (browser) await browser.close();
      return;
    }

    // Navigate to Notifications
    console.log('\n📍 Step 2: Open Notifications');
    const notifSuccess = await goToNotifications(page);
    if (!notifSuccess) {
      console.log('❌ Failed to load notifications');
      if (browser) await browser.close();
      return;
    }

    // Extract replies from notifications
    console.log('\n📍 Step 3: Extract Replies from Notifications');
    const replyNotifications = await findCommentNotifications(page);
    
    if (replyNotifications.length === 0) {
      console.log('\n📭 No reply notifications found');
      console.log('✅ All caught up!');
      await sleep(5000);
      if (browser) await browser.close();
      return;
    }

    let totalReplies = 0;
    let repliesLiked = 0;
    let repliesAnswered = 0;
    let repliesSkipped = 0;
    let postsOpened = 0;

    // Process each reply
    console.log('\n📍 Step 4: AI Pre-Analysis & Smart Response');
    const maxReplies = Math.min(replyNotifications.length, 5);
    
    for (let i = 0; i < maxReplies; i++) {
      const notif = replyNotifications[i];
      
      console.log('\n' + '═'.repeat(60));
      console.log(`📬 Reply ${i + 1}/${maxReplies}`);
      console.log(`👤 From: ${notif.author}`);
      console.log(`💬 "${notif.replyText}"`);
      console.log(`🕐 ${notif.time}`);
      console.log('═'.repeat(60));

      totalReplies++;

      // ===== AI PRE-CHECK =====
      // Analyze reply WITHOUT opening post first
      console.log('\n🧠 AI Pre-Analysis (before opening post)...');
      
      // Check if simple acknowledgment
      if (isSimpleAcknowledgment(notif.replyText)) {
        console.log('\n✅ Pre-Analysis Result: Simple acknowledgment');
        console.log('   Action: Like only');
        console.log('   🚫 No need to open post or reply');
        
        repliesSkipped++;
        
        await logActivity({
          action: 'reply-skipped',
          replyAuthor: notif.author,
          replyText: notif.replyText,
          replyType: 'acknowledgment',
          reason: 'Simple thank you - no action needed'
        });
        
        await sleep(randomDelay(2000, 3000));
        continue;
      }

      // AI analyzes the reply
      const analysis = await analyzeReply({
        author: notif.author,
        text: notif.replyText,
        time: notif.time,
        parentComment: 'From notification'
      });

      console.log(`\n📊 AI Pre-Analysis Result:`);
      console.log(`   🎯 Recommended Action: ${analysis.action.toUpperCase()}`);
      console.log(`   📝 Type: ${analysis.replyType}`);
      console.log(`   ❓ Is Question: ${analysis.isQuestion ? 'YES' : 'NO'}`);
      console.log(`   💭 Reasoning: ${analysis.reasoning}`);

      // Decide if we need to open post
      const needsAction = analysis.shouldLike || analysis.shouldReply;
      
      if (!needsAction) {
        console.log('\n⏭️ AI Decision: No action needed');
        console.log('   🚫 Skipping this reply (not opening post)');
        repliesSkipped++;
        await sleep(randomDelay(2000, 3000));
        continue;
      }

      // ===== OPEN POST ONLY IF ACTION NEEDED =====
      console.log('\n🌐 AI Decision: Action needed - Opening post...');
      postsOpened++;
      
      const replyElement = await findReplyElement(page, notif.postUrl);
      
      if (!replyElement) {
        console.log('⚠️ Could not find reply element in post');
        continue;
      }

      // Perform actions
      if (analysis.shouldLike) {
        console.log('\n👍 Liking reply...');
        const liked = await likeReply(replyElement);
        if (liked) {
          repliesLiked++;
          await logActivity({
            action: 'reply-like',
            replyAuthor: notif.author,
            replyText: notif.replyText,
            replyType: analysis.replyType
          });
        }
        await sleep(randomDelay(2000, 3000));
      }

      if (analysis.shouldReply && analysis.suggestedReply) {
        console.log(`\n💬 Posting AI-generated reply...`);
        console.log(`📝 "${analysis.suggestedReply}"`);
        
        const replied = await replyToComment(replyElement, page, analysis.suggestedReply);
        
        if (replied) {
          repliesAnswered++;
          await logActivity({
            action: 'reply-comment',
            replyAuthor: notif.author,
            replyText: notif.replyText,
            ourReply: analysis.suggestedReply,
            replyType: analysis.replyType,
            isQuestion: analysis.isQuestion
          });
        }
        
        await sleep(randomDelay(4000, 6000));
      }

      // Return to notifications
      if (i < maxReplies - 1) {
        console.log('\n🔙 Returning to notifications...');
        await goToNotifications(page);
        await sleep(3000);
      }
      
      await sleep(randomDelay(3000, 5000));
    }

    // Statistics
    console.log('\n' + '═'.repeat(60));
    console.log('✅ REPLY CHECK COMPLETED!');
    console.log('═'.repeat(60));
    console.log('\n📊 Session Statistics:');
    console.log(`   • Total Replies Found: ${totalReplies}`);
    console.log(`   • Posts Opened: ${postsOpened} (${Math.round((postsOpened/totalReplies)*100)}%)`);
    console.log(`   • Replies Liked: ${repliesLiked}`);
    console.log(`   • Replies Answered: ${repliesAnswered}`);
    console.log(`   • Replies Skipped: ${repliesSkipped}`);
    console.log(`\n💡 Efficiency: Avoided opening ${totalReplies - postsOpened} unnecessary posts!`);
    console.log('═'.repeat(60));

    console.log('\n⏳ Browser open for 10 seconds...');
    await sleep(10000);

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error('Stack:', err.stack);
  }
}

(async () => {
  try {
    await checkAndRespondToReplies();
  } catch (error) {
    console.error('💥 FATAL:', error);
    process.exit(1);
  }
})();
