import express from 'express';
import { 
  getUserLogs, 
  getConnectionStats, 
  exportLogsToCSV,
  getLogsAsCSV,
  deleteOldLogs,
  clearUserLogs
} from '../../services/mongoConnectionService.js';
import { promises as fs } from 'fs';
import path from 'path';

const router = express.Router();

/**
 * Get logs for user
 */
router.get('/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { action } = req.query;

    const logs = await getUserLogs(username, action);

    res.json({
      success: true,
      count: logs.length,
      data: logs
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get logs filtered by action
 */
router.get('/user/:username/action/:action', async (req, res) => {
  try {
    const { username, action } = req.params;

    const logs = await getUserLogs(username, action);

    res.json({
      success: true,
      count: logs.length,
      action,
      data: logs
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get stats for user
 */
router.get('/stats/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const stats = await getConnectionStats(username);

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
});

/**
 * Get dashboard
 */
router.get('/dashboard/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const stats = await getConnectionStats(username);
    const logs = await getUserLogs(username);

    res.json({
      success: true,
      data: {
        stats,
        totalLogs: logs.length,
        recentActivity: logs.slice(0, 10),
        timestamp: new Date()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Export to CSV file
 */
router.get('/export/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    const exportsDir = path.join(process.cwd(), 'exports');
    await fs.mkdir(exportsDir, { recursive: true });

    const csvPath = await exportLogsToCSV(username, `${exportsDir}/${username}_logs.csv`);

    if (!csvPath) {
      return res.status(404).json({
        success: false,
        error: 'No logs found to export'
      });
    }

    res.json({
      success: true,
      message: 'CSV exported successfully',
      filename: `${username}_logs.csv`,
      path: csvPath,
      downloadUrl: `/exports/${username}_logs.csv`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Download CSV as response
 */
router.get('/download/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const csv = await getLogsAsCSV(username);

    if (!csv) {
      return res.status(404).json({
        success: false,
        error: 'No logs found'
      });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${username}_logs.csv"`);
    res.send(csv);

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Delete old logs
 */
router.post('/delete-old/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { days = 30 } = req.body;

    const result = await deleteOldLogs(username, days);

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} logs older than ${days} days`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Clear all logs for user
 */
router.delete('/user/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const result = await clearUserLogs(username);

    res.json({
      success: true,
      message: `Cleared all logs for ${username}`,
      clearedCount: result.deletedCount
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
