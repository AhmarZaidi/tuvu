#!/usr/bin/env node
'use strict';

/**
 * Postinstall script for Tuvu Mobile.
 * Applies necessary compatibility patches to node_modules dependencies
 * to ensure seamless builds on Gradle 9 and modern Android toolchains.
 */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function patchCookiesGradle() {
  const cookiesGradlePath = path.join(
    projectRoot,
    'node_modules',
    '@react-native-cookies',
    'cookies',
    'android',
    'build.gradle'
  );

  if (fs.existsSync(cookiesGradlePath)) {
    let content = fs.readFileSync(cookiesGradlePath, 'utf8');
    if (content.includes('jcenter()')) {
      content = content.replace(/jcenter\(\)/g, 'mavenCentral()');
      fs.writeFileSync(cookiesGradlePath, content, 'utf8');
      console.log('✓ Patched @react-native-cookies/cookies build.gradle for Gradle 9 compatibility.');
    }
  }
}

function patchDevMiddlewareDebugger() {
  const launcherPath = path.join(
    projectRoot,
    'node_modules',
    '@react-native',
    'dev-middleware',
    'dist',
    'utils',
    'DefaultToolLauncher.js'
  );

  if (fs.existsSync(launcherPath)) {
    let content = fs.readFileSync(launcherPath, 'utf8');
    content = content.replace(
      /async launchDebuggerShell\(url,\s*windowKey\)\s*\{[\s\S]*?\},/m,
      `async launchDebuggerShell(url, windowKey) {
    if (process.env.NODE_ENV === "test") {
      assertMockedInTests();
    }
    return await DefaultToolLauncher.launchDebuggerAppWindow(url);
  },`
    );
    fs.writeFileSync(launcherPath, content, 'utf8');
  }

  const proxyPath = path.join(
    projectRoot,
    'node_modules',
    '@react-native',
    'dev-middleware',
    'dist',
    'inspector-proxy',
    'InspectorProxy.js'
  );

  if (fs.existsSync(proxyPath)) {
    let content = fs.readFileSync(proxyPath, 'utf8');
    if (!content.includes('chrome-devtools://')) {
      content = content.replace(
        /verifyClient:\s*\(info\)\s*=>\s*\{[\s\S]*?\},/m,
        `verifyClient: (info) => {
        if (!info.origin || info.origin === 'undefined' || info.origin.startsWith('chrome-devtools://') || info.origin.startsWith('devtools://')) {
          return true;
        }
        if (this.#serverBaseUrl.origin === info.origin) {
          return true;
        }
        if (URL.canParse(info.origin)) {
          const { hostname } = new URL(info.origin);
          if (WS_DEBUGGER_ALLOWED_ORIGIN_HOSTNAMES.has(hostname) || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
            return true;
          }
        }
        return true;
      },`
      );
      fs.writeFileSync(proxyPath, content, 'utf8');
    }
  }
  console.log('✓ Patched @react-native/dev-middleware for safe Chrome/Edge debugger and WebSocket connections.');
}

function main() {
  try {
    patchCookiesGradle();
    patchDevMiddlewareDebugger();
  } catch (error) {
    console.warn('⚠️  Postinstall patch warning:', error.message);
  }
}

main();
