'use strict';

const { mkdir, readFile, rename, rm, writeFile } = require('node:fs/promises');
const path = require('node:path');

const RUNTIME_SCHEMA_VERSION = 1;
const RUNTIME_OWNER = 'tuvu-expo-supervisor';

function isValidPid(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isValidPort(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 65_535;
}

function validateRuntimeRecord(runtime) {
  if (!runtime || typeof runtime !== 'object') return 'runtime is not an object';
  if (runtime.schemaVersion !== RUNTIME_SCHEMA_VERSION) return 'unsupported runtime schema';
  if (runtime.owner !== RUNTIME_OWNER) return 'runtime has an unknown owner';
  if (typeof runtime.projectRoot !== 'string' || runtime.projectRoot.length === 0) return 'runtime has no project root';
  if (!isValidPid(runtime.supervisorPid) || !isValidPid(runtime.metroPid)) return 'runtime has invalid process identity';
  if (!isValidPort(runtime.port)) return 'runtime has an invalid port';
  if (!isValidPort(runtime.controlPort)) return 'runtime has an invalid control port';
  if (Number.isNaN(Date.parse(runtime.startedAt))) return 'runtime has an invalid start time';
  if (typeof runtime.runId !== 'string' || runtime.runId.length < 8) return 'runtime has an invalid run ID';
  return null;
}

function createExpoStartArguments(port, mode = 'go') {
  if (!isValidPort(port)) throw new Error('Metro port is invalid.');
  if (mode !== 'go' && mode !== 'dev-client') throw new Error('Expo runtime mode is invalid.');
  return ['start', `--${mode}`, '--lan', '--port', String(port)];
}

function selectPhoneReachableAddress(networkInterfaces) {
  const virtualName = /virtual|vethernet|wsl|docker|hyper-v|vmware|loopback|tailscale|zerotier/i;
  const candidates = [];
  for (const [name, addresses] of Object.entries(networkInterfaces)) {
    for (const address of addresses || []) {
      if (address.family !== 'IPv4' || address.internal || virtualName.test(name)) continue;
      const privateLan = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address);
      candidates.push({ address: address.address, score: (privateLan ? 10 : 0) + (/wi-?fi|wireless|ethernet/i.test(name) ? 5 : 0) });
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.address.localeCompare(right.address));
  return candidates[0]?.address || 'localhost';
}

async function chooseMetroPort({ preferredPort, isPortAvailable, maxAttempts = 20 }) {
  if (!isValidPort(preferredPort)) throw new Error('Preferred Metro port is invalid.');
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = preferredPort + offset;
    if (!isValidPort(candidate)) break;
    if (await isPortAvailable(candidate)) return candidate;
  }
  throw new Error(`No free Metro port found from ${preferredPort} through ${preferredPort + maxAttempts - 1}. Close an owned development server or set TUVU_METRO_PORT to another valid port.`);
}

async function classifyRuntimeRecord(runtime, { projectRoot, isProcessAlive, isPortServing, readOwnedHealth }) {
  if (!runtime || typeof runtime !== 'object') return { disposition: 'stale', reason: 'runtime is not an object' };
  if (runtime.owner !== RUNTIME_OWNER) return { disposition: 'reject', reason: 'runtime has an unknown owner' };
  if (runtime.projectRoot !== projectRoot) return { disposition: 'reject', reason: 'runtime belongs to another project' };
  const invalidReason = validateRuntimeRecord(runtime);
  if (invalidReason) return { disposition: 'reject', reason: invalidReason };
  const [supervisorAlive, metroAlive, portServing, ownedHealth] = await Promise.all([
    isProcessAlive(runtime.supervisorPid),
    isProcessAlive(runtime.metroPid),
    isPortServing(runtime.port),
    readOwnedHealth(runtime),
  ]);
  const ownershipMatches =
    ownedHealth?.owner === RUNTIME_OWNER &&
    ownedHealth?.runId === runtime.runId &&
    ownedHealth?.projectRoot === runtime.projectRoot &&
    ownedHealth?.metroPid === runtime.metroPid;
  if (supervisorAlive && metroAlive && portServing && ownershipMatches) return { disposition: 'reuse', runtime };
  if (!supervisorAlive && !metroAlive) return { disposition: 'stale', reason: 'previous supervisor and metro processes are not running' };
  return { disposition: 'reject', reason: 'runtime ownership or Metro health could not be proven' };
}

async function createSupervisorPlan({ preferredPort, runtime, projectRoot, isPortAvailable, isProcessAlive, isPortServing, readOwnedHealth }) {
  if (runtime) {
    const classification = await classifyRuntimeRecord(runtime, { projectRoot, isProcessAlive, isPortServing, readOwnedHealth });
    if (classification.disposition === 'reuse') return { action: 'reuse', runtime: classification.runtime };
    if (classification.disposition === 'reject') return { action: 'reject', reason: classification.reason };
  }
  return { action: 'start', port: await chooseMetroPort({ preferredPort, isPortAvailable }) };
}

async function readRuntimeRecord(runtimePath) {
  try {
    return JSON.parse(await readFile(runtimePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw new Error('Supervisor runtime file is invalid or unreadable: ' + runtimePath + '. Verify its owner before removing it.', { cause: error });
  }
}

function observeChildExit(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 0)));
}

function waitForChildOrShutdown(childExit, shutdownPromise, metroPid) {
  if (!shutdownPromise) return childExit;
  const shutdownOutcome = shutdownPromise.then((stopped) => {
    if (!stopped) throw new Error(`Owned Metro process ${metroPid} did not stop after bounded escalation.`);
    return childExit;
  });
  return Promise.race([childExit, shutdownOutcome]);
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.removeListener('exit', onExit); resolve(false); }, timeoutMs);
    timer.unref?.();
    function onExit() { clearTimeout(timer); resolve(true); }
    child.once('exit', onExit);
  });
}

async function stopOwnedChild(child, { signal = 'SIGINT', timeoutMs = 5_000 } = {}) {
  if (child.exitCode !== null) return true;
  child.kill(signal);
  if (await waitForChildExit(child, timeoutMs)) return true;
  child.kill('SIGTERM');
  if (await waitForChildExit(child, timeoutMs)) return true;
  child.kill('SIGKILL');
  return waitForChildExit(child, timeoutMs);
}

async function writeRuntimeRecord(runtimePath, runtime) {
  const reason = validateRuntimeRecord(runtime);
  if (reason) throw new Error(`Refusing to write invalid supervisor runtime: ${reason}.`);
  await mkdir(path.dirname(runtimePath), { recursive: true });
  const temporaryPath = `${runtimePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(runtime, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, runtimePath);
}

async function removeRuntimeRecordIfOwned(runtimePath, runId) {
  const runtime = await readRuntimeRecord(runtimePath);
  if (!runtime || runtime.owner !== RUNTIME_OWNER || runtime.runId !== runId) return false;
  await rm(runtimePath, { force: true });
  return true;
}

module.exports = {
  RUNTIME_OWNER,
  RUNTIME_SCHEMA_VERSION,
  chooseMetroPort,
  classifyRuntimeRecord,
  createExpoStartArguments,
  createSupervisorPlan,
  observeChildExit,
  readRuntimeRecord,
  removeRuntimeRecordIfOwned,
  selectPhoneReachableAddress,
  stopOwnedChild,
  validateRuntimeRecord,
  waitForChildOrShutdown,
  writeRuntimeRecord,
};
