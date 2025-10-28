import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store running jobs
const runningJobs = new Map();

/**
 * Helper to run automation scripts
 */
function runAutomationScript(scriptName, params = {}) {
  return new Promise((resolve, reject) => {
    const jobId = `${scriptName}-${Date.now()}`;
    const scriptPath = path.join(__dirname, '../../', scriptName);
    
    console.log(`🚀 Starting job: ${jobId}`);
    console.log(`📄 Script: ${scriptPath}`);
    
    const child = spawn('node', [scriptPath], {
      env: { ...process.env, ...params },
      cwd: path.join(__dirname, '../../')
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log(`[${jobId}] ${chunk}`);
    });
    
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      console.error(`[${jobId}] ERROR: ${chunk}`);
    });
    
    child.on('close', (code) => {
      runningJobs.delete(jobId);
      
      if (code === 0) {
        console.log(`✅ Job completed: ${jobId}`);
        resolve({ jobId, output, status: 'completed' });
      } else {
        console.error(`❌ Job failed: ${jobId} (code ${code})`);
        reject({ jobId, error: errorOutput, code });
      }
    });
    
    runningJobs.set(jobId, {
      process: child,
      startTime: Date.now(),
      scriptName,
      status: 'running'
    });
    
    // Return jobId immediately for tracking
    resolve({ 
      jobId, 
      status: 'started',
      message: `Automation started: ${scriptName}`
    });
  });
}

export async function startFeedEngagement(req, res) {
  try {
    const { maxPosts = 15 } = req.body;
    
    const result = await runAutomationScript('index.js', {
      MAX_POSTS: maxPosts.toString()
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function startConnectionRequests(req, res) {
  try {
    const { keyword = 'vibe coding', maxRequests = 20 } = req.body;
    
    const result = await runAutomationScript('sendConnectionRequests.js', {
      SEARCH_KEYWORD: keyword,
      MAX_CONNECTION_REQUESTS_PER_DAY: maxRequests.toString()
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function startMonitorConnections(req, res) {
  try {
    const result = await runAutomationScript('monitorConnections.js');
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function startWelcomeMessages(req, res) {
  try {
    const result = await runAutomationScript('sendWelcomeMessages.js');
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function startSearchEngagement(req, res) {
  try {
    const { keyword = 'vibe coding', maxPosts = 10 } = req.body;
    
    const result = await runAutomationScript('searchAndEngage.js', {
      SEARCH_KEYWORD: keyword,
      MAX_SEARCH_POSTS: maxPosts.toString()
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function startProfileScraping(req, res) {
  try {
    const { keyword = 'vibe coding', maxProfiles = 20 } = req.body;
    
    const result = await runAutomationScript('scrapeLinkedInPeople.js', {
      SEARCH_KEYWORD: keyword,
      MAX_PROFILES_TO_SCRAPE: maxProfiles.toString()
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export function getJobStatus(req, res) {
  const { jobId } = req.params;
  
  const job = runningJobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({
      success: false,
      message: 'Job not found or already completed'
    });
  }
  
  res.json({
    success: true,
    jobId,
    status: job.status,
    scriptName: job.scriptName,
    startTime: job.startTime,
    runningFor: Date.now() - job.startTime
  });
}

export function stopJob(req, res) {
  const { jobId } = req.params;
  
  const job = runningJobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({
      success: false,
      message: 'Job not found'
    });
  }
  
  job.process.kill();
  runningJobs.delete(jobId);
  
  res.json({
    success: true,
    message: `Job ${jobId} stopped`
  });
}
