import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Image } from './AppImage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '../constants/theme';
import { EpisodeWithActivity, api } from '../services/api';
import { BottomSheet } from './BottomSheet';
import { resolveImageUrl } from '../utils/images';

interface SeasonAccordionProps {
  mediaId: string;
  mediaTitle?: string;
  isAnime?: boolean;
  episodes: EpisodeWithActivity[];
  onEpisodesUpdated: () => void;
  progressComponent?: React.ReactNode;
}

function releaseStatus(airDate: string | null): { kind: 'released' | 'future' | 'tba'; label: string } {
  if (!airDate) return { kind: 'tba', label: 'TBA' };
  const release = new Date(`${airDate}T00:00:00`);
  if (Number.isNaN(release.getTime())) return { kind: 'tba', label: 'TBA' };
  const diff = release.getTime() - Date.now();
  if (diff <= 0) return { kind: 'released', label: 'Released' };
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) return { kind: 'future', label: `in ${minutes}m` };
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return { kind: 'future', label: `in ${hours}h` };
  const days = Math.ceil(hours / 24);
  if (days < 60) return { kind: 'future', label: `in ${days}d` };
  return { kind: 'future', label: `in ${Math.ceil(days / 30)}mo` };
}

export function SeasonAccordion({
  mediaId,
  mediaTitle,
  isAnime,
  episodes,
  onEpisodesUpdated,
  progressComponent,
}: SeasonAccordionProps) {
  const router = useRouter();
  // Collapsed by default: expandedSeasons starts empty
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set([1]));
  const [dateMode, setDateMode] = useState<'sub' | 'dub'>('sub');
  const [busyEpisodeId, setBusyEpisodeId] = useState<string | null>(null);
  const [watchActionTarget, setWatchActionTarget] = useState<
    | { type: 'episode'; episode: EpisodeWithActivity }
    | { type: 'season'; seasonNumber: number; seasonName: string }
    | null
  >(null);

  const showDubToggle = useMemo(() => {
    if (isAnime) return true;
    return episodes.some((ep) => {
      let epExt: any = {};
      try {
        if (ep.extendedDataJson) epExt = JSON.parse(ep.extendedDataJson);
      } catch {}
      return Boolean(epExt.dubAirDate || epExt.dubAired || (ep as any).dubReleaseAt || epExt.hasDub);
    });
  }, [episodes, isAnime]);

  const seasonsMap = useMemo(() => {
    const map = new Map<number, EpisodeWithActivity[]>();
    for (const ep of episodes) {
      const s = ep.seasonNumber ?? 0;
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

  const handlePressEpisodeCheck = (ep: EpisodeWithActivity) => {
    const isWatched = Boolean(ep.activity?.watched);
    if (isWatched) {
      setWatchActionTarget({ type: 'episode', episode: ep });
    } else {
      void applyEpisodeAction(ep, 'watched_once');
    }
  };

  const handlePressSeasonCheck = (seasonNumber: number, seasonName: string, allWatched: boolean) => {
    if (allWatched) {
      setWatchActionTarget({ type: 'season', seasonNumber, seasonName });
    } else {
      void applySeasonAction(seasonNumber, 'watched_once');
    }
  };

  const applyEpisodeAction = async (ep: EpisodeWithActivity, action: 'not_watched' | 'rewatched' | 'watched_once') => {
    setBusyEpisodeId(ep.id);
    try {
      await api.updateEpisodeAction(ep.id, action, ep.activity?.rewatchCount ?? 0);
      onEpisodesUpdated();
    } catch (e) {
      console.error('Failed to apply episode action', e);
    } finally {
      setBusyEpisodeId(null);
      setWatchActionTarget(null);
    }
  };

  const applySeasonAction = async (seasonNumber: number, action: 'not_watched' | 'rewatched' | 'watched_once') => {
    try {
      await api.updateSeasonAction(mediaId, seasonNumber, action);
      onEpisodesUpdated();
    } catch (e) {
      console.error('Failed to apply season action', e);
    } finally {
      setWatchActionTarget(null);
    }
  };

  const mediaInitials = (mediaTitle || 'TU').slice(0, 2).toUpperCase();

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>EPISODE GUIDE</Text>
          <Text style={styles.heading}>Seasons & Episodes</Text>
        </View>
        {showDubToggle && (
          <View style={styles.dateModeToggle}>
            <Pressable
              style={[styles.dateModeOption, dateMode === 'sub' && styles.dateModeOptionActive]}
              onPress={() => setDateMode('sub')}
            >
              <Text style={[styles.dateModeText, dateMode === 'sub' && styles.dateModeTextActive]}>
                Sub Dates
              </Text>
            </Pressable>
            <Pressable
              style={[styles.dateModeOption, dateMode === 'dub' && styles.dateModeOptionActive]}
              onPress={() => setDateMode('dub')}
            >
              <Text style={[styles.dateModeText, dateMode === 'dub' && styles.dateModeTextActive]}>
                Dub Dates
              </Text>
            </Pressable>
          </View>
        )}
      </View>

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
            const seasonProgress = totalCount > 0 ? Math.round((watchedCount / totalCount) * 100) : 0;
            const seasonName = seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`;

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
                      {seasonName}
                    </Text>
                    <Text style={styles.seasonCount}>
                      {watchedCount}/{totalCount}
                    </Text>
                  </View>

                  {/* Bulk Season Checkmark Button */}
                  {(() => {
                    const seasonWatchCounts = seasonEpisodes.map((e) =>
                      e.activity?.watched ? 1 + (e.activity.rewatchCount ?? 0) : 0
                    );
                    const minSeasonWatch =
                      seasonEpisodes.length > 0 ? Math.min(...seasonWatchCounts) : 0;

                    return (
                      <Pressable
                        style={[styles.seasonCheckCircle, allWatched && styles.seasonCheckCircleWatched]}
                        onPress={() => handlePressSeasonCheck(seasonNumber, seasonName, allWatched)}
                        hitSlop={8}
                      >
                        {allWatched && minSeasonWatch > 1 ? (
                          <Text style={styles.rewatchBadgeText}>x{minSeasonWatch}</Text>
                        ) : (
                          <Ionicons
                            name="checkmark"
                            size={16}
                            color={allWatched ? '#101112' : '#8b8e89'}
                          />
                        )}
                      </Pressable>
                    );
                  })()}
                </Pressable>

                {/* Season Progress Bar along bottom of header */}
                <View style={styles.seasonProgressTrack}>
                  <View style={[styles.seasonProgressFill, { width: `${seasonProgress}%` }]} />
                </View>

                {/* Episodes List */}
                {isExpanded && (
                  <View style={styles.episodesList}>
                    {seasonEpisodes.map((ep) => {
                      const isWatched = Boolean(ep.activity?.watched);
                      const epWatchCount = isWatched ? 1 + (ep.activity?.rewatchCount ?? 0) : 0;
                      const isBusy = busyEpisodeId === ep.id;
                      const stillUrl = resolveImageUrl(ep.stillPath, 'w300');

                      const epCode = `S${String(ep.seasonNumber ?? 0).padStart(2, '0')}xE${String(
                        ep.episodeNumber
                      ).padStart(2, '0')}`;

                      let epExt: any = {};
                      try {
                        if (ep.extendedDataJson) epExt = JSON.parse(ep.extendedDataJson);
                      } catch {}

                      const altTitle = epExt.titleRomaji || epExt.titleJapanese;
                      const isFiller = Boolean(epExt.filler);
                      const isRecap = Boolean(epExt.recap);

                      const rawDubDate = epExt.dubAirDate || epExt.dubAired || (ep as any).dubReleaseAt || (isAnime && ep.airDate ? new Date(new Date(ep.airDate).getTime() + 21 * 86400000).toISOString().slice(0, 10) : null);
                      const effectiveAirDate = dateMode === 'dub'
                        ? (rawDubDate || ep.airDate)
                        : ep.airDate;
                      const release = releaseStatus(effectiveAirDate);
                      const formattedDate = effectiveAirDate
                        ? new Date(effectiveAirDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : null;

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
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.episodeCode}>{epCode}</Text>
                              {formattedDate && (
                                <Text style={styles.episodeDateText}>• {formattedDate}</Text>
                              )}
                              {isFiller && (
                                <View style={styles.fillerBadge}>
                                  <Text style={styles.fillerBadgeText}>FILLER</Text>
                                </View>
                              )}
                              {isRecap && (
                                <View style={styles.recapBadge}>
                                  <Text style={styles.recapBadgeText}>RECAP</Text>
                                </View>
                              )}
                            </View>
                            <Text
                              style={styles.episodeTitle}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              {ep.title || `Episode ${ep.episodeNumber}`}
                            </Text>
                            {altTitle && altTitle !== ep.title && (
                              <Text style={styles.episodeAltTitle} numberOfLines={1}>
                                {altTitle}
                              </Text>
                            )}
                          </View>

                          {/* Watched Action Circle OR Countdown Pill */}
                          {isWatched || release.kind === 'released' || release.kind === 'tba' ? (
                            <Pressable
                              style={[styles.episodeCheckCircle, isWatched && styles.episodeCheckCircleWatched]}
                              onPress={() => handlePressEpisodeCheck(ep)}
                              disabled={isBusy}
                              hitSlop={6}
                            >
                              {isBusy ? (
                                <ActivityIndicator size="small" color="#101112" />
                              ) : epWatchCount > 1 ? (
                                <Text style={styles.rewatchBadgeText}>x{epWatchCount}</Text>
                              ) : (
                                <Ionicons
                                  name="checkmark"
                                  size={16}
                                  color={isWatched ? '#101112' : '#8b8e89'}
                                />
                              )}
                            </Pressable>
                          ) : (
                            <View style={styles.countdownBadge}>
                              <Ionicons name="time-outline" size={11} color="#ffcf5c" />
                              <Text style={styles.countdownBadgeText}>{release.label}</Text>
                            </View>
                          )}

                          {/* Navigation Chevron */}
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color="#8b8e89"
                            style={styles.chevron}
                          />
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

      {/* Watch Action Bottom Sheet */}
      <BottomSheet
        visible={Boolean(watchActionTarget)}
        onClose={() => setWatchActionTarget(null)}
        title={
          watchActionTarget?.type === 'season'
            ? `${watchActionTarget.seasonName}`
            : (watchActionTarget?.episode.title || `Episode ${watchActionTarget?.episode.episodeNumber}`)
        }
        subtitle={
          watchActionTarget?.type === 'season'
            ? 'Bulk update season watch status'
            : 'Update episode watch activity'
        }
        icon="checkmark-circle-outline"
      >
        <View style={styles.sheetContent}>
          {/* Watched once */}
          <Pressable
            style={styles.sheetActionItem}
            onPress={() => {
              if (watchActionTarget?.type === 'season') {
                void applySeasonAction(watchActionTarget.seasonNumber, 'watched_once');
              } else if (watchActionTarget?.episode) {
                void applyEpisodeAction(watchActionTarget.episode, 'watched_once');
              }
            }}
          >
            <Ionicons name="checkmark-circle-outline" size={22} color={theme.colors.accent} />
            <View style={styles.sheetActionCopy}>
              <Text style={styles.sheetActionText}>Watched once</Text>
              <Text style={styles.sheetActionSub}>Reset rewatch count back to standard watched (1x)</Text>
            </View>
          </Pressable>

          {/* Rewatched */}
          <Pressable
            style={styles.sheetActionItem}
            onPress={() => {
              if (watchActionTarget?.type === 'season') {
                void applySeasonAction(watchActionTarget.seasonNumber, 'rewatched');
              } else if (watchActionTarget?.episode) {
                void applyEpisodeAction(watchActionTarget.episode, 'rewatched');
              }
            }}
          >
            <Ionicons name="repeat-outline" size={22} color="#f8f7f2" />
            <View style={styles.sheetActionCopy}>
              <Text style={styles.sheetActionText}>Rewatched</Text>
              <Text style={styles.sheetActionSub}>Add to rewatch count and keep watched (+1)</Text>
            </View>
          </Pressable>

          {/* Not watched */}
          <Pressable
            style={styles.sheetActionItem}
            onPress={() => {
              if (watchActionTarget?.type === 'season') {
                void applySeasonAction(watchActionTarget.seasonNumber, 'not_watched');
              } else if (watchActionTarget?.episode) {
                void applyEpisodeAction(watchActionTarget.episode, 'not_watched');
              }
            }}
          >
            <Ionicons name="close-circle-outline" size={22} color="#ff6b6b" />
            <View style={styles.sheetActionCopy}>
              <Text style={[styles.sheetActionText, { color: '#ff6b6b' }]}>Not watched</Text>
              <Text style={styles.sheetActionSub}>Unmark and reset watch status</Text>
            </View>
          </Pressable>
        </View>
      </BottomSheet>
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
    minWidth: 0,
    overflow: 'hidden',
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
    textAlign: 'left',
  },
  rewatchBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#101112',
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
  seasonProgressTrack: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    width: '100%',
  },
  seasonProgressFill: {
    height: '100%',
    backgroundColor: theme.colors.accent,
  },
  sheetContent: {
    paddingTop: 6,
  },
  sheetActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  sheetActionCopy: {
    flex: 1,
  },
  sheetActionText: {
    color: '#f8f7f2',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  sheetActionSub: {
    color: '#8b8e89',
    fontSize: 12,
  },
  modalItemSubtitle: {
    color: '#8b8e89',
    fontSize: 12,
    marginTop: 2,
  },
  fillerBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  fillerBadgeText: {
    color: '#ef4444',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  recapBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  recapBadgeText: {
    color: '#60a5fa',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  dateModeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  dateModeOption: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dateModeOptionActive: {
    backgroundColor: 'rgba(255, 207, 92, 0.2)',
  },
  dateModeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8b8e89',
  },
  dateModeTextActive: {
    color: '#ffcf5c',
    fontWeight: '800',
  },
  episodeDateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#aeb1ac',
    marginBottom: 2,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 207, 92, 0.1)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.25)',
  },
  countdownBadgeText: {
    color: '#ffcf5c',
    fontSize: 10,
    fontWeight: '800',
  },
  episodeAltTitle: {
    color: '#aeb1ac',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 1,
  },
});
