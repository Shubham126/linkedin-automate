import { google } from 'googleapis';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function getGoogleSheetsClient() {
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || './google-credentials.json';
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

/**
 * Initialize People Profiles sheet with headers
 */
async function initializePeopleSheet() {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_PEOPLE_SHEET_ID;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A1:G1',
    });

    if (!response.data.values || response.data.values.length === 0) {
      const headers = [
        'Profile URL',
        'Name',
        'Connection Degree',
        'Headline',
        'Location',
        'Followers',
        'About',
        'Scraped Date'
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1:H1',
        valueInputOption: 'RAW',
        resource: { values: [headers] },
      });

      // Format header
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
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
          }],
        },
      });

      console.log('✅ People sheet initialized');
    }
  } catch (error) {
    console.error('❌ Error initializing sheet:', error.message);
    throw error;
  }
}

/**
 * Check if profile already exists
 */
async function profileExists(profileUrl) {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_PEOPLE_SHEET_ID;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:A',
    });

    const urls = (response.data.values || []).slice(1).flat();
    return urls.includes(profileUrl);
  } catch (error) {
    return false;
  }
}

/**
 * Save profile data to sheet
 */
export async function saveProfileToSheet(profileData) {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_PEOPLE_SHEET_ID;

    if (!spreadsheetId) {
      throw new Error('GOOGLE_PEOPLE_SHEET_ID not set');
    }

    await initializePeopleSheet();

    // Check duplicate
    if (await profileExists(profileData.profileUrl)) {
      console.log('⚠️ Profile already exists (skipping duplicate)');
      return false;
    }

    const row = [
      profileData.profileUrl || '',
      profileData.name || '',
      profileData.connectionDegree || '',
      profileData.headline || '',
      profileData.location || '',
      profileData.followers || '',
      profileData.about || '',
      new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:H',
      valueInputOption: 'RAW',
      resource: { values: [row] },
    });

    console.log(`📊 Profile saved: ${profileData.name}`);
    return true;
  } catch (error) {
    console.error('❌ Error saving profile:', error.message);
    return false;
  }
}
