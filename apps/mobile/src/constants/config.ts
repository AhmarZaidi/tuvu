import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_PORT = 8787;

export function getDefaultApiBase(): string {
  // When running in Expo Go on a real phone or dev-client, hostUri contains "<laptop-ip>:<metro-port>"
  const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest2?.extra?.expoClient?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:${DEFAULT_PORT}`;
    }
  }

  // Fallback for Android emulator
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${DEFAULT_PORT}`;
  }
  return `http://127.0.0.1:${DEFAULT_PORT}`;
}

let activeApiBase = getDefaultApiBase();

export const config = {
  getApiBase(): string {
    return activeApiBase;
  },
  setApiBase(url: string): void {
    let clean = url.trim();
    if (clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    activeApiBase = clean;
  },
};
