import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { theme } from '../constants/theme';
import { HydrationProgress } from '../services/api';

interface EpisodeGuideProgressProps {
  progress: HydrationProgress;
}

export function EpisodeGuideProgress({ progress }: EpisodeGuideProgressProps) {
  const isRefreshing = progress.status === 'refreshing' || progress.activeJobs > 0;
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
          <ActivityIndicator size="small" color={theme.colors.accent} style={styles.spinner} />
          <Text style={styles.title}>{label}</Text>
        </View>
        <Text style={styles.percentText}>{pct}%</Text>
      </View>

      <Text style={styles.detailText}>{detail}</Text>

      <View style={styles.track}>
        <View style={[styles.bar, { width: `${pct}%` }]} />
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
});
