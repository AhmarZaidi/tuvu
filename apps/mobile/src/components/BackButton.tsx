import React from 'react';
import { StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';

interface BackButtonProps {
  onPress?: () => void;
  fallbackRoute?: string;
  forceFallback?: boolean;
  style?: any;
}

export function BackButton({ onPress, fallbackRoute = '/(tabs)', forceFallback = false, style }: BackButtonProps) {
  const router = useRouter();
  const { colors } = useAppTheme();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (forceFallback) {
      router.replace(fallbackRoute as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackRoute as any);
    }
  };

  return (
    <Pressable
      style={[
        styles.button,
        {
          backgroundColor: colors.isDark ? 'rgba(16, 17, 18, 0.75)' : 'rgba(255, 253, 248, 0.9)',
          borderColor: colors.border,
        },
        style,
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Ionicons name="arrow-back" size={18} color={colors.textStrong} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
});
