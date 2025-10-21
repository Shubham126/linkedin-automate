import { sleep, randomDelay } from '../utils/helpers.js';

/**
 * Type text with human-like speed and natural pauses
 */
async function humanLikeType(page, selector, text, options = {}) {
  const element = await page.$(selector);
  if (!element) return false;
  
  await element.click();
  await sleep(randomDelay(500, 1000)); // Pause after clicking
  
  // Type character by character with variable delays
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Longer pause for spaces (thinking time)
    if (char === ' ') {
      await element.type(char, { delay: randomDelay(150, 300) });
    }
    // Normal typing speed with variation
    else {
      await element.type(char, { delay: randomDelay(80, 200) });
    }
    
    // Random pause every few characters (like real typing)
    if (i > 0 && i % randomDelay(8, 15) === 0) {
      await sleep(randomDelay(200, 500));
    }
  }
  
  await sleep(randomDelay(300, 700)); // Pause after typing
  return true;
}

export async function linkedInLogin(page) {
  try {
    console.log('🔐 Navigating to LinkedIn login page...');
    await page.goto("https://www.linkedin.com/login", { 
      waitUntil: "networkidle2",
      timeout: 60000 
    });

    await page.locator('input[name="session_key"]').wait();

    // Check if manual login is needed
    if (!process.env.LINKEDIN_USERNAME || !process.env.LINKEDIN_PASSWORD) {
      console.log('⚠️ No credentials found in .env file');
      console.log('⏳ Please login manually (including CAPTCHA/2FA). Waiting 60 seconds...');
      await sleep(60000);
      return true;
    }

    console.log('🔑 Attempting automatic login...');
    console.log('⌨️ Typing username slowly (human-like)...');
    
    // Type username with human-like speed
    const usernameTyped = await humanLikeType(
      page, 
      'input[name="session_key"]', 
      process.env.LINKEDIN_USERNAME
    );
    
    if (!usernameTyped) {
      console.log('❌ Could not type username');
      return false;
    }
    
    // Random pause between fields (like a human)
    console.log('💭 Pausing before password...');
    await sleep(randomDelay(800, 1500));
    
    console.log('🔒 Typing password slowly...');
    
    // Type password with human-like speed
    const passwordTyped = await humanLikeType(
      page,
      'input[name="session_password"]',
      process.env.LINKEDIN_PASSWORD
    );
    
    if (!passwordTyped) {
      console.log('❌ Could not type password');
      return false;
    }

    // Pause before clicking (like reading the button)
    console.log('👀 About to click login button...');
    await sleep(randomDelay(1000, 2000));
    
    await page.locator('button[type="submit"]').click();
    
    console.log('⏳ Waiting for login... If CAPTCHA appears, solve it manually.');
    console.log('⏳ Waiting up to 60 seconds for login completion...');
    
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
