import dotenv from 'dotenv';
dotenv.config();

import { generateLinkedInPost, generateHashtags } from './services/aiService.js';

console.log('🚀 Starting post generator test...\n');

async function testPostGeneration() {
  try {
    console.log('🧪 Testing AI Post Generation\n');
    console.log('═'.repeat(60));
    
    const topic = "the importance of work-life balance in tech careers";
    
    console.log(`Topic: "${topic}"\n`);
    
    // Generate post
    console.log('🤖 Generating post with AI...\n');
    const post = await generateLinkedInPost(topic, {
      tone: 'professional',
      length: 'medium',
      includeQuestion: true,
      style: 'thought-leadership'
    });
    
    console.log('\n✅ Generated Post:');
    console.log('─'.repeat(60));
    console.log(post);
    console.log('─'.repeat(60));
    
    // Generate hashtags
    console.log('\n🏷️ Generating hashtags...\n');
    const hashtags = await generateHashtags(post, 5);
    
    console.log(`Hashtags: ${hashtags.join(' ')}`);
    console.log('\n═'.repeat(60));
    console.log('✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testPostGeneration();
