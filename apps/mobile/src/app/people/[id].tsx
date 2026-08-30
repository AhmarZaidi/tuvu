import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Linking,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { api, PersonCredit } from '../../services/api';
import { theme } from '../../constants/theme';
import { GoldenGlow } from '../../components/GoldenGlow';
import { TopBar } from '../../components/TopBar';
import { useSubpageBack } from '../../hooks/useSubpageBack';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function PersonDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  useSubpageBack('/(tabs)');

  const [expandedBio, setExpandedBio] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const { data: person, isLoading, isError, refetch } = useQuery({
    queryKey: ['personDetails', id],
    queryFn: () => api.getPerson(id),
    enabled: Boolean(id),
  });

  const handleOpenCredit = async (credit: PersonCredit) => {
    setResolvingId(credit.id);
    try {
      const res = await api.resolveMedia({
        provider: 'tmdb',
        providerId: credit.id,
        type: credit.type,
        title: credit.title,
        posterPath: credit.posterPath,
        year: credit.year,
      });
      router.push(`/media/${res.media.id}` as any);
    } catch {
      router.push(`/media/${credit.id}` as any);
    } finally {
      setResolvingId(null);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (isError || !person) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color="#ff6b6b" />
        <Text style={styles.errorTitle}>Person unavailable</Text>
        <Text style={styles.errorSubtitle}>Could not load this person's profile right now.</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const bio = person.biography || '';
  const isBioLong = bio.length > 280;
  const displayedBio = isBioLong && !expandedBio ? `${bio.slice(0, 260)}...` : bio;

  const images: string[] =
    person.images && person.images.length > 0
      ? person.images
      : person.profilePath
      ? [person.profilePath]
      : [];

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const cardWidth = SCREEN_WIDTH - theme.spacing.md * 2;
    const offset = e.nativeEvent.contentOffset.x;
    const index = Math.round(offset / cardWidth);
    if (index !== activeImageIndex && index >= 0 && index < images.length) {
      setActiveImageIndex(index);
    }
  };

  const cardWidth = SCREEN_WIDTH - theme.spacing.md * 2;

  return (
    <View style={styles.container}>
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
          <Text style={styles.eyebrow}>{person.knownForDepartment?.toUpperCase() || 'ACTING'}</Text>
          <Text style={styles.personName}>{person.name}</Text>

          <View style={styles.detailsRow}>
            {person.birthday && (
              <View style={styles.detailBadge}>
                <Ionicons name="calendar-outline" size={13} color="#aeb1ac" />
                <Text style={styles.detailBadgeText}>
                  {person.birthday}
                  {person.deathday ? ` – ${person.deathday}` : ''}
                </Text>
              </View>
            )}

            {person.placeOfBirth && (
              <View style={styles.detailBadge}>
                <Ionicons name="location-outline" size={13} color="#aeb1ac" />
                <Text style={styles.detailBadgeText} numberOfLines={1}>
                  {person.placeOfBirth}
                </Text>
              </View>
            )}

            {person.knownForDepartment && (
              <View style={styles.detailBadge}>
                <Ionicons name="film-outline" size={13} color="#aeb1ac" />
                <Text style={styles.detailBadgeText}>{person.knownForDepartment}</Text>
              </View>
            )}
          </View>
        </View>

        {/* 3. Full Size Image Card (Covering full width with fixed portrait 3:4 aspect ratio) */}
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
                {images.slice(0, 10).map((_, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.dot,
                      idx === activeImageIndex && styles.dotActive,
                    ]}
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
                {(person.name || 'P').slice(0, 2).toUpperCase()}
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
          {person.alsoKnownAs && person.alsoKnownAs.length > 0 && (
            <View style={styles.alsoKnownSection}>
              <Text style={styles.subHeading}>Also Known As</Text>
              <View style={styles.aliasesWrap}>
                {person.alsoKnownAs.slice(0, 6).map((alias, idx) => (
                  <View key={idx} style={styles.aliasChip}>
                    <Text style={styles.aliasChipText}>{alias}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* External Links */}
          {(person.imdbId || person.homepage) && (
            <View style={styles.linksRow}>
              {person.imdbId && (
                <Pressable
                  style={styles.externalLinkBtn}
                  onPress={() => {
                    Linking.openURL(`https://www.imdb.com/name/${person.imdbId}`).catch(() => {});
                  }}
                >
                  <Ionicons name="link-outline" size={14} color={theme.colors.accent} />
                  <Text style={styles.externalLinkText}>IMDb Profile</Text>
                </Pressable>
              )}
              {person.homepage && (
                <Pressable
                  style={styles.externalLinkBtn}
                  onPress={() => {
                    Linking.openURL(person.homepage!).catch(() => {});
                  }}
                >
                  <Ionicons name="globe-outline" size={14} color="#aeb1ac" />
                  <Text style={styles.externalLinkText}>Official Website</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* 5. Credits Card ("Known for") */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardEyebrow}>CREDITS</Text>
          <Text style={styles.cardTitle}>Known for ({person.credits.length})</Text>

          {person.credits.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.creditsScroll}
            >
              {person.credits.map((credit, idx) => {
                const isResolving = resolvingId === credit.id;
                return (
                  <Pressable
                    key={`${credit.id}-${idx}`}
                    style={styles.creditCard}
                    onPress={() => handleOpenCredit(credit)}
                    disabled={isResolving}
                  >
                    {credit.posterPath ? (
                      <Image
                        source={{ uri: credit.posterPath }}
                        style={styles.creditPoster}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.creditPosterPlaceholder}>
                        <Text style={styles.creditInitials}>
                          {(credit.title || 'M').slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}

                    {isResolving && (
                      <View style={styles.creditLoadingOverlay}>
                        <ActivityIndicator size="small" color={theme.colors.accent} />
                      </View>
                    )}

                    <Text style={styles.creditTitle} numberOfLines={1}>
                      {credit.title}
                    </Text>
                    <Text style={styles.creditRole} numberOfLines={1}>
                      {credit.character || credit.type}
                      {credit.year ? ` • ${credit.year}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.mutedText}>Credits will appear after provider hydration.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101112',
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#101112',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#aeb1ac',
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#101112',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8f7f2',
    marginTop: 12,
  },
  errorSubtitle: {
    fontSize: 13,
    color: '#aeb1ac',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.sm,
  },
  backButtonText: {
    color: '#101112',
    fontWeight: '700',
  },
  topBar: {
    marginTop: 8,
    marginBottom: 12,
  },
  circularBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Header Section
  headerSection: {
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: theme.colors.accent,
    marginBottom: 4,
  },
  personName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f8f7f2',
    lineHeight: 34,
    marginBottom: 10,
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  detailBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dcded9',
  },
  // Full Size Image Card (Covering full width with fixed portrait 3:4 aspect ratio)
  mainImageCard: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#18191b',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 14,
    position: 'relative',
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#202326',
  },
  placeholderInitials: {
    fontSize: 48,
    fontWeight: '800',
    color: theme.colors.accent,
  },
  dotsContainer: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
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
    backgroundColor: theme.colors.accent,
  },
  // Section Cards
  sectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    padding: 16,
    marginBottom: 14,
  },
  cardEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: theme.colors.accent,
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f8f7f2',
    marginBottom: 10,
  },
  bioContainer: {
    marginTop: 2,
  },
  bioText: {
    fontSize: 13,
    lineHeight: 21,
    color: '#dcded9',
  },
  readMoreBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  readMoreText: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  mutedText: {
    fontSize: 13,
    color: '#8b8e89',
    marginTop: 4,
  },
  alsoKnownSection: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingTop: 12,
  },
  subHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#aeb1ac',
    marginBottom: 8,
  },
  aliasesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  aliasChip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  aliasChipText: {
    fontSize: 11,
    color: '#dcded9',
  },
  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingTop: 12,
  },
  externalLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  externalLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f8f7f2',
  },
  // Credits
  creditsScroll: {
    gap: 12,
    paddingVertical: 4,
  },
  creditCard: {
    width: 96,
    position: 'relative',
  },
  creditPoster: {
    width: 96,
    height: 144,
    borderRadius: 8,
    backgroundColor: '#202326',
    marginBottom: 6,
  },
  creditPosterPlaceholder: {
    width: 96,
    height: 144,
    borderRadius: 8,
    backgroundColor: '#202326',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  creditInitials: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.accent,
  },
  creditLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f8f7f2',
    marginBottom: 2,
  },
  creditRole: {
    fontSize: 11,
    color: '#8b8e89',
  },
});
