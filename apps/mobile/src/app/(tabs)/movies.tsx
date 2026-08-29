import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api, DashboardResponse } from '../../services/api';
import { theme } from '../../constants/theme';
import { MediaCard } from '../../components/MediaCard';
import { SectionHeader } from '../../components/SectionHeader';

export default function MoviesScreen() {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery<DashboardResponse>({
    queryKey: ['dashboard', 'movies'],
    queryFn: () => api.getDashboard('movies'),
  });

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>Loading your movies...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Could not load movies</Text>
          <Text style={styles.errorSubtitle}>
            {(error as Error)?.message || 'Please check connection.'}
          </Text>
          <Pressable style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Retry Connection</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const sections = data?.sections?.filter((s) => s.entries && s.entries.length > 0) || [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={theme.colors.accent}
          colors={[theme.colors.accent]}
        />
      }
    >
      {sections.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No movies tracked yet</Text>
          <Text style={styles.emptySubtitle}>
            Discover popular and upcoming movies in the Explore tab.
          </Text>
        </View>
      ) : (
        sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <SectionHeader title={section.label} count={section.entries?.length} />
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={section.entries}
              keyExtractor={(item) => item.mediaId}
              renderItem={({ item }) => <MediaCard item={item} />}
              contentContainerStyle={styles.listContainer}
            />
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    paddingVertical: theme.spacing.md,
  },
  section: {
    marginBottom: theme.spacing.lg,
    paddingLeft: theme.spacing.md,
  },
  listContainer: {
    paddingRight: theme.spacing.md,
    paddingVertical: 2,
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
    textAlign: 'center',
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
    padding: theme.spacing.xl,
    marginTop: theme.spacing.xl,
    marginHorizontal: theme.spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  emptyTitle: {
    color: theme.colors.textStrong,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
});
