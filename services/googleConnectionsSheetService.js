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
 * Initialize Connections sheet with headers
 */
async function initializeConnectionsSheet() {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_CONNECTIONS_SHEET_ID;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A1:K1',
    });

    if (!response.data.values || response.data.values.length === 0) {
      const headers = [
        'Profile URL',
        'Name',
        'Headline',
        'Initial Connection',
        'Request Sent Date',
        'Status',
        'Acceptance Date',
        'Message Sent',
        'Message Date',
        'Message Content',
        'Notes'
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1:K1',
        valueInputOption: 'RAW',
        resource: { values: [headers] },
      });

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

      console.log('✅ Connections sheet initialized');
    }
  } catch (error) {
    console.error('❌ Error initializing sheet:', error.message);
    throw error;
  }
}

/**
 * Check if connection request already sent - EXPORTED
 */
export async function connectionRequestExists(profileUrl) {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_CONNECTIONS_SHEET_ID;

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
 * Log connection request with message content
 */
export async function logConnectionRequest(profileData, messageContent = '') {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_CONNECTIONS_SHEET_ID;

    if (!spreadsheetId) {
      throw new Error('GOOGLE_CONNECTIONS_SHEET_ID not set');
    }

    await initializeConnectionsSheet();

    if (await connectionRequestExists(profileData.profileUrl)) {
      console.log('⚠️ Connection request already logged');
      return false;
    }

    const row = [
      profileData.profileUrl || '',
      profileData.name || '',
      profileData.headline || '',
      profileData.connectionDegree || '',
      new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      'Pending',
      '',
      'No',
      '',
      messageContent || '',
      ''
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:K',
      valueInputOption: 'RAW',
      resource: { values: [row] },
    });

    console.log(`📊 Connection request logged: ${profileData.name}`);
    return true;
  } catch (error) {
    console.error('❌ Error logging connection:', error.message);
    return false;
  }
}

/**
 * Update connection status with message content
 */
export async function updateConnectionStatus(profileUrl, status, messageSent = false, messageContent = '') {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_CONNECTIONS_SHEET_ID;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:K',
    });

    const rows = response.data.values || [];
    let rowIndex = -1;

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === profileUrl) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      console.log('⚠️ Connection not found in sheet');
      return false;
    }

    const currentDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Sheet1!F${rowIndex}`,
      valueInputOption: 'RAW',
      resource: { values: [[status]] },
    });

    if (status === 'Accepted') {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Sheet1!G${rowIndex}`,
        valueInputOption: 'RAW',
        resource: { values: [[currentDate]] },
      });
    }

    if (messageSent) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Sheet1!H${rowIndex}:J${rowIndex}`,
        valueInputOption: 'RAW',
        resource: { values: [['Yes', currentDate, messageContent || '']] },
      });
    }

    console.log(`✅ Updated connection status: ${status}`);
    return true;
  } catch (error) {
    console.error('❌ Error updating status:', error.message);
    return false;
  }
}

/**
 * Get pending connections
 */
export async function getPendingConnections() {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_CONNECTIONS_SHEET_ID;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:K',
    });

    const rows = response.data.values || [];
    const pending = [];

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][5] === 'Pending') {
        pending.push({
          profileUrl: rows[i][0],
          name: rows[i][1],
          headline: rows[i][2],
          requestDate: rows[i][4]
        });
      }
    }

    return pending;
  } catch (error) {
    console.error('❌ Error getting pending connections:', error.message);
    return [];
  }
}

/**
 * Get accepted connections that haven't been messaged
 */
export async function getAcceptedUnmessaged() {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_CONNECTIONS_SHEET_ID;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:K',
    });

    const rows = response.data.values || [];
    const unmessaged = [];

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][5] === 'Accepted' && rows[i][7] !== 'Yes') {
        unmessaged.push({
          profileUrl: rows[i][0],
          name: rows[i][1],
          headline: rows[i][2],
          acceptanceDate: rows[i][6]
        });
      }
    }

    return unmessaged;
  } catch (error) {
    console.error('❌ Error getting unmessaged connections:', error.message);
    return [];
  }
}
