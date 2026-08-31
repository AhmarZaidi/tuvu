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
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { api, ConflictItem, EpisodeWithActivity, HydrationProgress, MediaNewsArticle } from '../../services/api';
import { theme } from '../../constants/theme';
import { TopBar } from '../../components/TopBar';
import { GoldenGlow } from '../../components/GoldenGlow';
import { PosterPlaceholder } from '../../components/PosterPlaceholder';
import { EmojiRating } from '../../components/EmojiRating';
import { EpisodeGuideProgress } from '../../components/EpisodeGuideProgress';
import { ConflictResolutionModal } from '../../components/ConflictResolutionModal';
import { SeasonAccordion } from '../../components/SeasonAccordion';
import { MediaTemplateSections } from '../../components/MediaTemplateSections';
import { BottomSheet } from '../../components/BottomSheet';
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
  const [expandedOverview, setExpandedOverview] = useState(false);
  const [isAddingToLibrary, setIsAddingToLibrary] = useState(false);
  const [busyEpisodeId, setBusyEpisodeId] = useState<string | null>(null);

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

        const isFailed =
          res.progress?.status === 'needs_retry' ||
          (res.progress?.failedJobs > 0 && res.progress?.activeJobs === 0);

        setHydrationProgress((isRefreshing || isFailed) ? res.progress : null);

        if (isRefreshing) {
          hydrationPollingRef.current = true;
          setTimeout(pollProgress, 2500);
        } else if (hydrationPollingRef.current) {
          hydrationPollingRef.current = false;
          if (!isFailed) {
            handleUpdated();
            void loadConflicts();
          }
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

  const handleToggleFavorite = async () => {
    if (!id) return;
    if (!data?.userMedia) {
      try {
        await api.addToLibrary(id);
        await api.updateMediaLibrary(id, { isFavorite: true });
        handleUpdated();
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['allLibrary'] });
      } catch (e) {
        console.error('Failed to add and favorite', e);
      }
      return;
    }
    const nextVal = !data.userMedia.isFavorite;
    try {
      await api.updateMediaLibrary(id, { isFavorite: nextVal });
      handleUpdated();
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['allLibrary'] });
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

  const handleQuickToggleUpNext = async (ep: EpisodeWithActivity) => {
    setBusyEpisodeId(ep.id);
    try {
      const isWatched = Boolean(ep.activity?.watched);
      await api.updateEpisodeAction(ep.id, isWatched ? 'not_watched' : 'watched_once');
      handleUpdated();
    } catch (e) {
      console.error('Failed to toggle up next watched', e);
    } finally {
      setBusyEpisodeId(null);
    }
  };

  const handleMarkAllWatched = async () => {
    if (!data?.media) return;
    setMenuOpen(false);
    try {
      const regularEpisodes = (episodesData?.episodes || []).filter((ep) => !ep.isSpecial);
      const regularSeasons = Array.from(new Set(regularEpisodes.map((e) => e.seasonNumber ?? 1)));
      await Promise.all(
        regularSeasons.map((sn) => api.bulkMarkSeason(data.media.id, sn, true))
      );
      handleUpdated();
    } catch (e) {
      console.error('Failed to mark all watched', e);
    }
  };

  const handleResetProgress = async () => {
    if (!data?.media) return;
    setMenuOpen(false);
    try {
      const regularEpisodes = (episodesData?.episodes || []).filter((ep) => !ep.isSpecial);
      const regularSeasons = Array.from(new Set(regularEpisodes.map((e) => e.seasonNumber ?? 1)));
      await Promise.all(
        regularSeasons.map((sn) => api.updateSeasonAction(data.media.id, sn, 'not_watched'))
      );
      handleUpdated();
    } catch (e) {
      console.error('Failed to reset progress', e);
    }
  };

  const handleRemoveFromLibrary = async () => {
    if (!id) return;
    setMenuOpen(false);
    try {
      await api.removeFromLibrary(id);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['allLibrary'] });
      router.back();
    } catch (e) {
      console.error('Failed to remove from library', e);
    }
  };

  const [isChangingType, setIsChangingType] = useState(false);

  const handleChangeMediaType = async (newType: string) => {
    if (!data?.media || data.media.type === newType) return;
    setIsChangingType(true);
    try {
      await api.updateMediaType(data.media.id, newType);
      handleUpdated();
      queryClient.invalidateQueries({ queryKey: ['media', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['allLibrary'] });
    } catch (e) {
      console.error('Failed to change media type', e);
      Alert.alert('Error', 'Failed to update media type.');
    } finally {
      setIsChangingType(false);
    }
  };

  const handleToggleAnimeClassification = async () => {
    if (!data?.media) return;
    setMenuOpen(false);
    try {
      const currentAnime = data.media.type === 'anime';
      await api.updateMediaClassification(data.media.id, !currentAnime);
      handleUpdated();
    } catch (e) {
      console.error('Failed to toggle classification', e);
    }
  };

  const handleAddToLibrary = async () => {
    if (!id) return;
    setIsAddingToLibrary(true);
    try {
      await api.addToLibrary(id);
      handleUpdated();
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['allLibrary'] });
    } catch (e) {
      console.error('Failed to add to library', e);
    } finally {
      setIsAddingToLibrary(false);
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
  const regularEpisodes = episodes.filter((ep) => !ep.isSpecial && (ep.seasonNumber ?? 0) > 0);
  const totalRegularCount = regularEpisodes.length;
  const watchedRegularCount = regularEpisodes.filter((ep) => ep.activity?.watched).length;
  const progressPercent =
    totalRegularCount > 0 ? Math.round((watchedRegularCount / totalRegularCount) * 100) : 0;

  // Up Next Episode (Only main episodes, strictly excluding specials)
  const nextEpisode = regularEpisodes
    .slice()
    .sort((a, b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) || a.episodeNumber - b.episodeNumber)
    .find((ep) => !ep.activity?.watched && !ep.isSpecial && (ep.seasonNumber ?? 0) > 0);

  const mediaInitials = (media.title || 'TU').slice(0, 2).toUpperCase();

  const formattedReleaseDate = formatMediaDateRange(media, regularEpisodes);

  return (
    <View style={styles.container}>
      <GoldenGlow />

      {/* Atmospheric Background with vibrant portrait poster image covering full screen */}
      {(posterUrl || backdropUrl) && (
        <View style={styles.atmosphericBackdropContainer} pointerEvents="none">
          <Image
            source={{ uri: (posterUrl || backdropUrl) as string }}
            style={styles.atmosphericBackdrop}
            contentFit="cover"
            blurRadius={12}
          />
          <LinearGradient
            colors={[
              'rgba(16, 17, 18, 0.3)',
              'rgba(16, 17, 18, 0.75)',
              '#101112',
            ]}
            locations={[0, 0.45, 0.9]}
            style={StyleSheet.absoluteFill}
          />
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

        {/* 1. Header Information */}
        <View style={styles.headerInfoSection}>
          <Text style={styles.mediaTypeEyebrow}>{media.type.toUpperCase()}</Text>
          <Text style={styles.mediaTitle}>{media.title}</Text>
          {media.overview ? (
            <View style={styles.overviewContainer}>
              <Text style={styles.mediaOverview}>
                {media.overview.length > 260 && !expandedOverview
                  ? `${media.overview.slice(0, 260)}...`
                  : media.overview}
              </Text>
              {media.overview.length > 260 && (
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

        {/* 3. Metadata & Tracking Status Card */}
        {!userMedia ? (
          <View style={styles.untrackedCard}>
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

            <Pressable
              style={styles.addToLibraryPrimaryBtn}
              onPress={handleAddToLibrary}
              disabled={isAddingToLibrary}
            >
              {isAddingToLibrary ? (
                <ActivityIndicator size="small" color="#101112" />
              ) : (
                <>
                  <Ionicons name="add" size={20} color="#101112" />
                  <Text style={styles.addToLibraryPrimaryText}>Add to library</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : (
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
            </View>

            {/* Status Buttons based on media type */}
            <View style={styles.statusButtonsRow}>
              {media.type === 'movie' ? (
                <>
                  <Pressable
                    style={[
                      styles.statusPill,
                      userMedia?.status === 'watched' && styles.statusPillActiveWatched,
                    ]}
                    onPress={() => handleManualStatus('watched')}
                  >
                    <Ionicons
                      name={userMedia?.status === 'watched' ? 'checkmark-circle' : 'checkmark-circle-outline'}
                      size={15}
                      color={userMedia?.status === 'watched' ? '#22c55e' : '#aeb1ac'}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        userMedia?.status === 'watched' && styles.statusPillTextActiveWatched,
                      ]}
                    >
                      Watched
                    </Text>
                  </Pressable>

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
                </>
              ) : media.type === 'book' ? (
                <>
                  <Pressable
                    style={[
                      styles.statusPill,
                      userMedia?.status === 'reading' && styles.statusPillActive,
                    ]}
                    onPress={() => handleManualStatus('reading')}
                  >
                    <Ionicons
                      name="book-outline"
                      size={14}
                      color={userMedia?.status === 'reading' ? theme.colors.accent : '#aeb1ac'}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        userMedia?.status === 'reading' && styles.statusPillTextActive,
                      ]}
                    >
                      Reading
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.statusPill,
                      userMedia?.status === 'finished' && styles.statusPillActiveWatched,
                    ]}
                    onPress={() => handleManualStatus('finished')}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={14}
                      color={userMedia?.status === 'finished' ? '#22c55e' : '#aeb1ac'}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        userMedia?.status === 'finished' && styles.statusPillTextActiveWatched,
                      ]}
                    >
                      Finished
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.statusPill,
                      userMedia?.status === 'want_to_read' && styles.statusPillActive,
                    ]}
                    onPress={() => handleManualStatus('want_to_read')}
                  >
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={userMedia?.status === 'want_to_read' ? theme.colors.accent : '#aeb1ac'}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        userMedia?.status === 'want_to_read' && styles.statusPillTextActive,
                      ]}
                    >
                      Want to Read
                    </Text>
                  </Pressable>
                </>
              ) : media.type === 'game' ? (
                <>
                  <Pressable
                    style={[
                      styles.statusPill,
                      userMedia?.status === 'playing' && styles.statusPillActive,
                    ]}
                    onPress={() => handleManualStatus('playing')}
                  >
                    <Ionicons
                      name="game-controller-outline"
                      size={14}
                      color={userMedia?.status === 'playing' ? theme.colors.accent : '#aeb1ac'}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        userMedia?.status === 'playing' && styles.statusPillTextActive,
                      ]}
                    >
                      Playing
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.statusPill,
                      userMedia?.status === 'completed' && styles.statusPillActiveWatched,
                    ]}
                    onPress={() => handleManualStatus('completed')}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={14}
                      color={userMedia?.status === 'completed' ? '#22c55e' : '#aeb1ac'}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        userMedia?.status === 'completed' && styles.statusPillTextActiveWatched,
                      ]}
                    >
                      Completed
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.statusPill,
                      userMedia?.status === 'planned' && styles.statusPillActive,
                    ]}
                    onPress={() => handleManualStatus('planned')}
                  >
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={userMedia?.status === 'planned' ? theme.colors.accent : '#aeb1ac'}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        userMedia?.status === 'planned' && styles.statusPillTextActive,
                      ]}
                    >
                      Planned
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
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
                </>
              )}
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

            {/* UP NEXT Card */}
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
                    <Text style={styles.upNextTitle} numberOfLines={1} ellipsizeMode="tail">
                      {nextEpisode.title || `Episode ${nextEpisode.episodeNumber}`}
                    </Text>
                  </View>

                  {/* One-tap checkmark or rewatch badge button */}
                  <Pressable
                    style={[
                      styles.upNextCheckButton,
                      nextEpisode.activity?.watched && styles.upNextCheckButtonWatched,
                    ]}
                    onPress={(e) => {
                      e.stopPropagation();
                      void handleQuickToggleUpNext(nextEpisode);
                    }}
                    hitSlop={8}
                    disabled={busyEpisodeId === nextEpisode.id}
                  >
                    {busyEpisodeId === nextEpisode.id ? (
                      <ActivityIndicator size="small" color="#101112" />
                    ) : nextEpisode.activity?.watched ? (
                      (nextEpisode.activity.rewatchCount ?? 0) > 0 ? (
                        <Text style={styles.rewatchMarkText}>
                          x{1 + (nextEpisode.activity.rewatchCount ?? 0)}
                        </Text>
                      ) : (
                        <Ionicons name="checkmark" size={18} color="#101112" />
                      )
                    ) : (
                      <Ionicons name="checkmark" size={18} color="#8b8e89" />
                    )}
                  </Pressable>
                </Pressable>
              </View>
            )}

            {/* PRIVATE NOTES */}
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
                editable={!savingNotes}
              />
            </View>
          </View>
        )}

        {/* 4. Episode Guide Section (matching Screenshot 3) */}
        {isSeries && (
          <SeasonAccordion
            mediaId={id}
            mediaTitle={media.title}
            isAnime={media.type === 'anime' || (media as any).extendedDataJson?.includes('anime')}
            episodes={episodes}
            onEpisodesUpdated={handleUpdated}
            progressComponent={
              hydrationProgress ? (
                <EpisodeGuideProgress
                  progress={hydrationProgress}
                  onRetry={handleManualRefresh}
                />
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
      <BottomSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={media.title}
        subtitle="Manage media details & classification"
        icon="options-outline"
      >
        <View style={styles.sheetContent}>
          {/* Media Type Selection Chips */}
          <View style={styles.typeSection}>
            <Text style={styles.typeSectionLabel}>MEDIA TYPE</Text>
            <View style={styles.typeChipsRow}>
              {(['show', 'anime', 'movie'] as const).map((typeKey) => {
                const isSelected = media.type === typeKey;
                const label = typeKey === 'show' ? 'TV Show' : typeKey === 'anime' ? 'Anime' : 'Movie';
                const iconName =
                  typeKey === 'show'
                    ? 'tv-outline'
                    : typeKey === 'anime'
                    ? 'sparkles-outline'
                    : 'film-outline';

                return (
                  <Pressable
                    key={typeKey}
                    style={[styles.typeChip, isSelected && styles.typeChipSelected]}
                    onPress={() => void handleChangeMediaType(typeKey)}
                    disabled={isChangingType}
                  >
                    <Ionicons
                      name={isSelected ? 'checkmark' : iconName}
                      size={14}
                      color={isSelected ? '#101112' : '#dcded9'}
                    />
                    <Text style={[styles.typeChipText, isSelected && styles.typeChipTextSelected]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Action Items List */}
          <View style={styles.actionsList}>
            {/* Refresh Show Details */}
            <Pressable style={styles.sheetActionItem} onPress={handleManualRefresh}>
              <Ionicons name="refresh-outline" size={18} color="#f8f7f2" />
              <Text style={styles.sheetActionItemText}>Refresh Show Details</Text>
            </Pressable>

            {/* Mark All Seasons Watched */}
            {isSeries && userMedia && (
              <Pressable
                style={styles.sheetActionItem}
                onPress={() => {
                  Alert.alert(
                    'Mark All as Watched',
                    `Mark all regular episodes of "${media.title}" as watched?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Mark All Watched', onPress: () => void handleMarkAllWatched() },
                    ]
                  );
                }}
              >
                <Ionicons name="checkmark-done-outline" size={18} color="#f8f7f2" />
                <Text style={styles.sheetActionItemText}>Mark All Seasons Watched</Text>
              </Pressable>
            )}

            {/* Reset Watch Progress */}
            {isSeries && userMedia && (
              <Pressable
                style={styles.sheetActionItem}
                onPress={() => {
                  Alert.alert(
                    'Reset Watch Progress',
                    `Unmark all watched episodes for "${media.title}"?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Reset Progress', style: 'destructive', onPress: () => void handleResetProgress() },
                    ]
                  );
                }}
              >
                <Ionicons name="refresh-circle-outline" size={18} color="#ff8585" />
                <Text style={[styles.sheetActionItemText, { color: '#ff8585' }]}>
                  Reset Watch Progress
                </Text>
              </Pressable>
            )}

            {/* Review Metadata Differences */}
            {conflicts.length > 0 && (
              <Pressable
                style={styles.sheetActionItem}
                onPress={() => {
                  setMenuOpen(false);
                  setConflictModalOpen(true);
                }}
              >
                <Ionicons name="git-pull-request-outline" size={18} color={theme.colors.accent} />
                <Text style={[styles.sheetActionItemText, { color: theme.colors.accent }]}>
                  Review Metadata Differences ({conflicts.length})
                </Text>
              </Pressable>
            )}

            {/* Remove from Library */}
            {userMedia && (
              <Pressable
                style={[styles.sheetActionItem, styles.sheetActionItemDanger]}
                onPress={() => {
                  Alert.alert(
                    'Remove from Library',
                    `Are you sure you want to remove "${media.title}" from your library?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => void handleRemoveFromLibrary() },
                    ]
                  );
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
                <Text style={[styles.sheetActionItemText, { color: '#ff6b6b' }]}>
                  Remove from Library
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </BottomSheet>

      {/* Conflict Resolution Modal */}
      <ConflictResolutionModal
        open={conflictModalOpen}
        onClose={() => setConflictModalOpen(false)}
        conflicts={conflicts}
        onResolve={handleResolveConflicts}
        mediaType={media.type}
        onTypeChange={handleChangeMediaType}
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
    bottom: 0,
    overflow: 'hidden',
  },
  atmosphericBackdrop: {
    width: '100%',
    height: '100%',
    opacity: 0.38,
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
  overviewContainer: {
    marginTop: 2,
  },
  mediaOverview: {
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
  // Untracked Card (When userMedia is null)
  untrackedCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    padding: 16,
    gap: 14,
  },
  addToLibraryPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    paddingVertical: 13,
  },
  addToLibraryPrimaryText: {
    color: '#101112',
    fontSize: 14,
    fontWeight: '700',
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
  statusPillActiveWatched: {
    backgroundColor: 'rgba(34, 197, 94, 0.16)',
    borderColor: '#22c55e',
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#aeb1ac',
  },
  statusPillTextActive: {
    color: '#f8f7f2',
  },
  statusPillTextActiveWatched: {
    color: '#22c55e',
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
    minWidth: 0,
    justifyContent: 'center',
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
    maxWidth: '100%',
  },
  upNextCheckButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  upNextCheckButtonWatched: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  rewatchMarkText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#101112',
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
  // Sheet Styles
  sheetContent: {
    paddingTop: 4,
    gap: 16,
  },
  typeSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  typeSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: theme.colors.accent,
    marginBottom: 8,
  },
  typeChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  typeChipSelected: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dcded9',
  },
  typeChipTextSelected: {
    color: '#101112',
    fontWeight: '800',
  },
  actionsList: {
    gap: 8,
  },
  sheetActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  sheetActionItemDanger: {
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
  },
  sheetActionItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f8f7f2',
  },
});

function latestEpisodeAirDate(episodes: EpisodeWithActivity[]): string | null {
  const dates = episodes
    .map((ep) => ep.airDate)
    .filter((d): d is string => Boolean(d))
    .sort();
  return dates[dates.length - 1] ?? null;
}

function formatMediaDateRange(
  media: { releaseDate?: string | null; year?: number | null; airStatus?: string | null; type: string },
  episodes: EpisodeWithActivity[]
): string | null {
  const start = media.releaseDate
    ? new Date(media.releaseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : media.year
    ? String(media.year)
    : null;

  if (!start) return 'Release TBA';
  if (media.type === 'movie') return start;

  if (media.airStatus === 'ended' || media.airStatus === 'released') {
    const endRaw = latestEpisodeAirDate(episodes) ?? media.releaseDate;
    if (!endRaw) return start;
    const end = new Date(endRaw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return end === start ? start : `${start} – ${end}`;
  }

  if (media.airStatus === 'continuing' || media.airStatus === 'upcoming') {
    return `${start} – Present`;
  }

  return start;
}

