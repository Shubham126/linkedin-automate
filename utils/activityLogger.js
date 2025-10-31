import { google } from 'googleapis';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Clean author name (remove duplicates and extra metadata)
 */
function cleanAuthorName(name) {
  if (!name || name === 'Unknown') return 'Unknown';
  
  let cleaned = name.split('\n')[0];
  cleaned = cleaned.split('•')[0];
  cleaned = cleaned.trim();
  
  const words = cleaned.split(' ');
  const halfLength = Math.floor(words.length / 2);
  
  if (words.length > 2 && words.length % 2 === 0) {
    const firstHalf = words.slice(0, halfLength).join(' ');
    const secondHalf = words.slice(halfLength).join(' ');
    
    if (firstHalf === secondHalf) {
      cleaned = firstHalf;
    }
  }
  
  return cleaned;
}

/**
 * Initialize Google Sheets API
 */
async function getGoogleSheetsClient() {
  try {
    const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || './google-credentials.json';
    
    if (!fs.existsSync(credentialsPath)) {
      throw new Error('Google credentials file not found: ' + credentialsPath);
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const authClient = await auth.getClient();
    return google.sheets({ version: 'v4', auth: authClient });
  } catch (error) {
    console.error('❌ Error initializing Google Sheets:', error.message);
    throw error;
  }
}

/**
 * Initialize the sheet with headers if empty
 */
async function initializeSheet() {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_ACTIVITY_SHEET_ID; // ← FIX: Use correct ID

    if (!spreadsheetId) {
      throw new Error('GOOGLE_ACTIVITY_SHEET_ID not set in .env file');
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A1:I1',
    });

    if (!response.data.values || response.data.values.length === 0) {
      const headers = [
        'Timestamp',
        'Action',
        'Post URL',
        'Author Name',
        'Post Preview',
        'Comment Text',
        'Like Score',
        'Comment Score',
        'Post Type'
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1:I1',
        valueInputOption: 'RAW',
        resource: { values: [headers] },
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [
            {
              repeatCell: {
                range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.2, green: 0.6, blue: 0.86 },
                    textFormat: {
                      foregroundColor: { red: 1, green: 1, blue: 1 },
                      bold: true,
                    },
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)',
              },
            },
          ],
        },
      });

      console.log('✅ Activity sheet initialized');
    }
  } catch (error) {
    console.error('❌ Error initializing sheet:', error.message);
    throw error;
  }
}

/**
 * Check if activity already exists in sheet (by timestamp)
 */
async function activityExists(timestamp) {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_ACTIVITY_SHEET_ID; // ← FIX

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:A',
    });

    const values = response.data.values || [];
    const timestamps = values.slice(1).flat();
    return timestamps.includes(timestamp);
  } catch (error) {
    console.error('⚠️ Error checking for duplicates:', error.message);
    return false;
  }
}

/**
 * Log activity to Google Sheets
 */
export async function logActivity(activity) {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_ACTIVITY_SHEET_ID; // ← FIX

    if (!spreadsheetId) {
      throw new Error('GOOGLE_ACTIVITY_SHEET_ID not set in .env file');
    }

    await initializeSheet();

    const timestamp = activity.timestamp || new Date().toISOString();
    
    if (await activityExists(timestamp)) {
      console.log('⚠️ Activity already exists in sheet');
      return false;
    }

    const cleanedAuthorName = cleanAuthorName(activity.authorName || 'Unknown');

    const row = [
      timestamp,
      activity.action || '',
      activity.postUrl || '',
      cleanedAuthorName,
      activity.postPreview || '',
      activity.commentText || '',
      activity.likeScore || '',
      activity.commentScore || '',
      activity.postType || ''
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:I',
      valueInputOption: 'RAW',
      resource: { values: [row] },
    });

    console.log(`📊 Activity logged to Google Sheets`);
    return true;
  } catch (error) {
    console.error('❌ Error logging to Google Sheets:', error.message);
    return false;
  }
}

/**
 * Get activity statistics
 */
export async function getActivityStats() {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_ACTIVITY_SHEET_ID; // ← FIX

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:I',
    });

    const rows = response.data.values || [];
    
    if (rows.length <= 1) {
      return { total: 0, likes: 0, comments: 0, uniquePosts: 0 };
    }

    const dataRows = rows.slice(1);

    const stats = {
      total: dataRows.length,
      likes: dataRows.filter(row => row[1] === 'like').length,
      comments: dataRows.filter(row => row[1] === 'comment').length,
      uniquePosts: new Set(dataRows.map(row => row[2])).size
    };

    return stats;
  } catch (error) {
    console.error('❌ Error getting stats:', error.message);
    return { total: 0, likes: 0, comments: 0, uniquePosts: 0 };
  }
}

/**
 * Check if already interacted with post
 */
export async function hasInteractedWithPost(postUrl) {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_ACTIVITY_SHEET_ID; // ← FIX

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!C:C', // Column C is Post URL
    });

    const urls = (response.data.values || []).slice(1).flat();
    return urls.includes(postUrl);
  } catch (error) {
    return false;
  }
}
