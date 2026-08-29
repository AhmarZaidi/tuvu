import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';

interface TopBarProps {
  onSearchPress?: () => void;
}

export function TopBar({ onSearchPress }: TopBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, theme } = useAppTheme();

  return (
    <View
      style={[
        styles.topbar,
        {
          paddingTop: Math.max(insets.top + 4, 14),
          backgroundColor: colors.isDark ? colors.background : colors.backgroundPanel,
          borderBottomColor: colors.border,
        },
      ]}
    >
      {/* Brand Icon Only (compact mode matching web client) */}
      <Pressable
        style={[styles.brandIconOnly, { backgroundColor: colors.accent, shadowColor: colors.accent }]}
        onPress={() => router.push('/' as any)}
        hitSlop={6}
      >
        <Ionicons name="tv" size={18} color={colors.accentContrast} />
      </Pressable>

      {/* Search Pill Input */}
      <Pressable
        style={[
          styles.searchPill,
          {
            backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(34, 31, 25, 0.05)',
            borderColor: colors.border,
            borderRadius: theme.borderRadius.pill,
          },
        ]}
        onPress={onSearchPress || (() => router.push('/explore' as any))}
      >
        <Ionicons name="search" size={16} color={colors.textSubtle} style={styles.searchIcon} />
        <Text style={[styles.searchPlaceholder, { color: colors.textSubtle }]}>Search any media</Text>
      </Pressable>

      {/* Profile Avatar Button */}
      <Pressable style={styles.profileButton} onPress={() => router.push('/profile' as any)}>
        <View
          style={[
            styles.avatarCircle,
            {
              backgroundColor: colors.isDark ? 'rgba(255, 207, 92, 0.15)' : 'rgba(240, 168, 36, 0.2)',
              borderColor: colors.accent,
            },
          ]}
        >
          <Text style={[styles.avatarInitial, { color: colors.isDark ? colors.accent : colors.accentContrast }]}>T</Text>
        </View>
        <View style={[styles.notificationDot, { backgroundColor: colors.notification, borderColor: colors.background }]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  brandIconOnly: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    height: 38,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchPlaceholder: {
    fontSize: 13,
  },
  profileButton: {
    position: 'relative',
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 14,
    fontWeight: '800',
  },
  notificationDot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
});
