import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { DashboardEntry } from '../services/api';

interface DashboardStatsProps {
  entries: DashboardEntry[];
  kind: string;
  totalTracked?: number;
  statusCounts?: Record<string, number>;
}

export function DashboardStats({
  entries = [],
  kind = 'shows',
  totalTracked,
  statusCounts,
}: DashboardStatsProps) {
  const active = statusCounts
    ? (statusCounts['watching'] || 0)
    : entries.filter((e) => ['watching', 'reading', 'playing'].includes(e.status)).length;

  const nextUpCount = kind === 'shows'
    ? entries.filter((e) => e.nextEpisode).length
    : active;

  const favorites = entries.filter((e) => e.isFavorite).length;
  const tracked = totalTracked ?? entries.length;

  return (
    <View style={styles.container}>
      {/* Card 1: Next up / In progress */}
      <View style={styles.card}>
        <Ionicons name="play" size={15} color={theme.colors.accent} />
        <View style={styles.meta}>
          <Text style={styles.label}>{kind === 'shows' ? 'Next up' : 'In progress'}</Text>
          <Text style={styles.value}>{nextUpCount}</Text>
        </View>
      </View>

      {/* Card 2: Favorites */}
      <View style={styles.card}>
        <Ionicons name="star" size={15} color={theme.colors.accent} />
        <View style={styles.meta}>
          <Text style={styles.label}>Favorites</Text>
          <Text style={styles.value}>{favorites}</Text>
        </View>
      </View>

      {/* Card 3: Tracked */}
      <View style={styles.card}>
        <Ionicons name="bar-chart" size={15} color={theme.colors.accent} />
        <View style={styles.meta}>
          <Text style={styles.label}>Tracked</Text>
          <Text style={styles.value}>{tracked}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    gap: 8,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 9,
    paddingHorizontal: 8,
    gap: 6,
  },
  meta: {
    alignItems: 'flex-start',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  value: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff4d3',
    lineHeight: 16,
  },
});
