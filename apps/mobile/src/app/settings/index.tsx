import React from 'react';
import { Redirect } from 'expo-router';

export default function SettingsIndexRedirect() {
  return <Redirect href="/(tabs)/settings" />;
}
