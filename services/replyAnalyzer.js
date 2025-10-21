import { openRouterConfig, validateConfig } from '../config/openrouter.js';

/**
 * Check if reply is just "thank you" or "congratulations"
 */
export function isSimpleAcknowledgment(text) {
  const lowerText = text.toLowerCase().trim();
  
  // If it has a question mark, it's definitely NOT a simple acknowledgment
  if (lowerText.includes('?')) {
    return false;
  }
  
  const simplePatterns = [
    'thank you',
    'thanks',
    'thank u',
    'ty',
    'thx',
    'congratulations',
    'congrats',
    'congratulation',
    'well done',
    '👍',
    '🙏',
    '👏',
    '🎉'
  ];
  
  // Must be short AND match exactly
  if (text.length < 40) {
    const words = lowerText.split(/\s+/);
    // If it's 1-3 words and matches a pattern, it's simple
    if (words.length <= 3) {
      for (const pattern of simplePatterns) {
        if (lowerText.includes(pattern)) {
          return true;
        }
      }
    }
  }
  
  return false;
}

/**
 * Improved heuristic reply analysis with better question detection
 */
function heuristicReplyAnalysis(text) {
  const lowerText = text.toLowerCase();
  
  // PRIORITY 1: Check for questions FIRST
  const hasQuestionMark = text.includes('?');
  const questionWords = ['what', 'when', 'where', 'why', 'how', 'which', 'who', 'can you', 'could you', 'would you', 'do you', 'does', 'is it', 'are you', 'will you'];
  const hasQuestionWord = questionWords.some(qw => lowerText.includes(qw));
  
  if (hasQuestionMark || hasQuestionWord) {
    return {
      shouldLike: true,
      shouldReply: true,
      action: 'like-and-reply',
      replyType: 'question',
      isQuestion: true,
      reasoning: 'Question detected - needs answer',
      suggestedReply: "Great question! I'd be happy to provide more details. For this opportunity, we're looking for candidates with hands-on experience and a strong willingness to learn. Feel free to reach out!"
    };
  }
  
  // PRIORITY 2: Check for simple acknowledgments
  const thankYouPatterns = ['thank', 'thanks', 'appreciated', '👍', '🙏'];
  const isShortThankYou = text.length < 40 && thankYouPatterns.some(pattern => lowerText.includes(pattern));
  
  if (isShortThankYou) {
    return {
      shouldLike: true,
      shouldReply: false,
      action: 'like-only',
      replyType: 'thank-you',
      isQuestion: false,
      reasoning: 'Simple thank you',
      suggestedReply: null
    };
  }
  
  // PRIORITY 3: Longer messages - might need discussion
  if (text.length > 50) {
    return {
      shouldLike: true,
      shouldReply: true,
      action: 'like-and-reply',
      replyType: 'discussion',
      isQuestion: false,
      reasoning: 'Meaningful discussion point',
      suggestedReply: "I appreciate your thoughts on this! You've raised a great point that's worth exploring further."
    };
  }
  
  // Default: just like
  return {
    shouldLike: true,
    shouldReply: false,
    action: 'like-only',
    replyType: 'acknowledgment',
    isQuestion: false,
    reasoning: 'General acknowledgment',
    suggestedReply: null
  };
}

/**
 * Analyze a reply - ALWAYS use heuristic for free models
 */
export async function analyzeReply(replyData) {
  try {
    const { text } = replyData;

    if (!text || text.length < 3) {
      return {
        shouldLike: false,
        shouldReply: false,
        action: 'skip',
        reasoning: 'Reply too short'
      };
    }

    // Check simple acknowledgment first
    if (isSimpleAcknowledgment(text)) {
      return {
        shouldLike: true,
        shouldReply: false,
        action: 'like-only',
        replyType: 'acknowledgment',
        isQuestion: false,
        reasoning: 'Simple thank you/congratulations',
        suggestedReply: null
      };
    }

    console.log('🤖 Analyzing reply with heuristic logic...');
    
    // ALWAYS use heuristic for reliability
    const analysis = heuristicReplyAnalysis(text);
    
    console.log(`✅ Analysis complete`);
    console.log(`   🎯 Action: ${analysis.action}`);
    console.log(`   📝 Type: ${analysis.replyType}`);
    console.log(`   ❓ Is Question: ${analysis.isQuestion ? 'YES' : 'NO'}`);
    console.log(`   💭 Reasoning: ${analysis.reasoning}`);
    
    return analysis;

  } catch (error) {
    console.error('❌ Analysis Error:', error.message);
    return heuristicReplyAnalysis(replyData.text);
  }
}
