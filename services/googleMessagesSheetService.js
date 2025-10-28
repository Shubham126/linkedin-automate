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
 * Initialize Messages sheet with headers
 */
async function initializeMessagesSheet() {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_MESSAGES_SHEET_ID;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A1:L1',
    });

    if (!response.data.values || response.data.values.length === 0) {
      const headers = [
        'Message ID',
        'Profile URL',
        'Recipient Name',
        'Message Type',
        'Message Content',
        'Sent Date',
        'Sent Time',
        'Status',
        'Reply Received',
        'Reply Date',
        'Reply Content',
        'Notes'
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1:L1',
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

      console.log('✅ Messages sheet initialized');
    }
  } catch (error) {
    console.error('❌ Error initializing messages sheet:', error.message);
    throw error;
  }
}

/**
 * Log message to Google Sheets
 */
export async function logMessageToSheet(messageData) {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_MESSAGES_SHEET_ID;

    if (!spreadsheetId) {
      throw new Error('GOOGLE_MESSAGES_SHEET_ID not set');
    }

    await initializeMessagesSheet();

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const timeStr = now.toLocaleTimeString('en-IN', { 
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const row = [
      messageData.messageId || `MSG${Date.now()}`,
      messageData.profileUrl || '',
      messageData.recipientName || '',
      messageData.messageType || 'Direct Message',
      messageData.messageContent || '',
      dateStr,
      timeStr,
      messageData.status || 'Sent',
      messageData.replyReceived ? 'Yes' : 'No',
      messageData.replyDate || '',
      messageData.replyContent || '',
      messageData.notes || ''
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:L',
      valueInputOption: 'RAW',
      resource: { values: [row] },
    });

    console.log(`📧 Message logged to sheet: ${messageData.recipientName}`);
    return true;
  } catch (error) {
    console.error('❌ Error logging message:', error.message);
    return false;
  }
}

export default {
  logMessageToSheet
};
