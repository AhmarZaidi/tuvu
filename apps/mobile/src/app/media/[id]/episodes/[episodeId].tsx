import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  TextInput,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { api, EpisodeWithActivity } from '../../../../services/api';
import { theme } from '../../../../constants/theme';
import { TopBar } from '../../../../components/TopBar';
import { GoldenGlow } from '../../../../components/GoldenGlow';
import { EmojiRating } from '../../../../components/EmojiRating';
import { BottomSheet } from '../../../../components/BottomSheet';
import { useSubpageBack } from '../../../../hooks/useSubpageBack';
import { getLanguageName } from '../../../../utils/language';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function EpisodeDetailsScreen() {
  const { id: mediaId, episodeId } = useLocalSearchParams<{ id: string; episodeId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  useSubpageBack(mediaId ? `/media/${mediaId}` : '/(tabs)');

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['episodeDetails', episodeId],
    queryFn: () => api.getEpisodeDetails(episodeId),
    enabled: Boolean(episodeId),
  });

  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedOverview, setExpandedOverview] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [watchSheetOpen, setWatchSheetOpen] = useState(false);

  useEffect(() => {
    if (data?.activity?.notes) {
      setNotes(data.activity.notes);
    }
  }, [data?.activity?.notes]);

  const episode = data?.episode;
  const media = data?.media;
  const activity = data?.activity;
  const isWatched = Boolean(activity?.watched);
  const rewatchCount = activity?.rewatchCount || 0;
  const rating = activity?.rating || null;

  // Extended Data
  let ext: Record<string, any> = {};
  if (episode?.extendedDataJson) {
    try {
      ext = typeof episode.extendedDataJson === 'string'
        ? JSON.parse(episode.extendedDataJson)
        : episode.extendedDataJson;
    } catch {
      ext = {};
    }
  }

  const cast: any[] = ext.cast || [];
  const crew: any[] = ext.crew || [];
  const externalRating = ext.rating ?? null;

  // Language Data
  let mediaExt: Record<string, any> = {};
  if (media?.extendedDataJson) {
    try {
      mediaExt = typeof media.extendedDataJson === 'string'
        ? JSON.parse(media.extendedDataJson)
        : media.extendedDataJson;
    } catch {
      mediaExt = {};
    }
  }

  const rawEpisodeOrigLang = ext.originalLanguage || mediaExt.originalLanguage || (media as any)?.language || null;
  const originalLanguageName = getLanguageName(rawEpisodeOrigLang);
  const episodeSpokenLanguages: Array<{ code: string; name: string }> = ext.spokenLanguages || mediaExt.spokenLanguages || [];
  const availableLanguagesList = episodeSpokenLanguages.length > 0
    ? episodeSpokenLanguages.map((l) => l.name || getLanguageName(l.code)).filter(Boolean)
    : (ext.languages || mediaExt.languages || []).map((code: string) => getLanguageName(code)).filter(Boolean);

  // Stills / Banner Images
  const stills: string[] = ext.stills || ext.images || [];
  const primaryStill = episode?.stillPath
    ? (episode.stillPath.startsWith('http')
        ? episode.stillPath
        : `https://tmdb-image-prod.b-cdn.net/t/p/w780${episode.stillPath}`)
    : null;

  const imageList: string[] = stills.length > 0
    ? stills.map((s) => (s.startsWith('http') ? s : `https://tmdb-image-prod.b-cdn.net/t/p/w780${s}`))
    : primaryStill
    ? [primaryStill]
    : [];

  const handleApplyWatchAction = async (action: 'not_watched' | 'rewatched' | 'watched_once') => {
    setWatchSheetOpen(false);
    setSaving(true);
    try {
      await api.updateEpisodeAction(episodeId, action, rewatchCount);
      await refetch();
      // Invalidate globally so media single page and dashboard are immediately updated
      if (mediaId) {
        queryClient.invalidateQueries({ queryKey: ['mediaEpisodes', mediaId] });
        queryClient.invalidateQueries({ queryKey: ['media', mediaId] });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['allLibrary'] });
    } catch (e) {
      console.error('Failed to update episode watch action', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSetRating = async (score: number | null) => {
    setSaving(true);
    try {
      await api.updateEpisodeActivity(episodeId, { rating: score });
      await refetch();
      if (mediaId) {
        queryClient.invalidateQueries({ queryKey: ['mediaEpisodes', mediaId] });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      console.error('Failed to set episode rating', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await api.updateEpisodeActivity(episodeId, { notes });
      await refetch();
    } catch (e) {
      console.error('Failed to save episode notes', e);
    } finally {
      setSaving(false);
    }
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const cardWidth = SCREEN_WIDTH - theme.spacing.md * 2;
    const offset = e.nativeEvent.contentOffset.x;
    const index = Math.round(offset / cardWidth);
    if (index !== activeImageIndex && index >= 0 && index < imageList.length) {
      setActiveImageIndex(index);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>Loading episode details...</Text>
      </View>
    );
  }

  if (isError || !episode) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Could not load episode</Text>
        <Text style={styles.errorSubtitle}>
          {(error as Error)?.message || 'Episode not found.'}
        </Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const cardWidth = SCREEN_WIDTH - theme.spacing.md * 2;
  const overview = episode.overview || episode.synopsis || '';
  const isOverviewLong = overview.length > 220;
  const displayedOverview = isOverviewLong && !expandedOverview
    ? `${overview.slice(0, 200)}...`
    : overview;

  const isAnime = Boolean(
    media?.type === 'anime' ||
    (media as any)?.extendedDataJson?.includes('anime') ||
    ext.category === 'anime' ||
    ext.titleRomaji ||
    ext.titleJapanese
  );
  const isFiller = Boolean(ext.isFiller || ext.filler || ext.animeEpisode?.isFiller);
  const isRecap = Boolean(ext.isRecap || ext.recap || ext.animeEpisode?.isRecap);
  const romajiTitle = ext.titleRomaji || ext.title_romanji || ext.animeEpisode?.titleRomaji || null;
  const japaneseTitle = ext.titleJapanese || ext.title_japanese || null;
  const dubAirDate =
    ext.dubAirDate ||
    ext.dubAired ||
    (episode as any).dubReleaseAt ||
    ext.animeEpisode?.dubAirDate ||
    (isAnime && episode.airDate ? new Date(new Date(episode.airDate).getTime() + 21 * 86400000).toISOString().slice(0, 10) : null);
  const hasDub = Boolean(ext.hasDub || ext.dubAvailable || ext.animeEpisode?.dubAvailable || dubAirDate || isAnime);

  const formattedAirDate = episode.airDate
    ? new Date(episode.airDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const dubCountdown = (() => {
    if (!dubAirDate) return null;
    const release = new Date(`${dubAirDate}T00:00:00`);
    if (Number.isNaN(release.getTime())) return null;
    const diff = release.getTime() - Date.now();
    if (diff <= 0) return null;
    const days = Math.ceil(diff / 86_400_000);
    if (days < 60) return `in ${days}d`;
    return `in ${Math.ceil(days / 30)}mo`;
  })();

  const formattedDubDate = dubAirDate
    ? dubCountdown
      ? `${new Date(dubAirDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (${dubCountdown})`
      : new Date(dubAirDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
    : null;

  return (
    <View style={styles.container}>
      <GoldenGlow />

      {/* Global TopBar matching app navigation */}
      <TopBar />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 1. Circular Back Button */}
        <View style={styles.topActionRow}>
          <Pressable style={styles.circularBackButton} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color="#f8f7f2" />
          </Pressable>
        </View>

        {/* 2. Show Name, Episode Name & Synopsis Header */}
        <View style={styles.headerSection}>
          <View style={styles.showNameRow}>
            <Text style={styles.showNameEyebrow}>{media?.title?.toUpperCase() || 'SERIES'}</Text>
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
          <Text style={styles.episodeTitle}>
            {episode.title || episode.name || `Episode ${episode.episodeNumber}`}
          </Text>
          {romajiTitle && romajiTitle !== episode.title && (
            <Text style={styles.episodeSubtitleRomaji}>
              {romajiTitle} {japaneseTitle ? `(${japaneseTitle})` : ''}
            </Text>
          )}

          {overview ? (
            <View style={styles.synopsisWrap}>
              <Text style={styles.synopsisText}>{displayedOverview}</Text>
              {isOverviewLong && (
                <Pressable
                  onPress={() => setExpandedOverview(!expandedOverview)}
                  style={styles.readMoreBtn}
                  hitSlop={6}
                >
                  <Text style={styles.readMoreText}>
                    {expandedOverview ? 'Collapse' : '...Read More'}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            <Text style={styles.mutedText}>No synopsis available for this episode.</Text>
          )}
        </View>

        {/* 3. Banner Image Card (16:9 Aspect Ratio with Season/Episode Badge) */}
        <View style={styles.bannerImageCard}>
          {imageList.length > 1 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleScroll}
                style={StyleSheet.absoluteFill}
              >
                {imageList.map((imgUrl, idx) => (
                  <View key={`${imgUrl}-${idx}`} style={{ width: cardWidth, height: '100%' }}>
                    <Image source={{ uri: imgUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  </View>
                ))}
              </ScrollView>

              {/* Dots indicator */}
              <View style={styles.dotsContainer}>
                {imageList.map((_, idx) => (
                  <View
                    key={idx}
                    style={[styles.dot, idx === activeImageIndex && styles.dotActive]}
                  />
                ))}
              </View>
            </>
          ) : imageList.length === 1 ? (
            <Image source={{ uri: imageList[0] }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="tv-outline" size={42} color="#555" />
            </View>
          )}

          {/* Season & Episode overlay badge */}
          <View style={styles.seasonEpisodeBadge}>
            <Text style={styles.seasonEpisodeBadgeText}>
              S{String(episode.seasonNumber ?? 1).padStart(2, '0')} • E{String(episode.episodeNumber).padStart(2, '0')}
            </Text>
          </View>
        </View>

        {/* 4. Metadata Chips & Refresh Info Button */}
        <View style={styles.metaChipsRow}>
          {formattedAirDate && (
            <View style={styles.metaChip}>
              <Ionicons name="calendar-outline" size={13} color="#aeb1ac" />
              <Text style={styles.metaChipText}>
                {isAnime ? `Sub: ${formattedAirDate}` : formattedAirDate}
              </Text>
            </View>
          )}

          {(formattedDubDate || hasDub) && (
            <View style={[styles.metaChip, styles.dubMetaChip]}>
              <Ionicons name="volume-high-outline" size={13} color="#22c55e" />
              <Text style={[styles.metaChipText, { color: '#22c55e' }]}>
                {formattedDubDate ? `Dub: ${formattedDubDate}` : 'Dub Available'}
              </Text>
            </View>
          )}

          {episode.runtimeMinutes ? (
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={13} color="#aeb1ac" />
              <Text style={styles.metaChipText}>{episode.runtimeMinutes}m</Text>
            </View>
          ) : null}

          {externalRating ? (
            <View style={styles.metaChip}>
              <Ionicons name="star" size={12} color={theme.colors.accent} />
              <Text style={styles.metaChipText}>{Number(externalRating).toFixed(1)}/10</Text>
            </View>
          ) : null}

          {/* Primary Language */}
          {originalLanguageName && (
            <View style={styles.metaChip}>
              <Ionicons name="language-outline" size={13} color={theme.colors.accent} />
              <Text style={styles.metaChipText}>{originalLanguageName}</Text>
            </View>
          )}

          {/* Available In */}
          {availableLanguagesList.length > 1 && (
            <View style={styles.metaChip}>
              <Ionicons name="globe-outline" size={13} color="#aeb1ac" />
              <Text style={styles.metaChipText}>
                Available in: {availableLanguagesList.slice(0, 3).join(', ')}
                {availableLanguagesList.length > 3 ? ` +${availableLanguagesList.length - 3}` : ''}
              </Text>
            </View>
          )}

          {/* Small icon-only refresh button */}
          <Pressable
            style={styles.iconRefreshBtn}
            onPress={() => void refetch()}
            hitSlop={6}
            disabled={isRefetching}
          >
            {isRefetching ? (
              <ActivityIndicator size="small" color="#f8f7f2" />
            ) : (
              <Ionicons name="refresh-outline" size={15} color="#f8f7f2" />
            )}
          </Pressable>
        </View>

        {/* 5. Watch Status Action Card */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardEyebrow}>WATCH STATUS</Text>
          <Pressable
            style={[
              styles.watchStatusButton,
              isWatched && styles.watchStatusButtonWatched,
            ]}
            onPress={() => setWatchSheetOpen(true)}
            disabled={saving}
          >
            <View style={styles.watchStatusLeft}>
              <View
                style={[
                  styles.watchStatusCheckCircle,
                  isWatched && styles.watchStatusCheckCircleActive,
                ]}
              >
                {isWatched ? (
                  rewatchCount > 0 ? (
                    <Text style={styles.rewatchBadgeText}>x{1 + rewatchCount}</Text>
                  ) : (
                    <Ionicons name="checkmark" size={16} color="#101112" />
                  )
                ) : (
                  <Ionicons name="checkmark" size={16} color="#8b8e89" />
                )}
              </View>

              <View>
                <Text style={styles.watchStatusTitle}>
                  {isWatched
                    ? rewatchCount > 0
                      ? `Rewatched (${1 + rewatchCount}x)`
                      : 'Watched'
                    : 'Mark as Watched'}
                </Text>
                <Text style={styles.watchStatusSubtitle}>
                  {isWatched
                    ? 'Tap to change watch status or add rewatch'
                    : 'Tap to update watch status'}
                </Text>
              </View>
            </View>

            <Ionicons name="chevron-forward" size={16} color="#8b8e89" />
          </Pressable>
        </View>

        {/* 6. Emoji Rating Card */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardEyebrow}>RATING</Text>
          <EmojiRating
            value={rating}
            onChange={handleSetRating}
            label="Your episode rating"
          />
        </View>

        {/* 7. Cast & Characters */}
        {cast.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.cardEyebrow}>GUEST STARS</Text>
            <Text style={styles.cardTitle}>Episode Cast ({cast.length})</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.castScroll}
            >
              {cast.map((actor, idx) => (
                <Pressable
                  key={`${actor.id}-${idx}`}
                  style={styles.castCard}
                  onPress={() => actor.id && router.push(`/people/${actor.id}` as any)}
                >
                  {actor.profilePath ? (
                    <Image
                      source={{ uri: actor.profilePath }}
                      style={styles.castPortrait}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.castPlaceholder}>
                      <Text style={styles.castInitials}>
                        {(actor.name || 'A').slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.castName} numberOfLines={1}>
                    {actor.name}
                  </Text>
                  <Text style={styles.castRole} numberOfLines={1}>
                    {actor.role || 'Guest'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 8. Crew (Directors & Writers) */}
        {crew.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.cardEyebrow}>CREW</Text>
            <View style={styles.crewWrap}>
              {crew.map((member, idx) => (
                <View key={`${member.id}-${idx}`} style={styles.crewChip}>
                  <Text style={styles.crewJob}>{member.job}:</Text>
                  <Text style={styles.crewName}>{member.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 9. Personal Notes */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardEyebrow}>PERSONAL NOTES</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Write notes on this episode..."
            placeholderTextColor="#8b8e89"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          <Pressable
            style={styles.saveNotesButton}
            onPress={handleSaveNotes}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#101112" />
            ) : (
              <Text style={styles.saveNotesButtonText}>Save Notes</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>

      {/* Watch Action Bottom Sheet */}
      <BottomSheet
        visible={watchSheetOpen}
        onClose={() => setWatchSheetOpen(false)}
        title={episode.title || `Episode ${episode.episodeNumber}`}
        subtitle={`Season ${episode.seasonNumber} • Episode ${episode.episodeNumber}`}
        icon="checkmark-circle-outline"
      >
        <View style={styles.sheetContent}>
          {/* Watched once */}
          <Pressable
            style={styles.sheetActionItem}
            onPress={() => void handleApplyWatchAction('watched_once')}
          >
            <Ionicons name="checkmark-circle-outline" size={22} color={theme.colors.accent} />
            <View style={styles.sheetActionCopy}>
              <Text style={styles.sheetActionText}>Watched once</Text>
              <Text style={styles.sheetActionSub}>Set as watched (1x)</Text>
            </View>
          </Pressable>

          {/* Rewatched */}
          <Pressable
            style={styles.sheetActionItem}
            onPress={() => void handleApplyWatchAction('rewatched')}
          >
            <Ionicons name="repeat-outline" size={22} color="#f8f7f2" />
            <View style={styles.sheetActionCopy}>
              <Text style={styles.sheetActionText}>Rewatched</Text>
              <Text style={styles.sheetActionSub}>Increment rewatch count (+1)</Text>
            </View>
          </Pressable>

          {/* Not watched */}
          <Pressable
            style={styles.sheetActionItem}
            onPress={() => void handleApplyWatchAction('not_watched')}
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
    flex: 1,
    backgroundColor: '#101112',
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 48,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#101112',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#aeb1ac',
    fontSize: 14,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8f7f2',
    marginTop: 12,
  },
  errorSubtitle: {
    fontSize: 13,
    color: '#aeb1ac',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.sm,
  },
  backButtonText: {
    color: '#101112',
    fontWeight: '700',
  },
  topActionRow: {
    marginTop: 8,
    marginBottom: 12,
  },
  circularBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Header Section
  headerSection: {
    marginBottom: 14,
  },
  showNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  showNameEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: theme.colors.accent,
  },
  fillerBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  fillerBadgeText: {
    color: '#ef4444',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  recapBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  recapBadgeText: {
    color: '#3b82f6',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  episodeSubtitleRomaji: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#aeb1ac',
    marginTop: -4,
    marginBottom: 8,
  },
  dubMetaChip: {
    borderColor: 'rgba(34, 197, 94, 0.3)',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  episodeTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f8f7f2',
    lineHeight: 30,
    marginBottom: 8,
  },
  synopsisWrap: {
    marginTop: 2,
  },
  synopsisText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#dcded9',
  },
  readMoreBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  readMoreText: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  mutedText: {
    fontSize: 13,
    color: '#8b8e89',
    marginTop: 4,
  },
  // Banner Image Card
  bannerImageCard: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#18191b',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 12,
    position: 'relative',
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#202326',
  },
  dotsContainer: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  dotActive: {
    width: 18,
    backgroundColor: theme.colors.accent,
  },
  seasonEpisodeBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(16, 17, 18, 0.85)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  seasonEpisodeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.accent,
    letterSpacing: 0.8,
  },
  // Metadata Row
  metaChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dcded9',
  },
  iconRefreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Section Cards
  sectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    padding: 14,
    marginBottom: 14,
  },
  cardEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: theme.colors.accent,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8f7f2',
    marginBottom: 10,
  },
  // Watch Status Button
  watchStatusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  watchStatusButtonWatched: {
    borderColor: 'rgba(255, 191, 71, 0.3)',
  },
  watchStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  watchStatusCheckCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  watchStatusCheckCircleActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  rewatchBadgeText: {
    color: '#101112',
    fontSize: 12,
    fontWeight: '900',
  },
  watchStatusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8f7f2',
  },
  watchStatusSubtitle: {
    fontSize: 11,
    color: '#8b8e89',
    marginTop: 1,
  },
  // Cast
  castScroll: {
    gap: 10,
    paddingVertical: 2,
  },
  castCard: {
    width: 78,
    alignItems: 'center',
  },
  castPortrait: {
    width: 78,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#202326',
    marginBottom: 4,
  },
  castPlaceholder: {
    width: 78,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#202326',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  castInitials: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.accent,
  },
  castName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#f8f7f2',
    textAlign: 'center',
  },
  castRole: {
    fontSize: 10,
    color: '#8b8e89',
    textAlign: 'center',
  },
  // Crew
  crewWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  crewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  crewJob: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  crewName: {
    fontSize: 11,
    color: '#dcded9',
  },
  // Notes
  notesInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.borderRadius.sm,
    padding: 10,
    color: '#f8f7f2',
    fontSize: 13,
    lineHeight: 19,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  saveNotesButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
  },
  saveNotesButtonText: {
    color: '#101112',
    fontWeight: '700',
    fontSize: 13,
  },
  // Sheet
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
});
