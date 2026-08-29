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
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { theme } from '../../constants/theme';
import { StatusBadge } from '../../components/StatusBadge';

export default function MediaDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['mediaDetails', id],
    queryFn: () => api.getMediaDetails(id),
    enabled: Boolean(id),
  });

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

  const media = data.item || data;
  const posterUrl = media.posterPath || media.poster_path
    ? ((media.posterPath || media.poster_path).startsWith('http')
        ? (media.posterPath || media.poster_path)
        : `https://image.tmdb.org/t/p/w500${media.posterPath || media.poster_path}`)
    : null;
  const backdropUrl = media.backdropPath || media.backdrop_path
    ? ((media.backdropPath || media.backdrop_path).startsWith('http')
        ? (media.backdropPath || media.backdrop_path)
        : `https://image.tmdb.org/t/p/w780${media.backdropPath || media.backdrop_path}`)
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
            
            <View style={styles.chipsRow}>
              <StatusBadge label={media.type || 'show'} tone="watching" />
              {(media.airStatus || media.air_status) && (
                <StatusBadge label={media.airStatus || media.air_status} tone="planned" />
              )}
            </View>

            <View style={styles.factsRow}>
              {media.year && <Text style={styles.factText}>{media.year}</Text>}
              {(media.runtimeMinutes || media.runtime_minutes) && (
                <Text style={styles.factText}>{media.runtimeMinutes || media.runtime_minutes}m</Text>
              )}
              {(media.totalSeasons || media.total_seasons) && (
                <Text style={styles.factText}>{media.totalSeasons || media.total_seasons} S</Text>
              )}
              {(media.totalEpisodes || media.total_episodes) && (
                <Text style={styles.factText}>{media.totalEpisodes || media.total_episodes} Ep</Text>
              )}
            </View>
          </View>
        </View>

        {/* Synopsis / Overview */}
        {media.overview ? (
          <View style={styles.overviewSection}>
            <Text style={styles.sectionHeading}>Synopsis</Text>
            <Text style={styles.overviewText}>{media.overview}</Text>
          </View>
        ) : null}

        {/* Episodes summary if present */}
        {data.episodes && data.episodes.length > 0 && (
          <View style={styles.episodesSection}>
            <Text style={styles.sectionHeading}>
              Episodes ({data.episodes.length})
            </Text>
            {data.episodes.slice(0, 15).map((ep: any) => (
              <View key={ep.id} style={styles.episodeRow}>
                <View style={styles.episodeNumber}>
                  <Text style={styles.episodeNumberText}>
                    S{ep.season_number || ep.seasonNumber} E{ep.episode_number || ep.episodeNumber}
                  </Text>
                </View>
                <View style={styles.episodeInfo}>
                  <Text style={styles.episodeTitle} numberOfLines={1}>
                    {ep.title || ep.name || `Episode ${ep.episode_number || ep.episodeNumber}`}
                  </Text>
                  {(ep.air_date || ep.airDate) && (
                    <Text style={styles.episodeAirDate}>{ep.air_date || ep.airDate}</Text>
                  )}
                </View>
              </View>
            ))}
            {data.episodes.length > 15 && (
              <Text style={styles.moreEpisodesText}>
                + {data.episodes.length - 15} more episodes
              </Text>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingBottom: theme.spacing.xl,
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
    marginBottom: 6,
    lineHeight: 22,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  factsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  factText: {
    color: theme.colors.textSubtle,
    fontSize: 12,
    fontWeight: '600',
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
  episodesSection: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  episodeNumber: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.xs,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  episodeNumberText: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  episodeInfo: {
    flex: 1,
  },
  episodeTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  episodeAirDate: {
    color: theme.colors.textSubtle,
    fontSize: 11,
    marginTop: 2,
  },
  moreEpisodesText: {
    color: theme.colors.textSubtle,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
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
