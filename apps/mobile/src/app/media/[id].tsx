import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  TextInput,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { api, ConflictItem, HydrationProgress, MediaNewsArticle } from '../../services/api';
import { theme } from '../../constants/theme';
import { TopBar } from '../../components/TopBar';
import { GoldenGlow } from '../../components/GoldenGlow';
import { PosterPlaceholder } from '../../components/PosterPlaceholder';
import { EmojiRating } from '../../components/EmojiRating';
import { EpisodeGuideProgress } from '../../components/EpisodeGuideProgress';
import { ConflictResolutionModal } from '../../components/ConflictResolutionModal';
import { SeasonAccordion } from '../../components/SeasonAccordion';
import { MediaTemplateSections } from '../../components/MediaTemplateSections';
import { useSubpageBack } from '../../hooks/useSubpageBack';

export default function MediaDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  useSubpageBack('/(tabs)');

  // Local interactive states
  const [notesText, setNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [hydrationProgress, setHydrationProgress] = useState<HydrationProgress | null>(null);
  const [newsArticles, setNewsArticles] = useState<MediaNewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  const hydrationPollingRef = useRef<boolean>(false);
  const autoHydrateTriedRef = useRef<Set<string>>(new Set());

  // 1. Fetch Media Detail
  const {
    data,
    isLoading,
    isError,
    error,
    refetch: refetchDetails,
  } = useQuery({
    queryKey: ['mediaDetails', id],
    queryFn: () => api.getMediaDetails(id),
    enabled: Boolean(id),
  });

  // Sync notes text when data loads
  useEffect(() => {
    if (data?.userMedia?.notes !== undefined) {
      setNotesText(data.userMedia.notes || '');
    }
  }, [data?.userMedia?.notes]);

  // 2. Fetch Episodes for Series
  const isSeries = data?.media.type === 'show' || data?.media.type === 'anime';
  const {
    data: episodesData,
    refetch: refetchEpisodes,
  } = useQuery({
    queryKey: ['mediaEpisodes', id],
    queryFn: () => api.getMediaEpisodes(id),
    enabled: Boolean(id && isSeries),
  });

  // 3. Fetch Units for Books/Games
  const isUnitTrackable = data?.media.type === 'book' || data?.media.type === 'game';
  const {
    data: unitsData,
    refetch: refetchUnits,
  } = useQuery({
    queryKey: ['mediaUnits', id],
    queryFn: () => api.getMediaUnits(id),
    enabled: Boolean(id && isUnitTrackable),
  });

  const handleUpdated = () => {
    refetchDetails();
    if (isSeries) refetchEpisodes();
    if (isUnitTrackable) refetchUnits();
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  // 4. Background Hydration & Conflict Inspection Lifecycle
  useEffect(() => {
    if (!id || !data?.media) return;

    let cancelled = false;

    // Check for pending conflicts
    const loadConflicts = async () => {
      try {
        const res = await api.getMediaConflicts(id);
        if (!cancelled && res.conflicts?.length) {
          setConflicts(res.conflicts);
        }
      } catch {
        // Ignored
      }
    };
    void loadConflicts();

    // Check if media needs hydration
    const ext = (() => {
      try {
        return data.media.extendedDataJson ? JSON.parse(data.media.extendedDataJson) : {};
      } catch {
        return {};
      }
    })();

    const hydratedAt = ext.hydratedAt ? new Date(ext.hydratedAt).getTime() : 0;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const isStale = hydratedAt > 0 && Date.now() - hydratedAt > SEVEN_DAYS_MS;
    const hasHydratedDetails = Boolean(hydratedAt) || Boolean(ext.cast?.length);

    // Polling for hydration progress
    const pollProgress = async () => {
      if (cancelled) return;
      try {
        const res = await api.getHydrationStatus(id);
        if (cancelled) return;

        const isRefreshing =
          res.progress?.status === 'refreshing' ||
          res.progress?.activeJobs > 0 ||
          res.progress?.runningJobs > 0 ||
          res.progress?.queuedJobs > 0;

        setHydrationProgress(isRefreshing ? res.progress : null);

        if (isRefreshing) {
          hydrationPollingRef.current = true;
          setTimeout(pollProgress, 3000);
        } else if (hydrationPollingRef.current) {
          hydrationPollingRef.current = false;
          // Finished! Refresh details, episodes, and check for conflicts
          handleUpdated();
          void loadConflicts();
        }
      } catch {
        // Ignored
      }
    };

    // Hydrate only if never hydrated, episodes are missing for series, or TTL expired
    const missingEpisodes = isSeries && (!episodesData?.episodes || episodesData.episodes.length === 0);
    const shouldHydrate = !hasHydratedDetails || missingEpisodes || isStale;

    if (shouldHydrate && !autoHydrateTriedRef.current.has(id)) {
      autoHydrateTriedRef.current.add(id);
      void (async () => {
        try {
          await api.triggerMediaRefresh(id);
          void pollProgress();
        } catch {
          // Ignored
        }
      })();
    }

    void pollProgress();

    return () => {
      cancelled = true;
    };
  }, [id, data?.media?.id]);

  // 5. Load News
  const loadNews = async (refresh = false) => {
    if (!id) return;
    try {
      setNewsLoading(true);
      const res = await api.getMediaNews(id, refresh);
      setNewsArticles(res.articles || []);
    } catch {
      // Ignored
    } finally {
      setNewsLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      void loadNews();
    }
  }, [id]);

  // 6. User Tracking Interactions
  const handleToggleFavorite = async () => {
    if (!id || !data?.userMedia) return;
    const nextVal = !data.userMedia.isFavorite;
    try {
      await api.updateMediaLibrary(id, { isFavorite: nextVal });
      handleUpdated();
    } catch (e) {
      console.error('Failed to toggle favorite', e);
    }
  };

  const handleManualStatus = async (status: string) => {
    if (!id) return;
    const current = data?.userMedia?.status;
    const nextVal = current === status ? 'planning' : status;
    try {
      await api.updateMediaLibrary(id, { status: nextVal });
      handleUpdated();
    } catch (e) {
      console.error('Failed to update status', e);
    }
  };

  const handleRating = async (rating: number | null) => {
    if (!id) return;
    try {
      await api.updateMediaLibrary(id, { rating });
      handleUpdated();
    } catch (e) {
      console.error('Failed to update rating', e);
    }
  };

  const handleSaveNotes = async () => {
    if (!id || savingNotes) return;
    setSavingNotes(true);
    try {
      await api.updateMediaLibrary(id, { notes: notesText.trim() || null });
    } catch (e) {
      console.error('Failed to save notes', e);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleResolveConflicts = async (resolutions: Record<string, 'accept' | 'keep'>) => {
    if (!id) return;
    const res = await api.resolveMediaConflicts(id, resolutions);
    setConflicts(res.remainingConflicts || []);
    handleUpdated();
  };

  const handleManualRefresh = async () => {
    if (!id) return;
    setMenuOpen(false);
    try {
      await api.triggerMediaRefresh(id);
      const statusRes = await api.getHydrationStatus(id);
      setHydrationProgress(statusRes.progress);
    } catch (e) {
      console.error('Failed to trigger refresh', e);
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
    ? media.posterPath.startsWith('http')
      ? media.posterPath
      : `https://tmdb-image-prod.b-cdn.net/t/p/w500${media.posterPath}`
    : null;

  const backdropUrl = media.backdropPath
    ? media.backdropPath.startsWith('http')
      ? media.backdropPath
      : `https://tmdb-image-prod.b-cdn.net/t/p/w780${media.backdropPath}`
    : null;

  const episodes = episodesData?.episodes || [];
  const regularEpisodes = episodes.filter((ep) => !ep.isSpecial);
  const totalRegularCount = regularEpisodes.length;
  const watchedRegularCount = regularEpisodes.filter((ep) => ep.activity?.watched).length;
  const progressPercent =
    totalRegularCount > 0 ? Math.round((watchedRegularCount / totalRegularCount) * 100) : 0;

  // Up Next Episode
  const nextEpisode = regularEpisodes
    .slice()
    .sort((a, b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) || a.episodeNumber - b.episodeNumber)
    .find((ep) => !ep.activity?.watched);

  const mediaInitials = (media.title || 'TU').slice(0, 2).toUpperCase();

  const releaseYear = media.year || (media.releaseDate ? new Date(media.releaseDate).getFullYear() : null);
  const formattedReleaseDate = media.releaseDate
    ? new Date(media.releaseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : releaseYear ? String(releaseYear) : null;

  return (
    <View style={styles.container}>
      <GoldenGlow />

      {/* Atmospheric Background using poster image with heavy dark gradient */}
      {(posterUrl || backdropUrl) && (
        <View style={styles.atmosphericBackdropContainer} pointerEvents="none">
          <Image
            source={{ uri: (posterUrl || backdropUrl) as string }}
            style={styles.atmosphericBackdrop}
            contentFit="cover"
            blurRadius={18}
          />
          <View style={styles.atmosphericBackdropOverlay} />
        </View>
      )}

      {/* TopBar matching mobile global navigation */}
      <TopBar />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Circular Back Button */}
        <View style={styles.topActionRow}>
          <Pressable style={styles.circularBackButton} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color="#f8f7f2" />
          </Pressable>
        </View>

        {/* 1. Header Information (matching Screenshot 1) */}
        <View style={styles.headerInfoSection}>
          <Text style={styles.mediaTypeEyebrow}>{media.type.toUpperCase()}</Text>
          <Text style={styles.mediaTitle}>{media.title}</Text>
          {media.overview ? (
            <Text style={styles.mediaOverview}>{media.overview}</Text>
          ) : null}
        </View>

        {/* 2. Banner Card (16:9) with Options Button (matching Screenshot 1) */}
        <View style={styles.bannerContainer}>
          {backdropUrl || posterUrl ? (
            <Image
              source={{ uri: (backdropUrl || posterUrl) as string }}
              style={styles.bannerImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.bannerPlaceholder}>
              <PosterPlaceholder title={media.title} type={media.type} />
            </View>
          )}

          {/* Three-dots Menu Button on top right */}
          <Pressable
            style={styles.bannerMenuButton}
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color="#f8f7f2" />
          </Pressable>
        </View>

        {/* Conflict Review Banner (if conflicting metadata detected) */}
        {conflicts.length > 0 && (
          <Pressable
            style={styles.conflictBanner}
            onPress={() => setConflictModalOpen(true)}
          >
            <View style={styles.conflictBannerLeft}>
              <Ionicons name="git-pull-request-outline" size={18} color={theme.colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.conflictBannerTitle}>
                  Provider Updates Available ({conflicts.length} differences)
                </Text>
                <Text style={styles.conflictBannerSub}>
                  Tap to review and choose which details to keep or update.
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.accent} />
          </Pressable>
        )}

        {/* 3. Metadata & Tracking Status Card (matching Screenshot 2) */}
        <View style={styles.trackingCard}>
          {/* Metadata Row: Calendar Date, Language, TMDB source */}
          <View style={styles.metaRow}>
            {formattedReleaseDate && (
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={14} color="#aeb1ac" />
                <Text style={styles.metaItemText}>{formattedReleaseDate}</Text>
              </View>
            )}
            {media.language && (
              <Text style={styles.metaItemText}>{media.language.toUpperCase()}</Text>
            )}
            <Text style={styles.metaItemText}>
              {media.source ? media.source.toUpperCase() : 'TMDB'}
            </Text>
          </View>

          {/* MANUAL STATUS & Favorite Heart */}
          <View style={styles.statusHeaderRow}>
            <Text style={styles.sectionEyebrow}>MANUAL STATUS</Text>
            {userMedia && (
              <Pressable
                style={[
                  styles.favoriteButton,
                  userMedia.isFavorite && styles.favoriteButtonActive,
                ]}
                onPress={handleToggleFavorite}
                hitSlop={8}
              >
                <Ionicons
                  name={userMedia.isFavorite ? 'heart' : 'heart-outline'}
                  size={18}
                  color={userMedia.isFavorite ? '#ff4b4b' : '#aeb1ac'}
                />
              </Pressable>
            )}
          </View>

          {/* Status Buttons: Watch Later, Stopped */}
          <View style={styles.statusButtonsRow}>
            <Pressable
              style={[
                styles.statusPill,
                userMedia?.status === 'watch_later' && styles.statusPillActive,
              ]}
              onPress={() => handleManualStatus('watch_later')}
            >
              <Ionicons
                name="time-outline"
                size={14}
                color={userMedia?.status === 'watch_later' ? theme.colors.accent : '#aeb1ac'}
              />
              <Text
                style={[
                  styles.statusPillText,
                  userMedia?.status === 'watch_later' && styles.statusPillTextActive,
                ]}
              >
                Watch Later
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.statusPill,
                userMedia?.status === 'stopped' && styles.statusPillActive,
              ]}
              onPress={() => handleManualStatus('stopped')}
            >
              <Ionicons
                name="square-outline"
                size={14}
                color={userMedia?.status === 'stopped' ? theme.colors.accent : '#aeb1ac'}
              />
              <Text
                style={[
                  styles.statusPillText,
                  userMedia?.status === 'stopped' && styles.statusPillTextActive,
                ]}
              >
                Stopped
              </Text>
            </Pressable>
          </View>

          {/* Your rating with 5 Emojis */}
          <EmojiRating
            value={userMedia?.rating ?? null}
            onChange={handleRating}
            label="Your rating"
          />

          {/* Progress Header & Bar (for Series) */}
          {isSeries && (
            <View style={styles.progressSection}>
              <View style={styles.progressHeaderRow}>
                <Text style={styles.progressLabel}>Progress</Text>
                <Text style={styles.progressCountText}>
                  {watchedRegularCount} / {totalRegularCount} available episodes ({progressPercent}%)
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
              </View>
            </View>
          )}

          {/* UP NEXT Card (matching Screenshot 2) */}
          {isSeries && nextEpisode && (
            <View style={styles.upNextCard}>
              <Text style={styles.upNextEyebrow}>UP NEXT</Text>
              <Pressable
                style={styles.upNextRow}
                onPress={() => router.push(`/media/${id}/episodes/${nextEpisode.id}` as any)}
              >
                {/* Initials / Still Box */}
                {nextEpisode.stillPath ? (
                  <Image
                    source={{ uri: nextEpisode.stillPath }}
                    style={styles.upNextThumb}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.upNextInitialsBox}>
                    <Text style={styles.upNextInitialsText}>{mediaInitials}</Text>
                  </View>
                )}

                {/* Details */}
                <View style={styles.upNextMeta}>
                  <Text style={styles.upNextCode}>
                    S{String(nextEpisode.seasonNumber ?? 0).padStart(2, '0')}xE{String(
                      nextEpisode.episodeNumber
                    ).padStart(2, '0')}
                  </Text>
                  <Text style={styles.upNextTitle} numberOfLines={1}>
                    {nextEpisode.title || `Episode ${nextEpisode.episodeNumber}`}
                  </Text>
                </View>

                {/* Air Date / TBA Chip */}
                <View style={styles.tbaChip}>
                  <Text style={styles.tbaChipText}>
                    {nextEpisode.airDate ? nextEpisode.airDate.slice(0, 4) : 'TBA'}
                  </Text>
                </View>
              </Pressable>
            </View>
          )}

          {/* PRIVATE NOTES (matching Screenshot 2) */}
          <View style={styles.notesSection}>
            <Text style={styles.sectionEyebrow}>PRIVATE NOTES</Text>
            <TextInput
              style={styles.notesInput}
              multiline
              numberOfLines={4}
              placeholder="Add your private notes or review here. Auto-saves on blur."
              placeholderTextColor="#8b8e89"
              value={notesText}
              onChangeText={setNotesText}
              onBlur={handleSaveNotes}
            />
          </View>
        </View>

        {/* 4. Episode Guide Section (matching Screenshot 3) */}
        {isSeries && (
          <SeasonAccordion
            mediaId={id}
            mediaTitle={media.title}
            episodes={episodes}
            onEpisodesUpdated={handleUpdated}
            progressComponent={
              hydrationProgress ? (
                <EpisodeGuideProgress progress={hydrationProgress} />
              ) : null
            }
          />
        )}

        {/* Units Guide (for Books & Games) */}
        {isUnitTrackable && unitsData?.units && unitsData.units.length > 0 && (
          <View style={styles.unitsSection}>
            <Text style={styles.sectionEyebrow}>PROGRESS GUIDE</Text>
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

        {/* 5. Template Sections (News, Streaming, Info chips, Cast, Related, Ratings, Community) */}
        <MediaTemplateSections
          media={media}
          newsArticles={newsArticles}
          newsLoading={newsLoading}
          onReloadNews={() => void loadNews(true)}
          dateRangeLabel={formattedReleaseDate}
        />
      </ScrollView>

      {/* Options Menu Bottom Sheet */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle}>{media.title}</Text>

            <Pressable style={styles.menuItem} onPress={handleManualRefresh}>
              <Ionicons name="refresh-outline" size={18} color="#f8f7f2" />
              <Text style={styles.menuItemText}>Refresh Extra Details</Text>
            </Pressable>

            {conflicts.length > 0 && (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  setConflictModalOpen(true);
                }}
              >
                <Ionicons name="git-pull-request-outline" size={18} color={theme.colors.accent} />
                <Text style={[styles.menuItemText, { color: theme.colors.accent }]}>
                  Review Metadata Differences ({conflicts.length})
                </Text>
              </Pressable>
            )}

            <Pressable style={[styles.menuItem, styles.menuCancel]} onPress={() => setMenuOpen(false)}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Conflict Resolution Modal */}
      <ConflictResolutionModal
        open={conflictModalOpen}
        onClose={() => setConflictModalOpen(false)}
        conflicts={conflicts}
        onResolve={handleResolveConflicts}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101112',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#101112',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#aeb1ac',
    marginTop: 12,
    fontSize: 14,
  },
  errorTitle: {
    color: '#f8f7f2',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  errorSubtitle: {
    color: '#aeb1ac',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.accent,
  },
  backButtonText: {
    color: '#101112',
    fontWeight: '700',
    fontSize: 14,
  },
  // Atmospheric Backdrop
  atmosphericBackdropContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 480,
    overflow: 'hidden',
  },
  atmosphericBackdrop: {
    width: '100%',
    height: '100%',
    opacity: 0.28,
  },
  atmosphericBackdropOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(16, 17, 18, 0.85)',
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 40,
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
  // Header Information
  headerInfoSection: {
    marginBottom: 14,
  },
  mediaTypeEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: theme.colors.accent,
    marginBottom: 4,
  },
  mediaTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f8f7f2',
    lineHeight: 34,
    marginBottom: 10,
  },
  mediaOverview: {
    fontSize: 13,
    lineHeight: 20,
    color: '#dcded9',
  },
  // 16:9 Banner Card
  bannerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 14,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerPlaceholder: {
    width: '100%',
    height: '100%',
  },
  bannerMenuButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(16, 17, 18, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  // Conflict Alert Banner
  conflictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 191, 71, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 191, 71, 0.3)',
    borderRadius: theme.borderRadius.md,
    padding: 12,
    marginBottom: 14,
  },
  conflictBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  conflictBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8f7f2',
  },
  conflictBannerSub: {
    fontSize: 11,
    color: '#dcded9',
    marginTop: 2,
  },
  // Tracking Card
  trackingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    padding: 14,
    gap: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#aeb1ac',
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: theme.colors.accent,
  },
  favoriteButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteButtonActive: {
    backgroundColor: 'rgba(255, 75, 75, 0.16)',
    borderColor: '#ff4b4b',
  },
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  statusPillActive: {
    backgroundColor: 'rgba(255, 191, 71, 0.16)',
    borderColor: theme.colors.accent,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#aeb1ac',
  },
  statusPillTextActive: {
    color: '#f8f7f2',
  },
  // Progress
  progressSection: {
    marginTop: 4,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8f7f2',
  },
  progressCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.accent,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#38b000',
  },
  // Up Next Card
  upNextCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 10,
  },
  upNextEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: theme.colors.accent,
    marginBottom: 6,
  },
  upNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  upNextThumb: {
    width: 42,
    height: 42,
    borderRadius: 6,
  },
  upNextInitialsBox: {
    width: 42,
    height: 42,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 191, 71, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 191, 71, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  upNextInitialsText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.accent,
  },
  upNextMeta: {
    flex: 1,
  },
  upNextCode: {
    fontSize: 11,
    fontWeight: '600',
    color: '#aeb1ac',
  },
  upNextTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8f7f2',
  },
  tbaChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  tbaChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#aeb1ac',
  },
  // Notes
  notesSection: {
    marginTop: 4,
  },
  notesInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.borderRadius.sm,
    padding: 10,
    color: '#f8f7f2',
    fontSize: 12,
    lineHeight: 18,
    minHeight: 70,
    textAlignVertical: 'top',
    marginTop: 6,
  },
  // Units (Books/Games)
  unitsSection: {
    marginTop: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8f7f2',
    marginBottom: 10,
    marginTop: 2,
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
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.accent,
    textTransform: 'uppercase',
  },
  unitTitle: {
    fontSize: 13,
    color: '#f8f7f2',
  },
  // Menu Modal
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#161819',
    borderTopLeftRadius: theme.borderRadius.md,
    borderTopRightRadius: theme.borderRadius.md,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8f7f2',
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  menuItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f8f7f2',
  },
  menuCancel: {
    marginTop: 6,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  menuCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8b8e89',
  },
});
