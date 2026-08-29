import React from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

interface TopBarProps {
  onSearchPress?: () => void;
}

export function TopBar({ onSearchPress }: TopBarProps) {
  const router = useRouter();

  return (
    <View style={styles.topbar}>
      {/* Brand Logo & Name */}
      <Pressable style={styles.brand} onPress={() => router.push('/' as any)}>
        <View style={styles.brandBadge}>
          <Ionicons name="tv" size={16} color={theme.colors.accentContrast} />
        </View>
        <Text style={styles.brandText}>Tuvu</Text>
      </Pressable>

      {/* Search Pill Input */}
      <Pressable
        style={styles.searchPill}
        onPress={onSearchPress || (() => router.push('/explore' as any))}
      >
        <Ionicons name="search" size={16} color={theme.colors.textSubtle} style={styles.searchIcon} />
        <Text style={styles.searchPlaceholder}>Search any media</Text>
      </Pressable>

      {/* Profile Avatar Button */}
      <Pressable style={styles.profileButton} onPress={() => router.push('/profile' as any)}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitial}>T</Text>
        </View>
        <View style={styles.notificationDot} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 10,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandBadge: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.accent,
    letterSpacing: -0.2,
  },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.borderRadius.pill,
    height: 38,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchPlaceholder: {
    color: theme.colors.textSubtle,
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
    backgroundColor: 'rgba(255, 207, 92, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: theme.colors.accent,
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
    backgroundColor: theme.colors.notification,
    borderWidth: 1.5,
    borderColor: theme.colors.background,
  },
});
