import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { api, MediaDetailData } from '../../services/api';
import { theme } from '../../constants/theme';
import { StatusBadge } from '../../components/StatusBadge';
import { TrackingPanel } from '../../components/TrackingPanel';
import { SeasonAccordion } from '../../components/SeasonAccordion';
import { GoldenGlow } from '../../components/GoldenGlow';

export default function MediaDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['mediaDetails', id],
    queryFn: () => api.getMediaDetails(id),
    enabled: Boolean(id),
  });

  const {
    data: episodesData,
    refetch: refetchEpisodes,
  } = useQuery({
    queryKey: ['mediaEpisodes', id],
    queryFn: () => api.getMediaEpisodes(id),
    enabled: Boolean(id && (data?.media.type === 'show' || data?.media.type === 'anime')),
  });

  const {
    data: unitsData,
    refetch: refetchUnits,
  } = useQuery({
    queryKey: ['mediaUnits', id],
    queryFn: () => api.getMediaUnits(id),
    enabled: Boolean(id && (data?.media.type === 'book' || data?.media.type === 'game')),
  });

  const handleUpdated = () => {
    refetch();
    if (data?.media.type === 'show' || data?.media.type === 'anime') {
      refetchEpisodes();
    }
    if (data?.media.type === 'book' || data?.media.type === 'game') {
      refetchUnits();
    }
    // Invalidate dashboards so lists update immediately
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const handleMarkMovieWatched = async () => {
    try {
      await api.markMovieWatched(id, true);
      handleUpdated();
    } catch (e) {
      console.error('Failed to mark movie watched', e);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>Loading details...</Text>
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Could not load media</Text>
        <Text style={styles.errorSubtitle}>
          {(error as Error)?.message || 'Media not found.'}
        </Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const media = data.media;
  const userMedia = data.userMedia;

  const posterUrl = media.posterPath
    ? (media.posterPath.startsWith('http')
        ? media.posterPath
        : `https://image.tmdb.org/t/p/w500${media.posterPath}`)
    : null;
  const backdropUrl = media.backdropPath
    ? (media.backdropPath.startsWith('http')
        ? media.backdropPath
        : `https://image.tmdb.org/t/p/w780${media.backdropPath}`)
    : null;

  const isMovie = media.type === 'movie';
  const isSeries = media.type === 'show' || media.type === 'anime';
  const isUnitTrackable = media.type === 'book' || media.type === 'game';

  return (
    <View style={styles.container}>
      <GoldenGlow />
      <ScrollView contentContainerStyle={styles.content}>
      {/* Backdrop Image */}
      {backdropUrl && (
        <View style={styles.backdropContainer}>
          <Image
            source={{ uri: backdropUrl }}
            style={styles.backdrop}
            contentFit="cover"
          />
          <View style={styles.backdropOverlay} />
        </View>
      )}

      {/* Main Info Card */}
      <View style={[styles.headerCard, !backdropUrl && { marginTop: theme.spacing.md }]}>
        <View style={styles.posterSection}>
          {posterUrl ? (
            <Image
              source={{ uri: posterUrl }}
              style={styles.poster}
              contentFit="cover"
            />
          ) : (
            <View style={styles.posterPlaceholder}>
              <Ionicons name="film-outline" size={32} color={theme.colors.textSubtle} />
            </View>
          )}

          <View style={styles.mainMeta}>
            <Text style={styles.title}>{media.title}</Text>
            {media.tagline ? <Text style={styles.tagline}>"{media.tagline}"</Text> : null}

            <View style={styles.chipsRow}>
              <StatusBadge label={media.type || 'show'} tone="watching" />
              {media.airStatus && <StatusBadge label={media.airStatus} tone="planned" />}
            </View>

            <View style={styles.factsRow}>
              {media.year && <Text style={styles.factText}>{media.year}</Text>}
              {media.runtimeMinutes && <Text style={styles.factText}>{media.runtimeMinutes}m</Text>}
              {media.totalSeasons && <Text style={styles.factText}>{media.totalSeasons} S</Text>}
              {media.totalEpisodes && <Text style={styles.factText}>{media.totalEpisodes} Ep</Text>}
              {media.language && <Text style={styles.factText}>{media.language.toUpperCase()}</Text>}
            </View>
          </View>
        </View>

        {/* Interactive User Tracking Panel */}
        <TrackingPanel
          mediaId={id}
          mediaType={media.type}
          userMedia={userMedia}
          onUpdated={handleUpdated}
        />

        {/* Quick Movie Watched Action */}
        {isMovie && userMedia?.status !== 'watched' && (
          <Pressable style={styles.quickWatchedButton} onPress={handleMarkMovieWatched}>
            <Ionicons name="checkmark-circle" size={18} color={theme.colors.accentContrast} />
            <Text style={styles.quickWatchedButtonText}>Mark Movie Watched</Text>
          </Pressable>
        )}

        {/* Synopsis / Overview */}
        {media.overview ? (
          <View style={styles.overviewSection}>
            <Text style={styles.sectionHeading}>Synopsis</Text>
            <Text style={styles.overviewText}>{media.overview}</Text>
          </View>
        ) : null}

        {/* Seasons & Episodes (for Shows and Anime) */}
        {isSeries && episodesData?.episodes && (
          <SeasonAccordion
            mediaId={id}
            episodes={episodesData.episodes}
            onEpisodesUpdated={handleUpdated}
          />
        )}

        {/* Units (for Books and Games) */}
        {isUnitTrackable && unitsData?.units && unitsData.units.length > 0 && (
          <View style={styles.overviewSection}>
            <Text style={styles.sectionHeading}>
              {media.type === 'book' ? 'Chapters & Volumes' : 'Quests & Acts'} ({unitsData.units.length})
            </Text>
            {unitsData.units.map((unit) => (
              <View key={unit.id} style={styles.unitRow}>
                <Text style={styles.unitKind}>{unit.kind}</Text>
                <Text style={styles.unitTitle}>{unit.title || `Part ${unit.position}`}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingBottom: 32,
  },
  backdropContainer: {
    width: '100%',
    height: 200,
    position: 'relative',
  },
  backdrop: {
    width: '100%',
    height: '100%',
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(16, 17, 18, 0.65)',
  },
  headerCard: {
    marginHorizontal: theme.spacing.md,
    marginTop: -40,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  posterSection: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  poster: {
    width: 95,
    height: 142,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: '#1c1d1e',
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  posterPlaceholder: {
    width: 95,
    height: 142,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: '#1c1d1e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  mainMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: theme.colors.textStrong,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
    lineHeight: 22,
  },
  tagline: {
    color: theme.colors.textSubtle,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  factsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  factText: {
    color: theme.colors.textSubtle,
    fontSize: 11,
    fontWeight: '600',
  },
  quickWatchedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    marginTop: 10,
    gap: 6,
  },
  quickWatchedButtonText: {
    color: theme.colors.accentContrast,
    fontSize: 13,
    fontWeight: '800',
  },
  overviewSection: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  sectionHeading: {
    color: theme.colors.textStrong,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  overviewText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    gap: 8,
  },
  unitKind: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  unitTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    color: theme.colors.textMuted,
    marginTop: 12,
  },
  errorTitle: {
    color: theme.colors.danger,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  errorSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
  },
  backButtonText: {
    color: theme.colors.accentContrast,
    fontWeight: '800',
  },
});
