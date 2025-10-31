import { sleep, randomDelay } from '../utils/helpers.js';
import { saveCookies, getCookies } from '../services/cookieService.js';

/**
 * Login to LinkedIn with cookie saving
 */
export async function linkedInLogin(page, username, password, saveCookiesToDB = true) {
  try {
    console.log('🔐 Checking for existing session...');

    // Try to load existing cookies from database
    const savedCookies = await getCookies(username);

    if (savedCookies && savedCookies.length > 0) {
      console.log('✅ Found saved cookies, attempting to reuse...');
      
      try {
        await page.setCookie(...savedCookies);
        console.log('⏳ Navigating to LinkedIn (timeout: 120s)...');
        await page.goto('https://www.linkedin.com/feed/', { 
          waitUntil: 'domcontentloaded',
          timeout: 120000  // Increased timeout
        });

        await sleep(5000);

        // Check if still logged in
        const currentUrl = page.url();
        if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork')) {
          console.log('✅ Logged in successfully using saved cookies!');
          return true;
        } else {
          console.log('⚠️ Saved cookies expired, logging in fresh...');
        }
      } catch (error) {
        console.log('⚠️ Error using saved cookies, logging in fresh...');
      }
    }

    // Fresh login
    console.log('🔐 Navigating to LinkedIn login page...');
    await page.goto('https://www.linkedin.com/login', { 
      waitUntil: 'domcontentloaded',  // Changed from networkidle2
      timeout: 120000  // Increased timeout
    });

    await sleep(randomDelay(2000, 3000));

    console.log('🔑 Attempting automatic login...');

    // Type username
    const usernameInput = await page.$('#username');
    if (!usernameInput) {
      throw new Error('Username input not found');
    }

    console.log('⌨️ Typing username slowly (human-like)...');
    await usernameInput.click();
    await sleep(randomDelay(500, 1000));

    for (const char of username) {
      await page.keyboard.type(char);
      await sleep(randomDelay(80, 150));
    }

    console.log('💭 Pausing before password...');
    await sleep(randomDelay(1000, 2000));

    // Type password
    const passwordInput = await page.$('#password');
    if (!passwordInput) {
      throw new Error('Password input not found');
    }

    console.log('🔒 Typing password slowly...');
    await passwordInput.click();
    await sleep(randomDelay(500, 1000));

    for (const char of password) {
      await page.keyboard.type(char);
      await sleep(randomDelay(80, 150));
    }

    await sleep(randomDelay(1000, 1500));

    // Click login button
    console.log('👀 About to click login button...');
    const loginButton = await page.$('button[type="submit"]');
    if (!loginButton) {
      throw new Error('Login button not found');
    }

    await loginButton.click();

    console.log('\n' + '='.repeat(60));
    console.log('⏳ WAITING FOR MANUAL VERIFICATION');
    console.log('='.repeat(60));
    console.log('👉 If LinkedIn asks for a verification code:');
    console.log('   1. Check your email/phone for the code');
    console.log('   2. Enter it in the browser window');
    console.log('   3. Click submit');
    console.log('⏰ You have 90 seconds');
    console.log('='.repeat(60) + '\n');

    // Wait for navigation with longer timeout
    try {
      await page.waitForNavigation({
        waitUntil: 'domcontentloaded',
        timeout: 90000  // Increased to 90 seconds
      });
    } catch (navError) {
      console.log('⚠️ Navigation timeout - checking if login succeeded...');
      await sleep(5000);
    }

    await sleep(randomDelay(3000, 5000));

    // Verify login
    const currentUrl = page.url();
    if (!currentUrl.includes('/feed') && !currentUrl.includes('/mynetwork') && !currentUrl.includes('/my-items/')) {
      console.log(`⚠️ Current URL: ${currentUrl}`);
      throw new Error('Login may have failed - not on expected page');
    }

    console.log('✅ Login successful!');

    // Save cookies to database
    if (saveCookiesToDB) {
      console.log('💾 Saving cookies to database...');
      const cookies = await page.cookies();
      await saveCookies(username, cookies);
      console.log('✅ Cookies saved successfully!');
    }

    return true;

  } catch (error) {
    console.error('❌ Login error:', error.message);
    return false;
  }
}
