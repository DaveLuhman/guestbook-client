import { mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname } from 'path';

// Ensure dist directory exists
const distDir = 'dist';
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Run esbuild
try {
  execSync('npx esbuild src/firstRun.ts --bundle --format=esm --outfile=dist/firstRun.js', { stdio: 'inherit' });
  console.log('✅ Assets built successfully');
} catch (error) {
  console.error('❌ Failed to build assets:', error.message);
  process.exit(1);
}
