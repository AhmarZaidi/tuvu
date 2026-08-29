import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api, DashboardResponse, DashboardEntry } from '../services/api';
import { theme } from '../constants/theme';
import { MediaCard } from './MediaCard';
import { SectionPills } from './SectionPills';
import { DashboardToolbar, SortMode } from './DashboardToolbar';

interface DashboardViewProps {
  kind: 'shows' | 'anime' | 'movies' | 'books' | 'games';
  title: string;
  eyebrow?: string;
  emptyMessage?: string;
}

export function DashboardView({ kind, title, eyebrow, emptyMessage }: DashboardViewProps) {
  const [activeSectionId, setActiveSectionId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('grid');
  const [sortMode, setSortMode] = useState<SortMode>('updated');

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
    // Ensure an 'All' section exists if not already provided
    const hasAll = data.sections.some((s) => s.id === 'all');
    if (!hasAll && data.entries) {
      return [{ id: 'all', label: `All ${title}`, entries: data.entries }, ...data.sections];
    }
    return data.sections;
  }, [data, title]);

  // Set default active section once data arrives
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
    } else if (sortMode === 'rating') {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else {
      list.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    }

    return list;
  }, [currentSection, search, sortMode]);

  const cycleSort = () => {
    setSortMode((prev) => {
      if (prev === 'updated') return 'title';
      if (prev === 'title') return 'year';
      if (prev === 'year') return 'rating';
      return 'updated';
    });
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>Loading {title.toLowerCase()}...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Could not load {title.toLowerCase()}</Text>
          <Text style={styles.errorSubtitle}>
            {(error as Error)?.message || 'Please check that the local server is running.'}
          </Text>
          <Pressable style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Retry Connection</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Section Filter Pills */}
      {sections.length > 0 && (
        <SectionPills
          sections={sections}
          activeSectionId={activeSectionId}
          onSelectSection={setActiveSectionId}
        />
      )}

      {/* Toolbar: Search, Sort, Grid/Compact View */}
      <DashboardToolbar
        search={search}
        onSearchChange={setSearch}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode((prev) => (prev === 'grid' ? 'compact' : 'grid'))}
        sortMode={sortMode}
        onCycleSort={cycleSort}
        placeholder={`Search ${currentSection?.label || title}...`}
      />

      {/* Main Items List */}
      <FlatList
        data={displayedEntries}
        keyExtractor={(item) => item.mediaId}
        key={viewMode}
        numColumns={viewMode === 'grid' ? 3 : 1}
        contentContainerStyle={[
          styles.listContent,
          viewMode === 'grid' ? styles.gridContent : styles.compactContent,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
          />
        }
        renderItem={({ item }) => (
          <View style={viewMode === 'grid' ? styles.gridItem : styles.compactItem}>
            <MediaCard item={item} width={viewMode === 'grid' ? 108 : undefined} variant={viewMode} />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No items found</Text>
            <Text style={styles.emptySubtitle}>
              {search.trim()
                ? 'Try a different search query.'
                : emptyMessage || `Nothing in ${currentSection?.label || title} yet.`}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: 8,
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 24,
  },
  gridContent: {
    gap: 12,
  },
  compactContent: {},
  gridItem: {
    flex: 1 / 3,
    alignItems: 'center',
    marginBottom: 12,
  },
  compactItem: {
    width: '100%',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
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
    marginTop: 24,
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
  },
});
