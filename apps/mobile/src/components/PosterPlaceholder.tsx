import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface PosterPlaceholderProps {
  title?: string;
  type?: string;
  iconSize?: number;
  showTitle?: boolean;
}

export function PosterPlaceholder({
  title,
  type,
  iconSize = 24,
  showTitle = true,
}: PosterPlaceholderProps) {
  const getIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'movie':
        return 'film-outline';
      case 'show':
        return 'tv-outline';
      case 'anime':
        return 'flame-outline';
      case 'game':
        return 'game-controller-outline';
      case 'book':
        return 'book-outline';
      default:
        return 'film-outline';
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Profile-banner matched gradient */}
      <LinearGradient
        colors={['rgba(255, 191, 71, 0.84)', 'rgba(53, 85, 109, 0.86)', 'rgba(22, 24, 25, 0.9)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.contentWrap}>
        <Ionicons name={getIcon()} size={iconSize} color="rgba(255, 255, 255, 0.85)" />
        {showTitle && title ? (
          <Text style={styles.titleText} numberOfLines={3}>
            {title}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contentWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  titleText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
