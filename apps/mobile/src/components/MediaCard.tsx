import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { DashboardEntry } from '../services/api';
import { StatusBadge, StatusTone } from './StatusBadge';

interface MediaCardProps {
  item: DashboardEntry;
  width?: number;
  variant?: 'grid' | 'compact';
  onMarkNext?: (episodeId: string) => Promise<void>;
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

export function MediaCard({
  item,
  width = 160,
  variant = 'grid',
  onMarkNext,
}: MediaCardProps) {
  const router = useRouter();
  const [marking, setMarking] = useState(false);

  const posterUrl = item.posterPath
    ? (item.posterPath.startsWith('http') ? item.posterPath : `https://tmdb-image-prod.b-cdn.net/t/p/w342${item.posterPath}`)
    : null;

  // Calculate progress percentage
  let progressPercent = 0;
  if (item.progressTotal && item.progressTotal > 0 && typeof item.progressValue === 'number') {
    progressPercent = Math.min(100, Math.round((item.progressValue / item.progressTotal) * 100));
  } else if (item.totalRegularEpisodes && item.totalRegularEpisodes > 0 && item.progressEpisodes > 0) {
    progressPercent = Math.min(100, Math.round((item.progressEpisodes / item.totalRegularEpisodes) * 100));
  } else if (['watched', 'completed', 'finished'].includes(item.status)) {
    progressPercent = 100;
  }

  const nextLabel = item.nextEpisode
    ? `S${item.nextEpisode.seasonNumber} E${item.nextEpisode.episodeNumber}`
    : null;
  const displayYear = item.year ? String(item.year) : '';

  const handleQuickWatch = async () => {
    if (!item.nextEpisode?.id || !onMarkNext) return;
    setMarking(true);
    try {
      await onMarkNext(item.nextEpisode.id);
    } finally {
      setMarking(false);
    }
  };

  // Compact List Row View
  if (variant === 'compact') {
    return (
      <View style={styles.compactWrap}>
        <Pressable
          style={styles.compactCard}
          onPress={() => router.push(`/media/${item.mediaId}`)}
          android_ripple={{ color: 'rgba(255, 207, 92, 0.1)' }}
        >
          {/* Mini Poster with Progress Overlay */}
          <View style={styles.compactPosterWrap}>
            {posterUrl ? (
              <>
                <Image source={{ uri: posterUrl }} style={[styles.posterFill, { opacity: 0.25 }]} contentFit="cover" />
                <View style={[styles.clipWrap, { width: `${progressPercent}%` }]}>
                  <Image source={{ uri: posterUrl }} style={[styles.posterFill, { width: 50 }]} contentFit="cover" />
                </View>
              </>
            ) : (
              <View style={styles.compactPlaceholder}>
                <Text style={styles.compactPlaceholderText} numberOfLines={2}>{item.title}</Text>
              </View>
            )}
          </View>

          {/* Body */}
          <View style={styles.compactBody}>
            <Text style={styles.compactTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.compactMeta}>{nextLabel ?? displayYear}</Text>
            <StatusBadge label={formatStatus(item.status)} tone={resolveStatusTone(item.status)} />
          </View>
        </Pressable>

        {/* Quick Watch Button */}
        {item.nextEpisode && onMarkNext && (
          <Pressable style={styles.quickWatchThinner} onPress={handleQuickWatch} disabled={marking}>
            {marking ? (
              <ActivityIndicator size="small" color={theme.colors.accent} />
            ) : (
              <>
                <Ionicons name="checkmark" size={13} color={theme.colors.accent} />
                <Text style={styles.quickWatchText}>Mark watched</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    );
  }

  // Grid Card View
  return (
    <View style={[styles.gridCardContainer, { width }]}>
      <Pressable
        style={styles.posterContainer}
        onPress={() => router.push(`/media/${item.mediaId}`)}
        android_ripple={{ color: 'rgba(255, 207, 92, 0.1)' }}
      >
        {posterUrl ? (
          <>
            {/* Background dimmed poster (0.25 opacity) */}
            <Image
              source={{ uri: posterUrl }}
              style={[styles.posterFill, { opacity: 0.25 }]}
              contentFit="cover"
            />

            {/* Foreground bright poster revealed horizontally via width percentage */}
            {progressPercent > 0 && (
              <View style={[styles.clipWrap, { width: `${progressPercent}%` }]}>
                <Image
                  source={{ uri: posterUrl }}
                  style={[styles.posterFill, { width }]}
                  contentFit="cover"
                />
              </View>
            )}
          </>
        ) : (
          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholderText} numberOfLines={3}>{item.title}</Text>
          </View>
        )}

        {/* Top-Left Overlay: Status Chip */}
        <View style={styles.topLeftOverlay}>
          <StatusBadge label={formatStatus(item.status)} tone={resolveStatusTone(item.status)} />
        </View>

        {/* Top-Right Overlay: Episode Chip (e.g. S01 E02) */}
        {nextLabel && (
          <View style={styles.topRightOverlay}>
            <View style={styles.episodeChip}>
              <Text style={styles.episodeChipText}>{nextLabel}</Text>
            </View>
          </View>
        )}

        {/* Bottom Gradient Overlay: Title and Year Chip */}
        <View style={styles.bottomOverlay}>
          <Text style={styles.overlayTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {displayYear ? (
            <View style={styles.yearChip}>
              <Text style={styles.yearChipText}>{displayYear}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      {/* Button below card: Mark next episode watched */}
      {item.nextEpisode && onMarkNext ? (
        <Pressable
          style={styles.quickWatchButton}
          onPress={handleQuickWatch}
          disabled={marking}
        >
          {marking ? (
            <ActivityIndicator size="small" color={theme.colors.accent} />
          ) : (
            <>
              <Ionicons name="checkmark" size={13} color={theme.colors.accent} />
              <Text style={styles.quickWatchText}>Mark {nextLabel} watched</Text>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gridCardContainer: {
    marginBottom: 14,
  },
  posterContainer: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    backgroundColor: '#171819',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    position: 'relative',
  },
  posterFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    height: '100%',
    width: '100%',
  },
  clipWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: '#1c1d1e',
  },
  placeholderText: {
    color: theme.colors.textStrong,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  topLeftOverlay: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 10,
  },
  topRightOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 10,
  },
  episodeChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: 'rgba(16, 17, 18, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.3)',
  },
  episodeChipText: {
    fontSize: 10,
    fontWeight: '900',
    color: theme.colors.accent,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 4,
    zIndex: 10,
  },
  overlayTitle: {
    flex: 1,
    color: '#fff8e8',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 15,
  },
  yearChip: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(16, 17, 18, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  yearChipText: {
    color: '#aeb1ac',
    fontSize: 10,
    fontWeight: '900',
  },
  quickWatchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 207, 92, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.25)',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginTop: 6,
    gap: 4,
  },
  quickWatchText: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  // Compact styles
  compactWrap: {
    marginBottom: 8,
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.borderRadius.sm,
    padding: 8,
    gap: 10,
  },
  compactPosterWrap: {
    width: 50,
    height: 75,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#1c1d1e',
    position: 'relative',
  },
  compactPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  compactPlaceholderText: {
    color: theme.colors.textStrong,
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  compactBody: {
    flex: 1,
    gap: 3,
  },
  compactTitle: {
    color: theme.colors.textStrong,
    fontSize: 13,
    fontWeight: '800',
  },
  compactMeta: {
    color: '#aeb1ac',
    fontSize: 11,
  },
  quickWatchThinner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 207, 92, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.22)',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 5,
    marginTop: 4,
    gap: 4,
  },
});
