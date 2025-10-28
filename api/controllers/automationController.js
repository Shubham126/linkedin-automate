import jobManager from '../../utils/simpleJobManager.js';

export async function startFeedEngagement(req, res) {
  try {
    const { maxPosts = 15 } = req.body;
    
    const result = await jobManager.startJob('index.js', {
      MAX_POSTS: maxPosts.toString()
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

export async function startConnectionRequests(req, res) {
  try {
    const { keyword = 'vibe coding', maxRequests = 20 } = req.body;
    
    const result = await jobManager.startJob('sendConnectionRequests.js', {
      SEARCH_KEYWORD: keyword,
      MAX_CONNECTION_REQUESTS_PER_DAY: maxRequests.toString()
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

export async function startMonitorConnections(req, res) {
  try {
    const result = await jobManager.startJob('monitorConnections.js');
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

export async function startWelcomeMessages(req, res) {
  try {
    const result = await jobManager.startJob('sendWelcomeMessages.js');
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

export async function startSearchEngagement(req, res) {
  try {
    const { keyword = 'vibe coding', maxPosts = 10 } = req.body;
    
    const result = await jobManager.startJob('searchAndEngage.js', {
      SEARCH_KEYWORD: keyword,
      MAX_SEARCH_POSTS: maxPosts.toString()
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

export async function startProfileScraping(req, res) {
  try {
    const { keyword = 'vibe coding', maxProfiles = 20 } = req.body;
    
    const result = await jobManager.startJob('scrapeLinkedInPeople.js', {
      SEARCH_KEYWORD: keyword,
      MAX_PROFILES_TO_SCRAPE: maxProfiles.toString()
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

// Get current job status
export function getJobStatus(req, res) {
  try {
    const status = jobManager.getStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Cancel current job
export function stopJob(req, res) {
  try {
    const result = jobManager.cancelJob();
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}
