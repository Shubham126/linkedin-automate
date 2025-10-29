import express from 'express';
import jobManager from '../../utils/simpleJobManager.js';
import { getCookies, hasValidSession } from '../../services/cookieService.js';

const router = express.Router();

// ==================== START AUTOMATIONS ====================

// Start Feed Engagement
router.post('/feed-engagement/start', async (req, res) => {
  try {
    const { linkedinUsername, linkedinPassword, maxPosts = 15 } = req.body;

    if (!linkedinUsername) {
      return res.status(400).json({
        success: false,
        error: 'LinkedIn username is required'
      });
    }

    // Check if we have valid cookies
    const hasSession = await hasValidSession(linkedinUsername);

    if (!hasSession && !linkedinPassword) {
      return res.status(401).json({
        success: false,
        error: 'No valid session found. Please login first or provide password.'
      });
    }

    const result = await jobManager.startJob('index.js', {
      LINKEDIN_USERNAME: linkedinUsername,
      LINKEDIN_PASSWORD: linkedinPassword || '',
      USE_SAVED_COOKIES: hasSession ? 'true' : 'false',
      MAX_POSTS: maxPosts.toString()
    });

    res.json({
      success: true,
      usingCookies: hasSession,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Start Connection Requests
router.post('/connection-requests/start', async (req, res) => {
  try {
    const { 
      linkedinUsername, 
      linkedinPassword, 
      keyword = 'vibe coding', 
      maxRequests = 20 
    } = req.body;

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

    const result = await jobManager.startJob('sendConnectionRequests.js', {
      LINKEDIN_USERNAME: linkedinUsername,
      LINKEDIN_PASSWORD: linkedinPassword || '',
      USE_SAVED_COOKIES: hasSession ? 'true' : 'false',
      SEARCH_KEYWORD: keyword,
      MAX_CONNECTION_REQUESTS_PER_DAY: maxRequests.toString()
    });

    res.json({
      success: true,
      usingCookies: hasSession,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Start Monitor Connections
router.post('/monitor-connections/start', async (req, res) => {
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

    const result = await jobManager.startJob('monitorConnections.js', {
      LINKEDIN_USERNAME: linkedinUsername,
      LINKEDIN_PASSWORD: linkedinPassword || '',
      USE_SAVED_COOKIES: hasSession ? 'true' : 'false'
    });

    res.json({
      success: true,
      usingCookies: hasSession,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Start Welcome Messages
router.post('/welcome-messages/start', async (req, res) => {
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

    const result = await jobManager.startJob('sendWelcomeMessages.js', {
      LINKEDIN_USERNAME: linkedinUsername,
      LINKEDIN_PASSWORD: linkedinPassword || '',
      USE_SAVED_COOKIES: hasSession ? 'true' : 'false'
    });

    res.json({
      success: true,
      usingCookies: hasSession,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Start Search Engagement
router.post('/search-engagement/start', async (req, res) => {
  try {
    const { 
      linkedinUsername, 
      linkedinPassword, 
      keyword = 'vibe coding', 
      maxPosts = 10 
    } = req.body;

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

    const result = await jobManager.startJob('searchAndEngage.js', {
      LINKEDIN_USERNAME: linkedinUsername,
      LINKEDIN_PASSWORD: linkedinPassword || '',
      USE_SAVED_COOKIES: hasSession ? 'true' : 'false',
      SEARCH_KEYWORD: keyword,
      MAX_SEARCH_POSTS: maxPosts.toString()
    });

    res.json({
      success: true,
      usingCookies: hasSession,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Start Profile Scraping
router.post('/profile-scraping/start', async (req, res) => {
  try {
    const { 
      linkedinUsername, 
      linkedinPassword, 
      keyword = 'vibe coding', 
      maxProfiles = 20 
    } = req.body;

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

    const result = await jobManager.startJob('scrapeLinkedInPeople.js', {
      LINKEDIN_USERNAME: linkedinUsername,
      LINKEDIN_PASSWORD: linkedinPassword || '',
      USE_SAVED_COOKIES: hasSession ? 'true' : 'false',
      SEARCH_KEYWORD: keyword,
      MAX_PROFILES_TO_SCRAPE: maxProfiles.toString()
    });

    res.json({
      success: true,
      usingCookies: hasSession,
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

// Get current job status
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

// Cancel current job
router.post('/job/cancel', (req, res) => {
  try {
    const result = jobManager.cancelJob();
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});
export default router;
