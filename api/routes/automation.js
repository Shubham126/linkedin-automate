// ==================== FILE: backend/api/routes/automation.js (ENHANCED) ====================
import express from 'express';
import jobManager from '../../utils/simpleJobManager.js';
import { getCookies, hasValidSession } from '../../services/cookieService.js';
import csvService from '../../services/csvService.js'; // NEW
import UserCSV from '../../models/UserCSV.js'; // NEW

const router = express.Router();

// ==================== MIDDLEWARE ====================

/**
 * Validate LinkedIn credentials
 */
async function validateLinkedInCredentials(req, res, next) {
  try {
    const { linkedinUsername, linkedinPassword } = req.body;

    if (!linkedinUsername) {
      return res.status(400).json({
        success: false,
        error: 'LinkedIn username is required'
      });
    }

    const hasSession = await hasValidSession(linkedinUsername);
    if (!hasSession && !linkedinPassword) {
      return res.status(401).json({
        success: false,
        error: 'No valid session found. Please login first or provide password.'
      });
    }

    // Attach to request object
    req.linkedinUsername = linkedinUsername;
    req.linkedinPassword = linkedinPassword || '';
    req.hasSession = hasSession;

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ==================== START AUTOMATIONS ====================

/**
 * Start Feed Engagement
 * POST /api/automation/feed-engagement/start
 */
router.post('/feed-engagement/start', validateLinkedInCredentials, async (req, res) => {
  try {
    const { maxPosts = 15 } = req.body;

    const result = await jobManager.startJob('index.js', {
      LINKEDIN_USERNAME: req.linkedinUsername,
      LINKEDIN_PASSWORD: req.linkedinPassword,
      USE_SAVED_COOKIES: req.hasSession ? 'true' : 'false',
      MAX_POSTS: maxPosts.toString()
    });

    // NEW: Initialize CSV for user
    try {
      await csvService.getUserCSVPaths(req.linkedinUsername);
    } catch (err) {
      console.log('⚠️ CSV initialization warning:', err.message);
    }

    res.json({
      success: true,
      usingCookies: req.hasSession,
      automation: 'feed-engagement',
      params: { maxPosts },
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Start Connection Requests
 * POST /api/automation/connection-requests/start
 */
router.post('/connection-requests/start', validateLinkedInCredentials, async (req, res) => {
  try {
    const { keyword = 'developer', maxRequests = 20 } = req.body;

    const result = await jobManager.startJob('sendConnectionRequests.js', {
      LINKEDIN_USERNAME: req.linkedinUsername,
      LINKEDIN_PASSWORD: req.linkedinPassword,
      USE_SAVED_COOKIES: req.hasSession ? 'true' : 'false',
      SEARCH_KEYWORD: keyword,
      MAX_CONNECTION_REQUESTS_PER_DAY: maxRequests.toString()
    });

    // NEW: Initialize CSV
    try {
      await csvService.getUserCSVPaths(req.linkedinUsername);
    } catch (err) {
      console.log('⚠️ CSV initialization warning:', err.message);
    }

    res.json({
      success: true,
      usingCookies: req.hasSession,
      automation: 'connection-requests',
      params: { keyword, maxRequests },
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Start Monitor Connections
 * POST /api/automation/monitor-connections/start
 */
router.post('/monitor-connections/start', validateLinkedInCredentials, async (req, res) => {
  try {
    const result = await jobManager.startJob('monitorConnections.js', {
      LINKEDIN_USERNAME: req.linkedinUsername,
      LINKEDIN_PASSWORD: req.linkedinPassword,
      USE_SAVED_COOKIES: req.hasSession ? 'true' : 'false'
    });

    res.json({
      success: true,
      usingCookies: req.hasSession,
      automation: 'monitor-connections',
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Start Welcome Messages
 * POST /api/automation/welcome-messages/start
 */
router.post('/welcome-messages/start', validateLinkedInCredentials, async (req, res) => {
  try {
    const result = await jobManager.startJob('sendWelcomeMessages.js', {
      LINKEDIN_USERNAME: req.linkedinUsername,
      LINKEDIN_PASSWORD: req.linkedinPassword,
      USE_SAVED_COOKIES: req.hasSession ? 'true' : 'false'
    });

    res.json({
      success: true,
      usingCookies: req.hasSession,
      automation: 'welcome-messages',
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Start Search Engagement
 * POST /api/automation/search-engagement/start
 */
router.post('/search-engagement/start', validateLinkedInCredentials, async (req, res) => {
  try {
    const { keyword = 'developer', maxPosts = 10 } = req.body;

    const result = await jobManager.startJob('searchAndEngage.js', {
      LINKEDIN_USERNAME: req.linkedinUsername,
      LINKEDIN_PASSWORD: req.linkedinPassword,
      USE_SAVED_COOKIES: req.hasSession ? 'true' : 'false',
      SEARCH_KEYWORD: keyword,
      MAX_SEARCH_POSTS: maxPosts.toString()
    });

    // NEW: Initialize CSV
    try {
      await csvService.getUserCSVPaths(req.linkedinUsername);
    } catch (err) {
      console.log('⚠️ CSV initialization warning:', err.message);
    }

    res.json({
      success: true,
      usingCookies: req.hasSession,
      automation: 'search-engagement',
      params: { keyword, maxPosts },
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Start Profile Scraping
 * POST /api/automation/profile-scraping/start
 */
router.post('/profile-scraping/start', validateLinkedInCredentials, async (req, res) => {
  try {
    const { keyword = 'developer', maxProfiles = 20 } = req.body;

    const result = await jobManager.startJob('scrapeProfiles.js', {
      LINKEDIN_USERNAME: req.linkedinUsername,
      LINKEDIN_PASSWORD: req.linkedinPassword,
      USE_SAVED_COOKIES: req.hasSession ? 'true' : 'false',
      SEARCH_KEYWORD: keyword,
      MAX_PROFILES_TO_SCRAPE: maxProfiles.toString()
    });

    res.json({
      success: true,
      usingCookies: req.hasSession,
      automation: 'profile-scraping',
      params: { keyword, maxProfiles },
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== JOB MANAGEMENT ====================

/**
 * Get current job status
 * GET /api/automation/job/status
 */
router.get('/job/status', (req, res) => {
  try {
    const status = jobManager.getStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Cancel current job
 * POST /api/automation/job/cancel
 */
router.post('/job/cancel', (req, res) => {
  try {
    const result = jobManager.cancelJob();
    
    res.json({
      success: result.success,
      message: result.message,
      jobId: result.jobId
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Force kill current job (emergency)
 * POST /api/automation/job/force-kill
 */
router.post('/job/force-kill', (req, res) => {
  try {
    const result = jobManager.forceKillJob();
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        jobId: result.jobId
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get job output (for debugging)
 * GET /api/automation/job/output
 */
router.get('/job/output', (req, res) => {
  try {
    const output = jobManager.getOutput();
    
    res.json({
      success: true,
      data: {
        output: output,
        length: output.length,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get detailed job info
 * GET /api/automation/job/info
 */
router.get('/job/info', (req, res) => {
  try {
    const status = jobManager.getStatus();
    const output = jobManager.getOutput();
    
    res.json({
      success: true,
      data: {
        status,
        outputLines: output.split('\n').length,
        lastLine: output.split('\n').slice(-1)[0],
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== CREATE POST ROUTES ====================

/**
 * Create Single Post (AI Generated)
 * POST /api/automation/create-post/single
 */
router.post('/create-post/single', validateLinkedInCredentials, async (req, res) => {
  try {
    const { postText, hashtags = [] } = req.body;

    if (!postText || postText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Post text is required'
      });
    }

    const result = await jobManager.startJob('createPostSingle.js', {
      LINKEDIN_USERNAME: req.linkedinUsername,
      LINKEDIN_PASSWORD: req.linkedinPassword,
      USE_SAVED_COOKIES: req.hasSession ? 'true' : 'false',
      POST_TEXT: postText,
      POST_HASHTAGS: JSON.stringify(hashtags)
    });

    res.json({
      success: true,
      usingCookies: req.hasSession,
      automation: 'create-post',
      postLength: postText.length,
      hashtagCount: hashtags.length,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Generate AI Post
 * POST /api/automation/create-post/generate-ai
 */
router.post('/create-post/generate-ai', async (req, res) => {
  try {
    const { 
      topic, 
      tone = 'professional', 
      length = 'medium', 
      includeQuestion = true
    } = req.body;

    if (!topic || topic.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Topic is required'
      });
    }

    // Generate realistic AI post based on length
    let postContent = '';
    
    if (length === 'short') {
      postContent = `Quick thought on ${topic}:\n\n📌 Key insight: In today's evolving landscape, ${topic.toLowerCase()} is crucial for success.\n\n✓ Drives innovation\n✓ Builds connections\n✓ Creates opportunities`;
    } else if (length === 'long') {
      postContent = `📊 Deep dive into ${topic}:\n\nAfter working in this space for years, I've learned that ${topic.toLowerCase()} fundamentally shapes outcomes. Here are my key observations:\n\n🔹 Strategic importance\n🔹 Implementation challenges\n🔹 Success metrics\n🔹 Future trends\n\nThe intersection of these factors creates unique opportunities for those willing to adapt and evolve.`;
    } else {
      postContent = `💭 Thoughts on ${topic}:\n\nIn today's fast-paced world, ${topic.toLowerCase()} has become increasingly important. Here are some key insights:\n\n✓ Innovation and growth\n✓ Best practices and strategies\n✓ Future opportunities`;
    }

    if (includeQuestion) {
      postContent += '\n\n❓ What are your thoughts? I\'d love to hear your perspective!';
    }

    const toneAdjustments = {
      professional: ['Strategic', 'Key', 'Important'],
      casual: ['Cool', 'Awesome', 'Fun'],
      inspirational: ['Journey', 'Growth', 'Believe']
    };

    const hashtags = [
      `#${topic.split(' ')[0]}`,
      '#LinkedIn',
      '#Professional',
      '#Growth',
      '#Innovation',
      '#Success'
    ];

    res.json({
      success: true,
      data: {
        text: postContent,
        hashtags,
        tone,
        length,
        stats: {
          wordCount: postContent.split(/\s+/).length,
          characterCount: postContent.length,
          lineCount: postContent.split('\n').length
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Generate Hashtags
 * POST /api/automation/create-post/generate-hashtags
 */
router.post('/create-post/generate-hashtags', (req, res) => {
  try {
    const { postText, count = 5 } = req.body;

    if (!postText || postText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Post text is required'
      });
    }

    // Extract keywords from post
    const words = postText
      .split(/\s+/)
      .filter(word => word.length > 4 && !word.includes('#'))
      .slice(0, 3);

    const customHashtags = words.map(word => 
      '#' + word.toLowerCase().replace(/[^a-z0-9]/g, '')
    );

    const genericHashtags = [
      '#LinkedIn',
      '#Professional',
      '#Success',
      '#Business',
      '#Growth',
      '#Innovation',
      '#Insights',
      '#Career',
      '#Networking',
      '#Leadership'
    ];

    const finalHashtags = [
      ...new Set([...customHashtags, ...genericHashtags])
    ].slice(0, count);

    res.json({
      success: true,
      data: {
        hashtags: finalHashtags,
        customHashtags,
        count: finalHashtags.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get user CSV statistics (NEW)
 * GET /api/automation/user/csv-stats?email=user@email.com
 */
router.get('/user/csv-stats', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const csvStats = await csvService.getUserStats(email);
    const userCSVPaths = await csvService.getUserCSVPaths(email);

    res.json({
      success: true,
      data: {
        stats: csvStats,
        paths: userCSVPaths?.csv_paths || {}
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get automation history (NEW)
 * GET /api/automation/history?email=user@email.com&limit=10
 */
router.get('/history', async (req, res) => {
  try {
    const { email, limit = 10 } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Get UserCSV record
    const userCSV = await UserCSV.findOne({ user_email: email });

    if (!userCSV) {
      return res.json({
        success: true,
        data: {
          history: [],
          message: 'No automation history found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        history: {
          totalEngagementLikes: userCSV.summary_stats.total_engagement_likes,
          totalEngagementComments: userCSV.summary_stats.total_engagement_comments,
          totalConnectionsSent: userCSV.summary_stats.total_connections_sent,
          totalMessagesSent: userCSV.summary_stats.total_messages_sent,
          lastUpdated: userCSV.updated_at
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
