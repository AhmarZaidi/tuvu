#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  androidPrebuildPlan,
  ensureAndroidNativeConfig,
  recordPrebuildFingerprint,
} = require("./android-native-config");

function fixture(usesCleartextTraffic, applicationAttributes = "") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tuvu-native-config-"));
  const manifestDirectory = path.join(root, "android", "app", "src", "main");
  fs.mkdirSync(manifestDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(root, "app.json"),
    JSON.stringify({ expo: { android: { usesCleartextTraffic } } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(manifestDirectory, "AndroidManifest.xml"),
    `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:name=".MainApplication"${applicationAttributes}></application></manifest>`,
    "utf8",
  );
  return root;
}

function manifest(root) {
  return fs.readFileSync(
    path.join(root, "android", "app", "src", "main", "AndroidManifest.xml"),
    "utf8",
  );
}

test("adds the configured cleartext value when Expo omits it", (t) => {
  const root = fixture(true);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = ensureAndroidNativeConfig(root);

  assert.equal(result.changed, true);
  assert.match(manifest(root), /android:usesCleartextTraffic="true"/);
  assert.match(manifest(root), /android:name="\.MainApplication"/);
});

test("corrects an existing value and is idempotent", (t) => {
  const root = fixture(true, ' android:usesCleartextTraffic="false"');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.equal(ensureAndroidNativeConfig(root).changed, true);
  assert.equal(ensureAndroidNativeConfig(root).changed, false);
  assert.match(manifest(root), /android:usesCleartextTraffic="true"/);
  assert.doesNotMatch(manifest(root), /android:usesCleartextTraffic="false"/);
});

test("skips prebuild for a complete existing project and caches its inputs", (t) => {
  const root = fixture(true);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "package.json"), '{"dependencies":{}}');
  fs.writeFileSync(path.join(root, "android", "app", "build.gradle"), "android {}");
  fs.writeFileSync(path.join(root, "android", "gradlew"), "");

  const initialPlan = androidPrebuildPlan(root);
  assert.equal(initialPlan.required, false);
  recordPrebuildFingerprint(root, initialPlan.fingerprint);

  const cachedPlan = androidPrebuildPlan(root);
  assert.equal(cachedPlan.required, false);
  assert.match(cachedPlan.reason, /unchanged/);
});

test("requires prebuild when a native input changes", (t) => {
  const root = fixture(true);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "package.json"), '{"dependencies":{}}');
  fs.writeFileSync(path.join(root, "android", "app", "build.gradle"), "android {}");
  fs.writeFileSync(path.join(root, "android", "gradlew"), "");

  const initialPlan = androidPrebuildPlan(root);
  recordPrebuildFingerprint(root, initialPlan.fingerprint);
  const appJson = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
  appJson.expo.scheme = "tuvu";
  fs.writeFileSync(path.join(root, "app.json"), JSON.stringify(appJson));

  const changedPlan = androidPrebuildPlan(root);
  assert.equal(changedPlan.required, true);
  assert.match(changedPlan.reason, /changed/);
});
