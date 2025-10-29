import LinkedInSession from '../models/LinkedInSession.js';

/**
 * Save cookies to database
 */
export async function saveCookies(email, cookies) {
  try {
    const cookiesString = JSON.stringify(cookies);
    
    await LinkedInSession.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        cookies: cookiesString,
        isValid: true,
        lastUsed: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Cookies saved for: ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error saving cookies:', error);
    return false;
  }
}

/**
 * Get cookies from database
 */
export async function getCookies(email) {
  try {
    const session = await LinkedInSession.findOne({ 
      email: email.toLowerCase() 
    });

    if (!session) {
      console.log(`❌ No session found for: ${email}`);
      return null;
    }

    if (session.isExpired()) {
      console.log(`❌ Session expired for: ${email}`);
      await session.updateOne({ isValid: false });
      return null;
    }

    // Update last used
    await session.updateOne({ lastUsed: new Date() });

    console.log(`✅ Cookies retrieved for: ${email}`);
    return JSON.parse(session.cookies);
  } catch (error) {
    console.error('❌ Error getting cookies:', error);
    return null;
  }
}

/**
 * Invalidate session
 */
export async function invalidateSession(email) {
  try {
    await LinkedInSession.updateOne(
      { email: email.toLowerCase() },
      { isValid: false }
    );
    console.log(`✅ Session invalidated for: ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error invalidating session:', error);
    return false;
  }
}

/**
 * Check if valid session exists
 */
export async function hasValidSession(email) {
  try {
    const session = await LinkedInSession.findOne({ 
      email: email.toLowerCase(),
      isValid: true
    });

    if (!session || session.isExpired()) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}
