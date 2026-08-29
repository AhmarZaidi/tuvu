import React, { useRef } from 'react';
import { Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../context/ThemeContext';
import { useSearch } from '../../context/SearchContext';
import { api } from '../../services/api';

interface TabItemConfig {
  id: string;
  route: string;
  title: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
}

const ALL_TAB_DEFS: TabItemConfig[] = [
  { id: 'shows', route: 'index', title: 'Shows', activeIcon: 'tv', inactiveIcon: 'tv-outline' },
  { id: 'anime', route: 'anime', title: 'Anime', activeIcon: 'flame', inactiveIcon: 'flame-outline' },
  { id: 'movies', route: 'movies', title: 'Movies', activeIcon: 'film', inactiveIcon: 'film-outline' },
  { id: 'books', route: 'books', title: 'Books', activeIcon: 'book', inactiveIcon: 'book-outline' },
  { id: 'games', route: 'games', title: 'Games', activeIcon: 'game-controller', inactiveIcon: 'game-controller-outline' },
  { id: 'explore', route: 'explore', title: 'Explore', activeIcon: 'compass', inactiveIcon: 'compass-outline' },
];

export default function TabsLayout() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { focusSearchInput } = useSearch();
  const lastExplorePressRef = useRef<number>(0);

  // Live Navigation Settings
  const { data: navData } = useQuery({
    queryKey: ['navigationSettings'],
    queryFn: () => api.getNavigationSettings(),
  });

  const rawActiveIds: string[] = navData?.navigation?.items || ['shows', 'anime', 'movies', 'books', 'games', 'explore'];
  const activeIds: string[] = rawActiveIds.includes('explore') ? rawActiveIds : [...rawActiveIds, 'explore'];
  const showLabels = navData?.navigation?.showLabelsMobile ?? false;

  const bottomPadding = Math.max(insets.bottom, 10);
  const tabHeight = (showLabels ? 62 : 56) + bottomPadding;

  // Order defined by activeIds
  const orderedActiveTabs = activeIds
    .map((id) => ALL_TAB_DEFS.find((t) => t.id === id))
    .filter((t): t is TabItemConfig => Boolean(t));

  // Any remaining tabs not active
  const inactiveTabs = ALL_TAB_DEFS.filter((t) => !activeIds.includes(t.id));

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarShowLabel: showLabels,
        tabBarStyle: {
          backgroundColor: colors.backgroundElevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: tabHeight,
          paddingBottom: bottomPadding,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
          marginTop: 2,
        },
        headerShown: false,
      }}
    >
      {/* 1. Render active tabs in user-configured order */}
      {orderedActiveTabs.map((item) => (
        <Tabs.Screen
          key={item.route}
          name={item.route}
          listeners={() => (item.id === 'explore' ? {
            tabPress: () => {
              const now = Date.now();
              const diff = now - lastExplorePressRef.current;
              lastExplorePressRef.current = now;
              if (diff > 50 && diff < 750) {
                lastExplorePressRef.current = 0;
                focusSearchInput();
              }
            },
          } : {})}
          options={{
            title: item.title,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? item.activeIcon : item.inactiveIcon}
                size={26}
                color={color}
              />
            ),
          }}
        />
      ))}

      {/* 2. Inactive tabs rendered with href: null so routes exist but don't show on bottom bar */}
      {inactiveTabs.map((item) => (
        <Tabs.Screen
          key={item.route}
          name={item.route}
          options={{
            title: item.title,
            href: null,
          }}
        />
      ))}

      {/* 3. Profile route exists (accessible via TopBar) but hidden from bottom bar */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          href: null,
        }}
      />

      {/* 4. Settings route exists in tabs but hidden from bottom bar */}
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          href: null,
        }}
      />
    </Tabs>
  );
}
