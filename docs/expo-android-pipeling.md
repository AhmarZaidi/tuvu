# Expo Android Build & Test Pipeline Reference

This document captures the complete build, test, and development pipeline as implemented in the **Gwalli** project (`d:\CS\Projects\gwalli`). Use it as a reference when implementing a similar pipeline for another Expo/React Native Android app.

---

## Table of Contents

1. [Project Layout Conventions](#1-project-layout-conventions)
2. [package.json Script Definitions](#2-packagejson-script-definitions)
3. [TypeScript Configuration](#3-typescript-configuration)
4. [Jest Test Configuration](#4-jest-test-configuration)
5. [Metro Bundler Configuration](#5-metro-bundler-configuration)
6. [Quality Gate (The verify script)](#6-quality-gate-the-verify-script)
7. [postinstall: Dependency Patching](#7-postinstall-dependency-patching)
8. [APK Build Script](#8-apk-build-script)
9. [Expo Go Dev Server Supervisor](#9-expo-go-dev-server-supervisor)
10. [.gitignore Conventions](#10-gitignore-conventions)
11. [Version Management Pattern](#11-version-management-pattern)
12. [Key Lessons and Gotchas](#12-key-lessons-and-gotchas)

---

## 1. Project Layout Conventions

```
my-app/
├── src/
│   ├── app/              # Expo Router file-based routing
│   │   └── (tabs)/       # Tab screens
│   ├── components/       # Reusable UI components
│   ├── constants/        # Design tokens, storage keys
│   ├── services/         # Background, native, API services
│   ├── state/            # React Context providers
│   └── utils/            # Shared utility functions
├── tests/                # All Jest tests (flat, named *.test.ts/tsx)
│   └── support/          # Shared test harness and fixtures
├── scripts/
│   ├── build-apk.js      # Main APK build runner
│   ├── expo-supervisor.js # Conflict-safe Metro dev server
│   ├── postinstall.js    # npm postinstall dependency patches
│   ├── clean.js          # Cache and build output cleaner
│   ├── hold-port.js      # Port-locking utility for testing
│   └── lib/              # Shared helpers for scripts
├── assets/               # Icons, splash screens, static images
├── app.json              # Expo app config (version, package name, plugins)
├── package.json          # Dependencies, scripts, engines
├── tsconfig.json         # TypeScript config
├── jest.config.js        # Jest config
├── metro.config.js       # Metro bundler config
└── .gitignore
```

> Reference: `d:\CS\Projects\gwalli` for a working implementation of this layout.

The `/android` and `/ios` native directories are **not committed**. They are generated on-demand by `expo prebuild` (run automatically by the build script).

---

## 2. package.json Script Definitions

Reference file: `d:\CS\Projects\gwalli\package.json`

```json
{
  "engines": {
    "node": ">=22.13.0"
  },
  "scripts": {
    "dev:expo":          "node ./scripts/expo-supervisor.js",
    "lint":              "expo lint",
    "typecheck":         "tsc --noEmit",
    "tsc":               "npm run typecheck",
    "test":              "jest --runInBand",
    "test:watch":        "jest --watch",
    "test:coverage":     "jest --coverage --runInBand",
    "bundle:android":    "expo export --platform android --output-dir .expo-export-smoke --clear",
    "build:apk":         "node ./scripts/build-apk.js",
    "build:apk:debug":   "node ./scripts/build-apk.js --debug",
    "build:apk:release": "node ./scripts/build-apk.js --release",
    "build:apk:all":     "node ./scripts/build-apk.js --all",
    "clean":             "node ./scripts/clean.js",
    "postinstall":       "node ./scripts/postinstall.js",
    "verify":            "npm run typecheck && npm run lint && npm test && npm run bundle:android"
  }
}
```

Key points:
- `--runInBand` on Jest prevents parallel test workers competing over a shared in-memory SQLite instance.
- `bundle:android` is a smoke test that catches Metro/Babel/bundler failures without needing a full native build. Output goes to `.expo-export-smoke/` which is gitignored.
- `verify` is the single aggregate quality gate. All four steps must pass cleanly before merging.

---

## 3. TypeScript Configuration

Reference file: `d:\CS\Projects\gwalli\tsconfig.json`

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "module": "ESNext",
    "forceConsistentCasingInFileNames": true,
    "types": ["jest", "node"],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- `strict: true` is non-negotiable. It catches nullability bugs before runtime.
- `paths: { "@/*": ["./*"] }` enables `@/src/...` absolute imports throughout the app.
- `types: ["jest", "node"]` makes `describe`, `it`, `expect`, and Node built-ins available globally in tests without importing them.
- `.expo/types/**/*.ts` includes auto-generated typed routes from Expo Router.

---

## 4. Jest Test Configuration

Reference file: `d:\CS\Projects\gwalli\jest.config.js`

```js
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.[jt]s?(x)'],
  collectCoverageFrom: [
    'tests/support/**/*.{ts,tsx}',
    'scripts/lib/expo-supervisor.js',
    '!**/*.d.ts',
  ],
};
```

- `jest-expo` preset handles Babel transforms and React Native mocks automatically.
- All tests live under `tests/` in a flat structure. Naming pattern: `feature-name.test.ts`.
- `collectCoverageFrom` covers shared test harness code and the supervisor library, not the full app source (coverage of RN component code via Jest is low-value and slow).
- Tests that need SQLite use `sql.js` (in-memory, WebAssembly) via a test harness in `tests/support/sqlJsDatabase.ts`. This means zero real file I/O in unit tests.

### Test harness pattern

Reference: `d:\CS\Projects\gwalli\tests\support\harness.ts`

Create a shared harness module that:
- Bootstraps an in-memory database.
- Exposes factory helpers (`createImage(overrides)`, `createPlaylist(overrides)`) for building test fixtures.
- Exports `resetDb()` for per-test isolation.

---

## 5. Metro Bundler Configuration

Reference file: `d:\CS\Projects\gwalli\metro.config.js`

```js
const { getDefaultConfig } = require('expo/metro-config');

const reanimatedVersion = require('react-native-reanimated/package.json').version;
const workletsVersion   = require('react-native-worklets/package.json').version;

const config = getDefaultConfig(__dirname);

// Tie cache namespace to native-sensitive packages to prevent stale Babel output.
config.cacheVersion = [
  config.cacheVersion,
  `react-native-reanimated-${reanimatedVersion}`,
  `react-native-worklets-${workletsVersion}`,
].join(':');

module.exports = config;
```

The critical pattern here: any library that uses a custom Babel plugin (Reanimated, Worklets, Hermes-specific transforms) must be included in `cacheVersion`. Without this, updating the library version does not invalidate Metro's transform cache, causing the old Babel output to be used silently.

---

## 6. Quality Gate (The verify script)

The `verify` script runs four checks in strict order. All four must exit 0 before any PR can merge.

```
npm run typecheck   # 1. tsc --noEmit: zero type errors
npm run lint        # 2. expo lint: zero ESLint warnings and errors
npm test            # 3. jest: all unit tests green
npm run bundle:android  # 4. Metro bundler smoke test: full JS bundle builds cleanly
```

The bundler smoke test catches issues that TypeScript and Jest cannot — broken dynamic imports, missing assets referenced in code, Metro plugin failures. It is cheap (no native compilation) but catches real production bundling problems.

---

## 7. postinstall: Dependency Patching

Reference file: `d:\CS\Projects\gwalli\scripts\postinstall.js`

Run automatically by npm after `npm install`. Patches `node_modules` in-place to fix known incompatibilities:

**Pattern 1: Gradle 9 jcenter() removal**

Some older React Native packages still reference the deprecated `jcenter()` repository in their `android/build.gradle`. Gradle 9 throws a hard error. The postinstall replaces `jcenter()` with `mavenCentral()`:

```js
content = content.replace(/jcenter\(\)/g, 'mavenCentral()');
```

Packages that commonly need this: `@react-native-cookies/cookies`.

**Pattern 2: Chrome DevTools WebSocket origin patching**

Metro's dev-middleware validates WebSocket origin headers. On Windows, the Chrome DevTools frontend sends an origin that fails Metro's allowlist. The postinstall patches `@react-native/dev-middleware`'s `InspectorProxy.js` to accept LAN-addressed origins.

> Important: `postinstall` patches are re-applied on every `npm install`. They will not survive a `node_modules` deletion without re-running install, which is correct behaviour.

---

## 8. APK Build Script

Reference file: `d:\CS\Projects\gwalli\scripts\build-apk.js`

This is a Node.js script that wraps the entire Android build pipeline. It avoids requiring the developer to know Gradle internals.

### What the script does, in order

**Step 1: Version prompt and apply**

Reads `package.json` for the current version. In interactive mode, prompts to keep or change it. Writes the selected version to:
- `package.json` (`version` field)
- `app.json` (`expo.version` and increments `expo.android.versionCode`)
- `android/app/build.gradle` (`versionName` and `versionCode`), if present

Skip the prompt in CI with `--no-prompt` or by passing `--version=X.X.X`.

**Step 2: Synchronize and verify native configuration**

Computes a fingerprint of native-affecting `app.json` settings, dependencies,
and referenced icon/splash assets. It skips Expo prebuild while that fingerprint
is unchanged, and runs `expo prebuild --platform android --no-install` only when
the native project is missing, incomplete, or its inputs changed. Version and
version-code updates do not invalidate the fingerprint. The script then
idempotently enforces and verifies
`android:usesCleartextTraffic` from `expo.android.usesCleartextTraffic` before
Gradle starts. This post-prebuild check is required because Expo may omit the
attribute when regenerating `AndroidManifest.xml`.

**Step 3: JDK discovery**

Searches for JDK 17 or 21 in order:
1. Gradle-provisioned JDK at `~/.gradle/jdks/` (fastest, most reliable)
2. Common Windows install paths: Eclipse Adoptium, Microsoft OpenJDK, Amazon Corretto
3. `JAVA_HOME` environment variable as fallback

Sets `JAVA_HOME` and prepends JDK `bin/` to `PATH` for the Gradle subprocess. Also strips `JDK_JAVA_OPTIONS`, `_JAVA_OPTIONS`, and `JAVA_TOOL_OPTIONS` from the environment to prevent conflicts with system Java.

**Step 4: Android SDK path**

Checks `android/local.properties` for `sdk.dir`. If absent, searches for the SDK at:
- `ANDROID_HOME` / `ANDROID_SDK_ROOT` env vars
- `%LOCALAPPDATA%\Android\Sdk` (Windows)
- `~/Library/Android/sdk` (macOS)
- `~/Android/Sdk` (Linux)

Writes `android/local.properties` automatically if found. `local.properties` is gitignored — it is machine-specific.

**Step 5: Gradle configuration**

Patches `android/gradle.properties` to:
- Set `org.gradle.java.home` to the discovered JDK path
- Enable `org.gradle.caching=true` (Gradle build cache, speeds up incremental builds)
- Enable `org.gradle.vfs.watch=true` (file system watching for faster rebuilds)
- Increase `org.gradle.jvmargs` to `-Xmx4096m -XX:MaxMetaspaceSize=1024m` if it is at the default 2048m

Also injects a `jcenter()` shim into `android/build.gradle` (same as postinstall, but applied at build time for safety).

**Step 6: Gradle assemble**

Runs `gradlew assembleRelease` (or `assembleDebug`) with:
```
-PreactNativeArchitectures=arm64-v8a   # targeted build: fastest, ~50 MB APK
-x lint                                 # skip Android Lint (already run via expo lint)
-x lintVitalRelease                     # skip release lint check
--build-cache                           # use Gradle build cache
--parallel                              # parallel module compilation
```

On Windows, stops existing Gradle daemons first to prevent file-locking issues on dex intermediates.

**Step 7: Copy output**

Copies the generated APK from `android/app/build/outputs/apk/release/app-release.apk` to:
- `builds/myapp-v1.1.0-release.apk` (versioned)
- `builds/myapp-release.apk` (variant shortcut)
- `builds/myapp.apk` (generic shortcut for quick ADB install)

### Build command flags

| Command | Architecture | APK Size | Use for |
| :--- | :--- | :--- | :--- |
| `npm run build:apk` | arm64-v8a only | ~50 MB | Physical phone testing (default) |
| `npm run build:apk:all` | All 4 ABIs | ~115 MB | Distribution / emulators |
| `npm run build:apk:debug` | arm64-v8a only | ~60 MB | Developer debugging |
| `node scripts/build-apk.js --arch=x86_64` | x86_64 only | ~50 MB | x86_64 emulators |

---

## 9. Expo Go Dev Server Supervisor

Reference file: `d:\CS\Projects\gwalli\scripts\expo-supervisor.js`

Problem: `expo start` hardcodes port 8081 and cannot recover if another process owns it. Running two instances silently picks a new port without the developer noticing.

Solution: a custom Node.js supervisor that:
1. Reads a runtime record file (`.gwalli-runtime/expo-supervisor-go.json`) to check if a Gwalli-owned Metro is already running.
2. If the existing Metro is healthy (verified via `GET /status`), prints its address and exits — reusing the existing server.
3. If the preferred port (default 8081, overridable via `GWALLI_METRO_PORT`) is in use by someone else, selects the next free port.
4. Starts `expo start --port <port>` as a child process.
5. Runs a lightweight HTTP health server so future invocations can verify the instance is alive.
6. On `Ctrl+C`, stops only the child started by the current supervisor and removes the runtime record.

```powershell
# Start (or reuse existing) Metro server
npm run dev:expo

# Use a custom port for one shell
$env:GWALLI_METRO_PORT = 8090
npm run dev:expo
```

The runtime record lives in `.gwalli-runtime/` which is gitignored. The supervisor library is in `scripts/lib/expo-supervisor.js`.

---

## 10. .gitignore Conventions

Reference file: `d:\CS\Projects\gwalli\.gitignore`

```gitignore
# Dependencies
node_modules/

# Expo runtime caches
.expo/
dist/
web-build/
.expo-export-smoke/
coverage/
expo-env.d.ts

# Generated native project directories
/ios
/android

# Machine-specific Android SDK config (never commit this)
local.properties

# Build outputs
/builds/
*.apk
*.aab

# App-specific runtime directories
/.gwalli-runtime/
/.ticket-evidence/
```

The critical entries:
- `/android` and `/ios` - generated by `expo prebuild`, never committed.
- `local.properties` - machine-specific SDK path, must never be committed.
- `/builds/` - compiled APK outputs, never committed (distribute via GitHub Releases).
- `.expo-export-smoke/` - bundle smoke test output, never committed.

---

## 11. Version Management Pattern

Version lives in two files that must stay in sync:

**`package.json`**: `"version": "1.1.0"` - the human-readable version.

**`app.json`**:
```json
{
  "expo": {
    "version": "1.1.0",
    "android": {
      "versionCode": 39
    }
  }
}
```

`versionCode` is an integer that must increase monotonically with every release (Android uses it to determine if an install is an upgrade). The build script increments it automatically.

The `scripts/build-apk.js` script keeps both files in sync when you run a build. For a CI pipeline, pass `--version=X.X.X --no-prompt` to set both files programmatically.

### Release checklist

1. Run `npm run verify` - all checks must pass.
2. Run `npm run build:apk` - produces the versioned APK in `builds/`.
3. Tag the commit: `git tag vX.X.X && git push origin vX.X.X`.
4. Create a GitHub Release, attach the APK files from `builds/`.

---

## 12. Key Lessons and Gotchas

### Native directory generation

Do not commit `/android`. The APK build script fingerprints native inputs and
regenerates or updates it only when required, then reapplies native settings
that Expo does not preserve. Manual prebuild is therefore unnecessary before
`npm run build:apk`.

### Gradle 9 jcenter() deprecation

Gradle 9 removed `jcenter()` as a repository. Many older React Native packages still reference it in their `android/build.gradle`. You must either patch `node_modules` in `postinstall` (as done here), or add a global repository substitution in the root `android/build.gradle`:

```groovy
// Root android/build.gradle
allprojects {
    configurations.all {
        resolutionStrategy.eachDependency { DependencyResolveDetails details ->
            // redirect jcenter artifacts to mavenCentral
        }
    }
}
```

The simpler approach used here: add a Groovy shim that redefines `jcenter()` as `mavenCentral()`.

### Reanimated / Worklets Babel cache

`react-native-reanimated` and `react-native-worklets` use custom Babel transforms. Metro's cache does not automatically invalidate when these packages are updated. Always include their versions in `metro.config.js`'s `cacheVersion` string. See `d:\CS\Projects\gwalli\metro.config.js`.

### Expo Go dependency pin

Expo Go releases are tied to a specific SDK version. Do not upgrade `react-native-reanimated` or `react-native-worklets` without verifying the new versions work with the physical Expo Go version on your test device. The working pair for Expo SDK 57 is `reanimated@4.5.0` + `worklets@0.10.0`.

### Windows-specific Gradle issues

- Gradle daemons hold file locks on dex intermediates. The build script runs `gradlew --stop` before building on Windows to prevent `EPERM` errors.
- Always use forward slashes in `local.properties` (`C:/Users/...`), not backslashes.
- Run PowerShell as Administrator if the NDK installation requires elevated access.

### JVM heap for Gradle

Default Gradle JVM heap (`-Xmx2048m`) is insufficient for large React Native projects. The build script bumps this to `-Xmx4096m`. If you see `OutOfMemoryError` during dexing, increase this further in `android/gradle.properties`.

### Tests must not touch the real filesystem

Use in-memory `sql.js` for SQLite tests. Use `jest.spyOn` on `FileSystem` functions. Never write to `FileSystem.documentDirectory` in tests - this makes tests dependent on the runtime environment and slow.

### Android Lint is skipped in the build script

Android Lint (`-x lint -x lintVitalRelease`) is skipped because `expo lint` (ESLint) already runs as part of the quality gate and is much faster. Android Lint's Java/Kotlin checks are not useful for a JS-only React Native codebase.
