console.log('TEST: Script is running!');

import dotenv from 'dotenv';
console.log('TEST: dotenv imported');

dotenv.config();
console.log('TEST: dotenv configured');

import { linkedInLogin } from './actions/login.js';
console.log('TEST: login imported');

import { goToNotifications } from './actions/checkNotifications.js';
console.log('TEST: checkNotifications imported');

import { analyzeReply } from './services/replyAnalyzer.js';
console.log('TEST: replyAnalyzer imported');

console.log('✅ All imports successful!');
