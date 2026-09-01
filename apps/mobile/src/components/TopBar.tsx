import React from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { Image } from './AppImage';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAppTheme } from '../context/ThemeContext';
import { useSearch } from '../context/SearchContext';
import { api } from '../services/api';
import { resolveImageUrl } from '../utils/images';

interface TopBarProps {
  onSearchPress?: () => void;
}

export function TopBar({ onSearchPress }: TopBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors, isDark, theme } = useAppTheme();
  const { searchQuery, setSearchQuery, searchInputRef, submitSearch, clearSearch } = useSearch();

  const isProfile = pathname ? pathname.includes('profile') : false;

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.getMe(),
  });

  const avatarUrl = resolveImageUrl(meData?.profile?.avatarUrl);
  const initial = (meData?.user?.displayName || meData?.user?.username || 'T')[0].toUpperCase();

  return (
    <View
      style={[
        styles.topbar,
        {
          paddingTop: Math.max(insets.top + 10, 22),
          backgroundColor: isDark ? colors.background : colors.backgroundPanel,
          borderBottomColor: colors.border,
        },
      ]}
    >
      {/* Official App Icon */}
      <Pressable
        style={styles.brandIconOnly}
        onPress={() => router.push('/' as any)}
        hitSlop={6}
      >
        <Image
          source={require('../../assets/app-icon.png')}
          style={styles.brandAppIcon}
          contentFit="cover"
        />
      </Pressable>

      {/* Consolidated Interactive Search Pill */}
      <View
        style={[
          styles.searchPill,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(34, 31, 25, 0.05)',
            borderColor: colors.border,
            borderRadius: theme.borderRadius.pill,
          },
        ]}
      >
        <Ionicons name="search" size={16} color={colors.textSubtle} style={styles.searchIcon} />
        <TextInput
          ref={searchInputRef as any}
          style={[styles.searchInput, { color: colors.textStrong }]}
          placeholder="Search any media..."
          placeholderTextColor={colors.textSubtle}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={() => submitSearch()}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={clearSearch} hitSlop={10} style={styles.clearButton}>
            <Ionicons name="close-circle" size={16} color={colors.textSubtle} />
          </Pressable>
        )}
      </View>

      {/* Profile Avatar Button */}
      <Pressable style={styles.profileButton} onPress={() => router.push('/profile' as any)} hitSlop={4}>
        <View
          style={[
            styles.avatarCircle,
            {
              backgroundColor: isDark ? 'rgba(255, 207, 92, 0.15)' : 'rgba(240, 168, 36, 0.2)',
              borderColor: colors.accent,
              borderWidth: isProfile ? 2.5 : 1,
            },
          ]}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} contentFit="cover" />
          ) : (
            <Text style={[styles.avatarInitial, { color: isDark ? colors.accent : colors.accentContrast }]}>{initial}</Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  brandIconOnly: {
    width: 36,
    height: 36,
    borderRadius: 9,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandAppIcon: {
    width: '100%',
    height: '100%',
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
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
    height: '100%',
  },
  clearButton: {
    marginLeft: 6,
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
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
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
