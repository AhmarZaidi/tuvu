import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';

interface SectionHeaderProps {
  title: string;
  count?: number;
  rightAction?: React.ReactNode;
}

export function SectionHeader({ title, count, rightAction }: SectionHeaderProps) {
  const { colors, isDark, theme } = useAppTheme();

  return (
    <View style={styles.container}>
      <View style={styles.leftGroup}>
        <Text style={[styles.title, { color: colors.textStrong }]}>{title}</Text>
        {typeof count === 'number' && (
          <View
            style={[
              styles.countBadge,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(34, 31, 25, 0.07)',
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.countText, { color: isDark ? colors.accent : colors.accentDark }]}>
              {count}
            </Text>
          </View>
        )}
      </View>
      {rightAction ? <View style={styles.rightGroup}>{rightAction}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: 1,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
