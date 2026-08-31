import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { theme } from '../../constants/theme';
import { GoldenGlow } from '../../components/GoldenGlow';
import { TopBar } from '../../components/TopBar';
import { useSubpageBack } from '../../hooks/useSubpageBack';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function CharacterDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  useSubpageBack('/(tabs)');

  const [expandedBio, setExpandedBio] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const { data: character, isLoading, isError, refetch } = useQuery({
    queryKey: ['characterDetails', id],
    queryFn: () => api.getCharacter(id),
    enabled: Boolean(id),
  });

  const handleOpenMedia = async (mediaItem: any) => {
    setResolvingId(mediaItem.id);
    try {
      const res = await api.resolveMedia({
        provider: 'anilist',
        providerId: mediaItem.id,
        type: 'anime',
        title: mediaItem.title,
        posterPath: mediaItem.posterPath,
      });
      router.push(`/media/${res.media.id}` as any);
    } catch {
      router.push(`/media/${mediaItem.id}` as any);
    } finally {
      setResolvingId(null);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <TopBar />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading character profile...</Text>
        </View>
      </View>
    );
  }

  if (isError || !character) {
    return (
      <View style={styles.loadingContainer}>
        <TopBar />
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>Character Unavailable</Text>
          <Text style={styles.errorSubtitle}>
            Could not load details for this character.
          </Text>
          <Pressable style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GoldenGlow />
      <TopBar />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO SECTION */}
        <View style={styles.heroSection}>
          <View style={styles.portraitWrapper}>
            {character.image ? (
              <Image
                source={{ uri: character.image }}
                style={styles.portraitImage}
                contentFit="cover"
              />
            ) : (
              <View style={styles.portraitPlaceholder}>
                <Ionicons name="person" size={60} color="#aeb1ac" />
              </View>
            )}
          </View>

          <View style={styles.heroInfo}>
            <Text style={styles.characterName} numberOfLines={2}>
              {character.name}
            </Text>

            {character.nativeName && (
              <Text style={styles.nativeName}>{character.nativeName}</Text>
            )}

            {/* Quick Info Badges */}
            <View style={styles.badgeRow}>
              {character.gender && (
                <View style={styles.infoBadge}>
                  <Ionicons name="male-female-outline" size={13} color="#aeb1ac" />
                  <Text style={styles.infoBadgeText}>{character.gender}</Text>
                </View>
              )}
              {character.age && (
                <View style={styles.infoBadge}>
                  <Ionicons name="sparkles-outline" size={13} color="#aeb1ac" />
                  <Text style={styles.infoBadgeText}>Age {character.age}</Text>
                </View>
              )}
              {character.dateOfBirth && (
                <View style={styles.infoBadge}>
                  <Ionicons name="calendar-outline" size={13} color="#aeb1ac" />
                  <Text style={styles.infoBadgeText}>{character.dateOfBirth}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ALTERNATIVE NAMES */}
        {character.alternativeNames && character.alternativeNames.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>ALIASES</Text>
            <Text style={styles.aliasText}>
              {character.alternativeNames.join(' • ')}
            </Text>
          </View>
        )}

        {/* ABOUT / BIOGRAPHY */}
        {character.description && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>ABOUT</Text>
            <Text style={styles.sectionTitle}>Character profile</Text>
            <Text
              style={styles.bioText}
              numberOfLines={expandedBio ? undefined : 6}
            >
              {character.description}
            </Text>
            {character.description.length > 280 && (
              <Pressable
                style={styles.expandButton}
                onPress={() => setExpandedBio((prev) => !prev)}
              >
                <Text style={styles.expandButtonText}>
                  {expandedBio ? 'Show Less' : 'Read Full Bio'}
                </Text>
                <Ionicons
                  name={expandedBio ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={theme.colors.accent}
                />
              </Pressable>
            )}
          </View>
        )}

        {/* VOICE ACTORS */}
        {character.voiceActors && character.voiceActors.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>VOICES</Text>
            <Text style={styles.sectionTitle}>Voice Actors</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalScroll}
            >
              {character.voiceActors.map((va, idx) => (
                <Pressable
                  key={`${va.id}-${idx}`}
                  style={styles.vaCard}
                  onPress={() => va.id && router.push(`/people/${va.id}` as any)}
                >
                  {va.image ? (
                    <Image source={{ uri: va.image }} style={styles.vaPortrait} contentFit="cover" />
                  ) : (
                    <View style={styles.vaPlaceholder}>
                      <Text style={styles.vaInitials}>{(va.name || 'V').slice(0, 1)}</Text>
                    </View>
                  )}
                  <Text style={styles.vaName} numberOfLines={1}>
                    {va.name}
                  </Text>
                  <Text style={styles.vaLang} numberOfLines={1}>
                    {va.language}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ANIME APPEARANCES */}
        {character.media && character.media.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>APPEARANCES</Text>
            <Text style={styles.sectionTitle}>Anime appearances</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalScroll}
            >
              {character.media.map((item, idx) => (
                <Pressable
                  key={`${item.id}-${idx}`}
                  style={styles.mediaCard}
                  onPress={() => handleOpenMedia(item)}
                  disabled={resolvingId === item.id}
                >
                  {item.posterPath ? (
                    <Image source={{ uri: item.posterPath }} style={styles.mediaPoster} contentFit="cover" />
                  ) : (
                    <View style={styles.mediaPosterPlaceholder}>
                      <Text style={styles.mediaInitials}>{(item.title || 'A').slice(0, 2)}</Text>
                    </View>
                  )}
                  <Text style={styles.mediaTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.mediaFormat} numberOfLines={1}>
                    {item.format || 'Anime'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0e12',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 48,
    paddingTop: 8,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0c0e12',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#aeb1ac',
    marginTop: 12,
    fontSize: 14,
  },
  errorTitle: {
    color: '#f8f7f2',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  errorSubtitle: {
    color: '#aeb1ac',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  retryButton: {
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#12151c',
    fontWeight: '700',
    fontSize: 14,
  },
  heroSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 16,
  },
  portraitWrapper: {
    width: 110,
    height: 155,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  portraitImage: {
    width: '100%',
    height: '100%',
  },
  portraitPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  characterName: {
    color: '#f8f7f2',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  nativeName: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  infoBadgeText: {
    color: '#d0d3cd',
    fontSize: 11,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  sectionEyebrow: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionTitle: {
    color: '#f8f7f2',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  aliasText: {
    color: '#aeb1ac',
    fontSize: 13,
    lineHeight: 18,
  },
  bioText: {
    color: '#d0d3cd',
    fontSize: 13.5,
    lineHeight: 20,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  expandButtonText: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  horizontalScroll: {
    gap: 12,
    paddingVertical: 4,
  },
  vaCard: {
    width: 90,
    alignItems: 'center',
  },
  vaPortrait: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  vaPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vaInitials: {
    color: '#f8f7f2',
    fontSize: 20,
    fontWeight: '700',
  },
  vaName: {
    color: '#f8f7f2',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
    width: '100%',
  },
  vaLang: {
    color: '#aeb1ac',
    fontSize: 10.5,
    marginTop: 2,
    textAlign: 'center',
  },
  mediaCard: {
    width: 105,
  },
  mediaPoster: {
    width: 105,
    height: 150,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  mediaPosterPlaceholder: {
    width: 105,
    height: 150,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaInitials: {
    color: '#f8f7f2',
    fontSize: 18,
    fontWeight: '700',
  },
  mediaTitle: {
    color: '#f8f7f2',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    lineHeight: 16,
  },
  mediaFormat: {
    color: '#aeb1ac',
    fontSize: 10,
    marginTop: 2,
  },
});
