import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { linkedInLogin } from '../../actions/login.js';
import { saveCookies } from '../../services/cookieService.js';
import { getProxyArgs, authenticateProxy } from '../../utils/proxyHelper.js';

puppeteer.use(StealthPlugin());

const router = express.Router();

/**
 * LOGIN ENDPOINT - Do login once, save cookies globally
 */
router.post('/linkedin/login', async (req, res) => {
  let browser;
  
  try {
    const { linkedinUsername, linkedinPassword } = req.body;

    if (!linkedinUsername || !linkedinPassword) {
      return res.status(400).json({
        success: false,
        error: 'LinkedIn credentials required'
      });
    }

    console.log(`🔐 LOGIN ENDPOINT: Starting login for ${linkedinUsername}`);

    const proxyArgs = getProxyArgs();

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
    
    await authenticateProxy(page);

    // DO THE LOGIN
    const loginSuccess = await linkedInLogin(page, linkedinUsername, linkedinPassword, true);

    if (!loginSuccess) {
      await browser.close();
      return res.status(401).json({
        success: false,
        error: 'Login failed'
      });
    }

    // Get and save cookies
    const cookies = await page.cookies();
    await saveCookies(linkedinUsername, cookies);

    console.log(`✅ LOGIN SUCCESSFUL: Cookies saved for ${linkedinUsername}`);

    await browser.close();

    res.json({
      success: true,
      message: 'Login successful! Cookies saved.',
      email: linkedinUsername,
      cookieCount: cookies.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    if (browser) await browser.close();

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
