import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logActivityToSheets } from '../services/googleSheetsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.join(__dirname, '../activity-log.json');

/**
 * Initialize log file if it doesn't exist
 */
async function initLogFile() {
  try {
    await fs.access(LOG_FILE);
  } catch (error) {
    // File doesn't exist, create it
    await fs.writeFile(LOG_FILE, JSON.stringify({ activities: [] }, null, 2));
    console.log('📝 Created new activity log file');
  }
}

/**
 * Read existing log data
 */
async function readLog() {
  try {
    const data = await fs.readFile(LOG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return { activities: [] };
  }
}

/**
 * Log an activity (like or comment) to both JSON and Google Sheets
 * @param {Object} activity - Activity data
 */
export async function logActivity(activity) {
  try {
    await initLogFile();
    const log = await readLog();
    
    const activityEntry = {
      timestamp: new Date().toISOString(),
      // date: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      ...activity
    };
    
    // Log to JSON file (local backup)
    log.activities.push(activityEntry);
    await fs.writeFile(LOG_FILE, JSON.stringify(log, null, 2));
    console.log(`📝 Logged: ${activity.action} on post (JSON)`);
    
    // Log to Google Sheets (cloud storage)
    try {
      await logActivityToSheets(activityEntry);
    } catch (sheetsError) {
      console.log('⚠️ Google Sheets logging failed (continuing with JSON only)');
      console.log('   Error:', sheetsError.message);
    }
    
  } catch (error) {
    console.error('❌ Error logging activity:', error.message);
  }
}

/**
 * Get statistics from activity log
 */
export async function getActivityStats() {
  try {
    const log = await readLog();
    const activities = log.activities || [];
    
    const stats = {
      total: activities.length,
      likes: activities.filter(a => a.action === 'like').length,
      comments: activities.filter(a => a.action === 'comment').length,
      uniquePosts: new Set(activities.map(a => a.postUrl || a.postId)).size,
      lastActivity: activities.length > 0 ? activities[activities.length - 1].date : 'None'
    };
    
    return stats;
  } catch (error) {
    console.error('❌ Error getting stats:', error.message);
    return { total: 0, likes: 0, comments: 0, uniquePosts: 0, lastActivity: 'None' };
  }
}

/**
 * Check if we've already interacted with a post
 */
export async function hasInteractedWithPost(postUrl) {
  try {
    const log = await readLog();
    const activities = log.activities || [];
    return activities.some(a => a.postUrl === postUrl);
  } catch (error) {
    return false;
  }
}
