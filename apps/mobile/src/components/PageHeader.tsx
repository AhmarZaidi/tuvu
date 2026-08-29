import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
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
  const { colors } = useAppTheme();

  return (
    <View style={styles.container}>
      <View style={styles.titles}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>{eyebrow}</Text>
        <Text style={[styles.title, { color: colors.textStrong }]}>{title}</Text>
      </View>

      {onAction && (
        <Pressable
          style={[
            styles.circularAddButton,
            {
              backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(34, 31, 25, 0.055)',
              borderColor: colors.border,
            },
          ]}
          onPress={onAction}
          accessibilityLabel={actionLabel || 'Add Media'}
          hitSlop={8}
        >
          <Ionicons name="add" size={22} color={colors.accent} />
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
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  circularAddButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
