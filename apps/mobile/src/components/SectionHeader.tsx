import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';

interface SectionHeaderProps {
  title: string;
  count?: number;
}

export function SectionHeader({ title, count }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {typeof count === 'number' && (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.textStrong,
    letterSpacing: -0.2,
  },
  countBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.accent,
  },
});
