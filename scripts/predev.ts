import { existsSync, copyFileSync, readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const envPath = join(root, '.env');
const envExamplePath = join(root, '.env.example');

console.log('🚀 Running pre-development checks...');

// 1. Check .env file
if (!existsSync(envPath)) {
  if (existsSync(envExamplePath)) {
    console.log('⚠️ .env file not found. Copying from .env.example...');
    copyFileSync(envExamplePath, envPath);
    console.log('✅ Created .env from .env.example');
  } else {
    console.error('❌ Error: .env and .env.example files are missing!');
    process.exit(1);
  }
} else {
  console.log('✅ .env file found');
}

// 2. Validate essential environment variables
const envContent = readFileSync(envPath, 'utf-8');
const requiredVars = [
  'MAIN_VITE_SUPABASE_URL',
  'MAIN_VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY'
];

const missingVars = requiredVars.filter(v => !envContent.includes(v));

if (missingVars.length > 0) {
  console.warn(`⚠️ Warning: Missing environment variables in .env: ${missingVars.join(', ')}`);
  console.warn('Please make sure these are set for the application to work correctly.');
} else {
  console.log('✅ Essential environment variables are present');
}

console.log('✨ Pre-development checks completed successfully!\n');
