import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api, MeResponse } from '../../services/api';
import { useAppTheme } from '../../context/ThemeContext';
import { TopBar } from '../../components/TopBar';
import { GoldenGlow } from '../../components/GoldenGlow';
import { ProfileHeroCard } from '../../components/ProfileHeroCard';
import { BottomSheet } from '../../components/BottomSheet';

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, isDark } = useAppTheme();

  // BottomSheet states
  const [showNotificationsSheet, setShowNotificationsSheet] = useState(false);
  const [showMergeMediaSheet, setShowMergeMediaSheet] = useState(false);
  const [showMessagesSheet, setShowMessagesSheet] = useState(false);
  const [showLogoutSheet, setShowLogoutSheet] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Fetch Session / User info
  const { data: meData, refetch: refetchMe } = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: () => api.getMe(),
  });

  // Fetch Library Stats
  const { data: statsData, isLoading: isStatsLoading } = useQuery({
    queryKey: ['profileStats'],
    queryFn: () => api.getProfileStats(),
  });

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await api.logout();
      setShowLogoutSheet(false);
      queryClient.clear();
      showToast('You have been logged out of this session.');
    } catch (e: any) {
      showToast(e?.message || 'Could not log out.');
    } finally {
      setLoggingOut(false);
    }
  };

  const visibility = meData?.profile?.visibility || 'private';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GoldenGlow />
      <TopBar />

      {/* Floating toast notification */}
      {toastMessage && (
        <View style={[styles.floatingToast, { backgroundColor: isDark ? '#1d1911' : '#fff7e0', borderColor: colors.accent }]}>
          <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
          <Text style={[styles.floatingToastText, { color: colors.textStrong }]}>{toastMessage}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {/* Page Heading matching web */}
        <View style={styles.headingSection}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>PROFILE</Text>
          <Text style={[styles.pageTitle, { color: colors.textStrong }]}>Your profile</Text>
          <Text style={[styles.pageDesc, { color: colors.textMuted }]}>Stats, recent activity, favorites, and tools gather here.</Text>
        </View>

        {/* Profile Hero Card with exact yellow-to-blue gradient banner and camera buttons */}
        <ProfileHeroCard meData={meData} editable={true} onRefresh={refetchMe} />

        {/* Profile Tools Grid matching web .profile-actions */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>Profile Tools</Text>
          <View style={styles.toolsGrid}>
            <Pressable
              style={[styles.toolButton, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}
              onPress={() => setShowNotificationsSheet(true)}
            >
              <View style={[styles.toolIconWrap, { backgroundColor: isDark ? 'rgba(255, 207, 92, 0.1)' : 'rgba(240, 168, 36, 0.18)' }]}>
                <Ionicons name="notifications-outline" size={20} color={colors.accent} />
              </View>
              <Text style={[styles.toolLabel, { color: colors.textStrong }]}>Notifications</Text>
            </Pressable>

            <Pressable
              style={[styles.toolButton, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}
              onPress={() => router.push('/(tabs)/settings' as any)}
            >
              <View style={[styles.toolIconWrap, { backgroundColor: isDark ? 'rgba(255, 207, 92, 0.1)' : 'rgba(240, 168, 36, 0.18)' }]}>
                <Ionicons name="settings-outline" size={20} color={colors.accent} />
              </View>
              <Text style={[styles.toolLabel, { color: colors.textStrong }]}>Settings</Text>
            </Pressable>

            <Pressable
              style={[styles.toolButton, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}
              onPress={() => router.push('/library')}
            >
              <View style={[styles.toolIconWrap, { backgroundColor: isDark ? 'rgba(255, 207, 92, 0.1)' : 'rgba(240, 168, 36, 0.18)' }]}>
                <Ionicons name="library-outline" size={20} color={colors.accent} />
              </View>
              <Text style={[styles.toolLabel, { color: colors.textStrong }]}>All Library</Text>
            </Pressable>

            <Pressable
              style={[styles.toolButton, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}
              onPress={() => router.push('/settings/import' as any)}
            >
              <View style={[styles.toolIconWrap, { backgroundColor: isDark ? 'rgba(255, 207, 92, 0.1)' : 'rgba(240, 168, 36, 0.18)' }]}>
                <Ionicons name="cloud-upload-outline" size={20} color={colors.accent} />
              </View>
              <Text style={[styles.toolLabel, { color: colors.textStrong }]}>TV Time Import</Text>
            </Pressable>

            <Pressable
              style={[styles.toolButton, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}
              onPress={() => setShowMergeMediaSheet(true)}
            >
              <View style={[styles.toolIconWrap, { backgroundColor: isDark ? 'rgba(255, 207, 92, 0.1)' : 'rgba(240, 168, 36, 0.18)' }]}>
                <Ionicons name="git-merge-outline" size={20} color={colors.accent} />
              </View>
              <Text style={[styles.toolLabel, { color: colors.textStrong }]}>Merge Media</Text>
            </Pressable>

            <Pressable
              style={[styles.toolButton, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}
              onPress={() => setShowMessagesSheet(true)}
            >
              <View style={[styles.toolIconWrap, { backgroundColor: isDark ? 'rgba(255, 207, 92, 0.1)' : 'rgba(240, 168, 36, 0.18)' }]}>
                <Ionicons name="mail-outline" size={20} color={colors.accent} />
              </View>
              <Text style={[styles.toolLabel, { color: colors.textStrong }]}>Messages</Text>
            </Pressable>
          </View>
        </View>

        {/* Session Status Card matching web EmptyState with ShieldCheck */}
        <View style={[styles.sessionCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
          <View style={styles.shieldIcon}>
            <Ionicons name="shield-checkmark" size={22} color="#5fe388" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sessionTitle, { color: colors.textStrong }]}>Session active</Text>
            <Text style={[styles.sessionDesc, { color: colors.textMuted }]}>
              Profile visibility is {visibility} (single-user local session).
            </Text>
          </View>
        </View>

        {/* Library Overview Stats Grid matching web .stats-grid */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>Library Overview</Text>
          {isStatsLoading ? (
            <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 16 }} />
          ) : (
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{statsData?.stats?.showsCount ?? 0}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Shows</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{statsData?.stats?.moviesCount ?? 0}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Movies</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{statsData?.stats?.animeCount ?? 0}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Anime</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{statsData?.stats?.booksCount ?? 0}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Books</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{statsData?.stats?.gamesCount ?? 0}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Games</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{statsData?.stats?.episodesWatched ?? 0}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Episodes</Text>
              </View>
            </View>
          )}
        </View>

        {/* Session Management / Logout Danger Row - Logout button moved to the RIGHT */}
        <View style={styles.dangerCard}>
          <View style={styles.dangerHeader}>
            <View style={styles.dangerIconWrap}>
              <Ionicons name="log-out-outline" size={20} color="#ff6b6b" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dangerTitle, { color: colors.textStrong }]}>Session Management</Text>
              <Text style={[styles.dangerDesc, { color: colors.textMuted }]}>Log out of your current session on this device.</Text>
            </View>
          </View>
          <Pressable
            style={styles.logoutButton}
            onPress={() => setShowLogoutSheet(true)}
          >
            <Text style={styles.logoutButtonText}>Log out</Text>
          </Pressable>
        </View>

        {/* App Info Footer */}
        <View style={styles.infoFooter}>
          <Text style={[styles.infoText, { color: colors.textMuted }]}>Tuvu Mobile v1.0.0 (Expo SDK 57)</Text>
          <Text style={[styles.infoSubtext, { color: colors.textSubtle }]}>Cloudflare Workers • D1 SQLite Database</Text>
        </View>
      </ScrollView>

      {/* ────────────────────────────────────────────── */}
      {/* 1. Notifications Bottom Sheet                  */}
      {/* ────────────────────────────────────────────── */}
      <BottomSheet
        visible={showNotificationsSheet}
        onClose={() => setShowNotificationsSheet(false)}
        title="Notifications"
        subtitle="Recent activity and update alerts"
        icon="notifications-outline"
      >
        <View style={[styles.emptySheetCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)', borderColor: colors.border }]}>
          <View style={styles.emptyIconBox}>
            <Ionicons name="checkmark-done" size={24} color="#5fe388" />
          </View>
          <Text style={[styles.emptySheetTitle, { color: colors.textStrong }]}>You're all caught up!</Text>
          <Text style={[styles.emptySheetDesc, { color: colors.textMuted }]}>
            No unread notifications at this time. Tracking updates and backup events will show up here.
          </Text>
        </View>

        <Pressable
          style={[styles.sheetDoneBtn, { backgroundColor: colors.accent }]}
          onPress={() => setShowNotificationsSheet(false)}
        >
          <Text style={[styles.sheetDoneText, { color: colors.accentContrast }]}>Done</Text>
        </Pressable>
      </BottomSheet>

      {/* ────────────────────────────────────────────── */}
      {/* 2. Merge Media Utility Bottom Sheet             */}
      {/* ────────────────────────────────────────────── */}
      <BottomSheet
        visible={showMergeMediaSheet}
        onClose={() => setShowMergeMediaSheet(false)}
        title="Merge Media Utility"
        subtitle="Combine custom imports with canonical entries"
        icon="git-merge-outline"
      >
        <View style={[styles.emptySheetCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)', borderColor: colors.border }]}>
          <Text style={[styles.emptySheetTitle, { color: colors.textStrong }]}>Reconcile Duplicate Media</Text>
          <Text style={[styles.emptySheetDesc, { color: colors.textMuted }]}>
            Merge media allows alias resolution between local TV Time import entries and verified TMDB, RAWG, or OpenLibrary entries without losing watch history.
          </Text>
        </View>

        <Pressable
          style={[styles.sheetDoneBtn, { backgroundColor: colors.accent }]}
          onPress={() => setShowMergeMediaSheet(false)}
        >
          <Text style={[styles.sheetDoneText, { color: colors.accentContrast }]}>Close</Text>
        </Pressable>
      </BottomSheet>

      {/* ────────────────────────────────────────────── */}
      {/* 3. Messages Bottom Sheet                       */}
      {/* ────────────────────────────────────────────── */}
      <BottomSheet
        visible={showMessagesSheet}
        onClose={() => setShowMessagesSheet(false)}
        title="Direct Messages"
        subtitle="Social and messaging features"
        icon="mail-outline"
      >
        <View style={[styles.emptySheetCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)', borderColor: colors.border }]}>
          <View style={styles.emptyIconBox}>
            <Ionicons name="chatbubbles-outline" size={24} color={colors.accent} />
          </View>
          <Text style={[styles.emptySheetTitle, { color: colors.textStrong }]}>Local Single-User Session</Text>
          <Text style={[styles.emptySheetDesc, { color: colors.textMuted }]}>
            Direct messages and connection requests are unavailable in local single-user mode.
          </Text>
        </View>

        <Pressable
          style={[styles.sheetDoneBtn, { backgroundColor: colors.accent }]}
          onPress={() => setShowMessagesSheet(false)}
        >
          <Text style={[styles.sheetDoneText, { color: colors.accentContrast }]}>Close</Text>
        </Pressable>
      </BottomSheet>

      {/* ────────────────────────────────────────────── */}
      {/* 4. Logout Confirmation Bottom Sheet            */}
      {/* ────────────────────────────────────────────── */}
      <BottomSheet
        visible={showLogoutSheet}
        onClose={() => setShowLogoutSheet(false)}
        title="Confirm Logout"
        subtitle="Are you sure you want to end your current session?"
        icon="log-out-outline"
        iconColor="#ff6b6b"
      >
        <Text style={[styles.logoutSheetText, { color: colors.textMuted }]}>
          You can sign back in at any time. Your locally tracked media and notes remain safely stored in the database.
        </Text>

        <View style={styles.sheetBtnRow}>
          <Pressable
            style={[styles.sheetSecondaryBtn, { borderColor: colors.border }]}
            onPress={() => setShowLogoutSheet(false)}
            disabled={loggingOut}
          >
            <Text style={[styles.sheetSecondaryText, { color: colors.textMuted }]}>Cancel</Text>
          </Pressable>

          <Pressable
            style={styles.sheetDangerBtn}
            onPress={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sheetDangerText}>Log out</Text>
            )}
          </Pressable>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  floatingToast: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 100,
  },
  floatingToastText: {
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    padding: 14,
    gap: 14,
    paddingBottom: 40,
  },
  headingSection: {
    paddingVertical: 6,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  pageDesc: {
    fontSize: 13,
    marginTop: 4,
  },
  sectionCard: {
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 12,
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  toolButton: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    gap: 10,
  },
  toolIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolLabel: {
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  shieldIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(95, 227, 136, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  sessionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCard: {
    width: '31%',
    borderRadius: 6,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  dangerCard: {
    backgroundColor: 'rgba(255, 107, 107, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.2)',
    padding: 14,
    gap: 12,
  },
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dangerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  dangerDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  logoutButton: {
    alignSelf: 'flex-end', // Moved to the RIGHT side
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.35)',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  logoutButtonText: {
    color: '#ff8080',
    fontSize: 12,
    fontWeight: '800',
  },
  infoFooter: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoText: {
    fontSize: 12,
    fontWeight: '700',
  },
  infoSubtext: {
    fontSize: 11,
    marginTop: 2,
  },
  emptySheetCard: {
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  emptyIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(95, 227, 136, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptySheetTitle: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySheetDesc: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  sheetDoneBtn: {
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
  },
  sheetDoneText: {
    fontSize: 14,
    fontWeight: '800',
  },
  logoutSheetText: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  sheetBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  sheetSecondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  sheetSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sheetDangerBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#ff6b6b',
  },
  sheetDangerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});
