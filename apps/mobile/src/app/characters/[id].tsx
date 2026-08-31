import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
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
  const [activeImageIndex, setActiveImageIndex] = useState(0);
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
      if (res?.media?.id) {
        router.push(`/media/${res.media.id}` as any);
      } else {
        router.push(`/media/${mediaItem.id}` as any);
      }
    } catch {
      router.push(`/media/${mediaItem.id}` as any);
    } finally {
      setResolvingId(null);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <GoldenGlow />
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>Loading character details...</Text>
      </View>
    );
  }

  if (isError || !character) {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <GoldenGlow />
        <Ionicons name="alert-circle-outline" size={48} color="#ff6b6b" />
        <Text style={styles.errorTitle}>Character unavailable</Text>
        <Text style={styles.errorSubtitle}>Could not load this character's profile right now.</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const bio = character.description || '';
  const isBioLong = bio.length > 280;
  const displayedBio = isBioLong && !expandedBio ? `${bio.slice(0, 260)}...` : bio;

  const images: string[] = character.image ? [character.image] : [];
  const cardWidth = SCREEN_WIDTH - theme.spacing.md * 2;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = e.nativeEvent.contentOffset.x;
    const index = Math.round(offset / cardWidth);
    if (index !== activeImageIndex && index >= 0 && index < images.length) {
      setActiveImageIndex(index);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <GoldenGlow />

      {/* TopBar matching mobile global navigation */}
      <TopBar />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 1. Circular Back Button */}
        <View style={styles.topBar}>
          <Pressable style={styles.circularBackButton} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color="#f8f7f2" />
          </Pressable>
        </View>

        {/* 2. Header Section: Eyebrow, Name, Details */}
        <View style={styles.headerSection}>
          <Text style={styles.eyebrow}>CHARACTER</Text>
          <Text style={styles.characterName}>{character.name}</Text>
          {character.nativeName && (
            <Text style={styles.nativeName}>{character.nativeName}</Text>
          )}

          <View style={styles.detailsRow}>
            {character.gender && (
              <View style={styles.detailBadge}>
                <Ionicons name="male-female-outline" size={13} color="#aeb1ac" />
                <Text style={styles.detailBadgeText}>{character.gender}</Text>
              </View>
            )}

            {character.age && (
              <View style={styles.detailBadge}>
                <Ionicons name="sparkles-outline" size={13} color="#aeb1ac" />
                <Text style={styles.detailBadgeText}>Age {character.age}</Text>
              </View>
            )}

            {character.dateOfBirth && (
              <View style={styles.detailBadge}>
                <Ionicons name="calendar-outline" size={13} color="#aeb1ac" />
                <Text style={styles.detailBadgeText}>{character.dateOfBirth}</Text>
              </View>
            )}
          </View>
        </View>

        {/* 3. Full Size Image Card (3:4 aspect ratio) */}
        <View style={styles.mainImageCard}>
          {images.length > 1 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleScroll}
                style={StyleSheet.absoluteFill}
              >
                {images.map((imgUrl, idx) => (
                  <View key={`${imgUrl}-${idx}`} style={{ width: cardWidth, height: '100%' }}>
                    <Image
                      source={{ uri: imgUrl }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  </View>
                ))}
              </ScrollView>

              {/* Dots indicator */}
              <View style={styles.dotsContainer}>
                {images.map((_, idx) => (
                  <View
                    key={idx}
                    style={[styles.dot, idx === activeImageIndex && styles.dotActive]}
                  />
                ))}
              </View>
            </>
          ) : images.length === 1 ? (
            <Image
              source={{ uri: images[0] }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.placeholderInitials}>
                {(character.name || 'C').slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* 4. Profile Card (Biography, Also Known As, Links) */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardEyebrow}>PROFILE</Text>
          <Text style={styles.cardTitle}>Biography</Text>

          {bio ? (
            <View style={styles.bioContainer}>
              <Text style={styles.bioText}>{displayedBio}</Text>
              {isBioLong && (
                <Pressable
                  onPress={() => setExpandedBio(!expandedBio)}
                  style={styles.readMoreBtn}
                  hitSlop={6}
                >
                  <Text style={styles.readMoreText}>
                    {expandedBio ? 'Collapse' : '...Read More'}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            <Text style={styles.mutedText}>Biography is not available yet.</Text>
          )}

          {/* Also Known As */}
          {character.alternativeNames && character.alternativeNames.length > 0 && (
            <View style={styles.alsoKnownSection}>
              <Text style={styles.subHeading}>Also Known As</Text>
              <View style={styles.aliasesWrap}>
                {character.alternativeNames.slice(0, 6).map((alias, idx) => (
                  <View key={idx} style={styles.aliasChip}>
                    <Text style={styles.aliasChipText}>{alias}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* 5. Voice Actors Section */}
        {character.voiceActors && character.voiceActors.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.cardEyebrow}>VOICES</Text>
            <Text style={styles.cardTitle}>Voice Actors</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalScroll}
            >
              {character.voiceActors.map((va, idx) => (
                <Pressable
                  key={`${va.id}-${idx}`}
                  style={styles.vaCard}
                  onPress={() =>
                    va.id &&
                    router.push({
                      pathname: '/people/[id]',
                      params: { id: String(va.id), provider: 'anilist', name: va.name },
                    } as any)
                  }
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

        {/* 6. Anime Appearances Section */}
        {character.media && character.media.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.cardEyebrow}>APPEARANCES</Text>
            <Text style={styles.cardTitle}>Anime appearances</Text>
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
    backgroundColor: '#0c0d0e',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0c0d0e',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#8b8e89',
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0c0d0e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    gap: 12,
  },
  errorTitle: {
    color: '#f8f7f2',
    fontSize: 18,
    fontWeight: '700',
  },
  errorSubtitle: {
    color: '#8b8e89',
    fontSize: 14,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 12,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  backButtonText: {
    color: '#f8f7f2',
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 60,
  },
  topBar: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  circularBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSection: {
    marginTop: 12,
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffcf5c',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  characterName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f8f7f2',
    letterSpacing: -0.5,
  },
  nativeName: {
    fontSize: 15,
    color: '#8b8e89',
    marginTop: 2,
    fontWeight: '500',
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  detailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 6,
  },
  detailBadgeText: {
    color: '#dcded9',
    fontSize: 12,
    fontWeight: '500',
  },
  mainImageCard: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#18191b',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  dotsContainer: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  dotActive: {
    width: 18,
    backgroundColor: '#ffcf5c',
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderInitials: {
    color: '#8b8e89',
    fontSize: 48,
    fontWeight: '800',
  },
  sectionCard: {
    backgroundColor: '#141517',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  cardEyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#8b8e89',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8f7f2',
    marginBottom: 12,
  },
  bioContainer: {
    marginTop: 2,
  },
  bioText: {
    color: '#dcded9',
    fontSize: 14,
    lineHeight: 21,
  },
  readMoreBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  readMoreText: {
    color: '#ffcf5c',
    fontSize: 13,
    fontWeight: '600',
  },
  mutedText: {
    color: '#8b8e89',
    fontSize: 13,
    fontStyle: 'italic',
  },
  alsoKnownSection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  subHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#aeb1ac',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aliasesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  aliasChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  aliasChipText: {
    color: '#dcded9',
    fontSize: 12,
  },
  horizontalScroll: {
    gap: 10,
  },
  vaCard: {
    width: 100,
  },
  vaPortrait: {
    width: 100,
    height: 140,
    borderRadius: 8,
    backgroundColor: '#1f2022',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  vaPlaceholder: {
    width: 100,
    height: 140,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  vaInitials: {
    color: '#8b8e89',
    fontSize: 24,
    fontWeight: '700',
  },
  vaName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f8f7f2',
    lineHeight: 15,
  },
  vaLang: {
    fontSize: 11,
    color: '#8b8e89',
    marginTop: 2,
  },
  mediaCard: {
    width: 115,
  },
  mediaPoster: {
    width: 115,
    height: 165,
    borderRadius: 10,
    backgroundColor: '#222',
    marginBottom: 6,
  },
  mediaPosterPlaceholder: {
    width: 115,
    height: 165,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  mediaInitials: {
    color: '#8b8e89',
    fontSize: 20,
    fontWeight: '700',
  },
  mediaTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#f8f7f2',
    lineHeight: 16,
  },
  mediaFormat: {
    fontSize: 11,
    color: '#8b8e89',
    marginTop: 2,
  },
});
