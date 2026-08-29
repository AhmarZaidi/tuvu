import React from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: theme.colors.background,
            },
            headerTintColor: theme.colors.textStrong,
            headerTitleStyle: {
              fontWeight: '800',
              fontSize: 18,
            },
            headerBackTitle: 'Back',
            contentStyle: {
              backgroundColor: theme.colors.background,
            },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="media/[id]"
            options={{
              title: 'Media Details',
            }}
          />
          <Stack.Screen
            name="media/[id]/episodes/[episodeId]"
            options={{
              title: 'Episode Details',
            }}
          />
          <Stack.Screen
            name="library"
            options={{
              title: 'All Library',
            }}
          />
          <Stack.Screen
            name="settings/index"
            options={{
              title: 'Settings',
            }}
          />
          <Stack.Screen
            name="settings/import"
            options={{
              title: 'TV Time Import',
            }}
          />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
