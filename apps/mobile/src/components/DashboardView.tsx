import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api, DashboardResponse, DashboardEntry, DashboardSection } from '../services/api';
import { theme } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';
import { useDashboardLayout } from '../context/DashboardLayoutContext';
import { TopBar } from './TopBar';
import { PageHeader } from './PageHeader';
import { DashboardStats } from './DashboardStats';
import { DashboardToolbar, SortMode } from './DashboardToolbar';
import { SectionPills } from './SectionPills';
import { SectionHeader } from './SectionHeader';
import { MediaCard } from './MediaCard';
import { GoldenGlow } from './GoldenGlow';

interface DashboardViewProps {
  kind: 'shows' | 'anime' | 'movies' | 'books' | 'games';
  title: string;
  mediaType: string;
  emptyMessage?: string;
}

export function DashboardView({ kind, title, mediaType, emptyMessage }: DashboardViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { width: windowWidth } = useWindowDimensions();
  const { colors, isDark } = useAppTheme();

  // Keep action button spacing aligned for shows and anime
  const reserveActionSpace = kind === 'shows' || kind === 'anime';

  // Synced layout mode and collapse state across all dashboard pages
  const {
    layoutMode,
    toggleLayoutMode,
    isSectionCollapsed,
    toggleSectionCollapse,
  } = useDashboardLayout();

  const [activeSectionId, setActiveSectionId] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<'all' | 'series' | 'movie' | 'ova'>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('updated');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const handleAddMedia = () => {
    router.push({
      pathname: '/explore',
      params: { category: mediaType },
    } as any);
  };

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<DashboardResponse>({
    queryKey: ['dashboard-infinite', kind, debouncedSearch],
    queryFn: ({ pageParam = 0 }) =>
      api.getDashboard(kind, {
        offset: Number(pageParam),
        limit: 100,
        q: debouncedSearch || undefined,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const totalLoaded = allPages.reduce((sum, p) => sum + (p.entries?.length || 0), 0);
      if (lastPage.page?.hasMore && totalLoaded < (lastPage.totalTracked || 0)) {
        return totalLoaded;
      }
      return undefined;
    },
    placeholderData: (previousData) => previousData,
    initialPageParam: 0,
  });

  const parseEntryTime = (dateStr?: string | null) => {
    if (!dateStr) return 0;
    const str = String(dateStr);
    const normalized = str.includes('T') ? str : str.replace(' ', 'T') + 'Z';
    const t = new Date(normalized).getTime();
    return isNaN(t) ? 0 : t;
  };

  const firstPage = data?.pages?.[0];
  const allEntries = useMemo(() => {
    if (!data?.pages) return [];
    const seen = new Set<string>();
    const list: DashboardEntry[] = [];
    for (const page of data.pages) {
      for (const item of page.entries || []) {
        if (!seen.has(item.mediaId)) {
          seen.add(item.mediaId);
          list.push(item);
        }
      }
    }
    return list;
  }, [data]);

  const totalTracked = firstPage?.totalTracked ?? allEntries.length;
  const statusCounts = firstPage?.statusCounts ?? {};
  const sectionCounts = firstPage?.sectionCounts ?? {};

  const sections = useMemo(() => {
    if (!firstPage?.sections) return [];
    const allTab = { id: 'all', label: `All ${title}`, entries: allEntries };
    const otherSecs = firstPage.sections
      .filter((s) => s.id !== 'all')
      .map((sec) => {
        const matching = allEntries.filter((item) => {
          if (sec.id === 'watch-next') return item.nextEpisode;
          if (sec.id === 'continue-watching') return item.progressEpisodes > 0 && item.nextEpisode;
          if (sec.id === 'away') return item.status === 'watching';
          return sec.entries?.some((e) => e.mediaId === item.mediaId);
        });
        return {
          ...sec,
          entries: matching.length > 0 ? matching : sec.entries,
        };
      });
    return [allTab, ...otherSecs];
  }, [firstPage, allEntries, title]);

  const currentSection = useMemo(() => {
    if (activeSectionId === 'all') {
      const allSec = sections.find((s) => s.id === 'all');
      return allSec || { id: 'all', label: `All ${title}`, entries: allEntries };
    }
    return sections.find((s) => s.id === activeSectionId) || sections[0];
  }, [sections, activeSectionId, allEntries, title]);

function resolveAnimeFormat(item: DashboardEntry): 'movie' | 'series' | 'ova' | 'ona' | 'special' {
  if (item.animeFormat) return item.animeFormat;
  const titleUpper = (item.title || '').toUpperCase();
  if (titleUpper.includes(' OVA')) return 'ova';
  if (titleUpper.includes(' ONA')) return 'ona';
  if (titleUpper.includes(' SPECIAL')) return 'special';
  if (item.extendedDataJson) {
    try {
      const ext = JSON.parse(item.extendedDataJson);
      if (ext.animeFormat === 'ova' || ext.format === 'OVA' || ext.anime?.format === 'OVA') return 'ova';
      if (ext.animeFormat === 'ona' || ext.format === 'ONA' || ext.anime?.format === 'ONA') return 'ona';
      if (ext.animeFormat === 'special' || ext.format === 'SPECIAL' || ext.format === 'SP' || ext.anime?.format === 'SPECIAL') return 'special';
      if (ext.animeFormat === 'movie' || ext.anime?.format === 'MOVIE' || ext.format === 'MOVIE') return 'movie';
      if (ext.animeFormat === 'series' || ext.format === 'TV' || ext.anime?.format === 'TV') return 'series';
    } catch {}
  }
  if (item.type === 'movie') return 'movie';
  return 'series';
}

  // Filter & Sort entries for Active Section / Grid Mode
  const displayedEntries = useMemo(() => {
    let list = [...(currentSection?.entries || [])];

    // Anime Format Filter
    if (kind === 'anime' && formatFilter !== 'all') {
      if (formatFilter === 'ova') {
        list = list.filter((item) => {
          const f = resolveAnimeFormat(item);
          return f === 'ova' || f === 'ona' || f === 'special';
        });
      } else {
        list = list.filter((item) => resolveAnimeFormat(item) === formatFilter);
      }
    }

    // Filter by search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((item) => item.title?.toLowerCase().includes(q));
    }

    // Sort entries
    if (sortMode === 'title') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortMode === 'year') {
      list.sort((a, b) => (b.year || 0) - (a.year || 0));
    } else if (sortMode === 'progress') {
      list.sort((a, b) => (b.progressEpisodes || 0) - (a.progressEpisodes || 0));
    } else {
      // Default: recently updated
      list.sort((a, b) => parseEntryTime(b.updatedAt) - parseEntryTime(a.updatedAt));
    }

    return list;
  }, [currentSection, search, sortMode, kind, formatFilter]);

  // Filter & Sort sections for Horizontal Carousels Mode
  const carouselSections = useMemo(() => {
    if (!sections.length) return [];
    const realSections = sections.filter((s) => s.id !== 'all');

    return realSections
      .map((sec: DashboardSection) => {
        let entries = [...(sec.entries || [])];
        if (kind === 'anime' && formatFilter !== 'all') {
          if (formatFilter === 'ova') {
            entries = entries.filter((item) => {
              const f = resolveAnimeFormat(item);
              return f === 'ova' || f === 'ona' || f === 'special';
            });
          } else {
            entries = entries.filter((item) => resolveAnimeFormat(item) === formatFilter);
          }
        }
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          entries = entries.filter((e) => e.title?.toLowerCase().includes(q));
        }
        if (sortMode === 'title') {
          entries.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        } else if (sortMode === 'year') {
          entries.sort((a, b) => (b.year || 0) - (a.year || 0));
        } else if (sortMode === 'progress') {
          entries.sort((a, b) => (b.progressEpisodes || 0) - (a.progressEpisodes || 0));
        } else {
          entries.sort((a, b) => parseEntryTime(b.updatedAt) - parseEntryTime(a.updatedAt));
        }
        return {
          ...sec,
          entries,
        };
      })
      .filter((sec) => sec.entries.length > 0);
  }, [sections, search, sortMode, kind, formatFilter]);

  const cycleSort = () => {
    setSortMode((prev) => {
      if (prev === 'updated') return 'title';
      if (prev === 'title') return 'year';
      if (prev === 'year') return 'progress';
      return 'updated';
    });
  };

  const handleMarkNext = async (episodeId: string) => {
    try {
      await api.updateEpisodeActivity(episodeId, { watched: true });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      console.error('Failed to mark next episode watched', e);
    }
  };

  if (isLoading && !data) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <TopBar />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Opening your library...</Text>
        </View>
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <TopBar />
        <View style={styles.centerContainer}>
          <View style={[styles.errorBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={styles.errorTitle}>Could not load {title.toLowerCase()}</Text>
            <Text style={[styles.errorSubtitle, { color: colors.textMuted }]}>
              {(error as Error)?.message || 'Please check that the local server is running.'}
            </Text>
            <Pressable style={styles.retryButton} onPress={() => refetch()}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // 3-column responsive card width calculation for grid
  const cardWidth = Math.floor((windowWidth - theme.spacing.md * 2 - 16) / 3);

  // Header Component
  const headerContent = (
    <View>
      {/* 2. Page Header: Title + action */}
      <PageHeader
        title={title}
        actionLabel={`+ Add ${mediaType}`}
        onAction={handleAddMedia}
      />

      {/* 3. Dashboard Stats Row (Collapsible) */}
      {firstPage && (
        <DashboardStats
          entries={allEntries}
          kind={kind}
          totalTracked={totalTracked}
          statusCounts={statusCounts}
        />
      )}

      {/* 4. Dashboard Toolbar (Sort button, Squared Search box, Layout Toggle) */}
      <DashboardToolbar
        search={search}
        onSearchChange={setSearch}
        layoutMode={layoutMode}
        onToggleLayoutMode={toggleLayoutMode}
        sortMode={sortMode}
        onSelectSort={setSortMode}
        onCycleSort={cycleSort}
        placeholder={`Filter ${title.toLowerCase()}...`}
      />

      {/* 5. Anime Format Filter: All Anime, Series, Movies, OVAs */}
      {kind === 'anime' && (
        <View style={styles.animeFormatRow}>
          {(['all', 'series', 'movie', 'ova'] as const).map((fmt) => {
            const label =
              fmt === 'all'
                ? 'All Anime'
                : fmt === 'series'
                ? 'Anime Series'
                : fmt === 'movie'
                ? 'Anime Movies'
                : 'OVAs & Specials';
            const isSelected = formatFilter === fmt;
            return (
              <Pressable
                key={fmt}
                style={[
                  styles.animeFormatChip,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(34, 31, 25, 0.05)',
                    borderColor: colors.border,
                  },
                  isSelected && styles.animeFormatChipActive,
                ]}
                onPress={() => setFormatFilter(fmt)}
              >
                <Text
                  style={[
                    styles.animeFormatChipText,
                    { color: colors.textMuted },
                    isSelected && { color: isDark ? colors.accent : colors.accentDark, fontWeight: '700' },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 6. Section Tabs (Only shown in Grid Mode) */}
      {layoutMode === 'grid' && sections.length > 0 && (
        <SectionPills
          sections={sections}
          activeSectionId={activeSectionId}
          onSelectSection={setActiveSectionId}
          totalTracked={totalTracked}
          sectionCounts={sectionCounts}
        />
      )}
    </View>
  );

  const renderEmptyState = () => (
    <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[styles.emptyTitle, { color: colors.textStrong }]}>
        {search.trim() ? 'No matching titles' : `Nothing in ${currentSection?.label ?? title} yet`}
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
        {search.trim()
          ? 'Try a different title or clear the filter.'
          : emptyMessage || `Add a ${mediaType} to fill this section.`}
      </Text>
      {!search.trim() && (
        <Pressable style={styles.emptyAddButton} onPress={handleAddMedia}>
          <Text style={styles.emptyAddButtonText}>+ Add {mediaType}</Text>
        </Pressable>
      )}
    </View>
  );

  // Render a carousel section in Section View Mode
  const renderSectionCarousel = (section: DashboardSection) => {
    const hasMultipleRows = section.entries.length > 10;
    const isCollapsed = isSectionCollapsed(section.id);
    const isTwoRows = hasMultipleRows && !isCollapsed;
    const displayCount =
      section.id === 'all'
        ? totalTracked
        : sectionCounts[section.id] ?? section.entries.length;

    // Header Right Action: small collapse button
    const collapseButton = (
      <Pressable
        style={[
          styles.collapseButton,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(34, 31, 25, 0.055)',
            borderColor: colors.border,
          },
          !hasMultipleRows && styles.collapseButtonDisabled,
          isCollapsed && styles.collapseButtonActive,
        ]}
        onPress={() => hasMultipleRows && toggleSectionCollapse(section.id)}
        disabled={!hasMultipleRows}
        hitSlop={6}
        accessibilityLabel={
          !hasMultipleRows
            ? 'Single row'
            : isCollapsed
            ? 'Expand to 2 rows'
            : 'Collapse to 1 row'
        }
      >
        <Ionicons
          name={isCollapsed ? 'expand-outline' : 'contract-outline'}
          size={14}
          color={
            !hasMultipleRows
              ? colors.textSubtle
              : isCollapsed
              ? isDark ? colors.accent : colors.accentDark
              : colors.textMuted
          }
        />
      </Pressable>
    );

    // If 2 rows, chunk items into pairs [item1, item2] so both rows scroll together
    if (isTwoRows) {
      const columns: DashboardEntry[][] = [];
      for (let i = 0; i < section.entries.length; i += 2) {
        columns.push(section.entries.slice(i, i + 2));
      }

      return (
        <View style={styles.carouselSection}>
          <View style={styles.carouselHeaderWrap}>
            <SectionHeader
              title={section.label}
              count={displayCount}
              rightAction={collapseButton}
            />
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={columns}
            keyExtractor={(_, idx) => `${section.id}:col:${idx}`}
            renderItem={({ item: pair }) => (
              <View style={{ width: cardWidth, marginRight: 8 }}>
                <MediaCard
                  item={pair[0]}
                  width={cardWidth}
                  onMarkNext={handleMarkNext}
                  reserveActionSpace={reserveActionSpace}
                />
                {pair[1] && (
                  <View style={{ marginTop: 10 }}>
                    <MediaCard
                      item={pair[1]}
                      width={cardWidth}
                      onMarkNext={handleMarkNext}
                      reserveActionSpace={reserveActionSpace}
                    />
                  </View>
                )}
              </View>
            )}
            contentContainerStyle={styles.horizontalList}
          />
        </View>
      );
    }

    // Otherwise render standard single-row horizontal list
    return (
      <View style={styles.carouselSection}>
        <View style={styles.carouselHeaderWrap}>
          <SectionHeader
            title={section.label}
            count={displayCount}
            rightAction={collapseButton}
          />
        </View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={section.entries}
          keyExtractor={(entry) => `${section.id}:${entry.mediaId}`}
          renderItem={({ item: entry }) => (
            <View style={{ width: cardWidth, marginRight: 8 }}>
              <MediaCard
                item={entry}
                width={cardWidth}
                onMarkNext={handleMarkNext}
                reserveActionSpace={reserveActionSpace}
              />
            </View>
          )}
          contentContainerStyle={styles.horizontalList}
        />
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GoldenGlow />
      {/* 1. Mobile TopBar matching web .topbar */}
      <TopBar />

      {layoutMode === 'grid' ? (
        <FlatList
          key="dashboard-grid-3col"
          data={displayedEntries}
          keyExtractor={(item) => item.mediaId}
          numColumns={3}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.gridRow}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              void fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListHeaderComponent={headerContent}
          renderItem={({ item }) => (
            <View style={styles.gridItem}>
              <MediaCard
                item={item}
                width={cardWidth}
                onMarkNext={handleMarkNext}
                reserveActionSpace={reserveActionSpace}
              />
            </View>
          )}
          ListEmptyComponent={renderEmptyState}
        />
      ) : (
        <FlatList
          key="dashboard-sections-carousel"
          data={carouselSections}
          keyExtractor={(item) => item.id}
          numColumns={1}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListHeaderComponent={headerContent}
          renderItem={({ item: section }) => renderSectionCarousel(section)}
          ListEmptyComponent={renderEmptyState}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    paddingBottom: 32,
  },
  gridRow: {
    paddingHorizontal: theme.spacing.md,
    gap: 8,
  },
  gridItem: {
    width: 'auto',
  },
  carouselSection: {
    marginBottom: 20,
  },
  carouselHeaderWrap: {
    paddingHorizontal: theme.spacing.md,
  },
  collapseButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapseButtonActive: {
    backgroundColor: 'rgba(240, 168, 36, 0.12)',
    borderColor: 'rgba(240, 168, 36, 0.35)',
  },
  collapseButtonDisabled: {
    opacity: 0.32,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    backgroundColor: 'transparent',
  },
  horizontalList: {
    paddingHorizontal: theme.spacing.md,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  loadingText: {
    color: theme.colors.textMuted,
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    alignItems: 'center',
    maxWidth: 340,
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
    lineHeight: 18,
  },
  retryButton: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.sm,
  },
  retryButtonText: {
    color: theme.colors.accentContrast,
    fontWeight: '800',
    fontSize: 13,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 20,
    marginHorizontal: theme.spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  emptyTitle: {
    color: theme.colors.textStrong,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 14,
  },
  emptyAddButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyAddButtonText: {
    color: '#12151c',
    fontSize: 14,
    fontWeight: '700',
  },
  animeFormatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  animeFormatChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  animeFormatChipActive: {
    backgroundColor: 'rgba(255, 191, 71, 0.16)',
    borderColor: theme.colors.accent,
  },
  animeFormatChipText: {
    color: '#aeb1ac',
    fontSize: 12,
    fontWeight: '600',
  },
  animeFormatChipTextActive: {
    color: '#f8f7f2',
    fontWeight: '700',
  },
});
