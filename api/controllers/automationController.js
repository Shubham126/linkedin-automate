// ==================== FILE: backend/api/controllers/automationController.js ====================
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { linkedInLogin } from '../../actions/login.js';
import { hasValidSession, invalidateSession } from '../../services/cookieService.js';
import { getProxyArgs, authenticateProxy } from '../../utils/proxyHelper.js';
import jobManager from '../../utils/simpleJobManager.js';
import csvService from '../../services/csvService.js'; // NEW

puppeteer.use(StealthPlugin());

// ==================== USER MANAGEMENT FUNCTIONS ====================

/**
 * Register a new user
 */
export const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and password are required' 
      });
    }

    // TODO: Implement user registration logic
    // - Hash password
    // - Save to database
    // - Generate JWT token

    res.json({ 
      success: true, 
      message: 'User registered successfully',
      user: { email, name }
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
};

/**
 * Login user (traditional auth)
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and password are required' 
      });
    }

    // TODO: Implement user login logic
    // - Find user in database
    // - Compare password hash
    // - Generate JWT token

    res.json({ 
      success: true, 
      message: 'User logged in successfully',
      token: 'your-jwt-token-here'
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
};

/**
 * Get current user profile
 */
export const getCurrentUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
    }

    res.json({ 
      success: true, 
      user: req.user 
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
};

/**
 * Update user profile
 */
export const updateUser = async (req, res) => {
  try {
    const { name, bio } = req.body;

    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
    }

    // TODO: Implement user update logic
    // - Update user in database

    res.json({ 
      success: true, 
      message: 'User profile updated successfully',
      user: { ...req.user, name, bio }
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
};

/**
 * Change user password
 */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Current and new password are required' 
      });
    }

    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
    }

    // TODO: Implement password change logic
    // - Verify current password
    // - Hash new password
    // - Update in database

    res.json({ 
      success: true, 
      message: 'Password changed successfully' 
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// ==================== LINKEDIN AUTOMATION FUNCTIONS ====================

/**
 * Login to LinkedIn and save cookies
 */
export async function loginAndSaveCookies(req, res) {
  let browser;
  
  try {
    const { linkedinUsername, linkedinPassword } = req.body;

    if (!linkedinUsername || !linkedinPassword) {
      return res.status(400).json({
        success: false,
        error: 'LinkedIn credentials are required'
      });
    }

    console.log(`🔐 Starting LinkedIn login for: ${linkedinUsername}`);

    const proxyArgs = getProxyArgs();

    // Launch browser
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        '--start-maximized',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        ...proxyArgs
      ]
    });

    const page = (await browser.pages())[0];

    // Authenticate proxy
    await authenticateProxy(page);
    
    // Login and save cookies
    const loginSuccess = await linkedInLogin(page, linkedinUsername, linkedinPassword, true);

    if (!loginSuccess) {
      await browser.close();
      return res.status(401).json({
        success: false,
        error: 'LinkedIn login failed'
      });
    }

    console.log('⏳ Keeping browser open for 5 seconds to verify...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // NEW: Initialize CSV for this user
    try {
      await csvService.getUserCSVPaths(linkedinUsername);
      console.log('✅ CSV storage initialized for user');
    } catch (csvErr) {
      console.log('⚠️ CSV initialization warning:', csvErr.message);
    }

    await browser.close();

    res.json({
      success: true,
      message: 'LinkedIn login successful! Cookies saved.',
      email: linkedinUsername,
      proxyUsed: proxyArgs.length > 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    
    if (browser) {
      await browser.close();
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Check LinkedIn login status
 */
export async function checkLoginStatus(req, res) {
  try {
    const { linkedinUsername } = req.body;

    if (!linkedinUsername) {
      return res.status(400).json({
        success: false,
        error: 'LinkedIn username is required'
      });
    }

    const hasSession = await hasValidSession(linkedinUsername);

    res.json({
      success: true,
      isLoggedIn: hasSession,
      email: linkedinUsername
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Logout from LinkedIn and clear cookies
 */
export async function logoutAndClearCookies(req, res) {
  try {
    const { linkedinUsername } = req.body;

    if (!linkedinUsername) {
      return res.status(400).json({
        success: false,
        error: 'LinkedIn username is required'
      });
    }

    await invalidateSession(linkedinUsername);

    res.json({
      success: true,
      message: 'Logged out successfully',
      email: linkedinUsername
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ==================== JOB MANAGEMENT ====================

export async function startFeedEngagement(req, res) {
  try {
    const { maxPosts = 15, email } = req.body;
    
    const result = await jobManager.startJob('index.js', {
      MAX_POSTS: maxPosts.toString(),
      LINKEDIN_USERNAME: email
    });
    
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
}

export async function startConnectionRequests(req, res) {
  try {
    const { keyword = 'developer', maxRequests = 20, email } = req.body;
    
    const result = await jobManager.startJob('sendConnectionRequests.js', {
      SEARCH_KEYWORD: keyword,
      MAX_CONNECTION_REQUESTS_PER_DAY: maxRequests.toString(),
      LINKEDIN_USERNAME: email
    });
    
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
}

export async function startMonitorConnections(req, res) {
  try {
    const { email } = req.body;
    
    const result = await jobManager.startJob('monitorConnections.js', {
      LINKEDIN_USERNAME: email
    });
    
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
}

export async function startWelcomeMessages(req, res) {
  try {
    const { email } = req.body;
    
    const result = await jobManager.startJob('sendWelcomeMessages.js', {
      LINKEDIN_USERNAME: email
    });
    
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
}

export async function startSearchEngagement(req, res) {
  try {
    const { keyword = 'developer', maxPosts = 10, email } = req.body;
    
    const result = await jobManager.startJob('searchAndEngage.js', {
      SEARCH_KEYWORD: keyword,
      MAX_SEARCH_POSTS: maxPosts.toString(),
      LINKEDIN_USERNAME: email
    });
    
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
}

export async function startProfileScraping(req, res) {
  try {
    const { keyword = 'developer', maxProfiles = 20, email } = req.body;
    
    const result = await jobManager.startJob('scrapeProfiles.js', {
      SEARCH_KEYWORD: keyword,
      MAX_PROFILES_TO_SCRAPE: maxProfiles.toString(),
      LINKEDIN_USERNAME: email
    });
    
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
}

/**
 * Get current job status
 */
export function getJobStatus(req, res) {
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
}

/**
 * Cancel current job
 */
export function stopJob(req, res) {
  try {
    const result = jobManager.cancelJob();
    
    res.json({
      success: result.success,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Force kill current job (NEW)
 */
export function forceKillJob(req, res) {
  try {
    const result = jobManager.forceKillJob();
    
    res.json({
      success: result.success,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}
