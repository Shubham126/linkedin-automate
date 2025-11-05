// ==================== FILE: services/mongoConnectionService.js ====================
import Activity from '../models/Activity.js';

/**
 * Get user logs with optional action filter
 */
export async function getUserLogs(username, action = null) {
  try {
    const query = { linkedinUsername: username };
    
    if (action) {
      query.action = action;
    }

    const logs = await Activity.find(query)
      .sort({ timestamp: -1 })
      .lean();

    return logs;
  } catch (error) {
    console.error('Error fetching user logs:', error.message);
    throw error;
  }
}

/**
 * Get connection statistics for a user
 */
export async function getConnectionStats(username) {
  try {
    const activities = await Activity.find({ linkedinUsername: username });

    const stats = {
      total: activities.length,
      likes: activities.filter(a => a.action === 'like').length,
      comments: activities.filter(a => a.action === 'comment').length,
      uniquePostCount: new Set(activities.map(a => a.postUrl)).size,
      averageLikeScore: 0,
      averageCommentScore: 0,
      jobPosts: activities.filter(a => a.isJobPost).length,
      status: 'logged'
    };

    // Calculate average scores
    const likes = activities.filter(a => a.likeScore);
    if (likes.length > 0) {
      stats.averageLikeScore = (likes.reduce((sum, a) => sum + a.likeScore, 0) / likes.length).toFixed(2);
    }

    const comments = activities.filter(a => a.commentScore);
    if (comments.length > 0) {
      stats.averageCommentScore = (comments.reduce((sum, a) => sum + a.commentScore, 0) / comments.length).toFixed(2);
    }

    return stats;
  } catch (error) {
    console.error('Error getting connection stats:', error.message);
    throw error;
  }
}

/**
 * Export logs to CSV file
 */
export async function exportLogsToCSV(username, filePath) {
  try {
    const logs = await getUserLogs(username);

    if (logs.length === 0) {
      console.log('No logs found to export');
      return null;
    }

    const csv = generateCsvContent(logs);
    const fs = await import('fs').then(m => m.promises);
    await fs.writeFile(filePath, csv, 'utf8');

    console.log(`✅ CSV exported to: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error('Error exporting to CSV:', error.message);
    throw error;
  }
}

/**
 * Get logs as CSV string (for direct download)
 */
export async function getLogsAsCSV(username) {
  try {
    const logs = await getUserLogs(username);

    if (logs.length === 0) {
      return null;
    }

    return generateCsvContent(logs);
  } catch (error) {
    console.error('Error generating CSV:', error.message);
    throw error;
  }
}

/**
 * Generate CSV content from logs
 */
function generateCsvContent(logs) {
  const headers = [
    'Timestamp',
    'Action',
    'Author Name',
    'Post URL',
    'Post Preview',
    'Comment Text',
    'Like Score',
    'Comment Score',
    'Post Type',
    'Is Job Post',
    'LinkedIn Username',
    'Status'
  ];

  const rows = logs.map(log => [
    log.timestamp ? new Date(log.timestamp).toISOString() : '',
    log.action || '',
    `"${(log.authorName || '').replace(/"/g, '""')}"`,
    log.postUrl || '',
    `"${(log.postPreview || '').replace(/"/g, '""')}"`,
    `"${(log.commentText || '').replace(/"/g, '""')}"`,
    log.likeScore || '',
    log.commentScore || '',
    log.postType || '',
    log.isJobPost ? 'Yes' : 'No',
    log.linkedinUsername || '',
    log.status || 'logged'
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  return csvContent;
}

/**
 * Delete old logs (older than X days)
 */
export async function deleteOldLogs(username, days = 30) {
  try {
    const date = new Date();
    date.setDate(date.getDate() - days);

    const result = await Activity.deleteMany({
      linkedinUsername: username,
      timestamp: { $lt: date }
    });

    console.log(`✅ Deleted ${result.deletedCount} logs older than ${days} days`);
    return result;
  } catch (error) {
    console.error('Error deleting old logs:', error.message);
    throw error;
  }
}

/**
 * Clear all logs for a user
 */
export async function clearUserLogs(username) {
  try {
    const result = await Activity.deleteMany({
      linkedinUsername: username
    });

    console.log(`✅ Cleared ${result.deletedCount} logs for ${username}`);
    return result;
  } catch (error) {
    console.error('Error clearing user logs:', error.message);
    throw error;
  }
}

/**
 * Log connection activity
 */
export async function logConnectionToMongo(data) {
  try {
    const {
      action,
      profileUrl,
      name,
      message,
      linkedinUsername,
      status = 'success'
    } = data;

    const activity = new Activity({
      timestamp: new Date(),
      action,
      authorName: name,
      postUrl: profileUrl,
      postPreview: message,
      linkedinUsername,
      status
    });

    await activity.save();
    console.log(`✅ Logged to MongoDB: ${action}`);
    return activity;
  } catch (error) {
    console.error('Error logging to MongoDB:', error.message);
    throw error;
  }
}

/**
 * Get activity breakdown by date
 */
export async function getActivityByDate(username) {
  try {
    const activities = await Activity.aggregate([
      { $match: { linkedinUsername: username } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
          },
          count: { $sum: 1 },
          likes: { $sum: { $cond: [{ $eq: ['$action', 'like'] }, 1, 0] } },
          comments: { $sum: { $cond: [{ $eq: ['$action', 'comment'] }, 1, 0] } }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    return activities;
  } catch (error) {
    console.error('Error getting activity by date:', error.message);
    throw error;
  }
}

/**
 * Get top authors engaged with
 */
export async function getTopAuthors(username, limit = 10) {
  try {
    const topAuthors = await Activity.aggregate([
      { $match: { linkedinUsername: username } },
      {
        $group: {
          _id: '$authorName',
          count: { $sum: 1 },
          likes: { $sum: { $cond: [{ $eq: ['$action', 'like'] }, 1, 0] } },
          comments: { $sum: { $cond: [{ $eq: ['$action', 'comment'] }, 1, 0] } }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);

    return topAuthors;
  } catch (error) {
    console.error('Error getting top authors:', error.message);
    throw error;
  }
}

/**
 * Get engagement trends
 */
export async function getEngagementTrends(username, days = 30) {
  try {
    const date = new Date();
    date.setDate(date.getDate() - days);

    const trends = await Activity.aggregate([
      {
        $match: {
          linkedinUsername: username,
          timestamp: { $gte: date }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
          },
          avgLikeScore: {
            $avg: {
              $cond: [{ $eq: ['$action', 'like'] }, '$likeScore', null]
            }
          },
          avgCommentScore: {
            $avg: {
              $cond: [{ $eq: ['$action', 'comment'] }, '$commentScore', null]
            }
          },
          total: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return trends;
  } catch (error) {
    console.error('Error getting engagement trends:', error.message);
    throw error;
  }
}
