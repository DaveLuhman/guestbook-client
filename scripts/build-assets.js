import { execSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";

// Ensure dist directory exists
const distDir = "dist";
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Run esbuild
try {
  execSync(
    "npx esbuild src/firstRun.ts --bundle --format=esm --outfile=dist/firstRun.js",
    { stdio: "inherit" },
  );
  
  // Copy required files from public/ to dist/
  const filesToCopy = [
    { src: "public/firstRun.html", dest: "dist/firstRun.html" },
    { src: "public/styles.css", dest: "dist/styles.css" },
  ];
  
  for (const file of filesToCopy) {
    if (existsSync(file.src)) {
      copyFileSync(file.src, file.dest);
      console.log(`✅ Copied ${file.src} to ${file.dest}`);
    } else {
      console.warn(`⚠️  Warning: ${file.src} not found, skipping copy`);
    }
  }
  
  console.log("✅ Assets built successfully");
} catch (error) {
  console.error("❌ Failed to build assets:", error.message);
  process.exit(1);
}
