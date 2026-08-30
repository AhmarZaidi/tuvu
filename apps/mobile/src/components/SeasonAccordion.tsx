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
  mediaTitle?: string;
  episodes: EpisodeWithActivity[];
  onEpisodesUpdated: () => void;
  progressComponent?: React.ReactNode;
}

export function SeasonAccordion({
  mediaId,
  mediaTitle,
  episodes,
  onEpisodesUpdated,
  progressComponent,
}: SeasonAccordionProps) {
  const router = useRouter();
  // Collapsed by default: expandedSeasons starts empty
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());
  const [busyEpisodeId, setBusyEpisodeId] = useState<string | null>(null);

  const seasonsMap = useMemo(() => {
    const map = new Map<number, EpisodeWithActivity[]>();
    for (const ep of episodes) {
      const s = ep.seasonNumber ?? 1;
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(ep);
    }
    return map;
  }, [episodes]);

  const sortedSeasons = useMemo(() => {
    return Array.from(seasonsMap.keys()).sort((a, b) => a - b);
  }, [seasonsMap]);

  const totalEpisodes = episodes.filter((ep) => !ep.isSpecial).length;
  const totalWatched = episodes.filter((ep) => !ep.isSpecial && ep.activity?.watched).length;

  const toggleSeasonCollapse = (seasonNumber: number) => {
    setExpandedSeasons((prev) => {
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

  const mediaInitials = (mediaTitle || 'TU').slice(0, 2).toUpperCase();

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>EPISODE GUIDE</Text>
      <Text style={styles.heading}>Seasons & Episodes</Text>
      <Text style={styles.subheading}>
        {totalWatched} of {totalEpisodes || episodes.length} available watched
      </Text>

      {progressComponent}

      {episodes.length === 0 && !progressComponent && (
        <View style={styles.emptyGuideCard}>
          <Text style={styles.emptyGuideTitle}>No episodes available</Text>
          <Text style={styles.emptyGuideSub}>
            Episode details could not be found or have not been added yet.
          </Text>
        </View>
      )}

      {episodes.length > 0 && (
        <View style={styles.seasonStack}>
          {sortedSeasons.map((seasonNumber) => {
            const seasonEpisodes = seasonsMap.get(seasonNumber) || [];
            const isExpanded = expandedSeasons.has(seasonNumber);
            const watchedCount = seasonEpisodes.filter((e) => e.activity?.watched).length;
            const totalCount = seasonEpisodes.length;
            const allWatched = watchedCount === totalCount && totalCount > 0;

            return (
              <View key={seasonNumber} style={styles.seasonCard}>
                {/* Season Header */}
                <Pressable
                  style={styles.seasonHeader}
                  onPress={() => toggleSeasonCollapse(seasonNumber)}
                >
                  <View style={styles.seasonHeaderLeft}>
                    <Ionicons
                      name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                      size={16}
                      color="#f8f7f2"
                    />
                    <Text style={styles.seasonName}>
                      {seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`}
                    </Text>
                    <Text style={styles.seasonCount}>
                      {watchedCount}/{totalCount}
                    </Text>
                  </View>

                  {/* Bulk Season Checkmark Button */}
                  <Pressable
                    style={[styles.seasonCheckCircle, allWatched && styles.seasonCheckCircleWatched]}
                    onPress={() => handleMarkSeasonWatched(seasonNumber, !allWatched)}
                    hitSlop={8}
                  >
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={allWatched ? '#101112' : '#8b8e89'}
                    />
                  </Pressable>
                </Pressable>

                {/* Episodes List */}
                {isExpanded && (
                  <View style={styles.episodesList}>
                    {seasonEpisodes.map((ep) => {
                      const isWatched = Boolean(ep.activity?.watched);
                      const isBusy = busyEpisodeId === ep.id;
                      const stillUrl = ep.stillPath
                        ? ep.stillPath.startsWith('http')
                          ? ep.stillPath
                          : `https://tmdb-image-prod.b-cdn.net/t/p/w300${ep.stillPath}`
                        : null;

                      const epCode = `S${String(ep.seasonNumber ?? 0).padStart(2, '0')}xE${String(
                        ep.episodeNumber
                      ).padStart(2, '0')}`;

                      return (
                        <Pressable
                          key={ep.id}
                          style={styles.episodeRow}
                          onPress={() => router.push(`/media/${mediaId}/episodes/${ep.id}` as any)}
                        >
                          {/* Thumbnail / Initials Box */}
                          {stillUrl ? (
                            <Image source={{ uri: stillUrl }} style={styles.thumbnail} contentFit="cover" />
                          ) : (
                            <View style={styles.thumbnailPlaceholder}>
                              <Text style={styles.initialsText}>{mediaInitials}</Text>
                            </View>
                          )}

                          {/* Title & Code */}
                          <View style={styles.episodeMeta}>
                            <Text style={styles.episodeCode}>{epCode}</Text>
                            <Text style={styles.episodeTitle} numberOfLines={1}>
                              {ep.title || `Episode ${ep.episodeNumber}`}
                            </Text>
                          </View>

                          {/* Watched Toggle Circle */}
                          <Pressable
                            style={[styles.episodeCheckCircle, isWatched && styles.episodeCheckCircleWatched]}
                            onPress={() => handleToggleWatched(ep)}
                            disabled={isBusy}
                            hitSlop={6}
                          >
                            {isBusy ? (
                              <ActivityIndicator size="small" color="#101112" />
                            ) : (
                              <Ionicons
                                name="checkmark"
                                size={16}
                                color={isWatched ? '#101112' : '#8b8e89'}
                              />
                            )}
                          </Pressable>

                          {/* Navigation Chevron */}
                          <Ionicons name="chevron-forward" size={16} color="#8b8e89" style={styles.chevron} />
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 18,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: theme.colors.accent,
    marginBottom: 2,
  },
  heading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8f7f2',
    marginBottom: 2,
  },
  subheading: {
    fontSize: 13,
    color: '#aeb1ac',
    marginBottom: 12,
  },
  emptyGuideCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: theme.borderRadius.sm,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  emptyGuideTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8f7f2',
    marginBottom: 4,
  },
  emptyGuideSub: {
    fontSize: 12,
    color: '#8b8e89',
    textAlign: 'center',
  },
  prepProgressBarTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  prepProgressBarFill: {
    width: '45%',
    height: '100%',
    backgroundColor: theme.colors.accent,
    borderRadius: 2,
  },
  seasonStack: {
    gap: 8,
  },
  seasonCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  seasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  seasonHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seasonName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8f7f2',
  },
  seasonCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8b8e89',
  },
  seasonCheckCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  seasonCheckCircleWatched: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  episodesList: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    gap: 10,
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  thumbnailPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 191, 71, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 191, 71, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.accent,
  },
  episodeMeta: {
    flex: 1,
  },
  episodeCode: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8b8e89',
    marginBottom: 2,
  },
  episodeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8f7f2',
  },
  episodeCheckCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeCheckCircleWatched: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  chevron: {
    marginLeft: 2,
  },
});
