import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { theme } from '../../constants/theme';
import { TopBar } from '../../components/TopBar';

export default function ProfileScreen() {
  const router = useRouter();

  const { data: statsData, isLoading: isStatsLoading } = useQuery({
    queryKey: ['profileStats'],
    queryFn: () => api.getProfileStats(),
  });

  return (
    <View style={styles.container}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Hero Card matching web */}
        <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={28} color={theme.colors.accent} />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>Tuvu User</Text>
          <Text style={styles.userHandle}>@tuvu_owner</Text>
          <Text style={styles.userRole}>Single-User Local Session • Active</Text>
        </View>
      </View>

      {/* Library Stats Grid matching web .stats-grid */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Library Overview</Text>
        {isStatsLoading ? (
          <ActivityIndicator size="small" color={theme.colors.accent} style={{ marginVertical: 16 }} />
        ) : (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{statsData?.stats?.showsCount ?? 0}</Text>
              <Text style={styles.statLabel}>Shows</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{statsData?.stats?.moviesCount ?? 0}</Text>
              <Text style={styles.statLabel}>Movies</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{statsData?.stats?.animeCount ?? 0}</Text>
              <Text style={styles.statLabel}>Anime</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{statsData?.stats?.booksCount ?? 0}</Text>
              <Text style={styles.statLabel}>Books</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{statsData?.stats?.gamesCount ?? 0}</Text>
              <Text style={styles.statLabel}>Games</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{statsData?.stats?.episodesWatched ?? 0}</Text>
              <Text style={styles.statLabel}>Episodes</Text>
            </View>
          </View>
        )}
      </View>

      {/* Profile Tools & Navigation */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Tools & Navigation</Text>

        <Pressable style={styles.actionRow} onPress={() => router.push('/library')}>
          <View style={styles.actionIconWrap}>
            <Ionicons name="library-outline" size={20} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>All Library</Text>
            <Text style={styles.actionDesc}>Filter across your entire library collection</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSubtle} />
        </Pressable>

        <Pressable style={styles.actionRow} onPress={() => router.push('/settings' as any)}>
          <View style={styles.actionIconWrap}>
            <Ionicons name="settings-outline" size={20} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Settings</Text>
            <Text style={styles.actionDesc}>Account, Appearance, Server, and Providers</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSubtle} />
        </Pressable>

        <Pressable style={styles.actionRow} onPress={() => router.push('/settings/import' as any)}>
          <View style={styles.actionIconWrap}>
            <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>TV Time Import</Text>
            <Text style={styles.actionDesc}>Import backup zip archives and watch logs</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSubtle} />
        </Pressable>
      </View>

      {/* App Info Footer */}
      <View style={styles.infoFooter}>
        <Text style={styles.infoText}>Tuvu Mobile v1.0.0 (Expo SDK 57)</Text>
        <Text style={styles.infoSubtext}>Obsidian & Warm Gold Design System</Text>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 207, 92, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.3)',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.textStrong,
  },
  userHandle: {
    fontSize: 12,
    color: theme.colors.accent,
    fontWeight: '700',
    marginTop: 1,
  },
  userRole: {
    fontSize: 11,
    color: theme.colors.textSubtle,
    marginTop: 3,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.textStrong,
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCard: {
    flex: 1 / 3 - 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff4d3',
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.textSubtle,
    marginTop: 2,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    gap: 12,
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textStrong,
  },
  actionDesc: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  infoFooter: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  infoText: {
    fontSize: 12,
    color: theme.colors.textSubtle,
  },
  infoSubtext: {
    fontSize: 11,
    color: theme.colors.textSubtle,
    marginTop: 3,
  },
});
