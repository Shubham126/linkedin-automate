import { openRouterConfig, validateConfig } from '../config/openrouter.js';

/**
 * Evaluate a post and determine if it's worth engaging with
 * @param {Object} postContent - Post content with text and hashtags
 * @returns {Promise<Object>} Evaluation results
 */
export async function evaluatePost(postContent) {
  try {
    validateConfig();

    const { text, hashtags } = postContent;

    if (!text || text.length < 20) {
      return {
        shouldLike: false,
        shouldComment: false,
        likeScore: 0,
        commentScore: 0,
        isJobPost: false,
        reasoning: 'Post too short'
      };
    }

    const prompt = `You are evaluating a LinkedIn post to decide engagement. Analyze this post carefully.

POST CONTENT:
${text}

HASHTAGS: ${hashtags.join(', ')}

Evaluate and respond in this EXACT JSON format:
{
  "likeScore": <0-10>,
  "commentScore": <0-10>,
  "isJobPost": <true/false>,
  "postType": "<job/thought-leadership/news/personal-story/promotional/other>",
  "reasoning": "<brief reason in 10 words max>"
}

SCORING CRITERIA:
likeScore (0-10):
- 8-10: Highly valuable, insightful, or relevant content
- 6-7: Good content, interesting but not exceptional
- 4-5: Average content, generic
- 0-3: Low quality, spam, or irrelevant

commentScore (0-10):
- 9-10: Excellent opportunity to add value (job posts, asking for help, discussion-worthy)
- 7-8: Good discussion potential
- 5-6: Could comment but not necessary
- 0-4: Not worth commenting

isJobPost: true if post is hiring/recruiting/job opportunity, false otherwise

Respond ONLY with the JSON, nothing else:`;

    console.log('🤖 AI is reading and evaluating post...');

    let lastError = null;
    
    for (const model of openRouterConfig.fallbackModels) {
      try {
        const response = await callOpenRouterAPI(prompt, model, 150);
        
        if (response && response.length > 10) {
          // Parse the JSON response
          const evaluation = parseEvaluationResponse(response);
          
          if (evaluation) {
            console.log(`✅ Post evaluated by ${model}`);
            console.log(`   📊 Like Score: ${evaluation.likeScore}/10`);
            console.log(`   💬 Comment Score: ${evaluation.commentScore}/10`);
            console.log(`   💼 Job Post: ${evaluation.isJobPost ? 'YES' : 'NO'}`);
            console.log(`   📝 Type: ${evaluation.postType}`);
            console.log(`   💭 Reasoning: ${evaluation.reasoning}`);
            
            return {
              shouldLike: evaluation.likeScore >= 6,
              shouldComment: evaluation.commentScore >= 9 || (evaluation.isJobPost && evaluation.commentScore >= 7),
              likeScore: evaluation.likeScore,
              commentScore: evaluation.commentScore,
              isJobPost: evaluation.isJobPost,
              postType: evaluation.postType,
              reasoning: evaluation.reasoning
            };
          }
        }
        
      } catch (error) {
        console.log(`⚠️ Model ${model} failed: ${error.message}`);
        lastError = error;
        
        if (error.message.includes('429') || error.message.includes('rate-limited')) {
          continue;
        }
        break;
      }
    }

    // Fallback evaluation if AI fails
    console.log('⚠️ AI evaluation failed, using heuristic evaluation');
    return heuristicEvaluation(text, hashtags);

  } catch (error) {
    console.error('❌ Post Evaluation Error:', error.message);
    return heuristicEvaluation(postContent.text, postContent.hashtags);
  }
}

/**
 * Parse AI evaluation response
 */
function parseEvaluationResponse(response) {
  try {
    // Extract JSON from response (might have extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate required fields
    if (typeof parsed.likeScore !== 'number' || 
        typeof parsed.commentScore !== 'number' ||
        typeof parsed.isJobPost !== 'boolean') {
      throw new Error('Invalid evaluation format');
    }
    
    return {
      likeScore: Math.max(0, Math.min(10, parsed.likeScore)),
      commentScore: Math.max(0, Math.min(10, parsed.commentScore)),
      isJobPost: parsed.isJobPost,
      postType: parsed.postType || 'other',
      reasoning: parsed.reasoning || 'AI evaluation'
    };
    
  } catch (error) {
    console.error('⚠️ Failed to parse AI evaluation:', error.message);
    return null;
  }
}

/**
 * Heuristic evaluation as fallback
 */
function heuristicEvaluation(text, hashtags) {
  const lowerText = text.toLowerCase();
  
  // Check for job post indicators
  const jobKeywords = ['hiring', 'job opening', 'we\'re hiring', 'join our team', 
                       'position', 'vacancy', 'career', 'opportunity', 'apply now',
                       'looking for', 'seeking', 'recruitment', 'job opportunity'];
  const isJobPost = jobKeywords.some(keyword => lowerText.includes(keyword));
  
  // Check for engagement indicators
  const engagementKeywords = ['what do you think', 'your thoughts', 'comment below', 
                              'share your', 'let me know', 'interested'];
  const hasEngagementPrompt = engagementKeywords.some(keyword => lowerText.includes(keyword));
  
  // Scoring logic
  let likeScore = 5; // Default average
  let commentScore = 4;
  
  if (isJobPost) {
    likeScore = 7;
    commentScore = 9;
  } else if (hasEngagementPrompt) {
    likeScore = 6;
    commentScore = 7;
  }
  
  // Adjust based on length (longer = more effort = higher score)
  if (text.length > 500) likeScore += 1;
  if (text.length > 1000) likeScore += 1;
  
  // Quality indicators
  if (text.includes('insights') || text.includes('lessons') || text.includes('experience')) {
    likeScore += 1;
  }
  
  // Cap scores
  likeScore = Math.min(10, likeScore);
  commentScore = Math.min(10, commentScore);
  
  return {
    shouldLike: likeScore >= 6,
    shouldComment: commentScore >= 9 || (isJobPost && commentScore >= 7),
    likeScore,
    commentScore,
    isJobPost,
    postType: isJobPost ? 'job' : 'other',
    reasoning: 'Heuristic evaluation'
  };
}

/**
 * Generate a contextual comment for a job post or general post
 */
export async function generateComment(postContent, evaluation) {
  try {
    validateConfig();

    const { text, hashtags } = postContent;
    const { isJobPost, postType } = evaluation;

    if (!text || text.length < 10) {
      return getFallbackComment(isJobPost);
    }

    // Different prompts for job posts vs regular posts
    let prompt;
    
    if (isJobPost) {
      prompt = `You are a professional job seeker commenting on a LinkedIn job posting. Be genuine and interested.

JOB POST:
${text}

Write a SHORT professional comment (15-25 words) that:
1. Shows genuine interest in the position
2. Briefly mentions relevant experience or enthusiasm
3. Sounds natural and human (not robotic)
4. Does NOT use hashtags or excessive emojis
5. Professional but conversational tone

Examples of good comments:
- "This role aligns perfectly with my QA background. I'd love to learn more about the team and projects."
- "Great opportunity! I have experience with similar testing frameworks and would be interested to discuss."
- "The remote flexibility is perfect for my situation. I'm interested in learning more about this position."

Write ONLY your comment, nothing else:`;
    } else {
      prompt = `You are a professional on LinkedIn commenting thoughtfully on a post.

POST:
${text}

Write a SHORT, thoughtful comment (15-25 words) that:
1. Shows you read and understood the post
2. Adds value or genuine perspective
3. Sounds like a real person (not AI)
4. NO hashtags, minimal emojis
5. Professional but conversational

Write ONLY your comment, nothing else:`;
    }

    console.log(`🤖 Generating ${isJobPost ? 'job interest' : 'thoughtful'} comment...`);

    for (const model of openRouterConfig.fallbackModels) {
      try {
        const comment = await callOpenRouterAPI(prompt, model, 100);
        
        if (comment && comment.length >= 10 && comment.length <= 300) {
          let cleanComment = comment
            .replace(/^["']|["']$/g, '')
            .replace(/^Comment:\s*/i, '')
            .replace(/^\s*-\s*/, '')
            .trim();
          
          console.log(`✅ Generated comment: "${cleanComment}"`);
          return cleanComment;
        }
        
      } catch (error) {
        if (error.message.includes('429') || error.message.includes('rate-limited')) {
          continue;
        }
        break;
      }
    }

    return getFallbackComment(isJobPost);

  } catch (error) {
    console.error('❌ Comment Generation Error:', error.message);
    return getFallbackComment(evaluation?.isJobPost);
  }
}

/**
 * Call OpenRouter API
 */
async function callOpenRouterAPI(prompt, model, maxTokens = 100) {
  const requestBody = {
    model: model,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.8,
    max_tokens: maxTokens,
    top_p: 0.9
  };

  const response = await fetch(openRouterConfig.baseUrl, {
    method: 'POST',
    headers: openRouterConfig.headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch (e) {
      errorData = { message: errorText };
    }
    
    if (response.status === 429) {
      throw new Error(`Rate limited: ${errorData.error?.message || errorText}`);
    }
    throw new Error(`API error (${response.status})`);
  }

  const data = await response.json();
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Invalid response format');
  }

  return data.choices[0].message.content.trim();
}

/**
 * Get fallback comment based on post type
 */
function getFallbackComment(isJobPost = false) {
  if (isJobPost) {
    const jobComments = [
      "Interested in learning more about this opportunity!",
      "This sounds like a great role. I'd love to know more details.",
      "Interested! Would appreciate more information about this position.",
      "This aligns well with my skills. Looking forward to learning more.",
      "Great opportunity! I'm interested in discussing this role further.",
      "Interested in this position. Please share more details.",
      "This looks like an excellent opportunity. I'd like to learn more."
    ];
    const comment = jobComments[Math.floor(Math.random() * jobComments.length)];
    console.log(`🔄 Using job fallback: "${comment}"`);
    return comment;
  } else {
    const generalComments = [
      "This is really insightful, thanks for sharing!",
      "Great perspective on this topic.",
      "Very informative post, appreciate it!",
      "This resonates with my experience. Well said!",
      "Interesting insights here, thanks!",
      "Really valuable information, thank you!",
      "Great points raised here!",
      "Thanks for sharing your thoughts on this!"
    ];
    const comment = generalComments[Math.floor(Math.random() * generalComments.length)];
    console.log(`🔄 Using fallback: "${comment}"`);
    return comment;
  }
}

/**
 * Test evaluation service
 */
export async function testEvaluationService() {
  console.log('\n🧪 Testing Post Evaluation Service...\n');
  
  const testPosts = [
    {
      text: "We're hiring a Software Engineer for remote work. Great opportunity to join our team and work on exciting projects!",
      hashtags: ['#hiring', '#softwareengineer', '#remotework']
    },
    {
      text: "Just finished an amazing project! Here are 5 lessons I learned about leadership and team collaboration...",
      hashtags: ['#leadership', '#teamwork']
    }
  ];
  
  for (let i = 0; i < testPosts.length; i++) {
    console.log(`\n📝 Test Post ${i + 1}:`);
    console.log(`"${testPosts[i].text.substring(0, 80)}..."\n`);
    
    const evaluation = await evaluatePost(testPosts[i]);
    
    console.log('Results:');
    console.log(`  Should Like: ${evaluation.shouldLike}`);
    console.log(`  Should Comment: ${evaluation.shouldComment}`);
    console.log(`  Is Job Post: ${evaluation.isJobPost}`);
    console.log('-'.repeat(60));
  }
}
