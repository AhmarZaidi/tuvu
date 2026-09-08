#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  RUNTIME_OWNER,
  RUNTIME_SCHEMA_VERSION,
  createExpoStartArguments,
  createSupervisorPlan,
  observeChildExit,
  readRuntimeRecord,
  removeRuntimeRecordIfOwned,
  selectPhoneReachableAddress,
  stopOwnedChild,
  waitForChildOrShutdown,
  writeRuntimeRecord,
} = require('./lib/expo-supervisor');

const projectRoot = path.resolve(__dirname, '..');
const runtimeDir = path.join(projectRoot, '.tuvu-runtime');
const args = process.argv.slice(2);
const isDevClient = args.includes('--dev-client');
const mode = isDevClient ? 'dev-client' : 'go';
const runtimeFileName = `expo-supervisor-${mode}.json`;
const runtimePath = path.join(runtimeDir, runtimeFileName);

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '0.0.0.0');
  });
}

function isPortServing(port, timeoutMs = 1_500) {
  return new Promise((resolve) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/status', timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.once('error', () => resolve(false));
    request.once('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readOwnedHealth(runtime, timeoutMs = 1_500) {
  return new Promise((resolve) => {
    const request = http.get(
      { hostname: '127.0.0.1', port: runtime.controlPort, path: '/__supervisor__/health', timeout: timeoutMs },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          resolve(null);
          return;
        }
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { raw += chunk; });
        response.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve(null);
          }
        });
      }
    );
    request.once('error', () => resolve(null));
    request.once('timeout', () => {
      request.destroy();
      resolve(null);
    });
  });
}

function startControlServer(state) {
  const server = http.createServer((request, response) => {
    if (request.url === '/__supervisor__/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        owner: RUNTIME_OWNER,
        schemaVersion: RUNTIME_SCHEMA_VERSION,
        runId: state.runId,
        projectRoot,
        supervisorPid: process.pid,
        metroPid: state.metroPid,
        port: state.port,
        mode,
      }));
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not found');
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

async function main() {
  const preferredPort = Number(process.env.TUVU_METRO_PORT || 8081);
  const runtime = await readRuntimeRecord(runtimePath);
  const plan = await createSupervisorPlan({
    preferredPort,
    runtime,
    projectRoot,
    isPortAvailable,
    isProcessAlive,
    isPortServing,
    readOwnedHealth,
  });

  if (plan.action === 'reject') {
    throw new Error(`Cannot start Metro safely: ${plan.reason}`);
  }

  if (plan.action === 'reuse') {
    const reachableIp = selectPhoneReachableAddress(os.networkInterfaces());
    console.log(`\nReusing existing healthy Tuvu Metro server (${mode}) at http://${reachableIp}:${plan.runtime.port}`);
    return;
  }

  const runId = crypto.randomBytes(8).toString('hex');
  const controlState = { runId, metroPid: 0, port: plan.port };
  const control = await startControlServer(controlState);

  const reachableIp = selectPhoneReachableAddress(os.networkInterfaces());
  console.log(`\nStarting Tuvu Expo dev server on port ${plan.port}...`);
  console.log(`Phone reachable URL: exp://${reachableIp}:${plan.port}\n`);

  const expoCli = require.resolve('expo/bin/cli');
  const startArgs = createExpoStartArguments(plan.port, mode);

  const metroChild = spawn(process.execPath, [expoCli, ...startArgs], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
  });

  controlState.metroPid = metroChild.pid;

  const runtimeRecord = {
    owner: RUNTIME_OWNER,
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    runId,
    projectRoot,
    supervisorPid: process.pid,
    metroPid: metroChild.pid,
    port: plan.port,
    controlPort: control.port,
    mode,
    startedAt: new Date().toISOString(),
  };

  await writeRuntimeRecord(runtimePath, runtimeRecord);

  let shutdownPromise = null;
  function handleSignal(signal) {
    if (shutdownPromise) return;
    shutdownPromise = (async () => {
      try {
        await stopOwnedChild(metroChild, { signal });
      } finally {
        await removeRuntimeRecordIfOwned(runtimePath, runId);
        control.server.close();
      }
    })();
  }

  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));

  const exitCode = await waitForChildOrShutdown(observeChildExit(metroChild), shutdownPromise, metroChild.pid);
  await removeRuntimeRecordIfOwned(runtimePath, runId);
  control.server.close();
  process.exitCode = exitCode ?? 0;
}

main().catch((error) => {
  console.error(`Tuvu Expo supervisor failed: ${error.message}`);
  process.exitCode = 1;
});
