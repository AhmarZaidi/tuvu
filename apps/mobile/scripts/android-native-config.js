#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PREBUILD_FINGERPRINT_FILE = ".tuvu-prebuild-fingerprint";

function collectReferencedFiles(value, files = new Set()) {
  if (typeof value === "string" && value.startsWith("./")) {
    files.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectReferencedFiles(item, files);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectReferencedFiles(item, files);
    }
  }
  return files;
}

function nativeInputFingerprint(projectRoot) {
  const appJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "app.json"), "utf8"),
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  );
  const expo = structuredClone(appJson.expo || {});
  delete expo.version;
  if (expo.android) {
    delete expo.android.versionCode;
    // This value is enforced directly after prebuild and need not trigger it.
    delete expo.android.usesCleartextTraffic;
  }

  const hash = crypto.createHash("sha256");
  hash.update(
    JSON.stringify({ expo, dependencies: packageJson.dependencies || {} }),
  );
  const referencedFiles = [...collectReferencedFiles(appJson.expo)].sort();
  for (const relativePath of referencedFiles) {
    const absolutePath = path.resolve(projectRoot, relativePath);
    hash.update(relativePath);
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
      hash.update(fs.readFileSync(absolutePath));
    } else {
      hash.update("missing");
    }
  }
  return hash.digest("hex");
}

function hasGeneratedAdaptiveIcon(projectRoot, appJson) {
  if (!appJson.expo?.android?.adaptiveIcon?.foregroundImage) return true;
  const resourceRoot = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    "main",
    "res",
  );
  if (!fs.existsSync(resourceRoot)) return false;
  return fs.readdirSync(resourceRoot).some((directory) => {
    if (!directory.startsWith("mipmap-")) return false;
    return ["webp", "png"].some((extension) =>
      fs.existsSync(
        path.join(
          resourceRoot,
          directory,
          `ic_launcher_foreground.${extension}`,
        ),
      ),
    );
  });
}

function androidPrebuildPlan(projectRoot) {
  const androidDirectory = path.join(projectRoot, "android");
  const fingerprint = nativeInputFingerprint(projectRoot);
  if (!fs.existsSync(androidDirectory)) {
    return { required: true, reason: "android/ is missing", fingerprint };
  }

  const appJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "app.json"), "utf8"),
  );
  const requiredFiles = [
    path.join(androidDirectory, "app", "build.gradle"),
    path.join(
      androidDirectory,
      "app",
      "src",
      "main",
      "AndroidManifest.xml",
    ),
  ];
  const gradleWrapperExists = ["gradlew", "gradlew.bat"].some((name) =>
    fs.existsSync(path.join(androidDirectory, name)),
  );
  if (
    !gradleWrapperExists ||
    requiredFiles.some((file) => !fs.existsSync(file)) ||
    !hasGeneratedAdaptiveIcon(projectRoot, appJson)
  ) {
    return {
      required: true,
      reason: "generated Android files are incomplete",
      fingerprint,
    };
  }

  const fingerprintPath = path.join(
    androidDirectory,
    PREBUILD_FINGERPRINT_FILE,
  );
  if (!fs.existsSync(fingerprintPath)) {
    return {
      required: false,
      reason: "existing Android project is complete; initializing fingerprint",
      fingerprint,
    };
  }
  const previousFingerprint = fs.readFileSync(fingerprintPath, "utf8").trim();
  return previousFingerprint === fingerprint
    ? { required: false, reason: "native inputs are unchanged", fingerprint }
    : { required: true, reason: "native inputs changed", fingerprint };
}

function recordPrebuildFingerprint(projectRoot, fingerprint) {
  const fingerprintPath = path.join(
    projectRoot,
    "android",
    PREBUILD_FINGERPRINT_FILE,
  );
  fs.writeFileSync(fingerprintPath, `${fingerprint}\n`, "utf8");
}

function ensureAndroidNativeConfig(projectRoot) {
  const appJsonPath = path.join(projectRoot, "app.json");
  const manifestPath = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    "main",
    "AndroidManifest.xml",
  );

  const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
  const usesCleartextTraffic = appJson.expo?.android?.usesCleartextTraffic;
  if (typeof usesCleartextTraffic !== "boolean") {
    throw new Error(
      "app.json must declare expo.android.usesCleartextTraffic as true or false.",
    );
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `Android manifest not found after prebuild: ${manifestPath}`,
    );
  }

  const expectedValue = String(usesCleartextTraffic);
  const applicationPattern = /<application\b[^>]*>/;
  const cleartextPattern = /\sandroid:usesCleartextTraffic="[^"]*"/;
  const manifest = fs.readFileSync(manifestPath, "utf8");
  const applicationTag = manifest.match(applicationPattern)?.[0];
  if (!applicationTag) {
    throw new Error(`Could not find <application> in ${manifestPath}`);
  }

  const nextApplicationTag = cleartextPattern.test(applicationTag)
    ? applicationTag.replace(
        cleartextPattern,
        ` android:usesCleartextTraffic="${expectedValue}"`,
      )
    : applicationTag.replace(
        />$/,
        ` android:usesCleartextTraffic="${expectedValue}">`,
      );
  const nextManifest = manifest.replace(applicationPattern, nextApplicationTag);

  if (nextManifest !== manifest) {
    fs.writeFileSync(manifestPath, nextManifest, "utf8");
  }

  const verifiedTag = nextManifest.match(applicationPattern)?.[0] || "";
  const verifiedValue = verifiedTag.match(cleartextPattern)?.[0] || "";
  if (!verifiedValue.includes(`"${expectedValue}"`)) {
    throw new Error(
      `Failed to enforce android:usesCleartextTraffic="${expectedValue}" in ${manifestPath}`,
    );
  }

  return {
    changed: nextManifest !== manifest,
    manifestPath,
    usesCleartextTraffic,
  };
}

module.exports = {
  androidPrebuildPlan,
  ensureAndroidNativeConfig,
  recordPrebuildFingerprint,
};
