import { getActivityStats as getStats } from '../../utils/activityLogger.js';
import { 
  getPendingConnections as getPending,
  getAcceptedUnmessaged 
} from '../../services/googleConnectionsSheetService.js';
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

export async function getActivityStats(req, res) {
  try {
    const stats = await getStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getConnectionStats(req, res) {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_CONNECTIONS_SHEET_ID;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:K',
    });

    const rows = response.data.values || [];
    const data = rows.slice(1); // Skip header

    const stats = {
      total: data.length,
      pending: data.filter(row => row[5] === 'Pending').length,
      accepted: data.filter(row => row[5] === 'Accepted').length,
      directMessaged: data.filter(row => row[5] === 'Direct Messaged').length,
      messaged: data.filter(row => row[7] === 'Yes').length
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getEngagementStats(req, res) {
  try {
    const stats = await getStats();
    
    const engagementRate = stats.total > 0 
      ? ((stats.likes + stats.comments) / stats.total * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        ...stats,
        engagementRate: `${engagementRate}%`,
        avgLikesPerPost: (stats.likes / stats.total).toFixed(2),
        avgCommentsPerPost: (stats.comments / stats.total).toFixed(2)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getRecentActivity(req, res) {
  try {
    const { limit = 10 } = req.query;
    
    const activityLog = JSON.parse(
      fs.readFileSync('./activity-log.json', 'utf-8')
    );

    const recent = activityLog.activities
      .slice(-limit)
      .reverse();

    res.json({
      success: true,
      data: recent
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getPendingConnections(req, res) {
  try {
    const pending = await getPending();
    
    res.json({
      success: true,
      data: pending
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getAcceptedConnections(req, res) {
  try {
    const accepted = await getAcceptedUnmessaged();
    
    res.json({
      success: true,
      data: accepted
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getConnectionHistory(req, res) {
  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_CONNECTIONS_SHEET_ID;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:K',
    });

    const rows = response.data.values || [];
    const headers = rows[0];
    const data = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || '';
      });
      return obj;
    });

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
