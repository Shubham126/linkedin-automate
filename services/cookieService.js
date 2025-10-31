import LinkedInSession from '../models/LinkedInSession.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fallback to file-based storage if MongoDB fails
const COOKIES_DIR = path.join(__dirname, '../.cookies');

// Ensure cookies directory exists
if (!fs.existsSync(COOKIES_DIR)) {
  fs.mkdirSync(COOKIES_DIR, { recursive: true });
}

/**
 * Save cookies (tries MongoDB first, falls back to file)
 */
export async function saveCookies(email, cookies) {
  try {
    const cookiesString = JSON.stringify(cookies);
    
    // Try MongoDB first
    try {
      await LinkedInSession.findOneAndUpdate(
        { email: email.toLowerCase() },
        {
          cookies: cookiesString,
          isValid: true,
          lastUsed: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        },
        { upsert: true, new: true, timeout: 5000 }
      );

      console.log(`✅ Cookies saved to MongoDB for: ${email}`);
      return true;
    } catch (mongoError) {
      console.log(`⚠️ MongoDB unavailable, saving to file instead`);
      
      // Fallback to file storage
      const filePath = path.join(COOKIES_DIR, `${email}.json`);
      const sessionData = {
        email: email.toLowerCase(),
        cookies: cookiesString,
        isValid: true,
        lastUsed: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };
      
      fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
      console.log(`✅ Cookies saved to file for: ${email}`);
      return true;
    }
  } catch (error) {
    console.error('❌ Error saving cookies:', error.message);
    return false;
  }
}

/**
 * Get cookies (tries MongoDB first, falls back to file)
 */
export async function getCookies(email) {
  try {
    // Try MongoDB first
    try {
      const session = await LinkedInSession.findOne({ 
        email: email.toLowerCase() 
      }).maxTimeMS(5000);

      if (session && !session.isExpired()) {
        await session.updateOne({ lastUsed: new Date() });
        console.log(`✅ Cookies retrieved from MongoDB for: ${email}`);
        return JSON.parse(session.cookies);
      }
    } catch (mongoError) {
      console.log(`⚠️ MongoDB unavailable, checking file storage`);
      
      // Fallback to file storage
      const filePath = path.join(COOKIES_DIR, `${email}.json`);
      
      if (fs.existsSync(filePath)) {
        const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        // Check if expired
        const expiresAt = new Date(sessionData.expiresAt);
        if (new Date() > expiresAt || !sessionData.isValid) {
          console.log(`❌ File session expired for: ${email}`);
          fs.unlinkSync(filePath);
          return null;
        }

        // Update last used
        sessionData.lastUsed = new Date().toISOString();
        fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));

        console.log(`✅ Cookies retrieved from file for: ${email}`);
        return JSON.parse(sessionData.cookies);
      }
    }

    console.log(`❌ No session found for: ${email}`);
    return null;
  } catch (error) {
    console.error('❌ Error getting cookies:', error.message);
    return null;
  }
}

/**
 * Invalidate session
 */
export async function invalidateSession(email) {
  try {
    // Try MongoDB
    try {
      await LinkedInSession.updateOne(
        { email: email.toLowerCase() },
        { isValid: false }
      ).maxTimeMS(5000);
      console.log(`✅ Session invalidated in MongoDB for: ${email}`);
    } catch (mongoError) {
      // Try file
      const filePath = path.join(COOKIES_DIR, `${email}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`✅ Session file deleted for: ${email}`);
      }
    }
    
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
    // Try MongoDB
    try {
      const session = await LinkedInSession.findOne({ 
        email: email.toLowerCase(),
        isValid: true
      }).maxTimeMS(5000);

      return session && !session.isExpired();
    } catch (mongoError) {
      // Try file
      const filePath = path.join(COOKIES_DIR, `${email}.json`);
      if (fs.existsSync(filePath)) {
        const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const expiresAt = new Date(sessionData.expiresAt);
        return new Date() <= expiresAt && sessionData.isValid;
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}
