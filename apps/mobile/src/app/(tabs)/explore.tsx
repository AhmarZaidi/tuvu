import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api, DashboardEntry } from '../../services/api';
import { theme } from '../../constants/theme';
import { MediaCard } from '../../components/MediaCard';
import { SectionHeader } from '../../components/SectionHeader';

const MEDIA_TYPES = [
  { key: '', label: 'All' },
  { key: 'show', label: 'Shows' },
  { key: 'movie', label: 'Movies' },
  { key: 'anime', label: 'Anime' },
  { key: 'game', label: 'Games' },
  { key: 'book', label: 'Books' },
];

export default function ExploreScreen() {
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState('');

  const isSearching = query.trim().length > 1;

  const {
    data: searchResults,
    isLoading: isSearchLoading,
  } = useQuery({
    queryKey: ['exploreSearch', query, activeType],
    queryFn: () => api.search(query.trim(), activeType || undefined),
    enabled: isSearching,
  });

  const {
    data: exploreData,
    isLoading: isExploreLoading,
  } = useQuery({
    queryKey: ['exploreData'],
    queryFn: () => api.getExploreData(),
    enabled: !isSearching,
  });

  return (
    <View style={styles.container}>
      {/* Search Input Bar matching web */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={theme.colors.textSubtle} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search shows, movies, anime, games..."
            placeholderTextColor={theme.colors.textSubtle}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textSubtle} />
            </Pressable>
          )}
        </View>

        {/* Media Type Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContainer}
        >
          {MEDIA_TYPES.map((type) => {
            const isSelected = activeType === type.key;
            return (
              <Pressable
                key={type.key}
                style={[
                  styles.filterChip,
                  isSelected && styles.filterChipActive,
                ]}
                onPress={() => setActiveType(type.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextActive,
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
        isSearchLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
            <Text style={styles.loadingText}>Searching...</Text>
          </View>
        ) : (
          <FlatList
            data={searchResults?.results || []}
            keyExtractor={(item) => item.mediaId}
            numColumns={3}
            contentContainerStyle={styles.gridContainer}
            renderItem={({ item }) => (
              <View style={styles.gridItem}>
                <MediaCard item={item} width={105} />
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.centerContainer}>
                <Text style={styles.emptyTitle}>No results found</Text>
                <Text style={styles.emptySubtitle}>Try searching with a different term.</Text>
              </View>
            }
          />
        )
      ) : (
        isExploreLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
            <Text style={styles.loadingText}>Loading discovery...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.exploreScroll}>
            {exploreData?.sections?.map((section: any) => (
              <View key={section.id || section.key} style={styles.section}>
                <SectionHeader title={section.label || section.title} count={section.entries?.length || section.items?.length} />
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={section.entries || section.items || []}
                  keyExtractor={(item: DashboardEntry) => item.mediaId}
                  renderItem={({ item }) => <MediaCard item={item} />}
                  contentContainerStyle={styles.horizontalList}
                />
              </View>
            )) || (
              <View style={styles.centerContainer}>
                <Text style={styles.emptyTitle}>Explore</Text>
                <Text style={styles.emptySubtitle}>Type above to search through thousands of titles.</Text>
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
  searchContainer: {
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    height: '100%',
  },
  filterScroll: {
    marginTop: 10,
  },
  filterContainer: {
    gap: 8,
    paddingRight: theme.spacing.md,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
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
  gridContainer: {
    padding: theme.spacing.sm,
  },
  gridItem: {
    flex: 1 / 3,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
  },
  exploreScroll: {
    paddingVertical: theme.spacing.md,
  },
  section: {
    marginBottom: theme.spacing.lg,
    paddingLeft: theme.spacing.md,
  },
  horizontalList: {
    paddingRight: theme.spacing.md,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  loadingText: {
    color: theme.colors.textMuted,
    marginTop: 12,
    fontSize: 13,
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
