import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
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
  const { colors } = useAppTheme();

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
      {/* Card 1: Next up / Active */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.055)' : colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <Ionicons name="play" size={13} color={colors.accent} style={styles.icon} />
        <Text style={[styles.label, { color: colors.textMuted }]} numberOfLines={1}>
          {kind === 'shows' ? 'Next up' : 'Active'}
        </Text>
        <Text style={[styles.value, { color: colors.textStrong }]} numberOfLines={1}>
          {nextUpCount}
        </Text>
      </View>

      {/* Card 2: Favorites */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.055)' : colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <Ionicons name="star" size={13} color={colors.accent} style={styles.icon} />
        <Text style={[styles.label, { color: colors.textMuted }]} numberOfLines={1}>Favorites</Text>
        <Text style={[styles.value, { color: colors.textStrong }]} numberOfLines={1}>{favorites}</Text>
      </View>

      {/* Card 3: Tracked */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.055)' : colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <Ionicons name="bar-chart" size={13} color={colors.accent} style={styles.icon} />
        <Text style={[styles.label, { color: colors.textMuted }]} numberOfLines={1}>Tracked</Text>
        <Text style={[styles.value, { color: colors.textStrong }]} numberOfLines={1}>{tracked}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    gap: 6,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 4,
  },
  icon: {
    marginRight: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
  value: {
    fontSize: 13,
    fontWeight: '800',
  },
});
