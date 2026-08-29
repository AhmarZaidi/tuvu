import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';

export type StatusTone = 'watching' | 'planned' | 'complete' | 'paused' | 'stopped' | 'neutral';

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
}

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
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
    <View style={[styles.badge, { backgroundColor: styleTone.bg }]}>
      <Text style={[styles.text, { color: styleTone.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.pill,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
