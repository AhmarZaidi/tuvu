#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const {
  androidPrebuildPlan,
  ensureAndroidNativeConfig,
  recordPrebuildFingerprint,
} = require("./android-native-config");

const projectRoot = path.resolve(__dirname, "..");
const androidDir = path.join(projectRoot, "android");
const buildsDir = path.join(projectRoot, "builds");

const args = process.argv.slice(2);
const isDebug = args.includes("--debug");
const isAllArch = args.includes("--all") || args.includes("--all-arch");
const archArg = args.find((a) => a.startsWith("--arch="));
const selectedArch = archArg
  ? archArg.split("=")[1]
  : isAllArch
    ? "armeabi-v7a,arm64-v8a,x86,x86_64"
    : "arm64-v8a";

const variant = isDebug ? "debug" : "release";
const gradleTask = isDebug ? "assembleDebug" : "assembleRelease";

function getCurrentVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    );
    return pkg.version || "1.0.0";
  } catch {
    return "1.0.0";
  }
}

async function promptVersion(currentVersion) {
  const explicitVer = args.find((a) => a.startsWith("--version="));
  if (explicitVer) {
    return explicitVer.split("=")[1].trim();
  }
  if (args.includes("--no-prompt") || !process.stdin.isTTY) {
    return currentVersion;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `App version [${currentVersion}] (press Enter to keep, or type new version): `,
      (answer) => {
        rl.close();
        const chosen = answer.trim();
        resolve(chosen || currentVersion);
      },
    );
  });
}

function applyVersion(newVersion) {
  let androidVersionCode;
  const pkgPath = path.join(projectRoot, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (pkg.version !== newVersion) {
      pkg.version = newVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
      console.log(`✓ Updated package.json version -> ${newVersion}`);
    }
  }

  const appJsonPath = path.join(projectRoot, "app.json");
  if (fs.existsSync(appJsonPath)) {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
    if (appJson.expo) {
      let changed = false;
      if (appJson.expo.version !== newVersion) {
        appJson.expo.version = newVersion;
        changed = true;
      }
      if (appJson.expo.android) {
        appJson.expo.android.versionCode =
          (appJson.expo.android.versionCode || 1) + 1;
        androidVersionCode = appJson.expo.android.versionCode;
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(
          appJsonPath,
          JSON.stringify(appJson, null, 2) + "\n",
          "utf8",
        );
        console.log(
          `✓ Updated app.json version -> ${newVersion} (versionCode: ${appJson.expo.android?.versionCode})`,
        );
      }
    }
  }

  const appGradlePath = path.join(androidDir, "app", "build.gradle");
  if (fs.existsSync(appGradlePath)) {
    let gradle = fs.readFileSync(appGradlePath, "utf8");
    gradle = gradle.replace(
      /versionName\s+"[^"]+"/,
      `versionName "${newVersion}"`,
    );
    if (androidVersionCode) {
      gradle = gradle.replace(
        /versionCode\s+\d+/,
        `versionCode ${androidVersionCode}`,
      );
    }
    fs.writeFileSync(appGradlePath, gradle, "utf8");
  }
}

function synchronizeAndroidProject(plan) {
  if (!plan.required) {
    console.log(`\u2713 Skipping Expo prebuild: ${plan.reason}.`);
    recordPrebuildFingerprint(projectRoot, plan.fingerprint);
    return;
  }
  console.log(
    `Synchronizing Android project via Expo prebuild: ${plan.reason}...`,
  );
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const res = spawnSync(
    npxCmd,
    ["expo", "prebuild", "--platform", "android", "--no-install"],
    {
      cwd: projectRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  if (res.error) {
    console.error(`Failed to execute Expo prebuild: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(
      "Failed to synchronize the Android project with Expo prebuild.",
    );
    process.exit(res.status || 1);
  }
  recordPrebuildFingerprint(projectRoot, plan.fingerprint);
}

function findBestJdk() {
  const homeDir = process.env.USERPROFILE || process.env.HOME || "";
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";

  const candidates = [
    path.join(localAppData, "Android", "Sdk", "jdk-17"),
    path.join(programFiles, "Android", "Android Studio", "jbr"),
    path.join(homeDir, ".gradle", "jdks"),
    process.env.JAVA_HOME,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const stat = fs.statSync(candidate);
    if (stat.isDirectory()) {
      const javacPath = path.join(
        candidate,
        "bin",
        process.platform === "win32" ? "javac.exe" : "javac",
      );
      if (fs.existsSync(javacPath)) {
        return candidate;
      }
    }
  }
  return process.env.JAVA_HOME || null;
}

function ensureSdkProperties() {
  const localPropsPath = path.join(androidDir, "local.properties");
  if (fs.existsSync(localPropsPath)) {
    const content = fs.readFileSync(localPropsPath, "utf8");
    if (content.includes("sdk.dir")) {
      return;
    }
  }

  const localAppData = process.env.LOCALAPPDATA || "";
  const homeDir = process.env.USERPROFILE || process.env.HOME || "";

  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(localAppData, "Android", "Sdk"),
    path.join(homeDir, "AppData", "Local", "Android", "Sdk"),
    path.join(homeDir, "Library", "Android", "sdk"),
    path.join(homeDir, "Android", "Sdk"),
  ].filter(Boolean);

  const sdkPath = candidates.find((dir) => fs.existsSync(dir));

  if (sdkPath) {
    const formattedSdkDir = sdkPath.replace(/\\/g, "/");
    fs.writeFileSync(localPropsPath, `sdk.dir=${formattedSdkDir}\n`, "utf8");
    console.log(
      `Auto-configured Android SDK in android/local.properties: ${formattedSdkDir}`,
    );
  } else {
    console.warn("\n⚠️  Could not automatically locate Android SDK directory.");
  }
}

function ensureGradleConfig(bestJdk) {
  const gradlePropsPath = path.join(androidDir, "gradle.properties");
  if (fs.existsSync(gradlePropsPath)) {
    let content = fs.readFileSync(gradlePropsPath, "utf8");
    let changed = false;

    if (bestJdk) {
      const formattedJdk = bestJdk.replace(/\\/g, "/");
      if (content.includes("org.gradle.java.home=")) {
        content = content.replace(
          /org\.gradle\.java\.home=.*/,
          `org.gradle.java.home=${formattedJdk}`,
        );
      } else {
        content += `\norg.gradle.java.home=${formattedJdk}\n`;
      }
      changed = true;
    }

    if (!content.includes("org.gradle.caching=true")) {
      content += `\norg.gradle.caching=true\n`;
      changed = true;
    }

    if (!content.includes("org.gradle.vfs.watch=true")) {
      content += `\norg.gradle.vfs.watch=true\n`;
      changed = true;
    }

    if (content.includes("org.gradle.jvmargs=-Xmx2048m")) {
      content = content.replace(
        "org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m",
        "org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m",
      );
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(gradlePropsPath, content, "utf8");
    }
  }

  const rootBuildGradlePath = path.join(androidDir, "build.gradle");
  if (fs.existsSync(rootBuildGradlePath)) {
    let content = fs.readFileSync(rootBuildGradlePath, "utf8");
    if (!content.includes("RepositoryHandler.metaClass.jcenter")) {
      const shim = `\n// Compatibility shim for legacy packages referencing jcenter()\ntry {\n  org.gradle.api.artifacts.dsl.RepositoryHandler.metaClass.jcenter = { Object... args -> delegate.mavenCentral() }\n} catch (Throwable ignored) {}\n\n`;
      content = content.replace("allprojects {", shim + "allprojects {");
      fs.writeFileSync(rootBuildGradlePath, content, "utf8");
    }
  }
}

async function main() {
  console.log(`\n========================================`);
  console.log(`  Tuvu Android APK Builder (${variant.toUpperCase()})`);
  console.log(`  Target Architecture: ${selectedArch}`);
  console.log(`========================================\n`);

  const currentVersion = getCurrentVersion();
  const selectedVersion = await promptVersion(currentVersion);
  applyVersion(selectedVersion);

  synchronizeAndroidProject(androidPrebuildPlan(projectRoot));
  const nativeConfig = ensureAndroidNativeConfig(projectRoot);
  console.log(
    `${nativeConfig.changed ? "✓ Applied" : "✓ Verified"} Android cleartext policy: ` +
      `usesCleartextTraffic=${nativeConfig.usesCleartextTraffic}`,
  );
  ensureSdkProperties();
  const bestJdk = findBestJdk();
  ensureGradleConfig(bestJdk);

  const gradlew =
    process.platform === "win32"
      ? path.join(androidDir, "gradlew.bat")
      : path.join(androidDir, "gradlew");

  if (process.platform !== "win32") {
    try {
      fs.chmodSync(gradlew, "755");
    } catch {}
  }

  console.log(`\nBuilding Android ${variant} APK with Gradle...`);
  if (bestJdk) {
    console.log(`Using JDK: ${bestJdk}`);
  }
  const startTime = Date.now();

  const buildEnv = { ...process.env };
  delete buildEnv.JDK_JAVA_OPTIONS;
  delete buildEnv._JAVA_OPTIONS;
  delete buildEnv.JAVA_TOOL_OPTIONS;

  const pathKey =
    Object.keys(process.env).find((k) => k.toLowerCase() === "path") || "PATH";
  const currentPath = process.env[pathKey] || "";

  if (bestJdk) {
    buildEnv.JAVA_HOME = bestJdk;
    buildEnv[pathKey] =
      `${path.join(bestJdk, "bin")}${path.delimiter}${currentPath}`;
    for (const k of Object.keys(buildEnv)) {
      if (k.toLowerCase() === "path" && k !== pathKey) {
        delete buildEnv[k];
      }
    }
  }

  const gradleArgs = [
    gradleTask,
    `-PreactNativeArchitectures=${selectedArch}`,
    "-x",
    "lint",
    "-x",
    "lintVitalRelease",
    "--build-cache",
    "--parallel",
  ];

  if (process.platform === "win32") {
    spawnSync("cmd.exe", ["/c", gradlew, "--stop"], {
      cwd: androidDir,
      stdio: "ignore",
      shell: false,
      env: buildEnv,
    });
  }

  const buildResult =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/c", gradlew, ...gradleArgs], {
          cwd: androidDir,
          stdio: "inherit",
          shell: false,
          env: buildEnv,
        })
      : spawnSync(gradlew, gradleArgs, {
          cwd: androidDir,
          stdio: "inherit",
          shell: false,
          env: buildEnv,
        });

  if (buildResult.error) {
    console.error(
      `\n❌ Failed to execute Gradle command: ${buildResult.error.message}`,
    );
    process.exit(1);
  }

  if (buildResult.status !== 0) {
    console.error(
      `\n❌ Gradle build failed with exit code ${buildResult.status}.`,
    );
    process.exit(buildResult.status || 1);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ Gradle build completed in ${duration}s.`);

  const defaultApkLocation = path.join(
    androidDir,
    "app",
    "build",
    "outputs",
    "apk",
    variant,
    `app-${variant}.apk`,
  );

  if (!fs.existsSync(defaultApkLocation)) {
    console.error(`\n❌ Could not find output APK at: ${defaultApkLocation}`);
    process.exit(1);
  }

  if (!fs.existsSync(buildsDir)) {
    fs.mkdirSync(buildsDir, { recursive: true });
  }

  const namedApkPath = path.join(
    buildsDir,
    `tuvu-v${selectedVersion}-${variant}.apk`,
  );
  const latestApkPath = path.join(buildsDir, `tuvu-${variant}.apk`);
  const genericApkPath = path.join(buildsDir, `tuvu.apk`);

  fs.copyFileSync(defaultApkLocation, namedApkPath);
  fs.copyFileSync(defaultApkLocation, latestApkPath);
  fs.copyFileSync(defaultApkLocation, genericApkPath);

  const stats = fs.statSync(namedApkPath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`\n========================================`);
  console.log(`  🎉 APK BUILT SUCCESSFULLY!`);
  console.log(`========================================`);
  console.log(`  Version:      v${selectedVersion}`);
  console.log(`  Architecture: ${selectedArch}`);
  console.log(`  Size:         ${sizeMb} MB`);
  console.log(`  Target:       ${namedApkPath}`);
  console.log(`  Shortcut:     ${genericApkPath}`);
  console.log(`========================================\n`);
  console.log(`To install on your phone with USB debugging enabled:`);
  console.log(`  adb install -r "${genericApkPath}"\n`);
}

main().catch((err) => {
  console.error("Fatal error during build:", err);
  process.exit(1);
});
