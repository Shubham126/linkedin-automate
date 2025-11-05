// ==================== FILE: backend/services/csvService.js ====================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import UserCSV from '../models/UserCSV.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_BASE_DIR = path.join(__dirname, '../data/csv');

class CSVService {
  // Get or create user directory
  getUserCSVDirectory(userEmail) {
    const sanitizedEmail = userEmail.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const userDir = path.join(CSV_BASE_DIR, `user_${sanitizedEmail}`);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
      console.log(`✅ Created CSV directory: ${userDir}`);
    }
    
    return userDir;
  }

  // Get or create CSV file with headers
  getOrCreateCSVFile(userEmail, fileType) {
    const userDir = this.getUserCSVDirectory(userEmail);
    const filePath = path.join(userDir, `${fileType}.csv`);
    
    const headers = {
      engagement_likes: 'timestamp,post_author,post_preview,like_score,is_job_post,post_url\n',
      engagement_comments: 'timestamp,post_author,post_preview,comment_text,comment_score,is_job_post,post_url\n',
      connections_sent: 'timestamp,recipient_name,recipient_profile_url,message,status\n',
      messages_sent: 'timestamp,recipient_name,recipient_profile_url,message_text,status\n',
      posts_created: 'timestamp,post_text,hashtags,likes_count,comments_count,shares_count\n'
    };
    
    // Create file with headers if doesn't exist
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, headers[fileType] || '');
      console.log(`✅ Created CSV file: ${filePath}`);
    }
    
    return filePath;
  }

  // Append like activity
  async appendLikeActivity(userEmail, activityData) {
    try {
      const filePath = this.getOrCreateCSVFile(userEmail, 'engagement_likes');
      
      const row = `${activityData.timestamp || new Date().toISOString()},${this.escapeCSV(activityData.authorName)},${this.escapeCSV(activityData.postPreview)},${activityData.likeScore || 0},${activityData.isJobPost || false},${this.escapeCSV(activityData.postUrl)}\n`;
      
      fs.appendFileSync(filePath, row);
      
      // Update MongoDB
      await this.updateUserCSVPath(userEmail, 'engagement_likes', filePath);
      
      console.log(`✅ Appended like to CSV: ${filePath}`);
      return { success: true, filePath };
    } catch (error) {
      console.error(`❌ Error appending like: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Append comment activity
  async appendCommentActivity(userEmail, activityData) {
    try {
      const filePath = this.getOrCreateCSVFile(userEmail, 'engagement_comments');
      
      const row = `${activityData.timestamp || new Date().toISOString()},${this.escapeCSV(activityData.authorName)},${this.escapeCSV(activityData.postPreview)},${this.escapeCSV(activityData.commentText)},${activityData.commentScore || 0},${activityData.isJobPost || false},${this.escapeCSV(activityData.postUrl)}\n`;
      
      fs.appendFileSync(filePath, row);
      
      // Update MongoDB
      await this.updateUserCSVPath(userEmail, 'engagement_comments', filePath);
      
      console.log(`✅ Appended comment to CSV: ${filePath}`);
      return { success: true, filePath };
    } catch (error) {
      console.error(`❌ Error appending comment: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Append connection sent
  async appendConnectionSent(userEmail, activityData) {
    try {
      const filePath = this.getOrCreateCSVFile(userEmail, 'connections_sent');
      
      const row = `${activityData.timestamp || new Date().toISOString()},${this.escapeCSV(activityData.recipientName)},${this.escapeCSV(activityData.recipientProfileUrl)},${this.escapeCSV(activityData.message)},${activityData.status || 'sent'}\n`;
      
      fs.appendFileSync(filePath, row);
      
      // Update MongoDB
      await this.updateUserCSVPath(userEmail, 'connections_sent', filePath);
      
      console.log(`✅ Appended connection to CSV: ${filePath}`);
      return { success: true, filePath };
    } catch (error) {
      console.error(`❌ Error appending connection: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Append message sent
  async appendMessageSent(userEmail, activityData) {
    try {
      const filePath = this.getOrCreateCSVFile(userEmail, 'messages_sent');
      
      const row = `${activityData.timestamp || new Date().toISOString()},${this.escapeCSV(activityData.recipientName)},${this.escapeCSV(activityData.recipientProfileUrl)},${this.escapeCSV(activityData.messageText)},${activityData.status || 'sent'}\n`;
      
      fs.appendFileSync(filePath, row);
      
      // Update MongoDB
      await this.updateUserCSVPath(userEmail, 'messages_sent', filePath);
      
      console.log(`✅ Appended message to CSV: ${filePath}`);
      return { success: true, filePath };
    } catch (error) {
      console.error(`❌ Error appending message: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Append post created
  async appendPostCreated(userEmail, activityData) {
    try {
      const filePath = this.getOrCreateCSVFile(userEmail, 'posts_created');
      
      const row = `${activityData.timestamp || new Date().toISOString()},${this.escapeCSV(activityData.postText)},${this.escapeCSV(activityData.hashtags.join(' ') || '')},${activityData.likesCount || 0},${activityData.commentsCount || 0},${activityData.sharesCount || 0}\n`;
      
      fs.appendFileSync(filePath, row);
      
      // Update MongoDB
      await this.updateUserCSVPath(userEmail, 'posts_created', filePath);
      
      console.log(`✅ Appended post to CSV: ${filePath}`);
      return { success: true, filePath };
    } catch (error) {
      console.error(`❌ Error appending post: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Read CSV file and return as array
  async readCSVFile(userEmail, fileType) {
    try {
      const filePath = this.getOrCreateCSVFile(userEmail, fileType);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      
      if (lines.length <= 1) return [];
      
      const headers = lines[0].split(',');
      const data = lines.slice(1).map(line => {
        const values = this.parseCSVLine(line);
        const obj = {};
        headers.forEach((header, index) => {
          obj[header.trim()] = values[index]?.trim() || '';
        });
        return obj;
      });
      
      return data;
    } catch (error) {
      console.error(`❌ Error reading CSV: ${error.message}`);
      return [];
    }
  }

  // Parse CSV line handling quoted values
  parseCSVLine(line) {
    const result = [];
    let current = '';
    let insideQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current);
    return result;
  }

  // Escape CSV special characters
  escapeCSV(value) {
    if (!value) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  // Update MongoDB with CSV path
  async updateUserCSVPath(userEmail, fileType, filePath) {
    try {
      await UserCSV.findOneAndUpdate(
        { user_email: userEmail },
        {
          $set: {
            [`csv_paths.${fileType}`]: filePath,
            updated_at: new Date()
          },
          $inc: {
            [`summary_stats.total_${fileType}`]: 1
          }
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error(`❌ Error updating MongoDB: ${error.message}`);
    }
  }

  // Get all user CSV paths
  async getUserCSVPaths(userEmail) {
    try {
      const userCSV = await UserCSV.findOne({ user_email: userEmail });
      return userCSV || null;
    } catch (error) {
      console.error(`❌ Error getting CSV paths: ${error.message}`);
      return null;
    }
  }

  // Get summary stats
  async getUserStats(userEmail) {
    try {
      const userCSV = await UserCSV.findOne({ user_email: userEmail });
      return userCSV?.summary_stats || {
        total_engagement_likes: 0,
        total_engagement_comments: 0,
        total_connections_sent: 0,
        total_messages_sent: 0,
        total_posts_created: 0
      };
    } catch (error) {
      console.error(`❌ Error getting stats: ${error.message}`);
      return {};
    }
  }
}

export default new CSVService();
