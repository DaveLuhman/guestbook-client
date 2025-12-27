import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

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
  console.log("✅ Assets built successfully");
} catch (error) {
  console.error("❌ Failed to build assets:", error.message);
  process.exit(1);
}
