import React from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useAppTheme } from '../context/ThemeContext';
import { BackButton } from '../components/BackButton';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

function RootNavigation() {
  const { colors, isDark } = useAppTheme();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.textStrong,
          headerTitleStyle: {
            fontWeight: '800',
            fontSize: 18,
            color: colors.textStrong,
          },
          headerLeft: () => <BackButton style={{ marginRight: 10 }} />,
          headerBackVisible: false,
          contentStyle: {
            backgroundColor: colors.background,
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
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="settings/import"
          options={{
            title: 'TV Time Import',
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RootNavigation />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
