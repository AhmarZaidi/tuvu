import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, DashboardResponse, DashboardEntry } from '../services/api';
import { theme } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';
import { TopBar } from './TopBar';
import { PageHeader } from './PageHeader';
import { DashboardStats } from './DashboardStats';
import { DashboardToolbar, SortMode } from './DashboardToolbar';
import { SectionPills } from './SectionPills';
import { MediaCard } from './MediaCard';
import { CreateMediaModal } from './CreateMediaModal';
import { GoldenGlow } from './GoldenGlow';

interface DashboardViewProps {
  kind: 'shows' | 'anime' | 'movies' | 'books' | 'games';
  title: string;
  mediaType: string;
  emptyMessage?: string;
}

export function DashboardView({ kind, title, mediaType, emptyMessage }: DashboardViewProps) {
  const queryClient = useQueryClient();
  const { width: windowWidth } = useWindowDimensions();
  const { colors } = useAppTheme();

  const [activeSectionId, setActiveSectionId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('grid');
  const [sortMode, setSortMode] = useState<SortMode>('updated');
  const [createModalOpen, setCreateModalOpen] = useState(false);

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

  const sections = useMemo(() => {
    if (!data?.sections) return [];
    const hasAll = data.sections.some((s) => s.id === 'all');
    if (!hasAll && data.entries) {
      return [{ id: 'all', label: `All ${title}`, entries: data.entries }, ...data.sections];
    }
    return data.sections;
  }, [data, title]);

  const currentSection = useMemo(() => {
    if (activeSectionId === 'all') {
      const allSec = sections.find((s) => s.id === 'all');
      return allSec || { id: 'all', label: `All ${title}`, entries: data?.entries || [] };
    }
    return sections.find((s) => s.id === activeSectionId) || sections[0];
  }, [sections, activeSectionId, data, title]);

  // Filter & Sort entries
  const displayedEntries = useMemo(() => {
    let list = [...(currentSection?.entries || [])];

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
      list.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    }

    return list;
  }, [currentSection, search, sortMode]);

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

  // Calculate 2-column card width on mobile with proper margins
  const cardWidth = Math.max(140, Math.floor((windowWidth - 32 - 12) / 2));

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GoldenGlow />
      {/* 1. Mobile TopBar matching web .topbar */}
      <TopBar />

      <FlatList
        data={displayedEntries}
        keyExtractor={(item) => item.mediaId}
        key={viewMode}
        numColumns={viewMode === 'grid' ? 2 : 1}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListHeaderComponent={
          <>
            {/* 2. Page Heading & + Add Media Action */}
            <PageHeader
              eyebrow="Library"
              title={title}
              actionLabel={`+ Add ${mediaType}`}
              onAction={() => setCreateModalOpen(true)}
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

            {/* 4. Dashboard Toolbar (Sort button, Search pill, View toggle) */}
            <DashboardToolbar
              search={search}
              onSearchChange={setSearch}
              viewMode={viewMode}
              onToggleViewMode={() => setViewMode((prev) => (prev === 'grid' ? 'compact' : 'grid'))}
              sortMode={sortMode}
              onCycleSort={cycleSort}
              placeholder={`Filter ${title.toLowerCase()}...`}
            />

            {/* 5. Section Tabs (Watch Next, Continue Watching, Away, etc.) */}
            {sections.length > 0 && (
              <SectionPills
                sections={sections}
                activeSectionId={activeSectionId}
                onSelectSection={setActiveSectionId}
              />
            )}
          </>
        }
        renderItem={({ item }) => (
          <View style={viewMode === 'grid' ? styles.gridItem : styles.compactItem}>
            <MediaCard
              item={item}
              width={viewMode === 'grid' ? cardWidth : undefined}
              variant={viewMode}
              onMarkNext={handleMarkNext}
            />
          </View>
        )}
        ListEmptyComponent={
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
              <Pressable style={styles.emptyAddButton} onPress={() => setCreateModalOpen(true)}>
                <Text style={styles.emptyAddButtonText}>+ Add {mediaType}</Text>
              </Pressable>
            )}
          </View>
        }
      />

      {/* Add Media Modal */}
      <CreateMediaModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        defaultType={mediaType}
        onMediaAdded={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    paddingBottom: 24,
  },
  gridItem: {
    flex: 1 / 2,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  compactItem: {
    width: '100%',
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
    color: theme.colors.accentContrast,
    fontSize: 13,
    fontWeight: '800',
  },
});
