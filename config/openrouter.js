import dotenv from 'dotenv';
dotenv.config();

export const openRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY,
  baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  // Using Meta Llama which has better free tier availability
  model: 'meta-llama/llama-3.2-3b-instruct:free',
  fallbackModels: [
    'meta-llama/llama-3.2-3b-instruct:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'google/gemini-2.0-flash-exp:free',
    'nousresearch/hermes-3-llama-3.1-405b:free'
  ],
  headers: {
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'HTTP-Referer': 'https://github.com/your-repo',
    'X-Title': 'LinkedIn AI Automation Bot',
    'Content-Type': 'application/json'
  }
};

export function validateConfig() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('❌ OPENROUTER_API_KEY is not set in .env file');
  }
  
  if (process.env.OPENROUTER_API_KEY.includes(' ')) {
    throw new Error('❌ OPENROUTER_API_KEY contains spaces - please remove them');
  }
  
  return true;
}
