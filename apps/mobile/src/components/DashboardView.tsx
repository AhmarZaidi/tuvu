import React, { useState, useMemo } from 'react';
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const { colors } = useAppTheme();

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
  const [formatFilter, setFormatFilter] = useState<'all' | 'series' | 'movie'>('all');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('updated');

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
  } = useQuery<DashboardResponse>({
    queryKey: ['dashboard', kind],
    queryFn: () => api.getDashboard(kind, { limit: 100 }),
  });

  const parseEntryTime = (dateStr?: string | null) => {
    if (!dateStr) return 0;
    const str = String(dateStr);
    const normalized = str.includes('T') ? str : str.replace(' ', 'T') + 'Z';
    const t = new Date(normalized).getTime();
    return isNaN(t) ? 0 : t;
  };

  const sections = useMemo(() => {
    if (!data?.sections) return [];
    const allSec = data.sections.find((s) => s.id === 'all');
    const otherSecs = data.sections.filter((s) => s.id !== 'all');
    const allTab = allSec || { id: 'all', label: `All ${title}`, entries: data?.entries || [] };
    return [allTab, ...otherSecs];
  }, [data, title]);

  const currentSection = useMemo(() => {
    if (activeSectionId === 'all') {
      const allSec = sections.find((s) => s.id === 'all');
      return allSec || { id: 'all', label: `All ${title}`, entries: data?.entries || [] };
    }
    return sections.find((s) => s.id === activeSectionId) || sections[0];
  }, [sections, activeSectionId, data, title]);

  // Filter & Sort entries for single-section Grid Mode
  const displayedEntries = useMemo(() => {
    let list = [...(currentSection?.entries || [])];

    if (kind === 'anime' && formatFilter !== 'all') {
      list = list.filter((item) => {
        let fmt = item.animeFormat;
        if (!fmt && item.extendedDataJson) {
          try {
            const ext = JSON.parse(item.extendedDataJson);
            fmt = ext.animeFormat || (ext.category === 'anime' && item.type === 'movie' ? 'movie' : 'series');
          } catch {}
        }
        if (!fmt) fmt = item.type === 'movie' ? 'movie' : 'series';
        return fmt === formatFilter;
      });
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((item) => item.title?.toLowerCase().includes(q));
    }

    if (sortMode === 'title') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortMode === 'year') {
      list.sort((a, b) => (b.year || 0) - (a.year || 0));
    } else if (sortMode === 'progress') {
      list.sort((a, b) => (b.progressEpisodes || 0) - (a.progressEpisodes || 0));
    } else {
      list.sort((a, b) => parseEntryTime(b.updatedAt) - parseEntryTime(a.updatedAt));
    }

    return list;
  }, [currentSection, search, sortMode, kind, formatFilter]);

  // Filter & Sort sections for Horizontal Carousels Mode
  const carouselSections = useMemo(() => {
    if (!data?.sections) return [];
    const realSections = data.sections.filter((s) => s.id !== 'all');

    return realSections
      .map((sec) => {
        let entries = [...(sec.entries || [])];
        if (kind === 'anime' && formatFilter !== 'all') {
          entries = entries.filter((item) => {
            let fmt = item.animeFormat;
            if (!fmt && item.extendedDataJson) {
              try {
                const ext = JSON.parse(item.extendedDataJson);
                fmt = ext.animeFormat || (ext.category === 'anime' && item.type === 'movie' ? 'movie' : 'series');
              } catch {}
            }
            if (!fmt) fmt = item.type === 'movie' ? 'movie' : 'series';
            return fmt === formatFilter;
          });
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
  }, [data, search, sortMode]);

  const cycleSort = () => {
    setSortMode((prev) => {
      if (prev === 'updated') return 'title';
      if (prev === 'title') return 'year';
      if (prev === 'year') return 'progress';
      return 'updated';
    });
  };

  // Quick mark episode watched
  const handleMarkNext = async (episodeId: string) => {
    try {
      await api.updateEpisodeActivity(episodeId, { watched: true });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      console.error('Failed to mark next episode watched', e);
    }
  };

  // Calculate 3-column card width on mobile with 16px screen padding and 8px gaps
  const cardWidth = Math.max(96, Math.floor((windowWidth - 32 - 16) / 3));

  if (isLoading) {
    return (
      <View style={styles.container}>
        <TopBar />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={styles.loadingText}>Opening your library...</Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <TopBar />
        <View style={styles.centerContainer}>
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Could not load {title.toLowerCase()}</Text>
            <Text style={styles.errorSubtitle}>
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

  const headerContent = (
    <View>
      {/* 2. Page Heading & + Add Media Action */}
      <PageHeader
        eyebrow="Library"
        title={title}
        actionLabel={`+ Add ${mediaType}`}
        onAction={handleAddMedia}
      />

      {/* 3. Stats Grid (Next up, Favorites, Tracked) */}
      {data && (
        <DashboardStats
          entries={data.entries}
          kind={kind}
          totalTracked={data.totalTracked}
          statusCounts={data.statusCounts}
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

      {/* 5. Anime Format Filter: All Anime, Series, Movies */}
      {kind === 'anime' && (
        <View style={styles.animeFormatRow}>
          {(['all', 'series', 'movie'] as const).map((fmt) => {
            const label = fmt === 'all' ? 'All Anime' : fmt === 'series' ? 'Anime Series' : 'Anime Movies';
            const isSelected = formatFilter === fmt;
            return (
              <Pressable
                key={fmt}
                style={[styles.animeFormatChip, isSelected && styles.animeFormatChipActive]}
                onPress={() => setFormatFilter(fmt)}
              >
                <Text style={[styles.animeFormatChipText, isSelected && styles.animeFormatChipTextActive]}>
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
        />
      )}
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>
        {search.trim() ? 'No matching titles' : `Nothing in ${currentSection?.label ?? title} yet`}
      </Text>
      <Text style={styles.emptySubtitle}>
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

    // Header Right Action: small collapse button
    const collapseButton = (
      <Pressable
        style={[
          styles.collapseButton,
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
              ? 'rgba(255, 255, 255, 0.2)'
              : isCollapsed
              ? theme.colors.accent
              : 'rgba(255, 255, 255, 0.65)'
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
              count={section.entries.length}
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
            count={section.entries.length}
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
