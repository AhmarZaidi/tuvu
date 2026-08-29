import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { theme } from '../constants/theme';
import { DashboardEntry } from '../services/api';
import { StatusBadge, StatusTone } from './StatusBadge';

interface MediaCardProps {
  item: DashboardEntry;
  width?: number;
  variant?: 'grid' | 'compact';
}

function resolveStatusTone(status: string): StatusTone {
  const s = (status || '').toLowerCase();
  if (['watching', 'reading', 'playing'].includes(s)) return 'watching';
  if (['watched', 'completed', 'finished', 'up_to_date'].includes(s)) return 'complete';
  if (['paused', 'on_hold'].includes(s)) return 'paused';
  if (['dropped', 'stopped'].includes(s)) return 'stopped';
  return 'planned';
}

function formatStatus(status: string): string {
  return (status || '').replace(/_/g, ' ');
}

export function MediaCard({ item, width = 125, variant = 'grid' }: MediaCardProps) {
  const router = useRouter();
  const posterUrl = item.posterPath
    ? (item.posterPath.startsWith('http') ? item.posterPath : `https://image.tmdb.org/t/p/w342${item.posterPath}`)
    : null;

  // Calculate progress percentage
  let progressPercent = 0;
  if (item.progressTotal && item.progressTotal > 0 && typeof item.progressValue === 'number') {
    progressPercent = Math.min(100, Math.round((item.progressValue / item.progressTotal) * 100));
  } else if (item.totalRegularEpisodes && item.totalRegularEpisodes > 0 && item.progressEpisodes > 0) {
    progressPercent = Math.min(100, Math.round((item.progressEpisodes / item.totalRegularEpisodes) * 100));
  }

  let metaString = '';
  if (item.nextEpisode) {
    metaString = `S${item.nextEpisode.seasonNumber} E${item.nextEpisode.episodeNumber}`;
  } else if (item.year) {
    metaString = `${item.year}`;
  }

  if (variant === 'compact') {
    return (
      <Pressable
        style={styles.compactContainer}
        onPress={() => router.push(`/media/${item.mediaId}`)}
        android_ripple={{ color: 'rgba(255, 207, 92, 0.1)' }}
      >
        <View style={styles.compactPoster}>
          {posterUrl ? (
            <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.compactPlaceholderText} numberOfLines={2}>
                {item.title}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.compactInfo}>
          <Text style={styles.compactTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={styles.compactMetaRow}>
            {metaString ? <Text style={styles.metaText}>{metaString}</Text> : null}
            <StatusBadge label={formatStatus(item.status)} tone={resolveStatusTone(item.status)} />
          </View>
          {progressPercent > 0 && (
            <View style={styles.compactProgressTrack}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[styles.gridContainer, { width }]}
      onPress={() => router.push(`/media/${item.mediaId}`)}
      android_ripple={{ color: 'rgba(255, 207, 92, 0.1)' }}
    >
      <View style={styles.posterContainer}>
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            style={styles.poster}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText} numberOfLines={3}>
              {item.title}
            </Text>
          </View>
        )}

        {progressPercent > 0 && (
          <View style={styles.progressBarWrap}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
        )}
      </View>

      <View style={styles.metaBody}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>

        <View style={styles.footerRow}>
          {metaString ? <Text style={styles.metaText}>{metaString}</Text> : null}
          <StatusBadge
            label={formatStatus(item.status)}
            tone={resolveStatusTone(item.status)}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gridContainer: {
    marginRight: 12,
  },
  posterContainer: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.sm,
    backgroundColor: '#1c1d1e',
  },
  placeholderText: {
    color: theme.colors.textStrong,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  progressBarWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.accent,
  },
  metaBody: {
    marginTop: 6,
    gap: 3,
  },
  title: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  metaText: {
    color: theme.colors.textSubtle,
    fontSize: 11,
    fontWeight: '600',
  },
  // Compact list layout
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.borderRadius.md,
    padding: 8,
    marginBottom: 8,
  },
  compactPoster: {
    width: 44,
    height: 66,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
    backgroundColor: '#1c1d1e',
    marginRight: 12,
  },
  compactPlaceholderText: {
    color: theme.colors.textStrong,
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  compactInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  compactTitle: {
    color: theme.colors.textStrong,
    fontSize: 14,
    fontWeight: '700',
  },
  compactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactProgressTrack: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
});
