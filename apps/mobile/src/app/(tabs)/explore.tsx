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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { api, DashboardEntry, ExploreResult } from '../../services/api';
import { theme } from '../../constants/theme';
import { MediaCard } from '../../components/MediaCard';
import { SectionHeader } from '../../components/SectionHeader';
import { TopBar } from '../../components/TopBar';

const MEDIA_TYPES = [
  { key: '', label: 'All Media' },
  { key: 'show', label: 'Shows' },
  { key: 'anime', label: 'Anime' },
  { key: 'movie', label: 'Movies' },
  { key: 'book', label: 'Books' },
  { key: 'game', label: 'Games' },
];

export default function ExploreScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);

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

  const handleAdd = async (item: DashboardEntry) => {
    setAddingId(item.mediaId);
    try {
      await api.addToLibrary(item.mediaId, 'watching');
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['allLibrary'] });
    } catch (e) {
      console.error('Failed to add to library', e);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <TopBar />
      {/* Search Input Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={theme.colors.textSubtle} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search shows, anime, movies, books, games..."
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
            <Text style={styles.loadingText}>Searching media...</Text>
          </View>
        ) : (
          <FlatList
            data={searchResults?.results || []}
            keyExtractor={(item) => item.mediaId}
            numColumns={3}
            contentContainerStyle={styles.gridContainer}
            renderItem={({ item }) => (
              <View style={styles.gridItem}>
                <MediaCard item={item} width={108} />
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.centerContainer}>
                <Text style={styles.emptyTitle}>No results found</Text>
                <Text style={styles.emptySubtitle}>Try searching with a different title or keyword.</Text>
              </View>
            }
          />
        )
      ) : (
        isExploreLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
            <Text style={styles.loadingText}>Loading discovery rows...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.exploreScroll}>
            {exploreData?.rows && exploreData.rows.length > 0 ? (
              exploreData.rows.map((row) => (
                <View key={row.id} style={styles.section}>
                  <SectionHeader title={row.title} count={row.results?.length} />
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={row.results || []}
                    keyExtractor={(result) => `${result.provider}:${result.providerId}`}
                    renderItem={({ item }) => {
                      const poster = item.posterPath
                        ? (item.posterPath.startsWith('http') ? item.posterPath : `https://image.tmdb.org/t/p/w342${item.posterPath}`)
                        : null;

                      return (
                        <View style={styles.exploreCard}>
                          <View style={styles.explorePoster}>
                            {poster ? (
                              <Image source={{ uri: poster }} style={styles.posterImg} contentFit="cover" />
                            ) : (
                              <View style={styles.placeholder}>
                                <Text style={styles.placeholderText} numberOfLines={2}>{item.title}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.exploreTitle} numberOfLines={1}>{item.title}</Text>
                          {item.year && <Text style={styles.exploreYear}>{item.year}</Text>}
                        </View>
                      );
                    }}
                    contentContainerStyle={styles.horizontalList}
                  />
                </View>
              ))
            ) : (
              <View style={styles.centerContainer}>
                <Ionicons name="compass-outline" size={48} color={theme.colors.textSubtle} style={{ marginBottom: 12 }} />
                <Text style={styles.emptyTitle}>Discover New Media</Text>
                <Text style={styles.emptySubtitle}>
                  Type in the search bar above to search across millions of TV shows, movies, anime, books, and games.
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
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
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
    padding: theme.spacing.md,
  },
  gridItem: {
    flex: 1 / 3,
    marginBottom: 12,
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
  exploreCard: {
    width: 120,
    marginRight: 12,
  },
  explorePoster: {
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
    color: theme.colors.textStrong,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  exploreYear: {
    color: theme.colors.textSubtle,
    fontSize: 11,
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 32,
  },
  loadingText: {
    color: theme.colors.textMuted,
    marginTop: 12,
    fontSize: 13,
  },
  emptyTitle: {
    color: theme.colors.textStrong,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
});
