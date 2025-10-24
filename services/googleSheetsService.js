import { google } from 'googleapis';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Clean author name (remove duplicates and extra metadata)
 */
function cleanAuthorName(name) {
  if (!name || name === 'Unknown') return 'Unknown';
  
  // Split by newlines and take first occurrence
  let cleaned = name.split('\n')[0];
  
  // Remove LinkedIn metadata like "• 2nd+", "• 3rd+", "Premium", etc.
  cleaned = cleaned.split('•')[0];
  
  // Remove extra spaces
  cleaned = cleaned.trim();
  
  // If name appears twice (e.g., "John DoeJohn Doe"), take first half
  const words = cleaned.split(' ');
  const halfLength = Math.floor(words.length / 2);
  
  if (words.length > 2 && words.length % 2 === 0) {
    const firstHalf = words.slice(0, halfLength).join(' ');
    const secondHalf = words.slice(halfLength).join(' ');
    
    // If both halves are identical, it's a duplicate
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
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    return sheets;
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
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Check if headers exist
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A1:I1',
    });

    if (!response.data.values || response.data.values.length === 0) {
      // Add headers (removed Date column since we have Timestamp)
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
        resource: {
          values: [headers],
        },
      });

      // Format header row (bold)
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: 0,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
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

      console.log('✅ Sheet initialized with headers');
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
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Get all timestamps (column A)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:A',
    });

    const values = response.data.values || [];
    
    // Skip header row and check if timestamp exists
    const timestamps = values.slice(1).flat();
    return timestamps.includes(timestamp);

  } catch (error) {
    console.error('⚠️ Error checking for duplicates:', error.message);
    return false;
  }
}

/**
 * Log activity to Google Sheets (with duplicate check and name cleaning)
 */
export async function logActivityToSheets(activity) {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEET_ID not set in .env file');
    }

    // Initialize sheet if needed
    await initializeSheet();

    // Check for duplicate
    const timestamp = activity.timestamp || new Date().toISOString();
    
    if (await activityExists(timestamp)) {
      console.log('⚠️ Activity already exists in sheet (skipping duplicate)');
      return false;
    }

    // Clean author name
    const cleanedAuthorName = cleanAuthorName(activity.authorName || 'Unknown');

    // Prepare row data (9 columns to match headers)
    const row = [
      timestamp,
      activity.action || '',
      activity.postUrl || '',
      cleanedAuthorName,  // Using cleaned name
      activity.postPreview || '',
      activity.commentText || '',
      activity.likeScore || '',
      activity.commentScore || '',
      activity.postType || activity.replyType || ''
    ];

    // Append row to sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:I',
      valueInputOption: 'RAW',
      resource: {
        values: [row],
      },
    });

    console.log(`📊 Activity logged to Google Sheets (${cleanedAuthorName})`);
    return true;

  } catch (error) {
    console.error('❌ Error logging to Google Sheets:', error.message);
    return false;
  }
}

/**
 * Get statistics from Google Sheets
 */
export async function getStatsFromSheets() {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:I',
    });

    const rows = response.data.values || [];
    
    if (rows.length <= 1) {
      return {
        total: 0,
        likes: 0,
        comments: 0,
        replies: 0
      };
    }

    const dataRows = rows.slice(1); // Skip header

    const stats = {
      total: dataRows.length,
      likes: dataRows.filter(row => row[1] === 'like').length,
      comments: dataRows.filter(row => row[1] === 'comment').length,
      replies: dataRows.filter(row => row[1]?.includes('reply')).length,
      lastActivity: dataRows[dataRows.length - 1]?.[0] || 'None'
    };

    return stats;

  } catch (error) {
    console.error('❌ Error getting stats from Sheets:', error.message);
    return { total: 0, likes: 0, comments: 0, replies: 0 };
  }
}

/**
 * Sync existing JSON log to Google Sheets (with duplicate detection)
 */
export async function syncJsonToSheets(jsonFilePath = './activity-log.json') {
  try {
    console.log('🔄 Syncing JSON log to Google Sheets...');

    if (!fs.existsSync(jsonFilePath)) {
      console.log('⚠️ No JSON log file found');
      return;
    }

    const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
    const activities = jsonData.activities || [];

    console.log(`📝 Found ${activities.length} activities in JSON`);

    await initializeSheet();

    let addedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < activities.length; i++) {
      const activity = activities[i];
      
      // Check if already exists
      const exists = await activityExists(activity.timestamp);
      
      if (exists) {
        skippedCount++;
      } else {
        await logActivityToSheets(activity);
        addedCount++;
      }
      
      if ((i + 1) % 10 === 0) {
        console.log(`   Processed ${i + 1}/${activities.length} (Added: ${addedCount}, Skipped: ${skippedCount})`);
      }
    }

    console.log('\n✅ Sync completed!');
    console.log(`   📊 Added: ${addedCount} new activities`);
    console.log(`   ⏭️  Skipped: ${skippedCount} duplicates`);
    console.log(`   🔗 View: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}`);

  } catch (error) {
    console.error('❌ Error syncing to Sheets:', error.message);
  }
}

/**
 * Clear all data from sheet (keep headers)
 */
export async function clearSheetData() {
  try {
    console.log('🗑️ Clearing sheet data...');
    
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Get current row count
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:I',
    });

    const rowCount = response.data.values?.length || 0;

    if (rowCount <= 1) {
      console.log('⚠️ Sheet is already empty (only headers)');
      return;
    }

    // Clear data rows (keep header)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `Sheet1!A2:I${rowCount}`,
    });

    console.log(`✅ Cleared ${rowCount - 1} rows of data`);
    console.log('   Headers preserved');

  } catch (error) {
    console.error('❌ Error clearing sheet:', error.message);
  }
}

/**
 * Test Google Sheets connection
 */
export async function testSheetsConnection() {
  try {
    console.log('\n🧪 Testing Google Sheets Connection...\n');
    
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const response = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    console.log('✅ Connected to Google Sheets!');
    console.log(`📊 Sheet Name: ${response.data.properties.title}`);
    console.log(`🔗 Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);

    // Test write with a duplicate name to verify cleaning
    await logActivityToSheets({
      timestamp: new Date().toISOString(),
      action: 'test',
      authorName: 'Test User',  // Intentional duplicate
      postPreview: 'This is a test entry'
    });

    console.log('✅ Test write successful!');
    return true;

  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    return false;
  }
}
