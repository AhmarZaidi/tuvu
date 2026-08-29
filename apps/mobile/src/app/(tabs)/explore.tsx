import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { api, DashboardEntry, ExploreResult, ExploreRow } from '../../services/api';
import { useAppTheme } from '../../context/ThemeContext';
import { useSearch } from '../../context/SearchContext';
import { useSnackbar } from '../../context/SnackbarContext';
import { theme } from '../../constants/theme';
import { MediaCard } from '../../components/MediaCard';
import { SectionHeader } from '../../components/SectionHeader';
import { TopBar } from '../../components/TopBar';
import { GoldenGlow } from '../../components/GoldenGlow';

const MEDIA_TYPES = [
  { key: '', label: 'All Media', icon: 'sparkles' as const },
  { key: 'movie', label: 'Movies', icon: 'film-outline' as const },
  { key: 'show', label: 'Shows', icon: 'tv-outline' as const },
  { key: 'anime', label: 'Anime', icon: 'flame-outline' as const },
  { key: 'book', label: 'Books', icon: 'book-outline' as const },
  { key: 'game', label: 'Games', icon: 'game-controller-outline' as const },
];

function getCategoryFromRowId(rowId: string): string {
  const id = rowId.toLowerCase();
  if (id.includes('movie')) return 'movie';
  if (id.includes('anime')) return 'anime';
  if (id.includes('show')) return 'show';
  if (id.includes('game')) return 'game';
  if (id.includes('book')) return 'book';
  return 'movie';
}

function getCategoryLabel(catKey: string): string {
  const match = MEDIA_TYPES.find((m) => m.key === catKey);
  return match?.label || 'Media';
}

function getTypeIcon(type?: string): keyof typeof Ionicons.glyphMap {
  switch (type?.toLowerCase()) {
    case 'movie':
      return 'film';
    case 'show':
      return 'tv';
    case 'anime':
      return 'flame';
    case 'book':
      return 'book';
    case 'game':
      return 'game-controller';
    default:
      return 'disc';
  }
}

function getTypeColor(type?: string, fallback = '#f0a824'): string {
  switch (type?.toLowerCase()) {
    case 'movie':
      return '#60a5fa';
    case 'show':
      return '#a78bfa';
    case 'anime':
      return '#f472b6';
    case 'game':
      return '#34d399';
    case 'book':
      return '#fbbf24';
    default:
      return fallback;
  }
}

export default function ExploreScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, isDark } = useAppTheme();
  const { searchQuery, setSearchQuery } = useSearch();
  const { showNotice } = useSnackbar();

  const [activeCategory, setActiveCategory] = useState<string>('');
  const [addingId, setAddingId] = useState<string | null>(null);

  const isSearching = searchQuery.trim().length > 1;

  // 1. Search Query (Untracked items only)
  const {
    data: searchResults,
    isLoading: isSearchLoading,
  } = useQuery({
    queryKey: ['exploreSearch', searchQuery, activeCategory],
    queryFn: () => api.search(searchQuery.trim(), activeCategory || undefined),
    enabled: isSearching,
  });

  // 2. All Media Overview Rows (Untracked items only)
  const {
    data: exploreData,
    isLoading: isExploreLoading,
    isRefetching: isExploreRefetching,
    refetch: refetchExplore,
  } = useQuery({
    queryKey: ['exploreData'],
    queryFn: () => api.getExploreData(),
    enabled: !isSearching && activeCategory === '',
    staleTime: 1000 * 30,
  });

  // 3. Deep Category Explore Rows (e.g. Popular, Trending, Top Rated)
  const {
    data: categoryExploreData,
    isLoading: isCategoryLoading,
    isRefetching: isCategoryRefetching,
    refetch: refetchCategory,
  } = useQuery({
    queryKey: ['exploreTypeData', activeCategory],
    queryFn: () => api.getExploreTypeData(activeCategory),
    enabled: !isSearching && activeCategory !== '',
    staleTime: 1000 * 30,
  });

  const handleOpenMedia = async (item: ExploreResult | any) => {
    if (item.localMediaId) {
      router.push(`/media/${item.localMediaId}` as any);
      return;
    }
    if (item.mediaId) {
      router.push(`/media/${item.mediaId}` as any);
      return;
    }
    try {
      const added = await api.addExploreResult(item);
      router.push(`/media/${added.media.id}` as any);
    } catch {
      // Fallback
    }
  };

  const handleQuickAdd = async (item: ExploreResult | any) => {
    const idToTrack = item.mediaId || item.localMediaId;
    const trackingKey = item.providerId || item.mediaId || item.id;
    setAddingId(trackingKey);
    try {
      if (idToTrack) {
        await api.addToLibrary(idToTrack);
      } else {
        await api.addExploreResult(item);
      }
      showNotice(`Added "${item.title}" to library`, 'success');
      queryClient.invalidateQueries({ queryKey: ['exploreData'] });
      queryClient.invalidateQueries({ queryKey: ['exploreTypeData'] });
      queryClient.invalidateQueries({ queryKey: ['exploreSearch'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['allLibrary'] });
    } catch (err: any) {
      showNotice(err?.message || 'Could not add item to library', 'error');
    } finally {
      setAddingId(null);
    }
  };

  const renderItemCard = (item: ExploreResult | any, isGrid = false) => {
    const poster = item.posterPath
      ? (item.posterPath.startsWith('http') ? item.posterPath : `https://tmdb-image-prod.b-cdn.net/t/p/w342${item.posterPath}`)
      : null;
    const itemKey = `${item.provider || 'media'}:${item.providerId || item.mediaId || item.id || item.title}`;
    const isAdding = addingId === (item.providerId || item.mediaId || item.id);

    return (
      <Pressable
        key={itemKey}
        style={[styles.exploreCard, isGrid && styles.gridCard]}
        onPress={() => handleOpenMedia(item)}
      >
        <View style={styles.explorePoster}>
          {poster ? (
            <Image source={{ uri: poster }} style={styles.posterImg} contentFit="cover" />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText} numberOfLines={2}>{item.title}</Text>
            </View>
          )}

          {/* Media Type Badge (Top-Left) */}
          {item.type && (
            <View style={[styles.typeBadge, { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.9)' }]}>
              <Ionicons name={getTypeIcon(item.type)} size={11} color={getTypeColor(item.type, colors.accent)} />
            </View>
          )}

          {/* Quick Add Button */}
          <Pressable
            style={[styles.quickAddButton, { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.85)' }]}
            hitSlop={8}
            onPress={(e) => {
              e.stopPropagation();
              handleQuickAdd(item);
            }}
          >
            {isAdding ? (
              <ActivityIndicator size="small" color={theme.colors.accent} />
            ) : (
              <Ionicons name="add" size={16} color={colors.accent} />
            )}
          </Pressable>
        </View>
        <Text style={[styles.exploreTitle, { color: colors.textStrong }]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.year && (
          <Text style={[styles.exploreYear, { color: colors.textSubtle }]}>
            {item.year}
          </Text>
        )}
      </Pressable>
    );
  };

  const renderShowMoreCard = (categoryKey: string) => (
    <Pressable
      key="show-more-card"
      style={styles.exploreCard}
      onPress={() => setActiveCategory(categoryKey)}
    >
      <View
        style={[
          styles.showMorePoster,
          {
            borderColor: colors.accent,
            backgroundColor: isDark ? 'rgba(255, 207, 92, 0.05)' : 'rgba(240, 168, 36, 0.08)',
          },
        ]}
      >
        <View style={[styles.showMoreIconWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="arrow-forward" size={20} color={colors.accent} />
        </View>
        <Text style={[styles.showMoreText, { color: colors.textStrong }]}>Show More</Text>
      </View>
      <Text style={[styles.exploreTitle, { color: colors.accent }]} numberOfLines={1}>
        View all {getCategoryLabel(categoryKey)}
      </Text>
      <Text style={[styles.exploreYear, { color: colors.textSubtle }]}>
        Explore more
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GoldenGlow />
      <TopBar />

      {/* Media Type Filter Chips */}
      <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
        >
          {MEDIA_TYPES.map((type) => {
            const isSelected = activeCategory === type.key;
            return (
              <Pressable
                key={type.key}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected ? colors.accent : isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                    borderColor: isSelected ? colors.accent : colors.border,
                  },
                ]}
                onPress={() => setActiveCategory(type.key)}
              >
                <Ionicons
                  name={type.icon}
                  size={14}
                  color={isSelected ? colors.accentContrast : colors.textSubtle}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    { color: isSelected ? colors.accentContrast : colors.textMuted },
                  ]}
                >
                  {type.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Content Area */}
      {isSearching ? (
        // ── Search Results Grid ──
        isSearchLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>Searching untracked media...</Text>
          </View>
        ) : (
          <FlatList
            data={(searchResults?.results || []).filter((item: any) => !activeCategory || item.type === activeCategory)}
            keyExtractor={(item: any, index) => `${item.provider || 'item'}:${item.providerId || item.mediaId || item.id || index}:${index}`}
            numColumns={3}
            contentContainerStyle={styles.gridContainer}
            columnWrapperStyle={styles.gridRow}
            renderItem={({ item }) => (
              <View style={styles.gridItem}>
                {renderItemCard(item, true)}
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.centerContainer}>
                <Ionicons name="search-outline" size={44} color={colors.textSubtle} style={{ marginBottom: 10 }} />
                <Text style={[styles.emptyTitle, { color: colors.textStrong }]}>No untracked matches found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                  {activeCategory
                    ? `No untracked ${getCategoryLabel(activeCategory).toLowerCase()} matching "${searchQuery}".`
                    : 'Items already in your library are hidden from Explore. Try searching with a different keyword.'}
                </Text>
              </View>
            }
          />
        )
      ) : activeCategory !== '' ? (
        // ── Category Deep View (Multiple sub-sections like Popular, Trending, Top Rated) ──
        isCategoryLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              Loading {getCategoryLabel(activeCategory)} discoveries...
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.exploreScroll}
            refreshControl={
              <RefreshControl
                refreshing={Boolean(isCategoryRefetching)}
                onRefresh={refetchCategory}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
          >
            {/* Category Banner with Back Button */}
            <View style={[styles.categoryBanner, { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.categoryBannerTitle, { color: colors.textStrong }]}>
                  {getCategoryLabel(activeCategory)}
                </Text>
                <Text style={[styles.categoryBannerSubtitle, { color: colors.textSubtle }]}>
                  Browse popular, trending, and top-rated {getCategoryLabel(activeCategory).toLowerCase()} not yet in your library.
                </Text>
              </View>
              <Pressable
                style={[styles.backToAllButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => setActiveCategory('')}
              >
                <Ionicons name="close" size={14} color={colors.textMuted} style={{ marginRight: 4 }} />
                <Text style={[styles.backToAllText, { color: colors.textMuted }]}>All Media</Text>
              </Pressable>
            </View>

            {categoryExploreData?.rows && categoryExploreData.rows.length > 0 ? (
              categoryExploreData.rows.map((row) => (
                <View key={row.id} style={styles.section}>
                  <SectionHeader title={row.title} count={row.results?.length} />
                  {row.subtitle && (
                    <Text style={[styles.rowSubtitle, { color: colors.textSubtle }]}>{row.subtitle}</Text>
                  )}
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={row.results || []}
                    keyExtractor={(result) => `${result.provider}:${result.providerId}`}
                    renderItem={({ item }) => renderItemCard(item)}
                    contentContainerStyle={styles.horizontalList}
                  />
                </View>
              ))
            ) : categoryExploreData?.results && categoryExploreData.results.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader title={`Popular ${getCategoryLabel(activeCategory)}`} count={categoryExploreData.results.length} />
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={categoryExploreData.results}
                  keyExtractor={(result) => `${result.provider}:${result.providerId}`}
                  renderItem={({ item }) => renderItemCard(item)}
                  contentContainerStyle={styles.horizontalList}
                />
              </View>
            ) : (
              <View style={styles.centerContainer}>
                <Ionicons name="compass-outline" size={44} color={colors.textSubtle} style={{ marginBottom: 10 }} />
                <Text style={[styles.emptyTitle, { color: colors.textStrong }]}>No new {getCategoryLabel(activeCategory).toLowerCase()} found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                  All popular items in this category may already be in your library!
                </Text>
              </View>
            )}
          </ScrollView>
        )
      ) : (
        // ── Initial "All Media" Explore View with "Show more" Cards ──
        isExploreLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading discovery categories...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.exploreScroll}
            refreshControl={
              <RefreshControl
                refreshing={Boolean(isExploreRefetching)}
                onRefresh={refetchExplore}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
          >
            {exploreData?.rows && exploreData.rows.length > 0 ? (
              exploreData.rows.map((row) => {
                const categoryKey = getCategoryFromRowId(row.id);
                return (
                  <View key={row.id} style={styles.section}>
                    <View style={styles.sectionHeadingRow}>
                      <SectionHeader title={row.title} count={row.results?.length} />
                      <Pressable
                        onPress={() => setActiveCategory(categoryKey)}
                        hitSlop={8}
                        style={styles.headerMoreLink}
                      >
                        <Text style={[styles.headerMoreText, { color: colors.accent }]}>More</Text>
                        <Ionicons name="chevron-forward" size={13} color={colors.accent} />
                      </Pressable>
                    </View>

                    <FlatList
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      data={row.results || []}
                      keyExtractor={(result) => `${result.provider}:${result.providerId}`}
                      renderItem={({ item }) => renderItemCard(item)}
                      ListFooterComponent={() => renderShowMoreCard(categoryKey)}
                      contentContainerStyle={styles.horizontalList}
                    />
                  </View>
                );
              })
            ) : (
              <View style={styles.centerContainer}>
                <Ionicons name="compass-outline" size={48} color={theme.colors.textSubtle} style={{ marginBottom: 12 }} />
                <Text style={[styles.emptyTitle, { color: colors.textStrong }]}>Discover New Media</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                  Use the search bar at the top to discover TV shows, movies, anime, books, and games.
                </Text>
              </View>
            )}
          </ScrollView>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  filterBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  filterContainer: {
    gap: 8,
    paddingRight: 12,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  gridContainer: {
    paddingHorizontal: 12,
    paddingVertical: theme.spacing.md,
  },
  gridRow: {
    justifyContent: 'flex-start',
    gap: 8,
    marginBottom: 16,
  },
  gridItem: {
    flex: 1,
    maxWidth: '31.5%',
  },
  gridCard: {
    width: '100%',
    marginRight: 0,
  },
  exploreScroll: {
    paddingVertical: theme.spacing.md,
  },
  section: {
    marginBottom: theme.spacing.lg,
    paddingLeft: theme.spacing.md,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: theme.spacing.md,
  },
  headerMoreLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  headerMoreText: {
    fontSize: 12,
    fontWeight: '700',
    marginRight: 2,
  },
  rowSubtitle: {
    fontSize: 12,
    marginTop: -4,
    marginBottom: 8,
  },
  horizontalList: {
    paddingRight: theme.spacing.md,
    alignItems: 'flex-start',
  },
  exploreCard: {
    width: 120,
    marginRight: 12,
  },
  explorePoster: {
    position: 'relative',
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
    backgroundColor: '#1c1d1e',
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  posterImg: {
    width: '100%',
    height: '100%',
  },
  typeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  quickAddButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  placeholderText: {
    color: theme.colors.textStrong,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  exploreTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  exploreYear: {
    fontSize: 11,
    marginTop: 2,
  },
  showMorePoster: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  showMoreIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  showMoreText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  showMoreSubtext: {
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 3,
  },
  categoryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: theme.spacing.md,
    marginBottom: 16,
    padding: 12,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    gap: 10,
  },
  categoryBannerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  categoryBannerSubtitle: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  backToAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
  },
  backToAllText: {
    fontSize: 11,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
