import dotenv from 'dotenv';
dotenv.config();

import { isSimpleAcknowledgment, analyzeReply } from './services/replyAnalyzer.js';

console.log('\n🧪 Testing Reply Checker Components\n');
console.log('═'.repeat(60));

// Test data from your notification
const testReplies = [
  {
    author: 'Alexey Navolokin',
    text: "Glad to see your interest, Loila! This breakthrough truly feels like the future at our fingertips, doesn't it?",
    time: '2h'
  },
  {
    author: 'John Doe',
    text: 'Thank you!',
    time: '1h'
  },
  {
    author: 'Jane Smith',
    text: 'Thanks for sharing this!',
    time: '3h'
  },
  {
    author: 'Bob Wilson',
    text: 'What kind of experience are you looking for in candidates?',
    time: '4h'
  },
  {
    author: 'Alice Brown',
    text: 'Congratulations on the achievement!',
    time: '5h'
  }
];

async function runTests() {
  console.log('\n📝 Test 1: Simple Acknowledgment Detection\n');
  
  for (const reply of testReplies) {
    const isSimple = isSimpleAcknowledgment(reply.text);
    console.log(`Reply: "${reply.text}"`);
    console.log(`Result: ${isSimple ? '✅ SKIP (Simple acknowledgment)' : '❌ NEEDS ANALYSIS'}`);
    console.log('─'.repeat(60));
  }

  console.log('\n📝 Test 2: AI Analysis (for non-simple replies)\n');
  
  for (const reply of testReplies) {
    if (!isSimpleAcknowledgment(reply.text)) {
      console.log(`\nAnalyzing: "${reply.text}"`);
      
      const analysis = await analyzeReply({
        author: reply.author,
        text: reply.text,
        time: reply.time,
        parentComment: 'Test comment about AI technology'
      });
      
      console.log(`Action: ${analysis.action.toUpperCase()}`);
      console.log(`Type: ${analysis.replyType}`);
      console.log(`Is Question: ${analysis.isQuestion ? 'YES' : 'NO'}`);
      console.log(`Reasoning: ${analysis.reasoning}`);
      
      if (analysis.suggestedReply) {
        console.log(`Suggested Reply: "${analysis.suggestedReply}"`);
      }
      
      console.log('─'.repeat(60));
    }
  }

  console.log('\n✅ All tests completed!');
  console.log('═'.repeat(60));
}

runTests().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
