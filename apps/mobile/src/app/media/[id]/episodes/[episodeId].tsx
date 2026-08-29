import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../../services/api';
import { theme } from '../../../../constants/theme';
import { useSubpageBack } from '../../../../hooks/useSubpageBack';

export default function EpisodeDetailsScreen() {
  const { id: mediaId, episodeId } = useLocalSearchParams<{ id: string; episodeId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  useSubpageBack(mediaId ? `/media/${mediaId}` : '/(tabs)');

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['episodeDetails', episodeId],
    queryFn: () => api.getEpisodeDetails(episodeId),
    enabled: Boolean(episodeId),
  });

  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.activity?.notes) {
      setNotes(data.activity.notes);
    }
  }, [data?.activity?.notes]);

  const episode = data?.episode;
  const activity = data?.activity;
  const isWatched = Boolean(activity?.watched);
  const rewatchCount = activity?.rewatchCount || 0;
  const rating = activity?.rating || null;

  const handleToggleWatched = async () => {
    setSaving(true);
    try {
      await api.updateEpisodeActivity(episodeId, { watched: !isWatched });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['mediaEpisodes', mediaId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      console.error('Failed to toggle episode watched', e);
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustRewatch = async (delta: number) => {
    const nextCount = Math.max(0, rewatchCount + delta);
    setSaving(true);
    try {
      await api.updateEpisodeActivity(episodeId, { rewatchCount: nextCount });
      refetch();
    } catch (e) {
      console.error('Failed to update rewatch count', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSetRating = async (score: number | null) => {
    setSaving(true);
    try {
      await api.updateEpisodeActivity(episodeId, { rating: score });
      refetch();
    } catch (e) {
      console.error('Failed to set episode rating', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await api.updateEpisodeActivity(episodeId, { notes });
      refetch();
    } catch (e) {
      console.error('Failed to save episode notes', e);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>Loading episode...</Text>
      </View>
    );
  }

  if (isError || !episode) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Could not load episode</Text>
        <Text style={styles.errorSubtitle}>
          {(error as Error)?.message || 'Episode not found.'}
        </Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const stillUrl = episode.stillPath
    ? (episode.stillPath.startsWith('http') ? episode.stillPath : `https://image.tmdb.org/t/p/w780${episode.stillPath}`)
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Episode Still Header */}
      <View style={styles.stillWrap}>
        {stillUrl ? (
          <Image source={{ uri: stillUrl }} style={styles.stillImage} contentFit="cover" />
        ) : (
          <View style={styles.stillPlaceholder}>
            <Ionicons name="tv-outline" size={40} color={theme.colors.textSubtle} />
          </View>
        )}
      </View>

      <View style={styles.detailsCard}>
        <View style={styles.codeRow}>
          <Text style={styles.episodeCode}>
            Season {episode.seasonNumber} • Episode {episode.episodeNumber}
          </Text>
          {episode.runtimeMinutes && (
            <Text style={styles.runtimeText}>{episode.runtimeMinutes}m</Text>
          )}
        </View>

        <Text style={styles.title}>{episode.title || episode.name || `Episode ${episode.episodeNumber}`}</Text>
        {episode.airDate && <Text style={styles.airDateText}>Aired on {episode.airDate}</Text>}

        {/* Quick Watched Action Button */}
        <Pressable
          style={[styles.watchedActionButton, isWatched && styles.watchedActionButtonActive]}
          onPress={handleToggleWatched}
          disabled={saving}
        >
          <Ionicons
            name={isWatched ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={20}
            color={isWatched ? theme.colors.accentContrast : theme.colors.textStrong}
          />
          <Text style={[styles.watchedActionText, isWatched && styles.watchedActionTextActive]}>
            {isWatched ? 'Watched' : 'Mark as Watched'}
          </Text>
        </Pressable>

        {/* Rewatch Counter & Rating Row */}
        <View style={styles.activityRow}>
          <View style={styles.rewatchBox}>
            <Text style={styles.subHeading}>Rewatch Count</Text>
            <View style={styles.counterRow}>
              <Pressable
                style={styles.counterButton}
                onPress={() => handleAdjustRewatch(-1)}
                disabled={rewatchCount <= 0 || saving}
              >
                <Ionicons name="remove" size={16} color={theme.colors.textStrong} />
              </Pressable>
              <Text style={styles.counterValue}>{rewatchCount}</Text>
              <Pressable
                style={styles.counterButton}
                onPress={() => handleAdjustRewatch(1)}
                disabled={saving}
              >
                <Ionicons name="add" size={16} color={theme.colors.textStrong} />
              </Pressable>
            </View>
          </View>

          <View style={styles.ratingBox}>
            <Text style={styles.subHeading}>Rating</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} onPress={() => handleSetRating(rating === star * 2 ? null : star * 2)}>
                  <Ionicons
                    name={rating && rating >= star * 2 ? 'star' : 'star-outline'}
                    size={20}
                    color={rating && rating >= star * 2 ? theme.colors.accent : theme.colors.textSubtle}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Synopsis */}
        {episode.overview ? (
          <View style={styles.sectionBlock}>
            <Text style={styles.subHeading}>Synopsis</Text>
            <Text style={styles.overviewText}>{episode.overview}</Text>
          </View>
        ) : null}

        {/* Personal Notes */}
        <View style={styles.sectionBlock}>
          <Text style={styles.subHeading}>Personal Notes</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Write notes on this episode..."
            placeholderTextColor={theme.colors.textSubtle}
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          <Pressable style={styles.saveNotesButton} onPress={handleSaveNotes} disabled={saving}>
            <Text style={styles.saveNotesButtonText}>Save Notes</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingBottom: 32,
  },
  stillWrap: {
    width: '100%',
    height: 210,
    backgroundColor: '#1c1d1e',
  },
  stillImage: {
    width: '100%',
    height: '100%',
  },
  stillPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    marginHorizontal: theme.spacing.md,
    marginTop: -20,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  episodeCode: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  runtimeText: {
    color: theme.colors.textSubtle,
    fontSize: 11,
    fontWeight: '600',
  },
  title: {
    color: theme.colors.textStrong,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  airDateText: {
    color: theme.colors.textSubtle,
    fontSize: 12,
    marginBottom: 12,
  },
  watchedActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  watchedActionButtonActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  watchedActionText: {
    color: theme.colors.textStrong,
    fontSize: 13,
    fontWeight: '800',
  },
  watchedActionTextActive: {
    color: theme.colors.accentContrast,
  },
  activityRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  rewatchBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  ratingBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  subHeading: {
    color: theme.colors.textSubtle,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counterButton: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    color: theme.colors.textStrong,
    fontSize: 15,
    fontWeight: '800',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    height: 28,
  },
  sectionBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  overviewText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  notesInput: {
    backgroundColor: '#101112',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    color: theme.colors.text,
    fontSize: 13,
    padding: 10,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  saveNotesButton: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.xs,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  saveNotesButtonText: {
    color: theme.colors.accentContrast,
    fontSize: 12,
    fontWeight: '800',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    color: theme.colors.textMuted,
    marginTop: 12,
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
  },
  backButton: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
  },
  backButtonText: {
    color: theme.colors.accentContrast,
    fontWeight: '800',
  },
});
