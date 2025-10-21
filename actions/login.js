import { sleep, randomDelay } from '../utils/helpers.js';

export async function linkedInLogin(page) {
  try {
    console.log('🔐 Navigating to LinkedIn login page...');
    await page.goto("https://www.linkedin.com/login", { 
      waitUntil: "networkidle2",
      timeout: 60000 
    });

    await page.locator('input[name="session_key"]').wait();

    if (!process.env.LINKEDIN_USERNAME || !process.env.LINKEDIN_PASSWORD) {
      console.log('⚠️ No credentials found in .env file');
      console.log('⏳ Please login manually (including CAPTCHA/2FA). Waiting 60 seconds...');
      await sleep(60000);
      return true;
    }

    console.log('🔑 Attempting automatic login...');
    
    await page.locator('input[name="session_key"]').fill(process.env.LINKEDIN_USERNAME);
    await sleep(randomDelay(1000, 2000));
    
    await page.locator('input[name="session_password"]').fill(process.env.LINKEDIN_PASSWORD);
    await sleep(randomDelay(1000, 2000));

    await page.locator('button[type="submit"]').click();
    
    console.log('⏳ Waiting for login... If CAPTCHA appears, solve it manually.');
    
    try {
      await page.waitForNavigation({ 
        waitUntil: "networkidle2", 
        timeout: 60000 
      });
      console.log('✅ Login successful!');
    } catch (navError) {
      if (navError.message.includes("timeout") || navError.message.includes("Timeout")) {
        console.log("⚠️ Navigation timeout - assuming login success...");
      } else {
        throw navError;
      }
    }

    await sleep(3000);
    return true;
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    return false;
  }
}
