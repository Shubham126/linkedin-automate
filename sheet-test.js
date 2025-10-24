import dotenv from 'dotenv';
import fs from 'fs';
import readline from 'readline';

dotenv.config();

// Pre-flight checks
console.log('\n🔍 Pre-flight Checks\n');
console.log('═'.repeat(60));

if (!process.env.GOOGLE_SHEET_ID) {
  console.error('❌ GOOGLE_SHEET_ID not found in .env file');
  process.exit(1);
}

console.log('✅ .env file configured');

const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './google-credentials.json';

if (!fs.existsSync(credPath)) {
  console.error(`❌ Credentials file not found: ${credPath}`);
  process.exit(1);
}

console.log('✅ Credentials file found');
console.log('═'.repeat(60));

// Import services
import { testSheetsConnection, syncJsonToSheets, clearSheetData } from './services/googleSheetsService.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer));
  });
}

async function runTests() {
  console.log('\n🎯 Google Sheets Integration Test\n');
  console.log('═'.repeat(60));
  
  // Test connection
  const connected = await testSheetsConnection();
  
  if (connected) {
    console.log('\n📊 What would you like to do?\n');
    console.log('1. Sync JSON data to Sheets (skips duplicates)');
    console.log('2. Clear all sheet data and re-sync');
    console.log('3. Skip sync\n');
    
    const choice = await askQuestion('Enter choice (1/2/3): ');
    
    if (choice === '1') {
      await syncJsonToSheets();
    } else if (choice === '2') {
      const confirm = await askQuestion('⚠️  Clear ALL data? (yes/no): ');
      if (confirm.toLowerCase() === 'yes') {
        await clearSheetData();
        await syncJsonToSheets();
      } else {
        console.log('❌ Cancelled');
      }
    } else {
      console.log('⏭️  Skipping sync');
    }
  }
  
  console.log('\n═'.repeat(60));
  console.log('✅ Test complete!');
  rl.close();
}

runTests().catch(error => {
  console.error('\n💥 Fatal error:', error.message);
  rl.close();
});
