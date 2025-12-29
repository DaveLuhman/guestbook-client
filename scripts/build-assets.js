import { execSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";

// Ensure dist directory exists
const distDir = "dist";
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Run esbuild - output to both dist/ and public/ for dev/prod compatibility
try {
  execSync(
    "npx esbuild src/firstRun.ts --bundle --format=esm --outfile=dist/firstRun.js",
    { stdio: "inherit" },
  );
  
  // Also copy to public/ for dev server
  if (existsSync("dist/firstRun.js")) {
    copyFileSync("dist/firstRun.js", "public/firstRun.js");
    console.log("✅ Copied dist/firstRun.js to public/firstRun.js for dev server");
  }

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
