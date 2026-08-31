import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../constants/theme';
import { DashboardEntry } from '../services/api';
import { StatusBadge, StatusTone } from './StatusBadge';
import { PosterPlaceholder } from './PosterPlaceholder';

interface MediaCardProps {
  item: DashboardEntry;
  width?: number;
  variant?: 'grid' | 'compact';
  onMarkNext?: (episodeId: string) => Promise<void>;
  reserveActionSpace?: boolean;
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
  reserveActionSpace = false,
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
  const isAnime = item.type === 'anime' || (item as any).category === 'anime';
  const formatLabel = item.animeFormat === 'movie' || item.type === 'movie' ? 'MOVIE' : 'SERIES';

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
              <PosterPlaceholder type={item.type} iconSize={16} showTitle={false} />
            )}
          </View>

          {/* Body */}
          <View style={styles.compactBody}>
            <Text style={styles.compactTitle} numberOfLines={1}>{item.title}</Text>
            <View style={styles.metaRowCompact}>
              <Text style={styles.compactMeta}>{nextLabel ?? displayYear}</Text>
              {isAnime && (
                <View style={styles.formatIconWrapCompact}>
                  <Ionicons
                    name={formatLabel === 'MOVIE' ? 'film-outline' : 'tv-outline'}
                    size={10}
                    color="#ffcf5c"
                  />
                </View>
              )}
            </View>
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
          <PosterPlaceholder title={item.title} type={item.type} />
        )}

        {/* Top Badges Header: Status & Episode Chip */}
        <View style={styles.topBadgesRow}>
          <View style={styles.statusBadgeWrap}>
            <StatusBadge
              label={formatStatus(item.status)}
              tone={resolveStatusTone(item.status)}
              numberOfLines={1}
              compact
            />
          </View>

          {nextLabel && (
            <View style={styles.episodeChip}>
              <Text style={styles.episodeChipText}>{nextLabel}</Text>
            </View>
          )}
        </View>

        {/* Bottom Gradient Overlay: Title and Year Chip */}
        <LinearGradient
          colors={['transparent', 'rgba(0, 0, 0, 0.45)', 'rgba(0, 0, 0, 0.88)']}
          locations={[0, 0.35, 1]}
          style={styles.bottomOverlay}
        >
          <Text style={styles.overlayTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.bottomMetaRow}>
            {displayYear ? (
              <View style={styles.yearChip}>
                <Text style={styles.yearChipText}>{displayYear}</Text>
              </View>
            ) : null}
            {isAnime && (
              <View style={styles.formatIconWrap}>
                <Ionicons
                  name={formatLabel === 'MOVIE' ? 'film-outline' : 'tv-outline'}
                  size={11}
                  color="#ffcf5c"
                />
              </View>
            )}
          </View>
        </LinearGradient>
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
              <Ionicons name="checkmark" size={12} color={theme.colors.accent} />
              <Text style={styles.quickWatchText} numberOfLines={1}>Mark {nextLabel}</Text>
            </>
          )}
        </Pressable>
      ) : reserveActionSpace ? (
        <View style={styles.quickWatchPlaceholder} />
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
  topBadgesRow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    zIndex: 10,
  },
  statusBadgeWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  episodeChip: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: 'rgba(16, 17, 18, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.4)',
    flexShrink: 0,
  },
  episodeChipText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: theme.colors.accent,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 22,
    paddingBottom: 6,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 4,
    zIndex: 10,
  },
  overlayTitle: {
    flex: 1,
    color: '#fff8e8',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  yearChip: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    backgroundColor: 'rgba(16, 17, 18, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    flexShrink: 0,
  },
  yearChipText: {
    color: '#cbd5e1',
    fontSize: 9.5,
    fontWeight: '800',
  },
  quickWatchButton: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 207, 92, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.25)',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 4,
    marginTop: 5,
    gap: 3,
  },
  quickWatchPlaceholder: {
    height: 24,
    marginTop: 5,
  },
  quickWatchText: {
    color: theme.colors.accent,
    fontSize: 9.5,
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
  bottomMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  metaRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formatIconWrap: {
    backgroundColor: 'rgba(255, 207, 92, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.35)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formatIconWrapCompact: {
    backgroundColor: 'rgba(255, 207, 92, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.35)',
    paddingHorizontal: 3.5,
    paddingVertical: 1.5,
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
