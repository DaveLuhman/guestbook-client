#!/usr/bin/env node
/**
 * Runs both TypeScript (Vitest) and Rust (cargo test) test suites,
 * then reports combined results.
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function runCommand(command, cwd = rootDir, description = '') {
  try {
    log(`\n${colors.cyan}▶ ${description || command}${colors.reset}`);
    const output = execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || error.stderr || error.message,
      error,
    };
  }
}

function parseVitestOutput(output) {
  // Vitest output format:
  // " Test Files  X passed (X)" or " Test Files  X passed | Y failed (Z)"
  // "      Tests  X passed (X)" or "      Tests  X passed | Y failed (Z)"
  const testFilesMatch = output.match(/Test Files\s+(\d+)\s+passed(?:\s+\((\d+)\))?(?:\s+\|\s+(\d+)\s+failed)?/);
  const testsMatch = output.match(/Tests\s+(\d+)\s+passed(?:\s+\((\d+)\))?(?:\s+\|\s+(\d+)\s+failed)?/);

  return {
    filesPassed: testFilesMatch ? parseInt(testFilesMatch[1], 10) : 0,
    filesFailed: testFilesMatch ? parseInt(testFilesMatch[3] || '0', 10) : 0,
    testsPassed: testsMatch ? parseInt(testsMatch[1], 10) : 0,
    testsFailed: testsMatch ? parseInt(testsMatch[3] || '0', 10) : 0,
  };
}

function parseCargoTestOutput(output) {
  // Look for test results: "test result: ok. X passed; Y failed"
  const resultMatches = output.match(/test result: ok\.\s+(\d+)\s+passed;\s+(\d+)\s+failed/g);
  let totalPassed = 0;
  let totalFailed = 0;

  if (resultMatches) {
    resultMatches.forEach((match) => {
      const parsed = match.match(/(\d+)\s+passed;\s+(\d+)\s+failed/);
      if (parsed) {
        totalPassed += parseInt(parsed[1], 10);
        totalFailed += parseInt(parsed[2], 10);
      }
    });
  }

  return {
    testsPassed: totalPassed,
    testsFailed: totalFailed,
  };
}

log(`${colors.bright}${colors.cyan}╔════════════════════════════════════════╗${colors.reset}`);
log(`${colors.bright}${colors.cyan}║   Running All Test Suites              ║${colors.reset}`);
log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════╝${colors.reset}`);

// Run TypeScript tests
const tsResult = runCommand('npm run test:unit', rootDir, 'TypeScript Tests (Vitest)');

// Run Rust tests
const rustResult = runCommand('cargo test', join(rootDir, 'src-tauri'), 'Rust Tests (Cargo)');

// Parse results
const tsStats = tsResult.success ? parseVitestOutput(tsResult.output) : null;
const rustStats = rustResult.success ? parseCargoTestOutput(rustResult.output) : null;

// Report results
log(`\n${colors.bright}${colors.cyan}╔════════════════════════════════════════╗${colors.reset}`);
log(`${colors.bright}${colors.cyan}║   Test Results Summary                 ║${colors.reset}`);
log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════╝${colors.reset}\n`);

// TypeScript results
if (tsResult.success && tsStats) {
  const tsColor = tsStats.filesFailed > 0 || tsStats.testsFailed > 0 ? colors.red : colors.green;
  log(`TypeScript (Vitest):`, colors.bright);
  log(
    `  Files: ${tsStats.filesPassed} passed${tsStats.filesFailed > 0 ? `, ${tsStats.filesFailed} failed` : ''}`,
    tsColor,
  );
  log(
    `  Tests: ${tsStats.testsPassed} passed${tsStats.testsFailed > 0 ? `, ${tsStats.testsFailed} failed` : ''}`,
    tsColor,
  );
} else {
  log(`TypeScript (Vitest): ${colors.red}FAILED${colors.reset}`, colors.red);
  if (tsResult.output) {
    log(`  Error: ${tsResult.output.split('\n').slice(-3).join('\n')}`, colors.red);
  }
}

log(''); // Spacer

// Rust results
if (rustResult.success && rustStats) {
  const rustColor = rustStats.testsFailed > 0 ? colors.red : colors.green;
  log(`Rust (Cargo):`, colors.bright);
  log(
    `  Tests: ${rustStats.testsPassed} passed${rustStats.testsFailed > 0 ? `, ${rustStats.testsFailed} failed` : ''}`,
    rustColor,
  );
} else {
  log(`Rust (Cargo): ${colors.red}FAILED${colors.reset}`, colors.red);
  if (rustResult.output) {
    // Show last few lines of error
    const errorLines = rustResult.output.split('\n').filter((l) => l.trim());
    const lastError = errorLines.slice(-5).join('\n');
    log(`  Error: ${lastError}`, colors.red);
  }
}

// Overall status
const allPassed =
  tsResult.success &&
  rustResult.success &&
  tsStats &&
  rustStats &&
  tsStats.filesFailed === 0 &&
  tsStats.testsFailed === 0 &&
  rustStats.testsFailed === 0;

log(`\n${colors.bright}${'─'.repeat(42)}${colors.reset}`);
if (allPassed) {
  log(`${colors.green}${colors.bright}✓ All tests passed!${colors.reset}\n`);
  process.exit(0);
} else {
  log(`${colors.red}${colors.bright}✗ Some tests failed${colors.reset}\n`);
  process.exit(1);
}
