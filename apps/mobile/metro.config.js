const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

try {
  const reanimatedVersion = require('react-native-reanimated/package.json').version;
  const workletsVersion = require('react-native-worklets/package.json').version;
  config.cacheVersion = [
    config.cacheVersion,
    `react-native-reanimated-${reanimatedVersion}`,
    `react-native-worklets-${workletsVersion}`,
  ].join(':');
} catch {}

module.exports = config;
