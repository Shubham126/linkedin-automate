
import Activity from '../models/Activity.js';

/**
 * Log activity to MongoDB
 */
export async function logActivity(data) {
  try {
    const {
      action,
      postUrl,
      authorName,
      postPreview = '',
      commentText = '',
      likeScore = 0,
      commentScore = 0,
      postType = 'unknown',
      isJobPost = false
    } = data;

    const username = process.env.LINKEDIN_USERNAME || 'unknown';

    console.log('💾 Saving to MongoDB:', {
      action,
      authorName,
      postUrl,
      username
    });

    // Create new activity document
    const activity = new Activity({
      timestamp: new Date(),
      action,
      authorName,
      postUrl,
      postPreview,
      commentText: action === 'comment' ? commentText : null,
      likeScore: action === 'like' ? likeScore : null,
      commentScore: action === 'comment' ? commentScore : null,
      postType,
      isJobPost,
      linkedinUsername: username,
      status: 'logged'
    });

    // Save to MongoDB
    const savedActivity = await activity.save();
    console.log(`✅ Saved to MongoDB with ID: ${savedActivity._id}`);
    
    return savedActivity;

  } catch (error) {
    console.error(`❌ Error logging activity to MongoDB:`, error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code
    });
    
    // Don't throw - let the bot continue even if logging fails
    return null;
  }
}

/**
 * Get activity statistics
 */
export async function getActivityStats() {
  try {
    const username = process.env.LINKEDIN_USERNAME || 'unknown';
    
    const activities = await Activity.find({ linkedinUsername: username });

    const stats = {
      total: activities.length,
      likes: activities.filter(a => a.action === 'like').length,
      comments: activities.filter(a => a.action === 'comment').length,
      uniquePostCount: new Set(activities.map(a => a.postUrl)).size,
      averageLikeScore: 0,
      averageCommentScore: 0,
      jobPosts: activities.filter(a => a.isJobPost).length
    };

    const likes = activities.filter(a => a.likeScore);
    if (likes.length > 0) {
      stats.averageLikeScore = (likes.reduce((sum, a) => sum + a.likeScore, 0) / likes.length).toFixed(2);
    }

    const comments = activities.filter(a => a.commentScore);
    if (comments.length > 0) {
      stats.averageCommentScore = (comments.reduce((sum, a) => sum + a.commentScore, 0) / comments.length).toFixed(2);
    }

    console.log('📊 Activity Stats:', stats);
    return stats;
  } catch (error) {
    console.error('Error getting activity stats:', error.message);
    return {
      total: 0,
      likes: 0,
      comments: 0,
      uniquePostCount: 0,
      averageLikeScore: 0,
      averageCommentScore: 0,
      jobPosts: 0
    };
  }
}

/**
 * Check if already interacted with post
 */
export async function hasInteractedWithPost(postUrl) {
  try {
    const username = process.env.LINKEDIN_USERNAME || 'unknown';
    
    const activity = await Activity.findOne({ 
      postUrl,
      linkedinUsername: username
    });
    
    if (activity) {
      console.log(`✓ Already interacted with ${postUrl}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error checking interaction:', error.message);
    return false;
  }
}
