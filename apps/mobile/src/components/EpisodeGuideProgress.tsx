import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';
import { HydrationProgress } from '../services/api';

interface EpisodeGuideProgressProps {
  progress: HydrationProgress;
  onRetry?: () => void;
}

export function EpisodeGuideProgress({ progress, onRetry }: EpisodeGuideProgressProps) {
  const { colors, isDark } = useAppTheme();
  const isRefreshing = progress.status === 'refreshing' || progress.activeJobs > 0;
  const isFailed = progress.status === 'needs_retry' || (progress.failedJobs > 0 && progress.activeJobs === 0);

  if (isFailed) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorHeader}>
          <View style={styles.labelRow}>
            <Ionicons name="alert-circle-outline" size={18} color="#ff6b6b" style={styles.spinner} />
            <Text style={[styles.errorTitle, { color: colors.danger }]}>Could not load episode details</Text>
          </View>
          {onRetry && (
            <Pressable style={styles.retryButton} onPress={onRetry}>
              <Ionicons name="refresh-outline" size={13} color={colors.accent} style={{ marginRight: 4 }} />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          )}
        </View>
        <Text style={[styles.errorSub, { color: colors.textMuted }]}>
          {progress.lastError || 'Unable to retrieve complete episode information from provider.'}
        </Text>
      </View>
    );
  }

  if (!isRefreshing) return null;

  const label =
    progress.totalEpisodes > 0
      ? `${progress.hydratedEpisodes} of ${progress.totalEpisodes} episode details loaded`
      : 'Preparing episode guide';

  const detail = `${progress.runningJobs > 0 ? 'Updating now' : 'Waiting'}${
    progress.queuedJobs > 0
      ? `, ${progress.queuedJobs} batch${progress.queuedJobs === 1 ? '' : 'es'} queued`
      : ''
  }`;

  const pct = Math.max(0, Math.min(100, progress.percent));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <ActivityIndicator size="small" color={colors.accent} style={styles.spinner} />
          <Text style={[styles.title, { color: colors.textStrong }]}>{label}</Text>
        </View>
        <Text style={[styles.percentText, { color: isDark ? colors.accent : colors.accentDark }]}>{pct}%</Text>
      </View>

      <Text style={[styles.detailText, { color: colors.textMuted }]}>{detail}</Text>

      <View style={[styles.track, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(34, 31, 25, 0.1)' }]}>
        <View style={[styles.bar, { width: `${pct}%`, backgroundColor: colors.accent }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 191, 71, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 191, 71, 0.22)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginVertical: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  spinner: {
    marginRight: 8,
  },
  title: {
    color: '#f8f7f2',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  percentText: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
  },
  detailText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginBottom: 10,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.25)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginVertical: theme.spacing.sm,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  errorTitle: {
    color: '#ff8585',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  errorSub: {
    color: '#aeb1ac',
    fontSize: 12,
    lineHeight: 17,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 191, 71, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 191, 71, 0.3)',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 8,
  },
  retryText: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
});
