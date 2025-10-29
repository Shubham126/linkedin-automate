import dotenv from 'dotenv';
dotenv.config();

export const sheetUrls = {
  activity: {
    id: process.env.GOOGLE_ACTIVITY_SHEET_ID,
    url: `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_ACTIVITY_SHEET_ID}/edit`,  // ← Added /edit
    name: 'Activity Log',
    description: 'Likes and comments on posts'
  },
  profiles: {
    id: process.env.GOOGLE_PROFILES_SHEET_ID,
    url: `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_PROFILES_SHEET_ID}/edit`,  // ← Added /edit
    name: 'Scraped Profiles',
    description: 'LinkedIn profiles scraped'
  },
  connections: {
    id: process.env.GOOGLE_CONNECTIONS_SHEET_ID,
    url: `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_CONNECTIONS_SHEET_ID}/edit`,  // ← Added /edit
    name: 'Connections Tracking',
    description: 'Connection requests and status'
  },
  messages: {
    id: process.env.GOOGLE_MESSAGES_SHEET_ID,
    url: `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_MESSAGES_SHEET_ID}/edit`,  // ← Added /edit
    name: 'Messages Log',
    description: 'All messages sent on LinkedIn'
  },
  feedPosts: {
    id: process.env.GOOGLE_FEED_POSTS_SHEET_ID,
    url: `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_FEED_POSTS_SHEET_ID}/edit`,  // ← Added /edit
    name: 'Feed Posts',
    description: 'Posts from LinkedIn feed'
  },
  analytics: {
    id: process.env.GOOGLE_ANALYTICS_SHEET_ID,
    url: `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_ANALYTICS_SHEET_ID}/edit`,  // ← Added /edit
    name: 'Analytics Dashboard',
    description: 'Overall statistics and metrics'
  }
};

export function getAllSheetUrls() {
  return sheetUrls;
}
