import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';

export type StatusTone = 'watching' | 'planned' | 'complete' | 'paused' | 'stopped' | 'neutral';

export function resolveStatusTone(status: string): StatusTone {
  const s = (status || '').toLowerCase();
  if (['watching', 'reading', 'playing'].includes(s)) return 'watching';
  if (['watched', 'completed', 'finished', 'up_to_date'].includes(s)) return 'complete';
  if (['paused', 'on_hold'].includes(s)) return 'paused';
  if (['dropped', 'stopped'].includes(s)) return 'stopped';
  return 'planned';
}

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  numberOfLines?: number;
  compact?: boolean;
}

export function StatusBadge({ label, tone = 'neutral', numberOfLines = 1, compact = false }: StatusBadgeProps) {
  let styleTone = theme.colors.status.planned;

  if (tone === 'watching') {
    styleTone = theme.colors.status.watching;
  } else if (tone === 'complete') {
    styleTone = theme.colors.status.complete;
  } else if (tone === 'paused') {
    styleTone = theme.colors.status.paused;
  } else if (tone === 'stopped') {
    styleTone = theme.colors.status.stopped;
  }

  return (
    <View style={[styles.badge, compact && styles.badgeCompact, { backgroundColor: styleTone.bg }]}>
      <Text
        style={[styles.text, compact && styles.textCompact, { color: styleTone.text }]}
        numberOfLines={numberOfLines}
        ellipsizeMode="tail"
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.pill,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  badgeCompact: {
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  text: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  textCompact: {
    fontSize: 8.5,
    letterSpacing: 0.2,
  },
});
