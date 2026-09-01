import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'dist-server');

console.log('\n========================================');
console.log('  📦 Packaging Tuvu Backend Server Bundle');
console.log('========================================\n');

if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// 1. Copy backend code
console.log('Copying src/...');
copyRecursive(path.join(projectRoot, 'src'), path.join(outDir, 'src'));

console.log('Copying migrations/...');
copyRecursive(path.join(projectRoot, 'migrations'), path.join(outDir, 'migrations'));

console.log('Copying scripts/...');
copyRecursive(path.join(projectRoot, 'scripts'), path.join(outDir, 'scripts'));

// 2. Copy config files
console.log('Copying configuration files...');
if (fs.existsSync(path.join(projectRoot, 'wrangler.jsonc'))) {
  fs.copyFileSync(path.join(projectRoot, 'wrangler.jsonc'), path.join(outDir, 'wrangler.jsonc'));
}
if (fs.existsSync(path.join(projectRoot, '.dev.vars'))) {
  fs.copyFileSync(path.join(projectRoot, '.dev.vars'), path.join(outDir, '.dev.vars'));
}
if (fs.existsSync(path.join(projectRoot, '.dev.providers.local'))) {
  fs.copyFileSync(path.join(projectRoot, '.dev.providers.local'), path.join(outDir, '.dev.providers.local'));
}

// 3. Copy D1 SQLite Database State (Full existing database!)
console.log('Copying local D1 SQLite database state...');
copyRecursive(path.join(projectRoot, '.wrangler'), path.join(outDir, '.wrangler'));

// 4. Create optimized package.json for backend
const rootPkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const serverPkg = {
  name: 'tuvu-server',
  version: rootPkg.version || '1.0.0',
  private: true,
  type: 'module',
  scripts: {
    start: 'node scripts/dev-worker.mjs --lan',
    server: 'node scripts/dev-worker.mjs --lan',
  },
  dependencies: rootPkg.dependencies || {},
  devDependencies: {
    wrangler: rootPkg.devDependencies?.wrangler || '^4.24.4',
  },
};
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(serverPkg, null, 2) + '\n', 'utf8');

// 5. Create quick start script for Termux / Linux
const startSh = `#!/bin/bash
# Tuvu Server Launcher for Termux & Android
echo "========================================"
echo "  🚀 Starting Tuvu Backend on Android"
echo "========================================"
npm install --no-audit --prefer-offline
npm run server
`;
fs.writeFileSync(path.join(outDir, 'start.sh'), startSh, { encoding: 'utf8', mode: 0o755 });

console.log('\n========================================');
console.log('  ✅ SERVER BUNDLE CREATED SUCCESSFULLY!');
console.log('========================================');
console.log(`  Location: ${outDir}`);
console.log('  Includes:');
console.log('    ✓ Full SQLite D1 Database State (all history & library)');
console.log('    ✓ TMDB Anti-Censorship Proxy');
console.log('    ✓ Wrangler LAN Worker (port 8787 on 0.0.0.0)');
console.log('========================================\n');
