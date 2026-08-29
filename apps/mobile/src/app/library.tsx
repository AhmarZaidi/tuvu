import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api, DashboardEntry } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { MediaCard } from '../components/MediaCard';
import { GoldenGlow } from '../components/GoldenGlow';

const MEDIA_TYPES = [
  { key: 'all', label: 'All Media' },
  { key: 'show', label: 'Shows' },
  { key: 'anime', label: 'Anime' },
  { key: 'movie', label: 'Movies' },
  { key: 'book', label: 'Books' },
  { key: 'game', label: 'Games' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All Statuses' },
  { key: 'watching', label: 'Watching' },
  { key: 'watch_later', label: 'Plan to Watch' },
  { key: 'completed', label: 'Completed' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'dropped', label: 'Dropped' },
];

export default function AllLibraryScreen() {
  const { colors } = useAppTheme();
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['allLibrary', selectedType, selectedStatus],
    queryFn: () => api.getAllLibrary({ type: selectedType, status: selectedStatus, limit: 500 }),
  });

  const rawEntries = useMemo(() => {
    if (!data?.library) return [];
    return data.library.map((entry: any) => {
      const m = entry.media || {};
      const item = entry.item || {};
      return {
        mediaId: m.id || item.mediaId,
        type: m.type || 'show',
        title: m.title || '',
        overview: m.overview || null,
        posterPath: m.posterPath || m.poster_path || null,
        backdropPath: m.backdropPath || m.backdrop_path || null,
        airStatus: m.airStatus || m.air_status || null,
        releaseDate: m.releaseDate || m.release_date || null,
        year: m.year || null,
        status: item.status || 'watch_later',
        isFavorite: Boolean(item.isFavorite || item.is_favorite),
        rating: item.rating || null,
        progressEpisodes: item.progressEpisodes || item.progress_episodes || 0,
        progressValue: item.progressValue || item.progress_value || null,
        progressTotal: item.progressTotal || item.progress_total || null,
        progressUnit: item.progressUnit || item.progress_unit || null,
        platform: item.platform || null,
        startedAt: item.startedAt || null,
        purchaseLibrary: item.purchaseLibrary || null,
        updatedAt: item.updatedAt || item.updated_at || '',
      } as DashboardEntry;
    });
  }, [data]);

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return rawEntries;
    const q = search.trim().toLowerCase();
    return rawEntries.filter((e: DashboardEntry) => e.title.toLowerCase().includes(q));
  }, [rawEntries, search]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GoldenGlow />
      {/* Search Input */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={theme.colors.textSubtle} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Filter entire library..."
          placeholderTextColor={theme.colors.textSubtle}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={theme.colors.textSubtle} />
          </Pressable>
        )}
      </View>

      {/* Type Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {MEDIA_TYPES.map((t) => {
          const isActive = selectedType === t.key;
          return (
            <Pressable
              key={t.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setSelectedType(t.key)}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Status Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {STATUS_FILTERS.map((s) => {
          const isActive = selectedStatus === s.key;
          return (
            <Pressable
              key={s.key}
              style={[styles.statusChip, isActive && styles.statusChipActive]}
              onPress={() => setSelectedStatus(s.key)}
            >
              <Text style={[styles.statusChipText, isActive && styles.statusChipTextActive]}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Main Grid */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading library...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.mediaId}
          numColumns={3}
          contentContainerStyle={styles.gridContent}
          renderItem={({ item }) => (
            <View style={styles.gridItem}>
              <MediaCard item={item} width={108} />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No items match filters</Text>
              <Text style={styles.emptySubtitle}>Try choosing a different type or status.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: theme.spacing.md,
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
  },
  filterScroll: {
    maxHeight: 38,
    marginBottom: 6,
  },
  filterRow: {
    paddingHorizontal: theme.spacing.md,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  filterChipText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: theme.colors.accentContrast,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  statusChipActive: {
    backgroundColor: 'rgba(255, 207, 92, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.4)',
  },
  statusChipText: {
    color: theme.colors.textSubtle,
    fontSize: 11,
    fontWeight: '600',
  },
  statusChipTextActive: {
    color: theme.colors.accent,
    fontWeight: '800',
  },
  gridContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: 8,
    paddingBottom: 24,
  },
  gridItem: {
    flex: 1 / 3,
    alignItems: 'center',
    marginBottom: 12,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: theme.colors.textMuted,
    marginTop: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 32,
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
  },
});
