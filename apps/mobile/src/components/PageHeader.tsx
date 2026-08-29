import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function PageHeader({
  eyebrow = 'Library',
  title,
  actionLabel,
  onAction,
}: PageHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.titles}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>

      {actionLabel && onAction && (
        <Pressable style={styles.actionButton} onPress={onAction}>
          <Ionicons name="add" size={16} color={theme.colors.accentContrast} />
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: 14,
    paddingBottom: 10,
  },
  titles: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff4d3',
    letterSpacing: -0.5,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 4,
  },
  actionText: {
    color: theme.colors.accentContrast,
    fontSize: 12,
    fontWeight: '800',
  },
});
