import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, ThemeProvider as NavigationThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useAppTheme } from '../context/ThemeContext';
import { SnackbarProvider } from '../context/SnackbarContext';
import { SearchProvider } from '../context/SearchContext';
import { DashboardLayoutProvider } from '../context/DashboardLayoutContext';
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

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  const navigationTheme = {
    dark: isDark,
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.background,
      text: colors.textStrong,
      border: colors.border,
      primary: colors.accent,
      notification: colors.accent,
    },
    fonts: isDark ? DarkTheme.fonts : DefaultTheme.fonts,
  };

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
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
            animation: 'fade',
            animationDuration: 150,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="media/[id]"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="people/[id]"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="characters/[id]"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="media/[id]/episodes/[episodeId]"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="library"
            options={{
              title: 'All Library',
              headerLeft: () => <BackButton fallbackRoute="/(tabs)" style={{ marginRight: 10 }} />,
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
              headerLeft: () => <BackButton fallbackRoute="/(tabs)/settings" style={{ marginRight: 10 }} />,
            }}
          />
        </Stack>
      </View>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#101112' }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SnackbarProvider>
            <SearchProvider>
              <DashboardLayoutProvider>
                <RootNavigation />
              </DashboardLayoutProvider>
            </SearchProvider>
          </SnackbarProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
