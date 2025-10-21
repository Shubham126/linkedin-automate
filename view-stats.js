import { getActivityStats } from './utils/activityLogger.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.join(__dirname, 'activity-log.json');

async function viewStats() {
  console.log('\n📊 LinkedIn Automation Activity Statistics\n');
  console.log('='.repeat(60));
  
  const stats = await getActivityStats();
  
  console.log(`Total Activities: ${stats.total}`);
  console.log(`Total Likes: ${stats.likes}`);
  console.log(`Total Comments: ${stats.comments}`);
  console.log(`Unique Posts Interacted: ${stats.uniquePosts}`);
  console.log(`Last Activity: ${stats.lastActivity}`);
  console.log('='.repeat(60));
  
  // Show recent activities
  try {
    const data = await fs.readFile(LOG_FILE, 'utf-8');
    const log = JSON.parse(data);
    const recent = log.activities.slice(-5).reverse();
    
    console.log('\n📝 Last 5 Activities:\n');
    recent.forEach((activity, index) => {
      console.log(`${index + 1}. ${activity.action.toUpperCase()} - ${activity.date}`);
      console.log(`   Author: ${activity.authorName}`);
      if (activity.commentText) {
        console.log(`   Comment: "${activity.commentText}"`);
      }
      console.log('');
    });
    
  } catch (error) {
    console.log('\n⚠️ No activities logged yet');
  }
}

viewStats();
