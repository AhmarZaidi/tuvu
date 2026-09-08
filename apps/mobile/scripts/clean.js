#!/usr/bin/env node
'use strict';

/**
 * Clean temporary build caches, smoke exports, runtime records, and coverage reports.
 */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

const targets = [
  '.expo-export-smoke',
  '.tuvu-runtime',
  'coverage',
  '.expo',
  'dist',
  'web-build',
];

console.log('Cleaning temporary artifacts and runtime directories...\n');

let removedCount = 0;

for (const target of targets) {
  const fullPath = path.join(projectRoot, target);
  if (fs.existsSync(fullPath)) {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`  ✓ Removed ${target}/`);
      removedCount++;
    } catch (err) {
      console.warn(`  ⚠️ Could not remove ${target}:`, err.message);
    }
  }
}

if (removedCount === 0) {
  console.log('  Everything is already clean.');
} else {
  console.log(`\nCleaned ${removedCount} temporary directories.`);
}
