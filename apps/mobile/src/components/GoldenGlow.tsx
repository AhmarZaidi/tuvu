import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../context/ThemeContext';

export function GoldenGlow() {
  const { colors, isDark } = useAppTheme();

  const gradientColors = isDark
    ? [
        'rgba(255, 191, 71, 0.15)',
        'rgba(53, 85, 109, 0.08)',
        'rgba(23, 24, 25, 0.45)',
        'rgba(16, 17, 18, 0.92)',
      ]
    : [
        'rgba(255, 191, 71, 0.22)',
        'rgba(247, 241, 228, 0.6)',
        '#f5eee1',
        '#eee5d4',
      ];

  return (
    <LinearGradient
      colors={gradientColors as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={styles.gradient}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  gradient: {
    ...StyleSheet.absoluteFill,
  },
});
