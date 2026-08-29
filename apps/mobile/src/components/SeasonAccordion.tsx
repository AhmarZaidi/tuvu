import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '../constants/theme';
import { EpisodeWithActivity, api } from '../services/api';

interface SeasonAccordionProps {
  mediaId: string;
  episodes: EpisodeWithActivity[];
  onEpisodesUpdated: () => void;
}

export function SeasonAccordion({ mediaId, episodes, onEpisodesUpdated }: SeasonAccordionProps) {
  const router = useRouter();
  const [collapsedSeasons, setCollapsedSeasons] = useState<Set<number>>(new Set());
  const [busyEpisodeId, setBusyEpisodeId] = useState<string | null>(null);

  // Group episodes by season
  const seasonsMap = useMemo(() => {
    const map = new Map<number, EpisodeWithActivity[]>();
    for (const ep of episodes) {
      const s = ep.seasonNumber || 1;
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(ep);
    }
    return map;
  }, [episodes]);

  const sortedSeasons = useMemo(() => {
    return Array.from(seasonsMap.keys()).sort((a, b) => a - b);
  }, [seasonsMap]);

  const toggleSeasonCollapse = (seasonNumber: number) => {
    setCollapsedSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(seasonNumber)) next.delete(seasonNumber);
      else next.add(seasonNumber);
      return next;
    });
  };

  const handleToggleWatched = async (ep: EpisodeWithActivity) => {
    const isWatched = Boolean(ep.activity?.watched);
    setBusyEpisodeId(ep.id);
    try {
      await api.updateEpisodeActivity(ep.id, { watched: !isWatched });
      onEpisodesUpdated();
    } catch (e) {
      console.error('Failed to toggle episode watched', e);
    } finally {
      setBusyEpisodeId(null);
    }
  };

  const handleMarkSeasonWatched = async (seasonNumber: number, watched = true) => {
    try {
      await api.bulkMarkSeason(mediaId, seasonNumber, watched);
      onEpisodesUpdated();
    } catch (e) {
      console.error('Failed to bulk mark season', e);
    }
  };

  if (episodes.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeading}>Episodes ({episodes.length})</Text>

      {sortedSeasons.map((seasonNumber) => {
        const seasonEpisodes = seasonsMap.get(seasonNumber) || [];
        const isCollapsed = collapsedSeasons.has(seasonNumber);
        const watchedCount = seasonEpisodes.filter((e) => e.activity?.watched).length;
        const totalCount = seasonEpisodes.length;
        const progressPercent = totalCount > 0 ? (watchedCount / totalCount) * 100 : 0;
        const allWatched = watchedCount === totalCount && totalCount > 0;

        return (
          <View key={seasonNumber} style={styles.seasonCard}>
            {/* Season Header */}
            <Pressable
              style={styles.seasonHeader}
              onPress={() => toggleSeasonCollapse(seasonNumber)}
            >
              <View style={styles.seasonTitleRow}>
                <Ionicons
                  name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                  size={16}
                  color={theme.colors.accent}
                />
                <Text style={styles.seasonTitle}>
                  {seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`}
                </Text>
                <Text style={styles.seasonCountText}>
                  {watchedCount}/{totalCount} watched
                </Text>
              </View>

              {/* Bulk Mark Season Watched */}
              <Pressable
                style={[styles.bulkButton, allWatched && styles.bulkButtonWatched]}
                onPress={() => handleMarkSeasonWatched(seasonNumber, !allWatched)}
                hitSlop={8}
              >
                <Ionicons
                  name={allWatched ? 'checkmark-circle' : 'checkmark-circle-outline'}
                  size={18}
                  color={allWatched ? theme.colors.accent : theme.colors.textSubtle}
                />
              </Pressable>
            </Pressable>

            {/* Season Progress Bar */}
            <View style={styles.seasonProgressTrack}>
              <View style={[styles.seasonProgressFill, { width: `${progressPercent}%` }]} />
            </View>

            {/* Episodes List (when expanded) */}
            {!isCollapsed && (
              <View style={styles.episodesList}>
                {seasonEpisodes.map((ep) => {
                  const isWatched = Boolean(ep.activity?.watched);
                  const isBusy = busyEpisodeId === ep.id;
                  const stillUrl = ep.stillPath
                    ? (ep.stillPath.startsWith('http') ? ep.stillPath : `https://tmdb-image-prod.b-cdn.net/t/p/w300${ep.stillPath}`)
                    : null;

                  return (
                    <Pressable
                      key={ep.id}
                      style={styles.episodeItem}
                      onPress={() => router.push(`/media/${mediaId}/episodes/${ep.id}` as any)}
                    >
                      {/* Still image thumbnail */}
                      <View style={styles.stillContainer}>
                        {stillUrl ? (
                          <Image source={{ uri: stillUrl }} style={styles.stillImage} contentFit="cover" />
                        ) : (
                          <View style={styles.stillPlaceholder}>
                            <Text style={styles.stillEpisodeNumber}>E{ep.episodeNumber}</Text>
                          </View>
                        )}
                      </View>

                      {/* Episode Meta */}
                      <View style={styles.episodeInfo}>
                        <View style={styles.episodeHeaderRow}>
                          <Text style={styles.episodeCode}>
                            S{ep.seasonNumber} E{ep.episodeNumber}
                          </Text>
                          {ep.airDate && <Text style={styles.episodeAirDate}>{ep.airDate}</Text>}
                        </View>
                        <Text style={styles.episodeTitle} numberOfLines={1}>
                          {ep.title || `Episode ${ep.episodeNumber}`}
                        </Text>
                        {ep.overview ? (
                          <Text style={styles.episodeOverview} numberOfLines={2}>
                            {ep.overview}
                          </Text>
                        ) : null}
                      </View>

                      {/* Watched Toggle Checkmark */}
                      <Pressable
                        style={[styles.checkAction, isWatched && styles.checkActionWatched]}
                        onPress={() => handleToggleWatched(ep)}
                        disabled={isBusy}
                        hitSlop={8}
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color={theme.colors.accent} />
                        ) : (
                          <Ionicons
                            name={isWatched ? 'checkmark' : 'checkmark-outline'}
                            size={18}
                            color={isWatched ? theme.colors.accentContrast : theme.colors.textSubtle}
                          />
                        )}
                      </Pressable>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 18,
  },
  sectionHeading: {
    color: theme.colors.textStrong,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  seasonCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 10,
    overflow: 'hidden',
  },
  seasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  seasonTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seasonTitle: {
    color: theme.colors.textStrong,
    fontSize: 14,
    fontWeight: '800',
  },
  seasonCountText: {
    color: theme.colors.textSubtle,
    fontSize: 12,
    fontWeight: '600',
  },
  bulkButton: {
    padding: 4,
  },
  bulkButtonWatched: {},
  seasonProgressTrack: {
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  seasonProgressFill: {
    height: '100%',
    backgroundColor: theme.colors.accent,
  },
  episodesList: {
    paddingVertical: 4,
  },
  episodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    gap: 10,
  },
  stillContainer: {
    width: 64,
    height: 40,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#1c1d1e',
  },
  stillImage: {
    width: '100%',
    height: '100%',
  },
  stillPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c1d1e',
  },
  stillEpisodeNumber: {
    color: theme.colors.textSubtle,
    fontSize: 11,
    fontWeight: '700',
  },
  episodeInfo: {
    flex: 1,
  },
  episodeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  episodeCode: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  episodeAirDate: {
    color: theme.colors.textSubtle,
    fontSize: 10,
    fontWeight: '600',
  },
  episodeTitle: {
    color: theme.colors.textStrong,
    fontSize: 13,
    fontWeight: '700',
  },
  episodeOverview: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  checkAction: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  checkActionWatched: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
});
