import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WebView } from 'react-native-webview';
import YoutubePlayer from 'react-native-youtube-iframe';
import { theme } from '../constants/theme';
import { api, MediaDetailData, MediaNewsArticle } from '../services/api';
import { getLanguageName } from '../utils/language';
import { EmbeddedStreamPlayer } from './EmbeddedStreamPlayer';

interface MediaTemplateSectionsProps {
  media: MediaDetailData['media'];
  newsArticles: MediaNewsArticle[];
  newsLoading: boolean;
  onReloadNews: () => void;
  dateRangeLabel?: string | null;
}

export function MediaTemplateSections({
  media,
  newsArticles,
  newsLoading,
  onReloadNews,
  dateRangeLabel,
}: MediaTemplateSectionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  let ext: Record<string, any> = {};
  try {
    ext = media.extendedDataJson ? JSON.parse(media.extendedDataJson) : {};
  } catch {
    ext = {};
  }

  const cast: any[] = ext.cast || [];
  const crew: any[] = ext.crew || [];
  const creators: any[] = ext.creators || [];
  const watchProviders: any[] = ext.watchProviders || [];
  const related: any[] = ext.related || [];
  const videos: any[] = ext.videos || [];
  const trailer = videos.find((v: any) => v.type === 'Trailer' && v.key) || videos.find((v: any) => v.key) || null;
  const networks: any[] = ext.networks || [];
  const networkName = networks[0]?.name || ext.network || null;

  const backdrops: string[] = ext.images?.backdrops || [];
  const posters: string[] = ext.images?.posters || [];
  const galleryImages = [...backdrops, ...posters];
  const [activeGalleryIndex, setActiveGalleryIndex] = useState<number | null>(null);

  const isAnime = media.type === 'anime' || ext.category === 'anime';
  const isMovie = media.type === 'movie' || ext.animeFormat === 'movie' || ext.format === 'MOVIE' || ext.anime?.format === 'MOVIE';

  const { data: streamData } = useQuery({
    queryKey: ['mediaStreamUrl', media?.id, isMovie],
    queryFn: () => api.getStreamUrl(media.id, { isEpisode: false }),
    enabled: Boolean(media?.id && isMovie),
  });

  const animeData = ext.anime || {};
  const studios: any[] = animeData.studios || ext.studios || [];
  const titles: any = animeData.titles || {};
  const characters: any[] = animeData.characters || ext.characters || [];
  const japaneseCast: any[] = animeData.japaneseCast || [];
  const dubCast: any[] = animeData.dubCast || [];
  const hasDub = Boolean(ext.hasDub || animeData.hasDub || dubCast.length > 0 || ext.audioLanguages?.includes('English'));
  const animeFormatLabel = useMemo(() => {
    const fmt = (ext.animeFormat || ext.format || animeData.format || '').toUpperCase();
    if (fmt === 'OVA' || media.title?.toUpperCase().includes(' OVA')) return 'Anime OVA';
    if (fmt === 'ONA' || media.title?.toUpperCase().includes(' ONA')) return 'Anime ONA';
    if (fmt === 'SPECIAL' || media.title?.toUpperCase().includes(' SPECIAL')) return 'Anime Special';
    if (fmt === 'MOVIE' || media.type === 'movie') return 'Anime Movie';
    return 'Anime Series';
  }, [ext.animeFormat, ext.format, animeData.format, media.type, media.title]);

  const [voiceCastTab, setVoiceCastTab] = useState<'sub' | 'dub'>('sub');

  const rawOrigLang = ext.originalLanguage || (media as any).language || ext.anime?.originalLanguage || null;
  const originalLanguageName = getLanguageName(rawOrigLang);
  const spokenLanguages: Array<{ code: string; name: string }> = ext.spokenLanguages || [];
  const availableLanguagesList = spokenLanguages.length > 0
    ? spokenLanguages.map((l) => l.name || getLanguageName(l.code)).filter(Boolean)
    : (ext.languages || []).map((code: string) => getLanguageName(code)).filter(Boolean);

  const [trackedIds, setTrackedIds] = useState<Set<string>>(() => {
    return new Set(
      related
        .filter((r: any) => r.alreadyTracked)
        .map((r: any) => String(r.id || r.providerId || r.localMediaId))
    );
  });
  const [addingId, setAddingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const handleQuickAddRelated = async (item: any) => {
    const key = String(item.id || item.providerId);
    setAddingId(key);
    try {
      if (item.localMediaId) {
        await api.addToLibrary(item.localMediaId);
      } else {
        await api.addExploreResult({
          provider: item.provider ?? 'tmdb',
          providerId: key,
          type: item.type || media.type,
          title: item.title,
          posterPath: item.posterPath,
          year: item.year,
        });
      }
      setTrackedIds((prev) => {
        const next = new Set(prev);
        next.add(key);
        if (item.id) next.add(String(item.id));
        if (item.providerId) next.add(String(item.providerId));
        if (item.localMediaId) next.add(String(item.localMediaId));
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['allLibrary'] });
    } catch (e) {
      console.error('Failed to add related media', e);
    } finally {
      setAddingId(null);
    }
  };

  const handleOpenRelated = async (item: any) => {
    if (item.localMediaId) {
      router.push(`/media/${item.localMediaId}` as any);
      return;
    }
    const key = String(item.id || item.providerId);
    setResolvingId(key);
    try {
      const res = await api.resolveMedia({
        provider: item.provider ?? 'tmdb',
        providerId: key,
        type: item.type || media.type,
        title: item.title,
        posterPath: item.posterPath,
        year: item.year,
      });
      router.push(`/media/${res.media.id}` as any);
    } catch {
      router.push(`/media/${item.id}` as any);
    } finally {
      setResolvingId(null);
    }
  };
  const genres: any[] = ext.genres || [];
  const rating = ext.rating;
  const voteCount = ext.voteCount;

  const directors = crew
    .filter((c: any) => c.job === 'Director')
    .map((c: any) => c.name)
    .slice(0, 3);
  const writers = crew
    .filter((c: any) => c.job === 'Writer' || c.job === 'Screenplay')
    .map((c: any) => c.name)
    .slice(0, 3);
  const producers = crew
    .filter((c: any) => c.job === 'Producer' || c.job === 'Executive Producer')
    .map((c: any) => c.name)
    .slice(0, 3);
  const creatorNames = creators.map((c: any) => c.name).slice(0, 3);

  return (
    <View style={styles.container}>
      {/* 1. NEWS SECTION */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.eyebrow}>NEWS</Text>
            <Text style={styles.sectionTitle}>Latest articles</Text>
          </View>
          <Pressable
            style={styles.reloadButton}
            onPress={onReloadNews}
            disabled={newsLoading}
          >
            {newsLoading ? (
              <ActivityIndicator size="small" color="#f8f7f2" />
            ) : (
              <Text style={styles.reloadButtonText}>Reload</Text>
            )}
          </Pressable>
        </View>

        {newsArticles.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {newsArticles.map((article, index) => (
              <Pressable
                key={article.url || index}
                style={styles.newsCard}
                onPress={() => article.url && Linking.openURL(article.url)}
              >
                {article.imageUrl ? (
                  <Image source={{ uri: article.imageUrl }} style={styles.newsThumb} contentFit="cover" />
                ) : (
                  <View style={styles.newsThumbPlaceholder}>
                    <Text style={styles.newsThumbInitials}>
                      {(article.sourceName || 'NEWS').slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.newsCopy}>
                  <Text style={styles.newsSource}>{article.sourceName}</Text>
                  <Text style={styles.newsHeadline} numberOfLines={2}>
                    {article.title}
                  </Text>
                  <Text style={styles.newsDate}>
                    {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.mutedText}>
              No cached news yet. Reload to fetch the latest articles.
            </Text>
          </View>
        )}
      </View>

      {/* 2. WHERE TO WATCH / STREAMING */}
      <View style={styles.sectionCard}>
        <Text style={styles.eyebrow}>WHERE TO WATCH</Text>
        <Text style={styles.sectionTitle}>Streaming</Text>

        {watchProviders.length > 0 ? (
          <View style={styles.providersWrap}>
            {watchProviders.map((provider: any, idx: number) => (
              <View key={`${provider.name}-${idx}`} style={styles.providerChip}>
                {provider.logoPath && (
                  <Image source={{ uri: provider.logoPath }} style={styles.providerLogo} contentFit="cover" />
                )}
                <Text style={styles.providerName}>{provider.name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.mutedText}>Availability has not been hydrated yet.</Text>
        )}
      </View>

      {/* 3. SHOW INFO BADGES */}
      <View style={styles.sectionCard}>
        <Text style={styles.eyebrow}>INFO</Text>
        <Text style={styles.sectionTitle}>
          {media.type === 'game'
            ? 'Game info'
            : media.type === 'book'
            ? 'Book info'
            : media.type === 'anime'
            ? 'Anime info'
            : 'Show info'}
        </Text>

        <View style={styles.infoGrid}>
          {/* Anime Format Badge */}
          {isAnime && (
            <View style={[styles.infoBadge, styles.infoBadgeAccent]}>
              <Ionicons name={animeFormatLabel === 'Anime Movie' ? 'film-outline' : 'tv-outline'} size={14} color={theme.colors.accent} />
              <Text style={[styles.infoBadgeText, { color: theme.colors.accent, fontWeight: '700' }]}>
                {animeFormatLabel}
              </Text>
            </View>
          )}

          {/* Dub Status Badge */}
          {isAnime && (
            <View style={[styles.infoBadge, hasDub && styles.infoBadgeSuccess]}>
              <Ionicons
                name={hasDub ? 'volume-high-outline' : 'chatbubble-ellipses-outline'}
                size={14}
                color={hasDub ? '#22c55e' : '#aeb1ac'}
              />
              <Text style={[styles.infoBadgeText, hasDub && { color: '#22c55e', fontWeight: '700' }]}>
                {hasDub ? 'Sub & Dub Available' : 'Subtitled'}
              </Text>
            </View>
          )}

          {/* Anime Studio Badge */}
          {isAnime && studios.length > 0 && (
            <View style={styles.infoBadge}>
              <Ionicons name="business-outline" size={14} color="#aeb1ac" />
              <Text style={styles.infoBadgeText} numberOfLines={1}>
                Studio: {studios.map((s: any) => s.name || s).join(', ')}
              </Text>
            </View>
          )}

          {/* Release Date */}
          <View style={styles.infoBadge}>
            <Ionicons name="calendar-outline" size={14} color="#aeb1ac" />
            <Text style={styles.infoBadgeText}>
              {dateRangeLabel || media.releaseDate || (media.year ? String(media.year) : 'Release TBA')}
            </Text>
          </View>

          {/* Runtime */}
          <View style={styles.infoBadge}>
            <Ionicons name="time-outline" size={14} color="#aeb1ac" />
            <Text style={styles.infoBadgeText}>
              {media.runtimeMinutes ? `${media.runtimeMinutes} min avg` : 'Runtime TBA'}
            </Text>
          </View>

          {/* Genres */}
          <View style={styles.infoBadge}>
            <Ionicons name="sparkles-outline" size={14} color="#aeb1ac" />
            <Text style={styles.infoBadgeText} numberOfLines={1}>
              {genres.length > 0 ? genres.map((g: any) => g.name || g).join(', ') : 'Genres TBA'}
            </Text>
          </View>

          {/* Director */}
          <View style={styles.infoBadge}>
            <Ionicons name="videocam-outline" size={14} color="#aeb1ac" />
            <Text style={styles.infoBadgeText} numberOfLines={1}>
              Director: {directors.join(', ') || 'TBA'}
            </Text>
          </View>

          {/* Writer */}
          <View style={styles.infoBadge}>
            <Ionicons name="book-outline" size={14} color="#aeb1ac" />
            <Text style={styles.infoBadgeText} numberOfLines={1}>
              Writer: {writers.join(', ') || 'TBA'}
            </Text>
          </View>

          {/* Producer */}
          <View style={styles.infoBadge}>
            <Ionicons name="star-outline" size={14} color="#aeb1ac" />
            <Text style={styles.infoBadgeText} numberOfLines={1}>
              Producer: {producers.join(', ') || 'TBA'}
            </Text>
          </View>

          {/* Creator */}
          {creatorNames.length > 0 && (
            <View style={styles.infoBadge}>
              <Ionicons name="person-outline" size={14} color="#aeb1ac" />
              <Text style={styles.infoBadgeText} numberOfLines={1}>
                Creator: {creatorNames.join(', ')}
              </Text>
            </View>
          )}

          {/* Network / Platform */}
          {networkName ? (
            <View style={styles.infoBadge}>
              <Ionicons name="tv-outline" size={14} color="#aeb1ac" />
              <Text style={styles.infoBadgeText} numberOfLines={1}>
                {networkName}
              </Text>
            </View>
          ) : null}

          {/* Primary Language */}
          {originalLanguageName && (
            <View style={styles.infoBadge}>
              <Ionicons name="language-outline" size={14} color={theme.colors.accent} />
              <Text style={styles.infoBadgeText} numberOfLines={1}>
                Primary: {originalLanguageName}
              </Text>
            </View>
          )}

          {/* Available Languages */}
          {availableLanguagesList.length > 0 && (
            <View style={styles.infoBadge}>
              <Ionicons name="globe-outline" size={14} color="#aeb1ac" />
              <Text style={styles.infoBadgeText} numberOfLines={1}>
                Available in: {availableLanguagesList.slice(0, 4).join(', ')}
                {availableLanguagesList.length > 4 ? ` +${availableLanguagesList.length - 4}` : ''}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ANIME ALTERNATIVE TITLES */}
      {isAnime && Boolean(titles.english || titles.romaji || titles.native) && (
        <View style={styles.sectionCard}>
          <Text style={styles.eyebrow}>TITLES</Text>
          <Text style={styles.sectionTitle}>Alternative titles</Text>
          <View style={styles.titlesList}>
            {titles.english && titles.english !== media.title && (
              <View style={styles.titleRow}>
                <Text style={styles.titleRowLabel}>English</Text>
                <Text style={styles.titleRowVal}>{titles.english}</Text>
              </View>
            )}
            {titles.romaji && titles.romaji !== media.title && (
              <View style={styles.titleRow}>
                <Text style={styles.titleRowLabel}>Romaji</Text>
                <Text style={styles.titleRowVal}>{titles.romaji}</Text>
              </View>
            )}
            {titles.native && (
              <View style={styles.titleRow}>
                <Text style={styles.titleRowLabel}>Japanese</Text>
                <Text style={[styles.titleRowVal, { color: theme.colors.accent }]}>{titles.native}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* CHARACTERS (ANIME) */}
      {characters.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.eyebrow}>CHARACTERS</Text>
          <Text style={styles.sectionTitle}>In-show characters</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {characters.map((char: any, idx: number) => (
              <Pressable
                key={`${char.id || char.name}-${idx}`}
                style={styles.characterCard}
                onPress={() => char.id && router.push(`/characters/${char.id}` as any)}
              >
                {char.image ? (
                  <Image source={{ uri: char.image }} style={styles.characterPortrait} contentFit="cover" />
                ) : (
                  <View style={styles.characterPlaceholder}>
                    <Text style={styles.characterInitials}>{(char.name || 'C').slice(0, 1)}</Text>
                  </View>
                )}
                <Text style={styles.characterName} numberOfLines={1}>
                  {char.name}
                </Text>
                <Text style={styles.characterRole} numberOfLines={1}>
                  {char.role || 'Character'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ANIME DUB & AUDIO INFO */}
      {isAnime && (
        <View style={styles.sectionCard}>
          <Text style={styles.eyebrow}>AUDIO & DUBBING</Text>
          <Text style={styles.sectionTitle}>Languages & Availability</Text>
          <View style={styles.titlesList}>
            <View style={styles.titleRow}>
              <Text style={styles.titleRowLabel}>Original Audio</Text>
              <Text style={styles.titleRowVal}>Japanese</Text>
            </View>
            <View style={styles.titleRow}>
              <Text style={styles.titleRowLabel}>Dubbing</Text>
              <Text style={[styles.titleRowVal, { color: hasDub ? '#22c55e' : '#aeb1ac', fontWeight: '700' }]}>
                {hasDub ? 'English Dub Available' : 'Japanese Audio (Subtitled)'}
              </Text>
            </View>
            {hasDub && (
              <View style={styles.titleRow}>
                <Text style={styles.titleRowLabel}>Simuldub / Release</Text>
                <Text style={styles.titleRowVal}>Simuldub Tracked (Sub & Dub)</Text>
              </View>
            )}
            {availableLanguagesList.length > 0 && (
              <View style={styles.titleRow}>
                <Text style={styles.titleRowLabel}>Audio Tracks</Text>
                <Text style={styles.titleRowVal} numberOfLines={2}>
                  {availableLanguagesList.join(', ')}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* 4. CAST & VOICES */}
      <View style={styles.sectionCard}>
        <View style={styles.castHeaderRow}>
          <View>
            <Text style={styles.eyebrow}>{isAnime ? 'VOICES' : 'CAST'}</Text>
            <Text style={styles.sectionTitle}>{isAnime ? 'Voice Cast' : 'Cast & Characters'}</Text>
          </View>

          {/* Anime Sub vs Dub Switcher */}
          {isAnime && (
            <View style={styles.voiceTabSwitcher}>
              <Pressable
                style={[styles.voiceTab, voiceCastTab === 'sub' && styles.voiceTabActive]}
                onPress={() => setVoiceCastTab('sub')}
              >
                <Text style={[styles.voiceTabText, voiceCastTab === 'sub' && styles.voiceTabTextActive]}>
                  Sub (JP)
                </Text>
              </Pressable>
              <Pressable
                style={[styles.voiceTab, voiceCastTab === 'dub' && styles.voiceTabActive]}
                onPress={() => setVoiceCastTab('dub')}
              >
                <Text style={[styles.voiceTabText, voiceCastTab === 'dub' && styles.voiceTabTextActive]}>
                  Dub (EN)
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {(() => {
          const activeDubCast = dubCast.length > 0
            ? dubCast
            : characters
                .filter((c: any) => c.dubVoiceActor)
                .map((c: any) => ({
                  id: c.dubVoiceActor.id,
                  name: c.dubVoiceActor.name,
                  role: c.name,
                  profilePath: c.dubVoiceActor.image,
                }));

          const activeJpCast = japaneseCast.length > 0
            ? japaneseCast
            : characters
                .filter((c: any) => c.subVoiceActor)
                .map((c: any) => ({
                  id: c.subVoiceActor.id,
                  name: c.subVoiceActor.name,
                  role: c.name,
                  profilePath: c.subVoiceActor.image,
                }));

          const currentCast = isAnime
            ? voiceCastTab === 'dub'
              ? activeDubCast
              : activeJpCast.length > 0
              ? activeJpCast
              : cast
            : cast;

          if (currentCast.length > 0) {
            return (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScroll}
              >
                {currentCast.map((actor: any, idx: number) => (
                  <Pressable
                    key={`${actor.id ?? actor.name}-${idx}`}
                    style={styles.castCard}
                    onPress={() =>
                      actor.id &&
                      router.push({
                        pathname: '/people/[id]',
                        params: {
                          id: String(actor.id),
                          provider: isAnime ? 'anilist' : undefined,
                          name: actor.name,
                        },
                      } as any)
                    }
                  >
                    {actor.profilePath ? (
                      <Image source={{ uri: actor.profilePath }} style={styles.castPortrait} contentFit="cover" />
                    ) : (
                      <View style={styles.castPortraitPlaceholder}>
                        <Text style={styles.castInitials}>{(actor.name || 'A').slice(0, 1)}</Text>
                      </View>
                    )}
                    <Text style={styles.castName} numberOfLines={1}>
                      {actor.name}
                    </Text>
                    <Text style={styles.castRole} numberOfLines={1}>
                      {actor.role || (isAnime ? 'Voice' : 'Cast')}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            );
          }

          return (
            <Text style={styles.mutedText}>
              {isAnime && voiceCastTab === 'dub'
                ? 'English Dub cast not indexed for this anime.'
                : 'Cast will appear after provider hydration.'}
            </Text>
          );
        })()}
      </View>

      {/* 5. EMBEDDED MOVIE STREAM PLAYER */}
      {isMovie && streamData?.streamUrl && (
        <EmbeddedStreamPlayer
          url={streamData.streamUrl}
          provider={streamData.provider}
          title={`Watch ${media.title}`}
          subtitle={`${media.year || ''} • ${streamData.sourceLabel}`}
          height={225}
        />
      )}

      {/* 6. TRAILER EMBEDDED PLAYER */}
      {trailer && (
        <View style={styles.sectionCard}>
          <View style={styles.trailerHeaderRow}>
            <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
              <Text style={styles.eyebrow}>TRAILER</Text>
              <Text style={styles.sectionTitle} numberOfLines={1} ellipsizeMode="tail">
                {trailer.name || 'Official Trailer'}
              </Text>
            </View>
            <Pressable
              style={styles.trailerExternalBtn}
              onPress={() => {
                Linking.openURL(`https://www.youtube.com/watch?v=${trailer.key}`).catch(() => {});
              }}
              hitSlop={6}
            >
              <Ionicons name="open-outline" size={16} color="#aeb1ac" />
            </Pressable>
          </View>

          <View style={styles.videoPlayerContainer}>
            <YoutubePlayer
              height={205}
              play={false}
              videoId={trailer.key}
              webViewProps={{
                androidLayerType: 'hardware',
                allowsInlineMediaPlayback: true,
              }}
            />
          </View>
        </View>
      )}

      {/* 6. RELATED MEDIA */}
      <View style={styles.sectionCard}>
        <Text style={styles.eyebrow}>RELATED</Text>
        <Text style={styles.sectionTitle}>Related media</Text>

        {related.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {related.map((item: any, idx: number) => {
              const key = String(item.id || item.providerId);
              const isTracked =
                Boolean(item.alreadyTracked) ||
                trackedIds.has(key) ||
                (item.id && trackedIds.has(String(item.id))) ||
                (item.providerId && trackedIds.has(String(item.providerId))) ||
                Boolean(item.localMediaId && trackedIds.has(String(item.localMediaId)));
              const isResolving = resolvingId === key;
              const isAdding = addingId === key;

              return (
                <Pressable
                  key={`${item.id}-${idx}`}
                  style={styles.relatedCard}
                  onPress={() => handleOpenRelated(item)}
                  disabled={isResolving}
                >
                  {item.posterPath ? (
                    <Image source={{ uri: item.posterPath }} style={styles.relatedPoster} contentFit="cover" />
                  ) : (
                    <View style={styles.relatedPosterPlaceholder}>
                      <Text style={styles.relatedInitials}>{(item.title || 'M').slice(0, 2)}</Text>
                    </View>
                  )}

                  {isResolving && (
                    <View style={styles.relatedLoadingOverlay}>
                      <ActivityIndicator size="small" color={theme.colors.accent} />
                    </View>
                  )}

                  {/* Tick badge if tracked, otherwise + button to quick add */}
                  {isTracked ? (
                    <View style={styles.relatedTrackedBadge}>
                      <Ionicons name="checkmark" size={13} color="#101112" />
                    </View>
                  ) : (
                    <Pressable
                      style={styles.relatedAddButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        void handleQuickAddRelated(item);
                      }}
                      hitSlop={6}
                      disabled={isAdding}
                    >
                      {isAdding ? (
                        <ActivityIndicator size="small" color="#101112" />
                      ) : (
                        <Ionicons name="add" size={13} color="#f8f7f2" />
                      )}
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={styles.mutedText}>Related media will appear after provider hydration.</Text>
        )}
      </View>

      {/* 7. MEDIA GALLERY */}
      {galleryImages.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.eyebrow}>MEDIA GALLERY</Text>
          <Text style={styles.sectionTitle}>Backdrops & Posters ({galleryImages.length})</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {galleryImages.slice(0, 16).map((imgUrl, idx) => {
              const isBackdrop = idx < backdrops.length;
              return (
                <Pressable
                  key={`${imgUrl}-${idx}`}
                  style={[
                    styles.galleryThumbCard,
                    isBackdrop ? styles.galleryBackdropCard : styles.galleryPosterCard,
                  ]}
                  onPress={() => setActiveGalleryIndex(idx)}
                >
                  <Image source={{ uri: imgUrl }} style={styles.galleryThumbImage} contentFit="cover" />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Fullscreen Image Gallery Modal */}
      <Modal
        visible={activeGalleryIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveGalleryIndex(null)}
      >
        <View style={styles.galleryModalBackdrop}>
          <Pressable
            style={styles.galleryCloseBtn}
            onPress={() => setActiveGalleryIndex(null)}
            hitSlop={10}
          >
            <Ionicons name="close" size={24} color="#f8f7f2" />
          </Pressable>

          {activeGalleryIndex !== null && galleryImages[activeGalleryIndex] && (
            <View style={styles.galleryModalContent}>
              <Image
                source={{ uri: galleryImages[activeGalleryIndex] }}
                style={styles.galleryFullImage}
                contentFit="contain"
              />
              <Text style={styles.galleryCounterText}>
                {activeGalleryIndex + 1} / {galleryImages.length}
              </Text>

              <View style={styles.galleryNavRow}>
                <Pressable
                  style={[styles.galleryNavBtn, activeGalleryIndex === 0 && styles.galleryNavBtnDisabled]}
                  disabled={activeGalleryIndex === 0}
                  onPress={() => setActiveGalleryIndex(activeGalleryIndex - 1)}
                >
                  <Ionicons name="arrow-back" size={20} color="#f8f7f2" />
                </Pressable>
                <Pressable
                  style={[
                    styles.galleryNavBtn,
                    activeGalleryIndex === galleryImages.length - 1 && styles.galleryNavBtnDisabled,
                  ]}
                  disabled={activeGalleryIndex === galleryImages.length - 1}
                  onPress={() => setActiveGalleryIndex(activeGalleryIndex + 1)}
                >
                  <Ionicons name="arrow-forward" size={20} color="#f8f7f2" />
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* 8. EXTERNAL RATINGS */}
      <View style={styles.sectionCard}>
        <Text style={styles.eyebrow}>RATINGS</Text>
        <Text style={styles.sectionTitle}>External ratings</Text>

        <View style={styles.ratingsRow}>
          <View style={styles.ratingChip}>
            <Text style={styles.ratingChipText}>
              TMDB {rating ? `${Number(rating).toFixed(1)}/10` : 'TBA'}
            </Text>
          </View>
          {voteCount ? (
            <Text style={styles.voteCountText}>
              {voteCount.toLocaleString()} votes
            </Text>
          ) : null}
        </View>
      </View>

      {/* 7. COMMUNITY COMMENTS */}
      <View style={styles.sectionCard}>
        <Text style={styles.eyebrow}>COMMUNITY</Text>
        <Text style={styles.sectionTitle}>Comments</Text>
        <Text style={styles.mutedText}>Spoiler-aware comments arrive in Phase 8.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    marginTop: 12,
  },
  sectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: theme.borderRadius.md,
    padding: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: theme.colors.accent,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f8f7f2',
    marginBottom: 8,
  },
  reloadButton: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  reloadButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f8f7f2',
  },
  mutedText: {
    fontSize: 13,
    color: '#8b8e89',
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: theme.borderRadius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  horizontalScroll: {
    gap: 10,
    paddingVertical: 4,
  },
  // News
  newsCard: {
    width: 220,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  newsThumb: {
    width: '100%',
    height: 100,
  },
  newsThumbPlaceholder: {
    width: '100%',
    height: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newsThumbInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  newsCopy: {
    padding: 8,
  },
  newsSource: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.accent,
    marginBottom: 2,
  },
  newsHeadline: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f8f7f2',
    lineHeight: 16,
    marginBottom: 4,
  },
  newsDate: {
    fontSize: 10,
    color: '#8b8e89',
  },
  // Streaming providers
  providersWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  providerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  providerLogo: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  providerName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#f8f7f2',
  },
  // Info Chips
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  infoBadgeText: {
    fontSize: 12,
    color: '#dcded9',
    fontWeight: '500',
  },
  trailerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 75, 75, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 75, 75, 0.3)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  trailerButtonText: {
    color: '#ff8585',
    fontSize: 12,
    fontWeight: '700',
  },
  // Cast
  castCard: {
    width: 82,
    alignItems: 'center',
  },
  castPortrait: {
    width: 82,
    height: 110,
    borderRadius: 8,
    backgroundColor: '#202326',
    marginBottom: 6,
  },
  castPortraitPlaceholder: {
    width: 82,
    height: 110,
    borderRadius: 8,
    backgroundColor: '#202326',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  castInitials: {
    fontSize: 20,
    fontWeight: '700',
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
  // Related
  relatedCard: {
    width: 96,
    height: 144,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  relatedPoster: {
    width: 96,
    height: 144,
    borderRadius: 8,
  },
  relatedPosterPlaceholder: {
    width: 96,
    height: 144,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  relatedInitials: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  relatedAddButton: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  relatedAddButtonTracked: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  relatedTrackedBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relatedLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Trailer Player
  trailerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  trailerExternalBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  videoPlayerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  videoWebView: {
    flex: 1,
    backgroundColor: '#000',
  },
  // Gallery
  galleryThumbCard: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  galleryBackdropCard: {
    width: 180,
    height: 101,
  },
  galleryPosterCard: {
    width: 80,
    height: 120,
  },
  galleryThumbImage: {
    width: '100%',
    height: '100%',
  },
  galleryModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  galleryCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  galleryModalContent: {
    width: '100%',
    height: '75%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryFullImage: {
    width: '100%',
    height: '85%',
  },
  galleryCounterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#aeb1ac',
    marginTop: 12,
  },
  galleryNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 30,
    marginTop: 16,
  },
  galleryNavBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryNavBtnDisabled: {
    opacity: 0.3,
  },
  // Ratings
  ratingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  ratingChip: {
    backgroundColor: 'rgba(255, 191, 71, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 191, 71, 0.28)',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  ratingChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  voteCountText: {
    fontSize: 12,
    color: '#8b8e89',
  },
  infoBadgeAccent: {
    backgroundColor: 'rgba(255, 191, 71, 0.12)',
    borderColor: 'rgba(255, 191, 71, 0.3)',
  },
  infoBadgeSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  titlesList: {
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  titleRowLabel: {
    width: 65,
    color: '#aeb1ac',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  titleRowVal: {
    flex: 1,
    color: '#f8f7f2',
    fontSize: 13,
    fontWeight: '600',
  },
  characterCard: {
    width: 90,
    alignItems: 'center',
  },
  characterPortrait: {
    width: 76,
    height: 104,
    borderRadius: 8,
    backgroundColor: '#202326',
    marginBottom: 6,
  },
  characterPlaceholder: {
    width: 76,
    height: 104,
    borderRadius: 8,
    backgroundColor: '#202326',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  characterInitials: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  characterName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#f8f7f2',
    textAlign: 'center',
  },
  characterRole: {
    fontSize: 10,
    color: theme.colors.accent,
    textAlign: 'center',
  },
  castHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  voiceTabSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  voiceTab: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  voiceTabActive: {
    backgroundColor: 'rgba(255, 191, 71, 0.2)',
  },
  voiceTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#aeb1ac',
  },
  voiceTabTextActive: {
    color: theme.colors.accent,
    fontWeight: '700',
  },
});
