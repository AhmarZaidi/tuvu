import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '../constants/theme';
import { MediaDetailData, MediaNewsArticle } from '../services/api';

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

  let ext: any = {};
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
        </View>
      </View>

      {/* 4. CAST & CHARACTERS */}
      <View style={styles.sectionCard}>
        <Text style={styles.eyebrow}>CAST</Text>
        <Text style={styles.sectionTitle}>Cast & Characters</Text>

        {cast.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {cast.map((actor: any, idx: number) => (
              <View key={`${actor.id ?? actor.name}-${idx}`} style={styles.castCard}>
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
                  {actor.role || 'Cast'}
                </Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.mutedText}>Cast will appear after provider hydration.</Text>
        )}
      </View>

      {/* 5. RELATED MEDIA */}
      <View style={styles.sectionCard}>
        <Text style={styles.eyebrow}>RELATED</Text>
        <Text style={styles.sectionTitle}>Related media</Text>

        {related.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {related.map((item: any, idx: number) => (
              <Pressable
                key={`${item.id}-${idx}`}
                style={styles.relatedCard}
                onPress={() => item.id && router.push(`/media/${item.id}` as any)}
              >
                {item.posterPath ? (
                  <Image source={{ uri: item.posterPath }} style={styles.relatedPoster} contentFit="cover" />
                ) : (
                  <View style={styles.relatedPosterPlaceholder}>
                    <Text style={styles.relatedInitials}>{(item.title || 'M').slice(0, 2)}</Text>
                  </View>
                )}
                <Text style={styles.relatedTitle} numberOfLines={2}>
                  {item.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.mutedText}>Related media will appear after provider hydration.</Text>
        )}
      </View>

      {/* 6. EXTERNAL RATINGS */}
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
  // Cast
  castCard: {
    width: 90,
    alignItems: 'center',
  },
  castPortrait: {
    width: 70,
    height: 70,
    borderRadius: 35,
    marginBottom: 6,
  },
  castPortraitPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    width: 95,
  },
  relatedPoster: {
    width: 95,
    height: 142,
    borderRadius: 6,
    marginBottom: 4,
  },
  relatedPosterPlaceholder: {
    width: 95,
    height: 142,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  relatedInitials: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  relatedTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#f8f7f2',
    lineHeight: 14,
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
});
