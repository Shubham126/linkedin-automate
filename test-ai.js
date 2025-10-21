import dotenv from 'dotenv';
dotenv.config();

import { testEvaluationService } from './services/aiService.js';

console.log('🎯 Testing AI Post Evaluation Service\n');
console.log('='.repeat(60));

testEvaluationService().then(() => {
  console.log('\n✅ Test complete!');
  process.exit(0);
});
