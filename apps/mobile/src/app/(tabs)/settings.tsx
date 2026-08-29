import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../../context/ThemeContext';
import { useSnackbar } from '../../context/SnackbarContext';
import { config, getDefaultApiBase } from '../../constants/config';
import {
  api,
  MeResponse,
  ProviderCredentialStatus,
  UserBackup,
  StorageStats,
} from '../../services/api';
import { GoldenGlow } from '../../components/GoldenGlow';
import { TopBar } from '../../components/TopBar';
import { BackButton } from '../../components/BackButton';
import { ProfileHeroCard } from '../../components/ProfileHeroCard';
import { BottomSheet } from '../../components/BottomSheet';
import { useSubpageBack } from '../../hooks/useSubpageBack';

type SettingsTab =
  | 'account'
  | 'appearance'
  | 'navigation'
  | 'providers'
  | 'data'
  | 'storage'
  | 'connection';

export type MobileProviderCatalogItem = {
  code: string;
  name: string;
  category: 'audiovisual' | 'books' | 'games' | 'music' | 'news' | 'subtitles' | 'video';
  description: string;
  keyless: boolean;
  fields: Array<{ key: string; label: string; placeholder: string; secure?: boolean }>;
  attribution: string;
  docUrl: string;
  status?: string;
  configured?: boolean;
  configurationSource?: 'personal' | 'app' | 'keyless' | 'disabled' | 'none';
  connectionStatus?: string | null;
  configuredFields?: string[];
  hasSavedPersonalCredentials?: boolean;
  lastValidatedAt?: string | null;
  appFallback?: {
    configured: boolean;
    message: string;
  };
};

const PROVIDER_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'audiovisual', label: 'Movies & Shows' },
  { id: 'books', label: 'Books' },
  { id: 'games', label: 'Games' },
  { id: 'music', label: 'Music' },
  { id: 'news', label: 'News' },
  { id: 'subtitles', label: 'Subtitles' },
  { id: 'video', label: 'Video' },
];

const DEFAULT_PROVIDER_CATALOG: MobileProviderCatalogItem[] = [
  // ── Audiovisual ──
  {
    code: 'tmdb',
    name: 'TMDB',
    category: 'audiovisual',
    description: 'Primary metadata, posters, and credits for movies, shows, and anime.',
    keyless: false,
    fields: [{ key: 'TMDB_API_KEY', label: 'API Key / Read Token', placeholder: 'TMDB v3 API key or v4 token', secure: true }],
    attribution: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    docUrl: 'https://developer.themoviedb.org/docs',
  },
  {
    code: 'tvmaze',
    name: 'TVmaze',
    category: 'audiovisual',
    description: 'Keyless broadcast schedules, air dates, runtimes, and exact IMDb/TVDB cross-lookups.',
    keyless: true,
    fields: [],
    attribution: 'Television data provided by TVmaze under CC BY-SA.',
    docUrl: 'https://www.tvmaze.com/api',
  },
  {
    code: 'wikidata',
    name: 'Wikidata',
    category: 'audiovisual',
    description: 'Keyless factual enrichment, cross-identifiers, and Wikimedia Commons media.',
    keyless: true,
    fields: [],
    attribution: 'Structured data from Wikidata under CC0.',
    docUrl: 'https://www.wikidata.org/wiki/Wikidata:Data_access',
  },
  {
    code: 'thetvdb',
    name: 'TheTVDB',
    category: 'audiovisual',
    description: 'Television series metadata, season artwork, and episode orders.',
    keyless: false,
    fields: [
      { key: 'THETVDB_API_KEY', label: 'Project API Key', placeholder: 'TheTVDB v4 Project API key', secure: true },
      { key: 'THETVDB_USER_PIN', label: 'Subscriber PIN', placeholder: 'Optional subscriber PIN', secure: true },
    ],
    attribution: 'Metadata provided by TheTVDB.com under project license.',
    docUrl: 'https://thetvdb.com/api-information',
  },
  {
    code: 'jikan',
    name: 'Jikan (MAL)',
    category: 'audiovisual',
    description: 'Community anime and manga catalog indexing.',
    keyless: true,
    fields: [{ key: 'MAL_JIKAN_API_ENDPOINT', label: 'API Endpoint', placeholder: 'https://api.jikan.moe/v4/' }],
    attribution: 'Unofficial MyAnimeList data via Jikan REST API.',
    docUrl: 'https://docs.api.jikan.moe/',
  },
  {
    code: 'anilist',
    name: 'AniList',
    category: 'audiovisual',
    description: 'Community anime and manga GraphQL metadata and relations.',
    keyless: true,
    fields: [{ key: 'ANILIST_API_ENDPOINT', label: 'GraphQL Endpoint', placeholder: 'https://graphql.anilist.co' }],
    attribution: 'Data provided by AniList GraphQL API.',
    docUrl: 'https://docs.anilist.co/guide/graphql/',
  },

  // ── Books ──
  {
    code: 'googlebooks',
    name: 'Google Books',
    category: 'books',
    description: 'Book editions, ISBNs, page counts, descriptions, preview, and access metadata.',
    keyless: false,
    fields: [{ key: 'GOOGLE_BOOKS_API_KEY', label: 'API Key', placeholder: 'Google Books API key', secure: true }],
    attribution: 'Book information provided by Google Books.',
    docUrl: 'https://developers.google.com/books/docs/v1/using',
  },
  {
    code: 'openlibrary',
    name: 'Open Library',
    category: 'books',
    description: 'Open, keyless book work/edition reconciliation by Internet Archive.',
    keyless: true,
    fields: [{ key: 'OPEN_LIBRARY_CONTACT_EMAIL', label: 'Contact Email', placeholder: 'your@email.com' }],
    attribution: 'Book data from Open Library by Internet Archive under CC0 / ODC-BY.',
    docUrl: 'https://openlibrary.org/developers/api',
  },

  // ── Games ──
  {
    code: 'igdb',
    name: 'IGDB / Twitch',
    category: 'games',
    description: 'Primary video game database for releases, platforms, companies, and ratings.',
    keyless: false,
    fields: [
      { key: 'TWITCH_IGDB_CLIENT_ID', label: 'Client ID', placeholder: 'Twitch Developer Client ID' },
      { key: 'TWITCH_IGDB_CLIENT_SECRET', label: 'Client Secret', placeholder: 'Twitch Developer Client Secret', secure: true },
    ],
    attribution: 'Video game data powered by IGDB.com via Twitch.',
    docUrl: 'https://api-docs.igdb.com/',
  },
  {
    code: 'rawg',
    name: 'RAWG Games',
    category: 'games',
    description: 'Game store links, screenshots, player ratings, and PC hardware requirements.',
    keyless: false,
    fields: [{ key: 'RAWG_API_KEY', label: 'API Key', placeholder: 'RAWG.io API key', secure: true }],
    attribution: 'Game metadata powered by RAWG.io database.',
    docUrl: 'https://rawg.io/apidocs',
  },

  // ── Music ──
  {
    code: 'musicbrainz',
    name: 'MusicBrainz',
    category: 'music',
    description: 'Open music encyclopedia for artists, release groups, albums, and tracks.',
    keyless: true,
    fields: [{ key: 'MUSICBRAINZ_CONTACT_EMAIL', label: 'Contact Email', placeholder: 'your@email.com' }],
    attribution: 'Music data from MusicBrainz open database under CC0.',
    docUrl: 'https://musicbrainz.org/doc/MusicBrainz_API',
  },
  {
    code: 'coverartarchive',
    name: 'Cover Art Archive',
    category: 'music',
    description: 'High-resolution music album and single artwork linked to MusicBrainz MBIDs.',
    keyless: true,
    fields: [],
    attribution: 'Cover art provided by Cover Art Archive (MusicBrainz & Internet Archive).',
    docUrl: 'https://musicbrainz.org/doc/Cover_Art_Archive/API',
  },
  {
    code: 'listenbrainz',
    name: 'ListenBrainz',
    category: 'music',
    description: 'Listening history scrobbles, playlists, and open music recommendations.',
    keyless: true,
    fields: [{ key: 'LISTENBRAINZ_TOKEN', label: 'User Token', placeholder: 'Optional personal user token', secure: true }],
    attribution: 'Listening data provided by ListenBrainz by MetaBrainz Foundation.',
    docUrl: 'https://listenbrainz.readthedocs.io/',
  },
  {
    code: 'theaudiodb',
    name: 'TheAudioDB',
    category: 'music',
    description: 'Community music biographies, album discographies, and reviews.',
    keyless: false,
    fields: [{ key: 'THEAUDIODB_API_KEY', label: 'API Key', placeholder: "TheAudioDB API key (defaults to '2')", secure: true }],
    attribution: 'Music biographies and artwork from TheAudioDB.com.',
    docUrl: 'https://www.theaudiodb.com/api_guide.php',
  },
  {
    code: 'lrclib',
    name: 'LRCLIB Lyrics',
    category: 'music',
    description: 'Synchronized and plain-text song lyrics (client-cached, not stored).',
    keyless: true,
    fields: [],
    attribution: 'Lyrics provided by LRCLIB open lyrics database.',
    docUrl: 'https://lrclib.net/docs',
  },

  // ── News ──
  {
    code: 'gdelt',
    name: 'GDELT Project',
    category: 'news',
    description: 'Keyless global news events, headlines, and article discovery in 65 languages.',
    keyless: true,
    fields: [],
    attribution: 'News discovery via GDELT Project Doc 2.0 API.',
    docUrl: 'https://blog.gdeltproject.org/',
  },
  {
    code: 'guardian',
    name: 'The Guardian',
    category: 'news',
    description: 'Editorial article discovery and archive search from The Guardian.',
    keyless: false,
    fields: [{ key: 'GUARDIAN_API_KEY', label: 'Developer API Key', placeholder: 'The Guardian API key', secure: true }],
    attribution: 'Articles provided by Guardian News & Media Limited.',
    docUrl: 'https://open-platform.theguardian.com/access/',
  },
  {
    code: 'newsapi',
    name: 'NewsAPI',
    category: 'news',
    description: 'Live breaking headlines and articles from 80,000+ publishers.',
    keyless: false,
    fields: [{ key: 'NEWSAPI_KEY', label: 'API Key', placeholder: 'NewsAPI.org key', secure: true }],
    attribution: 'Powered by NewsAPI.org.',
    docUrl: 'https://newsapi.org/',
  },

  // ── Subtitles ──
  {
    code: 'opensubtitles',
    name: 'OpenSubtitles',
    category: 'subtitles',
    description: 'Subtitle availability and language metadata.',
    keyless: false,
    fields: [{ key: 'OPENSUBTITLES_API_KEY', label: 'API Key', placeholder: 'OpenSubtitles.com API key', secure: true }],
    attribution: 'Subtitle availability metadata from OpenSubtitles.com.',
    docUrl: 'https://ai.opensubtitles.com/docs',
  },

  // ── Video ──
  {
    code: 'youtube',
    name: 'YouTube',
    category: 'video',
    description: 'Video trailers, clips, and channels.',
    keyless: false,
    fields: [{ key: 'YOUTUBE_API_KEY', label: 'API Key', placeholder: 'YouTube Data API key', secure: true }],
    attribution: 'Video metadata powered by YouTube.',
    docUrl: 'https://developers.google.com/youtube/v3',
  },
];

const ALL_NAV_ITEMS = [
  { id: 'shows', label: 'Shows', icon: 'tv-outline' },
  { id: 'anime', label: 'Anime', icon: 'flame-outline' },
  { id: 'movies', label: 'Movies', icon: 'film-outline' },
  { id: 'books', label: 'Books', icon: 'book-outline' },
  { id: 'games', label: 'Games', icon: 'game-controller-outline' },
  { id: 'explore', label: 'Explore', icon: 'compass-outline' },
];

const GRADIENT_INTENSITY_PRESETS = [
  { label: 'Off', value: 0 },
  { label: 'Subtle', value: 0.1 },
  { label: 'Default', value: 0.2 },
  { label: 'Vibrant', value: 0.35 },
  { label: 'Intense', value: 0.5 },
];

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export default function TabSettingsScreen() {
  const router = useRouter();
  useSubpageBack('/(tabs)/profile', true);
  const queryClient = useQueryClient();
  const { colors, mode, setMode, isDark, theme, gradientIntensity, setGradientIntensity } = useAppTheme();
  const { showNotice } = useSnackbar();
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');

  const showFeedback = (msg: string, tone: 'info' | 'success' | 'error' = 'success') => {
    showNotice(msg, tone);
  };

  // ──────────────────────────────────────────────
  // 1. Account Settings State
  // ──────────────────────────────────────────────
  const { data: meData, refetch: refetchMe } = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: () => api.getMe(),
  });

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'connections' | 'public'>('private');
  const [savingAccount, setSavingAccount] = useState(false);

  // Delete Account State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useEffect(() => {
    if (meData) {
      setDisplayName(meData.user.displayName || '');
      setUsername(meData.user.username || '');
      setBio(meData.profile.bio || '');
      setVisibility((meData.profile.visibility as any) || 'private');
    }
  }, [meData]);

  const handleSaveAccount = async () => {
    setSavingAccount(true);
    try {
      await api.updateProfile({ displayName, username, bio, visibility });
      await refetchMe();
      queryClient.invalidateQueries({ queryKey: ['me'] });
      showFeedback('Profile saved successfully.');
    } catch (e: any) {
      showFeedback(e?.message || 'Could not save profile.', 'error');
    } finally {
      setSavingAccount(false);
    }
  };

  // Media picker BottomSheet state
  const [activePickerKind, setActivePickerKind] = useState<'avatar' | 'banner'>('avatar');
  const [showMediaActionSheet, setShowMediaActionSheet] = useState(false);

  const handleMediaPress = (kind: 'avatar' | 'banner') => {
    setActivePickerKind(kind);
    const hasImage = kind === 'avatar' ? Boolean(meData?.profile?.avatarUrl) : Boolean(meData?.profile?.bannerUrl);
    if (!hasImage) {
      // If no image is added, directly open Android's gallery selector
      openImagePicker(kind);
    } else {
      // If image already exists, open bottom sheet with Replace & Remove options
      setShowMediaActionSheet(true);
    }
  };

  const openImagePicker = async (kind: 'avatar' | 'banner') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showFeedback('Media library access is needed to select an image.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: kind === 'avatar' ? [1, 1] : [16, 7],
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        const asset = result.assets[0];
        await api.uploadProfileMedia(kind, asset.uri, asset.mimeType, asset.fileName ?? undefined);
        await refetchMe();
        queryClient.invalidateQueries({ queryKey: ['me'] });
        showFeedback(`${kind.charAt(0).toUpperCase() + kind.slice(1)} uploaded successfully.`);
      }
    } catch (err: any) {
      try {
        const fallbackResult = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.85,
        });
        if (!fallbackResult.canceled && fallbackResult.assets && fallbackResult.assets[0]?.uri) {
          const asset = fallbackResult.assets[0];
          await api.uploadProfileMedia(kind, asset.uri, asset.mimeType, asset.fileName ?? undefined);
          await refetchMe();
          queryClient.invalidateQueries({ queryKey: ['me'] });
          showFeedback(`${kind.charAt(0).toUpperCase() + kind.slice(1)} uploaded successfully.`);
        }
      } catch (e: any) {
        showFeedback(e?.message || 'Could not upload image.');
      }
    }
  };

  const handleReplaceMedia = () => {
    setShowMediaActionSheet(false);
    setTimeout(() => {
      openImagePicker(activePickerKind);
    }, 250);
  };

  const handleRemoveMedia = async () => {
    setShowMediaActionSheet(false);
    try {
      await api.removeProfileMedia(activePickerKind);
      await refetchMe();
      queryClient.invalidateQueries({ queryKey: ['me'] });
      showFeedback(`${activePickerKind.charAt(0).toUpperCase() + activePickerKind.slice(1)} removed.`);
    } catch (e: any) {
      showFeedback(e?.message || `Could not remove ${activePickerKind}.`);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== meData?.user?.username) {
      showFeedback('Please type your exact username to confirm deletion.');
      return;
    }
    setIsDeletingAccount(true);
    try {
      await api.deleteAccount();
      setShowDeleteModal(false);
      queryClient.clear();
      router.replace('/' as any);
    } catch (e: any) {
      showFeedback(e?.message || 'Failed to delete account.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // ──────────────────────────────────────────────
  // 2. Appearance Settings State
  // ──────────────────────────────────────────────
  const handleChangeTheme = async (newTheme: 'dark' | 'light' | 'system') => {
    await setMode(newTheme);
    showFeedback(`Theme preference set to ${newTheme}.`);
  };

  // ──────────────────────────────────────────────
  // 3. Navigation Settings State
  // ──────────────────────────────────────────────
  const [navItems, setNavItems] = useState<string[]>(['shows', 'anime', 'movies', 'books', 'games', 'explore']);
  const [showLabelsMobile, setShowLabelsMobile] = useState(false);
  const [savingNav, setSavingNav] = useState(false);

  useEffect(() => {
    api.getNavigationSettings()
      .then((res) => {
        if (res.navigation?.items) {
          const items = res.navigation.items.includes('explore')
            ? res.navigation.items
            : [...res.navigation.items, 'explore'];
          setNavItems(items);
        }
        if (typeof res.navigation?.showLabelsMobile === 'boolean') {
          setShowLabelsMobile(res.navigation.showLabelsMobile);
        }
      })
      .catch(() => {});
  }, []);

  const toggleNavItem = (id: string) => {
    if (id === 'explore') {
      showFeedback('Explore is always included in the bottom navigation bar.', 'info');
      return;
    }
    if (navItems.includes(id)) {
      setNavItems(navItems.filter((i) => i !== id));
    } else {
      setNavItems([...navItems, id]);
    }
  };

  const moveNavItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= navItems.length) return;
    const next = [...navItems];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    setNavItems(next);
  };

  const handleSaveNavigation = async () => {
    setSavingNav(true);
    try {
      const itemsToSave = navItems.includes('explore') ? navItems : [...navItems, 'explore'];
      await api.updateNavigationSettings(itemsToSave, showLabelsMobile);
      queryClient.invalidateQueries({ queryKey: ['navigationSettings'] });
      showFeedback('Navigation settings saved.');
    } catch (e: any) {
      showFeedback(e?.message || 'Could not save navigation.', 'error');
    } finally {
      setSavingNav(false);
    }
  };

  // ──────────────────────────────────────────────
  // 4. Providers Settings State
  // ──────────────────────────────────────────────
  const providerScrollRef = useRef<ScrollView>(null);
  const [providerStatuses, setProviderStatuses] = useState<ProviderCredentialStatus[]>([]);
  const [selectedProviderCategory, setSelectedProviderCategory] = useState<string>('all');
  const [activeProviderKey, setActiveProviderKey] = useState<string>('tmdb');
  const [providerSecrets, setProviderSecrets] = useState<Record<string, string>>({});
  const [showSecretKeys, setShowSecretKeys] = useState<Record<string, boolean>>({});
  const [savingProvider, setSavingProvider] = useState(false);
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; status: string; latencyMs: number; message: string } | null>(null);
  const [appPingLoading, setAppPingLoading] = useState(false);
  const [appPingResult, setAppPingResult] = useState<{ ok: boolean; status: string; latencyMs: number; message: string } | null>(null);

  const toggleShowSecret = (key: string) => {
    setShowSecretKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const loadProviders = useCallback(async () => {
    try {
      const res = await api.getProviderSettings();
      setProviderStatuses(res.providers || []);
    } catch {}
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    setPingResult(null);
    setAppPingResult(null);
    setProviderSecrets({});
    setShowSecretKeys({});
  }, [activeProviderKey]);

  const allProviders = useMemo(() => {
    const statusMap = new Map(providerStatuses.map((p) => [p.provider, p]));
    return DEFAULT_PROVIDER_CATALOG.map((item) => {
      const live = statusMap.get(item.code);
      return {
        ...item,
        status: live?.status ?? (item.keyless ? 'active' : 'not_configured'),
        configured: live?.configured ?? item.keyless,
        configurationSource: live?.configurationSource ?? (item.keyless ? 'keyless' : 'none'),
        connectionStatus: live?.connectionStatus ?? null,
        configuredFields: live?.configuredFields ?? [],
        hasSavedPersonalCredentials: live?.hasSavedPersonalCredentials ?? false,
        lastValidatedAt: live?.lastValidatedAt ?? null,
        appFallback: live?.appFallback ?? {
          configured: item.keyless,
          message: item.keyless ? 'Keyless public API (always ready)' : 'Server environment fallback',
        },
      };
    });
  }, [providerStatuses]);

  const filteredMobileProviders = useMemo(() => {
    if (selectedProviderCategory === 'all') return allProviders;
    return allProviders.filter((p: MobileProviderCatalogItem) => p.category === selectedProviderCategory);
  }, [allProviders, selectedProviderCategory]);

  const activeProviderItem = useMemo(() => {
    return allProviders.find((p: MobileProviderCatalogItem) => p.code === activeProviderKey) || allProviders[0] || DEFAULT_PROVIDER_CATALOG[0];
  }, [allProviders, activeProviderKey]);

  const activeProviderStatus = activeProviderItem.configurationSource === 'personal';
  const activeProviderUsesAppFallback = activeProviderItem.configurationSource === 'app';
  const activeProviderConnectionFailed = Boolean(activeProviderItem.connectionStatus && !['healthy', 'not_configured'].includes(activeProviderItem.connectionStatus));
  const activeProviderHealthLabel = activeProviderItem.connectionStatus === 'healthy' ? 'Live' : activeProviderConnectionFailed ? 'Failing' : 'Not tested';
  const activeProviderHealthColor = activeProviderItem.connectionStatus === 'healthy' ? '#5fe388' : activeProviderConnectionFailed ? '#ff6b6b' : colors.textMuted;
  const activeProviderHealthBackground = activeProviderItem.connectionStatus === 'healthy' ? 'rgba(95, 227, 136, 0.14)' : activeProviderConnectionFailed ? 'rgba(255, 107, 107, 0.14)' : colors.inputBg;

  const recordConnectionStatus = (provider: string, status: string) => {
    setProviderStatuses((current) => current.map((item) => item.provider === provider ? { ...item, connectionStatus: status } : item));
  };

  const handleSelectProviderCategory = (catId: string) => {
    setSelectedProviderCategory(catId);
    if (catId === 'all') {
      if (!allProviders.some((p) => p.code === activeProviderKey)) {
        setActiveProviderKey('tmdb');
      }
    } else {
      const match = allProviders.find((p) => p.category === catId);
      if (match) {
        setActiveProviderKey(match.code);
      }
    }
    // Scroll specific API pills back to the beginning
    setTimeout(() => {
      providerScrollRef.current?.scrollTo({ x: 0, y: 0, animated: true });
    }, 50);
  };

  useEffect(() => {
    providerScrollRef.current?.scrollTo({ x: 0, y: 0, animated: true });
  }, [selectedProviderCategory]);

  const handleTestAppFallback = async () => {
    setAppPingLoading(true);
    setAppPingResult(null);
    try {
      const res = await api.pingProvider(activeProviderKey, 'app');
      setAppPingResult(res.ping);
      recordConnectionStatus(activeProviderKey, res.ping.status);
      if (res.ping.ok) {
        showFeedback(`App fallback: ${res.ping.message} (${res.ping.latencyMs} ms)`);
      } else {
        showFeedback(`App fallback: ${res.ping.message}`, 'error');
      }
    } catch (e: any) {
      const fail = {
        ok: false,
        status: 'unavailable',
        latencyMs: 0,
        message: e?.message || 'Failed to ping app fallback.',
      };
      setAppPingResult(fail);
      recordConnectionStatus(activeProviderKey, fail.status);
      showFeedback(fail.message, 'error');
    } finally {
      setAppPingLoading(false);
    }
  };

  const handleSaveProvider = async () => {
    setSavingProvider(true);
    try {
      const cleanSecrets: Record<string, string> = {};
      for (const [k, v] of Object.entries(providerSecrets)) {
        if (v && v.trim()) {
          cleanSecrets[k] = v.trim();
        }
      }
      if (Object.keys(cleanSecrets).length === 0) {
        showFeedback('Please enter at least one credential value.', 'error');
        setSavingProvider(false);
        return;
      }
      await api.updateProviderSettings(activeProviderKey, cleanSecrets);
      setProviderSecrets({});
      await loadProviders();
      showFeedback(`${activeProviderItem.name} saved successfully.`);
    } catch (e: any) {
      showFeedback(e?.message || 'Failed to save provider credentials.', 'error');
    } finally {
      setSavingProvider(false);
    }
  };

  const handleRemoveProviderCredentials = async () => {
    setSavingProvider(true);
    try {
      await api.disableProvider(activeProviderKey);
      await loadProviders();
      showFeedback(`${activeProviderItem.name} saved credentials removed.`);
    } catch (e: any) {
      showFeedback(e?.message || 'Failed to disable provider.', 'error');
    } finally {
      setSavingProvider(false);
    }
  };

  const handleTestProviderConnection = async () => {
    setPingLoading(true);
    setPingResult(null);
    try {
      const res = await api.pingProvider(activeProviderKey, activeProviderUsesAppFallback ? 'app' : 'user');
      setPingResult(res.ping);
      recordConnectionStatus(activeProviderKey, res.ping.status);
      if (res.ping.ok) {
        showFeedback(`${activeProviderItem.name} connected (${res.ping.latencyMs} ms)`);
      } else {
        showFeedback(`${activeProviderItem.name}: ${res.ping.message}`, 'error');
      }
    } catch (e: any) {
      const fail = {
        ok: false,
        status: 'unavailable',
        latencyMs: 0,
        message: e?.message || 'Connection probe failed.',
      };
      setPingResult(fail);
      recordConnectionStatus(activeProviderKey, fail.status);
      showFeedback('Connection probe failed.', 'error');
    } finally {
      setPingLoading(false);
    }
  };

  // ──────────────────────────────────────────────
  // 5. Data & Backups State
  // ──────────────────────────────────────────────
  const [backups, setBackups] = useState<UserBackup[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);

  const loadBackups = useCallback(async () => {
    try {
      const res = await api.getBackups();
      setBackups(res.backups || []);
    } catch {}
  }, []);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      await api.createBackup();
      await loadBackups();
      showFeedback('Backup created successfully.');
    } catch (e: any) {
      showFeedback(e?.message || 'Failed to create backup.', 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleExportBackup = async (id: string) => {
    try {
      const res = await api.exportBackup(id);
      showFeedback(`Backup ${res.backup.id.slice(0, 8)} exported (${formatBytes(res.backup.byteSize)}).`, 'success');
    } catch (e: any) {
      showFeedback(e?.message || 'Could not export backup.', 'error');
    }
  };

  // ──────────────────────────────────────────────
  // 6. Storage Settings State
  // ──────────────────────────────────────────────
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [loadingStorage, setLoadingStorage] = useState(false);

  const loadStorage = useCallback(async () => {
    setLoadingStorage(true);
    try {
      const res = await api.getStorageSettings();
      setStorageStats(res.storage);
    } catch {}
    finally {
      setLoadingStorage(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'storage') {
      void loadStorage();
    }
  }, [activeTab, loadStorage]);

  // ──────────────────────────────────────────────
  // 7. Backend Connection State (Custom retained)
  // ──────────────────────────────────────────────
  const [serverUrl, setServerUrl] = useState(config.getApiBase());
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  const handleTestConnection = async () => {
    config.setApiBase(serverUrl);
    setIsPinging(true);
    setPingStatus(null);
    try {
      const start = Date.now();
      const res = await api.checkHealth();
      const elapsed = Date.now() - start;
      if (res.ok) {
        setPingStatus(`✓ Connected to ${res.service} (${elapsed}ms)`);
      } else {
        setPingStatus(`⚠️ Server response: ${JSON.stringify(res)}`);
      }
    } catch (e: any) {
      setPingStatus(`❌ Connection failed: ${e.message}`);
    } finally {
      setIsPinging(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GoldenGlow />
      <TopBar />

      {/* Subpage Back Button Header */}
      <View style={styles.subpageHeader}>
        <BackButton fallbackRoute="/(tabs)/profile" forceFallback={true} />
        <Text style={[styles.subpageHeaderTitle, { color: colors.textStrong }]}>Settings</Text>
      </View>

      {/* Settings Tab Navigation Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabsScroll, { borderBottomColor: colors.border, backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(34, 31, 25, 0.02)' }]}
        contentContainerStyle={styles.tabsContainer}
      >
        <Pressable
          style={[
            styles.tabButton,
            { borderColor: colors.border, backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(34, 31, 25, 0.04)' },
            activeTab === 'account' && { backgroundColor: colors.isDark ? 'rgba(255, 207, 92, 0.12)' : 'rgba(240, 168, 36, 0.2)', borderColor: colors.accent },
          ]}
          onPress={() => setActiveTab('account')}
        >
          <Ionicons name="person-outline" size={15} color={activeTab === 'account' ? colors.accent : colors.textMuted} />
          <Text style={[styles.tabText, { color: colors.textMuted }, activeTab === 'account' && { color: colors.accent, fontWeight: '900' }]}>Account</Text>
        </Pressable>

        <Pressable
          style={[
            styles.tabButton,
            { borderColor: colors.border, backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(34, 31, 25, 0.04)' },
            activeTab === 'appearance' && { backgroundColor: colors.isDark ? 'rgba(255, 207, 92, 0.12)' : 'rgba(240, 168, 36, 0.2)', borderColor: colors.accent },
          ]}
          onPress={() => setActiveTab('appearance')}
        >
          <Ionicons name="color-palette-outline" size={15} color={activeTab === 'appearance' ? colors.accent : colors.textMuted} />
          <Text style={[styles.tabText, { color: colors.textMuted }, activeTab === 'appearance' && { color: colors.accent, fontWeight: '900' }]}>Appearance</Text>
        </Pressable>

        <Pressable
          style={[
            styles.tabButton,
            { borderColor: colors.border, backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(34, 31, 25, 0.04)' },
            activeTab === 'navigation' && { backgroundColor: colors.isDark ? 'rgba(255, 207, 92, 0.12)' : 'rgba(240, 168, 36, 0.2)', borderColor: colors.accent },
          ]}
          onPress={() => setActiveTab('navigation')}
        >
          <Ionicons name="compass-outline" size={15} color={activeTab === 'navigation' ? colors.accent : colors.textMuted} />
          <Text style={[styles.tabText, { color: colors.textMuted }, activeTab === 'navigation' && { color: colors.accent, fontWeight: '900' }]}>Navigation</Text>
        </Pressable>

        <Pressable
          style={[
            styles.tabButton,
            { borderColor: colors.border, backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(34, 31, 25, 0.04)' },
            activeTab === 'providers' && { backgroundColor: colors.isDark ? 'rgba(255, 207, 92, 0.12)' : 'rgba(240, 168, 36, 0.2)', borderColor: colors.accent },
          ]}
          onPress={() => setActiveTab('providers')}
        >
          <Ionicons name="key-outline" size={15} color={activeTab === 'providers' ? colors.accent : colors.textMuted} />
          <Text style={[styles.tabText, { color: colors.textMuted }, activeTab === 'providers' && { color: colors.accent, fontWeight: '900' }]}>Providers</Text>
        </Pressable>

        <Pressable
          style={[
            styles.tabButton,
            { borderColor: colors.border, backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(34, 31, 25, 0.04)' },
            activeTab === 'data' && { backgroundColor: colors.isDark ? 'rgba(255, 207, 92, 0.12)' : 'rgba(240, 168, 36, 0.2)', borderColor: colors.accent },
          ]}
          onPress={() => setActiveTab('data')}
        >
          <Ionicons name="cloud-upload-outline" size={15} color={activeTab === 'data' ? colors.accent : colors.textMuted} />
          <Text style={[styles.tabText, { color: colors.textMuted }, activeTab === 'data' && { color: colors.accent, fontWeight: '900' }]}>Data</Text>
        </Pressable>

        <Pressable
          style={[
            styles.tabButton,
            { borderColor: colors.border, backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(34, 31, 25, 0.04)' },
            activeTab === 'storage' && { backgroundColor: colors.isDark ? 'rgba(255, 207, 92, 0.12)' : 'rgba(240, 168, 36, 0.2)', borderColor: colors.accent },
          ]}
          onPress={() => setActiveTab('storage')}
        >
          <Ionicons name="bar-chart-outline" size={15} color={activeTab === 'storage' ? colors.accent : colors.textMuted} />
          <Text style={[styles.tabText, { color: colors.textMuted }, activeTab === 'storage' && { color: colors.accent, fontWeight: '900' }]}>Storage</Text>
        </Pressable>

        <Pressable
          style={[
            styles.tabButton,
            { borderColor: colors.border, backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(34, 31, 25, 0.04)' },
            activeTab === 'connection' && { backgroundColor: colors.isDark ? 'rgba(255, 207, 92, 0.12)' : 'rgba(240, 168, 36, 0.2)', borderColor: colors.accent },
          ]}
          onPress={() => setActiveTab('connection')}
        >
          <Ionicons name="server-outline" size={15} color={activeTab === 'connection' ? colors.accent : colors.textMuted} />
          <Text style={[styles.tabText, { color: colors.textMuted }, activeTab === 'connection' && { color: colors.accent, fontWeight: '900' }]}>Server</Text>
        </Pressable>
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content}>
        {/* ────────────────────────────────────────────── */}
        {/* TAB 1: ACCOUNT SETTINGS                        */}
        {/* ────────────────────────────────────────────── */}
        {activeTab === 'account' && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>SETTINGS</Text>
              <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>Account</Text>
              <Text style={[styles.sectionDesc, { color: colors.textMuted }]}>Profile media, identity, and account controls.</Text>
            </View>

            {/* Profile Media Live Preview matching web .settings-preview */}
            <Text style={[styles.subHeading, { color: colors.textStrong }]}>Profile Media</Text>
            <ProfileHeroCard meData={meData} editable={true} onRefresh={refetchMe} style={{ marginBottom: 12 }} />

            {/* Quick Upload Buttons */}
            <View style={styles.mediaButtonRow}>
              <Pressable
                style={[styles.mediaActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => handleMediaPress('avatar')}
              >
                <Ionicons name="camera-outline" size={16} color={colors.accent} />
                <Text style={[styles.mediaActionText, { color: colors.textStrong }]}>
                  {meData?.profile?.avatarUrl ? 'Manage Avatar' : 'Add Avatar'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.mediaActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => handleMediaPress('banner')}
              >
                <Ionicons name="image-outline" size={16} color={colors.accent} />
                <Text style={[styles.mediaActionText, { color: colors.textStrong }]}>
                  {meData?.profile?.bannerUrl ? 'Manage Banner' : 'Add Banner'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textStrong }]}>Display Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Enter your name"
                placeholderTextColor={colors.textSubtle}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textStrong }]}>Username</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                value={username}
                onChangeText={setUsername}
                placeholder="username"
                placeholderTextColor={colors.textSubtle}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textStrong }]}>Email Address</Text>
              <TextInput
                style={[styles.input, styles.disabledInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                value={meData?.user?.email || 'Single-user local session'}
                editable={false}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textStrong }]}>Bio</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                value={bio}
                onChangeText={setBio}
                placeholder="Short bio about yourself"
                placeholderTextColor={colors.textSubtle}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textStrong }]}>Visibility</Text>
              <View style={[styles.pillGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {(['private', 'connections', 'public'] as const).map((opt) => (
                  <Pressable
                    key={opt}
                    style={[styles.pillOption, visibility === opt && { backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(34, 31, 25, 0.08)' }]}
                    onPress={() => setVisibility(opt)}
                  >
                    <Text
                      style={[
                        styles.pillOptionText,
                        { color: colors.textMuted },
                        visibility === opt && { color: colors.textStrong, fontWeight: '800' },
                      ]}
                    >
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable
              style={[styles.primaryButton, { backgroundColor: colors.accent }, savingAccount && { opacity: 0.7 }]}
              onPress={handleSaveAccount}
              disabled={savingAccount}
            >
              {savingAccount ? (
                <ActivityIndicator size="small" color={colors.accentContrast} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: colors.accentContrast }]}>Save profile</Text>
              )}
            </Pressable>

            {/* Danger Zone: Delete Account */}
            <View style={styles.dangerZone}>
              <View style={styles.dangerZoneHeader}>
                <Ionicons name="trash-outline" size={20} color="#ff6b6b" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dangerZoneTitle}>Danger Zone</Text>
                  <Text style={[styles.dangerZoneDesc, { color: colors.textMuted }]}>Permanently delete account and all tracking data.</Text>
                </View>
              </View>
              <Pressable
                style={styles.deleteAccountButton}
                onPress={() => {
                  setDeleteConfirmText('');
                  setShowDeleteModal(true);
                }}
              >
                <Text style={styles.deleteAccountButtonText}>Delete Account</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ────────────────────────────────────────────── */}
        {/* TAB 2: APPEARANCE SETTINGS                     */}
        {/* ────────────────────────────────────────────── */}
        {activeTab === 'appearance' && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>SETTINGS</Text>
              <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>Appearance</Text>
              <Text style={[styles.sectionDesc, { color: colors.textMuted }]}>Switch between Dark and Light mode live.</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textStrong }]}>Color Theme</Text>
              <View style={[styles.pillGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {(['dark', 'light', 'system'] as const).map((t) => (
                  <Pressable
                    key={t}
                    style={[
                      styles.pillOption,
                      mode === t && { backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(34, 31, 25, 0.1)' },
                    ]}
                    onPress={() => handleChangeTheme(t)}
                  >
                    <Text
                      style={[
                        styles.pillOptionText,
                        { color: colors.textMuted },
                        mode === t && { color: colors.textStrong, fontWeight: '800' },
                      ]}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Golden Gradient Intensity Setting */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textStrong }]}>Golden Glow Intensity</Text>
              <Text style={{ fontSize: 12, lineHeight: 17, color: colors.textMuted, marginBottom: 8 }}>
                Controls the intensity of the golden ambient gradient radiating from the top left corner.
              </Text>
              <View style={[styles.pillGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {GRADIENT_INTENSITY_PRESETS.map((preset) => {
                  const isSelected = Math.abs((gradientIntensity ?? 0.2) - preset.value) < 0.04;
                  return (
                    <Pressable
                      key={preset.label}
                      style={[
                        styles.pillOption,
                        isSelected && { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(34, 31, 25, 0.1)' },
                      ]}
                      onPress={async () => {
                        await setGradientIntensity(preset.value);
                        showFeedback(`Gradient intensity set to ${preset.label}.`);
                      }}
                    >
                      <Text
                        style={[
                          styles.pillOptionText,
                          { color: colors.textMuted },
                          isSelected && { color: colors.textStrong, fontWeight: '800' },
                        ]}
                      >
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[styles.infoRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.infoIconWrap, { backgroundColor: colors.isDark ? 'rgba(255, 207, 92, 0.1)' : 'rgba(240, 168, 36, 0.18)' }]}>
                <Ionicons name="grid-outline" size={18} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoRowTitle, { color: colors.textStrong }]}>Display Density</Text>
                <Text style={[styles.infoRowDesc, { color: colors.textMuted }]}>Comfortable (standard poster cards and spacing)</Text>
              </View>
            </View>
          </View>
        )}

        {/* ────────────────────────────────────────────── */}
        {/* TAB 3: NAVIGATION SETTINGS                     */}
        {/* ────────────────────────────────────────────── */}
        {activeTab === 'navigation' && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>SETTINGS</Text>
              <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>Navigation</Text>
              <Text style={[styles.sectionDesc, { color: colors.textMuted }]}>
                Choose any number of items for the mobile bottom bar. Explore is always included.
              </Text>
            </View>

            <Text style={[styles.subHeading, { color: colors.textStrong }]}>1. Active Navigation Items</Text>
            <View style={styles.navChipsWrap}>
              {ALL_NAV_ITEMS.map((item) => {
                const isActive = navItems.includes(item.id);
                const isExplore = item.id === 'explore';
                return (
                  <Pressable
                    key={item.id}
                    style={[
                      styles.navChip,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      isActive && { backgroundColor: colors.isDark ? 'rgba(255, 207, 92, 0.12)' : 'rgba(240, 168, 36, 0.2)', borderColor: colors.accent },
                    ]}
                    onPress={() => toggleNavItem(item.id)}
                  >
                    <Ionicons
                      name={item.icon as any}
                      size={15}
                      color={isActive ? colors.accent : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.navChipText,
                        { color: colors.textMuted },
                        isActive && { color: colors.textStrong, fontWeight: '800' },
                      ]}
                    >
                      {item.label}
                    </Text>
                    {isExplore ? (
                      <Ionicons name="lock-closed" size={12} color={colors.accent} style={{ marginLeft: 2 }} />
                    ) : (
                      isActive && <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
                    )}
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.subHeading, { color: colors.textStrong, marginTop: 18 }]}>2. Reorder Items</Text>
            <View style={styles.reorderList}>
              {navItems.map((id, index) => {
                const item = ALL_NAV_ITEMS.find((c) => c.id === id);
                return (
                  <View
                    key={id}
                    style={[styles.reorderRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Text style={[styles.reorderIndex, { color: colors.accent }]}>{index + 1}</Text>
                    <Text style={[styles.reorderLabel, { color: colors.textStrong }]}>{item?.label || id}</Text>
                    <View style={styles.reorderActions}>
                      <Pressable
                        style={[styles.arrowButton, { backgroundColor: colors.border }, index === 0 && { opacity: 0.3 }]}
                        disabled={index === 0}
                        onPress={() => moveNavItem(index, 'up')}
                      >
                        <Ionicons name="arrow-up" size={16} color={colors.accent} />
                      </Pressable>
                      <Pressable
                        style={[styles.arrowButton, { backgroundColor: colors.border }, index === navItems.length - 1 && { opacity: 0.3 }]}
                        disabled={index === navItems.length - 1}
                        onPress={() => moveNavItem(index, 'down')}
                      >
                        <Ionicons name="arrow-down" size={16} color={colors.accent} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>

            <Text style={[styles.subHeading, { color: colors.textStrong, marginTop: 18 }]}>3. Text Labels on Mobile</Text>
            <View style={[styles.pillGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable
                style={[styles.pillOption, !showLabelsMobile && { backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(34, 31, 25, 0.08)' }]}
                onPress={() => setShowLabelsMobile(false)}
              >
                <Text style={[styles.pillOptionText, { color: colors.textMuted }, !showLabelsMobile && { color: colors.textStrong, fontWeight: '800' }]}>
                  Hide Labels
                </Text>
              </Pressable>
              <Pressable
                style={[styles.pillOption, showLabelsMobile && { backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(34, 31, 25, 0.08)' }]}
                onPress={() => setShowLabelsMobile(true)}
              >
                <Text style={[styles.pillOptionText, { color: colors.textMuted }, showLabelsMobile && { color: colors.textStrong, fontWeight: '800' }]}>
                  Show Labels
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.primaryButton, { backgroundColor: colors.accent }, savingNav && { opacity: 0.7 }]}
              onPress={handleSaveNavigation}
              disabled={savingNav}
            >
              {savingNav ? (
                <ActivityIndicator size="small" color={colors.accentContrast} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: colors.accentContrast }]}>Save navigation</Text>
              )}
            </Pressable>
          </View>
        )}

        {/* ────────────────────────────────────────────── */}
        {/* TAB 4: PROVIDERS SETTINGS                      */}
        {/* ────────────────────────────────────────────── */}
        {activeTab === 'providers' && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>SETTINGS</Text>
              <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>Providers & APIs</Text>
              <Text style={[styles.sectionDesc, { color: colors.textMuted }]}>
                Connect personal credentials or test keyless connectivity for media search and hydration.
              </Text>
            </View>

            {/* Category Selector Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {PROVIDER_CATEGORIES.map((cat) => {
                const isSelected = selectedProviderCategory === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    style={[
                      styles.providerCategoryPill,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      isSelected && {
                        backgroundColor: colors.isDark ? 'rgba(255, 207, 92, 0.15)' : 'rgba(240, 168, 36, 0.22)',
                        borderColor: colors.accent,
                      },
                    ]}
                    onPress={() => handleSelectProviderCategory(cat.id)}
                  >
                    <Text
                      style={[
                        styles.providerCategoryPillText,
                        { color: colors.textMuted },
                        isSelected && { color: colors.textStrong, fontWeight: '800' },
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Provider Selector Pills for Active Category */}
            <ScrollView
              ref={providerScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.providerScroll}
            >
              {filteredMobileProviders.map((p: MobileProviderCatalogItem) => {
                const isSelected = activeProviderKey === p.code;
                const isConfigured = p.configurationSource === 'personal' || p.configurationSource === 'app';
                const hasFailedConnection = Boolean(p.connectionStatus && !['healthy', 'not_configured'].includes(p.connectionStatus));
                const isKeyless = p.keyless;
                const isDisabled = p.status === 'disabled';
                return (
                  <Pressable
                    key={p.code}
                    style={[
                      styles.providerServicePill,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      isSelected && {
                        backgroundColor: colors.isDark ? 'rgba(255, 207, 92, 0.12)' : 'rgba(240, 168, 36, 0.2)',
                        borderColor: colors.accent,
                      },
                    ]}
                    onPress={() => setActiveProviderKey(p.code)}
                  >
                    <Text
                      style={[
                        styles.providerServicePillText,
                        { color: colors.textMuted },
                        isSelected && { color: colors.textStrong, fontWeight: '800' },
                      ]}
                    >
                      {p.name}
                    </Text>
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor: hasFailedConnection
                            ? '#ff6b6b'
                            : isConfigured
                            ? '#5fe388'
                            : isKeyless
                            ? '#3b82f6'
                            : isDisabled
                            ? '#ff6b6b'
                            : '#6c706d',
                        },
                      ]}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Provider Form Card */}
            <View style={[styles.providerForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {/* Header: Title, Status Badge, Description */}
              <View style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={[styles.providerTitle, { color: colors.textStrong, flex: 1 }]} numberOfLines={1}>
                    {activeProviderItem.name}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 5, flexShrink: 0 }}>
                    <View style={[styles.badge, activeProviderStatus || activeProviderUsesAppFallback ? styles.badgeGreen : activeProviderItem.keyless ? { backgroundColor: 'rgba(59, 130, 246, 0.15)' } : activeProviderItem.status === 'disabled' ? { backgroundColor: 'rgba(255, 107, 107, 0.15)' } : styles.badgeGray]}>
                    <Text
                      style={[
                        styles.badgeText,
                        activeProviderStatus
                          ? styles.badgeTextGreen
                          : activeProviderUsesAppFallback
                          ? { color: '#5fe388' }
                          : activeProviderItem.keyless
                          ? { color: '#3b82f6' }
                          : activeProviderItem.status === 'disabled'
                          ? { color: '#ff6b6b' }
                          : styles.badgeTextGray,
                      ]}
                    >
                      {activeProviderStatus
                        ? 'Personal key saved'
                        : activeProviderUsesAppFallback
                        ? 'App fallback set'
                        : activeProviderItem.keyless
                        ? 'Keyless API'
                        : activeProviderItem.status === 'disabled'
                        ? 'Disabled'
                        : 'Not configured'}
                    </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: activeProviderHealthBackground }]}>
                      <Text style={[styles.badgeText, { color: activeProviderHealthColor }]}>{activeProviderHealthLabel}</Text>
                    </View>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 16 }}>
                  {activeProviderItem.description}
                </Text>
              </View>

              {/* Keyless Information Banner */}
              {activeProviderItem.keyless && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    borderColor: 'rgba(59, 130, 246, 0.25)',
                    borderWidth: 1,
                    borderRadius: 6,
                    padding: 10,
                    marginBottom: 12,
                    gap: 8,
                  }}
                >
                  <Ionicons name="wifi-outline" size={18} color="#3b82f6" />
                  <Text style={{ flex: 1, fontSize: 11, color: colors.textMuted, lineHeight: 16 }}>
                    This service operates keylessly without requiring personal credentials. You can test live connectivity below.
                  </Text>
                </View>
              )}

              {/* App-Based Fallback Status Row with Small Icon-Only Test Button */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: colors.inputBg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  marginBottom: 12,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Ionicons
                    name={activeProviderItem.appFallback?.configured ? 'server-outline' : 'alert-circle-outline'}
                    size={16}
                    color={activeProviderItem.appFallback?.configured ? '#5fe388' : colors.textSubtle}
                  />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textStrong }}>
                        App Fallback
                      </Text>
                      <View
                        style={{
                          backgroundColor: activeProviderItem.appFallback?.configured
                            ? 'rgba(95, 227, 136, 0.14)'
                            : 'rgba(255, 107, 107, 0.14)',
                          paddingHorizontal: 5,
                          paddingVertical: 1,
                          borderRadius: 3,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: '800',
                            color: activeProviderItem.appFallback?.configured ? '#5fe388' : '#ff6b6b',
                          }}
                        >
                          {activeProviderItem.appFallback?.configured ? 'Set' : 'Not Set'}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: activeProviderHealthBackground, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: activeProviderHealthColor }}>{activeProviderHealthLabel}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>
                      {appPingResult
                        ? `${appPingResult.message}${appPingResult.latencyMs > 0 ? ` (${appPingResult.latencyMs} ms)` : ''}`
                        : activeProviderItem.appFallback?.message || 'Server environment fallback'}
                    </Text>
                  </View>
                </View>

                {/* Small Test Button with ONLY an Icon */}
                <Pressable
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 5,
                    backgroundColor: appPingLoading ? 'rgba(255, 207, 92, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 8,
                  }}
                  onPress={handleTestAppFallback}
                  disabled={appPingLoading}
                  hitSlop={6}
                  accessibilityLabel="Test app fallback"
                >
                  {appPingLoading ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Ionicons
                      name={appPingResult ? (appPingResult.ok ? 'checkmark' : 'close') : 'pulse-outline'}
                      size={15}
                      color={appPingResult ? (appPingResult.ok ? '#5fe388' : '#ff6b6b') : colors.accent}
                    />
                  )}
                </Pressable>
              </View>

              {/* Credential Fields */}
              {activeProviderItem.fields && activeProviderItem.fields.length > 0 && (
                <View style={{ marginBottom: 12, gap: 10 }}>
                  {activeProviderItem.fields.map((f: { key: string; label: string; placeholder: string; secure?: boolean }) => {
                    const isSecure = f.secure && !showSecretKeys[f.key];
                    const hasSavedField = activeProviderItem.configuredFields?.includes(f.key) ?? false;
                    const effectivePlaceholder = hasSavedField && !providerSecrets[f.key]
                      ? '•••••••••••••••• (Configured)'
                      : f.placeholder;

                    return (
                      <View key={f.key}>
                        <Text style={[styles.label, { color: colors.textStrong }]}>{f.label}</Text>
                        <View style={{ position: 'relative', justifyContent: 'center' }}>
                          <TextInput
                            style={[
                              styles.input,
                              {
                                backgroundColor: colors.inputBg,
                                color: colors.text,
                                borderColor: colors.border,
                                paddingRight: f.secure ? 40 : 12,
                              },
                            ]}
                            value={providerSecrets[f.key] || ''}
                            onChangeText={(val) => setProviderSecrets((prev) => ({ ...prev, [f.key]: val }))}
                            placeholder={effectivePlaceholder}
                            placeholderTextColor={hasSavedField && !providerSecrets[f.key] ? colors.accent : colors.textSubtle}
                            secureTextEntry={isSecure}
                            autoCapitalize="none"
                            autoCorrect={false}
                          />
                          {f.secure && (
                            <Pressable
                              onPress={() => toggleShowSecret(f.key)}
                              style={{
                                position: 'absolute',
                                right: 10,
                                height: 38,
                                justifyContent: 'center',
                                alignItems: 'center',
                                paddingHorizontal: 4,
                              }}
                              hitSlop={8}
                            >
                              <Ionicons
                                name={showSecretKeys[f.key] ? 'eye-off-outline' : 'eye-outline'}
                                size={18}
                                color={colors.textMuted}
                              />
                            </Pressable>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Live Connection Test Result */}
              {pingResult && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: pingResult.ok ? 'rgba(95, 227, 136, 0.1)' : 'rgba(255, 107, 107, 0.1)',
                    borderColor: pingResult.ok ? 'rgba(95, 227, 136, 0.3)' : 'rgba(255, 107, 107, 0.3)',
                    borderWidth: 1,
                    borderRadius: 6,
                    padding: 10,
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Ionicons
                      name={pingResult.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                      size={18}
                      color={pingResult.ok ? '#5fe388' : '#ff6b6b'}
                    />
                    <Text style={{ fontSize: 11, color: colors.textStrong, flex: 1 }}>{pingResult.message}</Text>
                  </View>
                  {pingResult.latencyMs > 0 && (
                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textMuted }}>
                      {pingResult.latencyMs} ms
                    </Text>
                  )}
                </View>
              )}

              {/* Action Buttons */}
              <View style={{ gap: 8, marginTop: 4 }}>
                {activeProviderItem.fields && activeProviderItem.fields.length > 0 && (
                  <Pressable
                    style={[
                      styles.primaryButton,
                      { backgroundColor: colors.accent, marginTop: 0, paddingVertical: 11 },
                      savingProvider && { opacity: 0.7 },
                    ]}
                    onPress={handleSaveProvider}
                    disabled={savingProvider}
                  >
                    {savingProvider ? (
                      <ActivityIndicator size="small" color={colors.accentContrast} />
                    ) : (
                      <Text style={[styles.primaryButtonText, { color: colors.accentContrast }]}>Save Credentials</Text>
                    )}
                  </Pressable>
                )}

                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Pressable
                    style={[
                      styles.secondaryButton,
                      {
                        flex: 1,
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        borderWidth: 1,
                        borderColor: colors.border,
                        paddingVertical: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      },
                      pingLoading && { opacity: 0.7 },
                    ]}
                    onPress={handleTestProviderConnection}
                    disabled={pingLoading}
                  >
                    {pingLoading ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <>
                        <Ionicons name="pulse-outline" size={16} color={colors.accent} />
                        <Text style={[styles.secondaryButtonText, { color: colors.textStrong }]}>Test Connection</Text>
                      </>
                    )}
                  </Pressable>

                  {activeProviderItem.fields && activeProviderItem.fields.length > 0 && (
                    <Pressable
                      style={[styles.disableButton, { paddingVertical: 10, paddingHorizontal: 16 }, !activeProviderItem.hasSavedPersonalCredentials && { opacity: 0.45 }]}
                      onPress={handleRemoveProviderCredentials}
                      disabled={savingProvider || !activeProviderItem.hasSavedPersonalCredentials}
                    >
                      <Text style={styles.disableButtonText}>Remove Credentials</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Mandatory Attribution & Documentation */}
              <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <Text style={{ fontSize: 10, color: colors.textSubtle, flex: 1 }}>{activeProviderItem.attribution}</Text>
                {activeProviderItem.docUrl && (
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                    onPress={() => Linking.openURL(activeProviderItem.docUrl)}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.accent }}>Docs</Text>
                    <Ionicons name="open-outline" size={11} color={colors.accent} />
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        )}

        {/* ────────────────────────────────────────────── */}
        {/* TAB 5: DATA & BACKUPS                          */}
        {/* ────────────────────────────────────────────── */}
        {activeTab === 'data' && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>SETTINGS</Text>
              <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>Data</Text>
              <Text style={[styles.sectionDesc, { color: colors.textMuted }]}>TV Time import, D1 database backups, and archives.</Text>
            </View>

            {/* TV Time Import Link */}
            <Pressable style={[styles.importLinkRow, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/settings/import' as any)}>
              <View style={[styles.toolIconWrap, { backgroundColor: colors.isDark ? 'rgba(255, 207, 92, 0.1)' : 'rgba(240, 168, 36, 0.18)' }]}>
                <Ionicons name="cloud-upload-outline" size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoRowTitle, { color: colors.textStrong }]}>TV Time Import</Text>
                <Text style={[styles.infoRowDesc, { color: colors.textMuted }]}>Import tracking archive ZIP or individual CSV files.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </Pressable>

            {/* Create Backup */}
            <View style={[styles.backupHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoRowTitle, { color: colors.textStrong }]}>Create Backup</Text>
                <Text style={[styles.infoRowDesc, { color: colors.textMuted }]}>Packages tracking records into a D1 backup entry.</Text>
              </View>
              <Pressable
                style={[styles.primaryButtonSmall, { backgroundColor: colors.accent }, creatingBackup && { opacity: 0.7 }]}
                onPress={handleCreateBackup}
                disabled={creatingBackup}
              >
                {creatingBackup ? (
                  <ActivityIndicator size="small" color={colors.accentContrast} />
                ) : (
                  <Text style={[styles.primaryButtonText, { color: colors.accentContrast }]}>Create</Text>
                )}
              </Pressable>
            </View>

            {/* Backup List */}
            <Text style={[styles.subHeading, { color: colors.textStrong, marginTop: 16 }]}>Backups</Text>
            {backups.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="refresh-outline" size={22} color={colors.textSubtle} />
                <Text style={[styles.emptyCardText, { color: colors.textSubtle }]}>No backups created yet.</Text>
              </View>
            ) : (
              <View style={styles.backupList}>
                {backups.map((bak) => (
                  <View key={bak.id} style={[styles.backupItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.backupLabel, { color: colors.textStrong }]}>{bak.label || 'Backup'}</Text>
                      <Text style={[styles.backupMeta, { color: colors.textMuted }]}>
                        {new Date(bak.createdAt).toLocaleDateString()} • {formatBytes(bak.byteSize)}
                      </Text>
                    </View>
                    <Pressable style={styles.exportButton} onPress={() => handleExportBackup(bak.id)}>
                      <Ionicons name="download-outline" size={14} color={colors.accent} />
                      <Text style={[styles.exportButtonText, { color: colors.accent }]}>Export</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ────────────────────────────────────────────── */}
        {/* TAB 6: STORAGE STATS                           */}
        {/* ────────────────────────────────────────────── */}
        {activeTab === 'storage' && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>SETTINGS</Text>
              <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>Storage</Text>
              <Text style={[styles.sectionDesc, { color: colors.textMuted }]}>Live database catalog, library records, and backup usage.</Text>
            </View>

            {loadingStorage ? (
              <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 24 }} />
            ) : (
              <>
                <View style={styles.storageGrid}>
                  <View style={[styles.storageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="library-outline" size={20} color={colors.accent} />
                    <Text style={[styles.storageLabel, { color: colors.textMuted }]}>Tracked Items</Text>
                    <Text style={[styles.storageValue, { color: colors.textStrong }]}>{storageStats?.libraryItems ?? 0}</Text>
                    <Text style={[styles.storageDetail, { color: colors.textSubtle }]}>User library rows</Text>
                  </View>

                  <View style={[styles.storageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="cloud-upload-outline" size={20} color={colors.accent} />
                    <Text style={[styles.storageLabel, { color: colors.textMuted }]}>Profile Media</Text>
                    <Text style={[styles.storageValue, { color: colors.textStrong }]}>{formatBytes(storageStats?.userUploadBytes ?? 0)}</Text>
                    <Text style={[styles.storageDetail, { color: colors.textSubtle }]}>{storageStats?.userUploads ?? 0} uploads</Text>
                  </View>

                  <View style={[styles.storageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="refresh-outline" size={20} color={colors.accent} />
                    <Text style={[styles.storageLabel, { color: colors.textMuted }]}>Backups</Text>
                    <Text style={[styles.storageValue, { color: colors.textStrong }]}>{formatBytes(storageStats?.backupBytes ?? 0)}</Text>
                    <Text style={[styles.storageDetail, { color: colors.textSubtle }]}>{storageStats?.backups ?? 0} archives</Text>
                  </View>

                  <View style={[styles.storageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="earth-outline" size={20} color={colors.accent} />
                    <Text style={[styles.storageLabel, { color: colors.textMuted }]}>Global Catalog</Text>
                    <Text style={[styles.storageValue, { color: colors.textStrong }]}>{storageStats?.globalMediaItems ?? 0}</Text>
                    <Text style={[styles.storageDetail, { color: colors.textSubtle }]}>Shared catalog items</Text>
                  </View>
                </View>

                <View style={[styles.infoRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="server-outline" size={18} color={colors.textSubtle} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.infoRowTitle, { color: colors.textStrong }]}>D1 SQLite Database</Text>
                    <Text style={[styles.infoRowDesc, { color: colors.textMuted }]}>Local embedded database in active memory</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        )}

        {/* ────────────────────────────────────────────── */}
        {/* TAB 7: SERVER CONNECTION (Custom Retained)     */}
        {/* ────────────────────────────────────────────── */}
        {activeTab === 'connection' && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>SETTINGS</Text>
              <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>Server Connection</Text>
              <Text style={[styles.sectionDesc, { color: colors.textMuted }]}>Configure local network IP or remote Cloudflare Workers URL.</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textStrong }]}>Backend API Base URL</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                value={serverUrl}
                onChangeText={setServerUrl}
                placeholder="http://192.168.1.x:8787"
                placeholderTextColor={colors.textSubtle}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.buttonRow}>
              <Pressable
                style={[styles.primaryButton, { flex: 1, backgroundColor: colors.accent }]}
                onPress={handleTestConnection}
                disabled={isPinging}
              >
                {isPinging ? (
                  <ActivityIndicator size="small" color={colors.accentContrast} />
                ) : (
                  <Text style={[styles.primaryButtonText, { color: colors.accentContrast }]}>Ping Server</Text>
                )}
              </Pressable>

              <Pressable
                style={[styles.secondaryButton, { backgroundColor: colors.surface }]}
                onPress={() => setServerUrl(getDefaultApiBase())}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>Reset Default</Text>
              </Pressable>
            </View>

            {pingStatus && (
              <View style={[styles.pingStatusCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.pingStatusText, { color: colors.accent }]}>{pingStatus}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ────────────────────────────────────────────── */}
      {/* 1. Delete Account Confirmation BottomSheet     */}
      {/* ────────────────────────────────────────────── */}
      <BottomSheet
        visible={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Account"
        subtitle="Permanently delete account and all library data"
        icon="trash-bin-outline"
        iconColor="#ff6b6b"
      >
        <Text style={[styles.deleteSheetDesc, { color: colors.textMuted }]}>
          This action is permanent and cannot be undone. All your tracked shows, movies, anime, and notes will be deleted.
        </Text>
        <Text style={[styles.deleteSheetSub, { color: colors.textMuted }]}>
          Type <Text style={{ fontWeight: '900', color: colors.accent }}>{meData?.user?.username}</Text> to confirm:
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
          value={deleteConfirmText}
          onChangeText={setDeleteConfirmText}
          placeholder={meData?.user?.username}
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
        />
        <View style={styles.sheetBtnRow}>
          <Pressable
            style={[styles.sheetSecondaryBtn, { borderColor: colors.border }]}
            onPress={() => setShowDeleteModal(false)}
            disabled={isDeletingAccount}
          >
            <Text style={[styles.sheetSecondaryText, { color: colors.textMuted }]}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[
              styles.sheetDangerBtn,
              deleteConfirmText !== meData?.user?.username && { opacity: 0.5 },
            ]}
            onPress={handleDeleteAccount}
            disabled={deleteConfirmText !== meData?.user?.username || isDeletingAccount}
          >
            {isDeletingAccount ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sheetDangerText}>Delete Permanently</Text>
            )}
          </Pressable>
        </View>
      </BottomSheet>

      {/* ────────────────────────────────────────────── */}
      {/* 2. Media Action BottomSheet (Replace / Remove) */}
      {/* ────────────────────────────────────────────── */}
      <BottomSheet
        visible={showMediaActionSheet}
        onClose={() => setShowMediaActionSheet(false)}
        title={activePickerKind === 'avatar' ? 'Profile Avatar' : 'Profile Banner'}
        subtitle={`Manage your profile ${activePickerKind}`}
        icon={activePickerKind === 'avatar' ? 'person-circle-outline' : 'image-outline'}
      >
        <Pressable
          style={[styles.sheetActionItem, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)', borderColor: colors.border }]}
          onPress={handleReplaceMedia}
        >
          <View style={[styles.sheetIconBox, { backgroundColor: isDark ? 'rgba(255, 207, 92, 0.12)' : 'rgba(240, 168, 36, 0.18)' }]}>
            <Ionicons name="images-outline" size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sheetActionTitle, { color: colors.textStrong }]}>Replace image</Text>
            <Text style={[styles.sheetActionSubtitle, { color: colors.textMuted }]}>Choose a new photo from gallery</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
        </Pressable>

        <Pressable
          style={[styles.sheetActionItem, { backgroundColor: isDark ? 'rgba(255, 92, 92, 0.08)' : 'rgba(255, 92, 92, 0.06)', borderColor: 'rgba(255, 92, 92, 0.25)' }]}
          onPress={handleRemoveMedia}
        >
          <View style={[styles.sheetIconBox, { backgroundColor: 'rgba(255, 92, 92, 0.15)' }]}>
            <Ionicons name="trash-outline" size={20} color="#ff5c5c" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sheetActionTitle, { color: '#ff5c5c' }]}>Remove image</Text>
            <Text style={[styles.sheetActionSubtitle, { color: colors.textMuted }]}>Delete current {activePickerKind}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#ff5c5c" />
        </Pressable>

        <Pressable
          style={[styles.sheetCancelBtn, { borderColor: colors.border }]}
          onPress={() => setShowMediaActionSheet(false)}
        >
          <Text style={[styles.sheetCancelText, { color: colors.textMuted }]}>Cancel</Text>
        </Pressable>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  subpageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  subpageHeaderTitle: {
    fontSize: 20,
    fontWeight: '900',
  },
  tabsScroll: {
    height: 56,
    borderBottomWidth: 1,
    flexGrow: 0,
    flexShrink: 0,
  },
  tabsContainer: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    height: 38,
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    gap: 6,
    flexShrink: 0,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '800',
    includeFontPadding: false,
    lineHeight: 18,
    flexShrink: 0,
  },
  floatingBanner: {
    position: 'absolute',
    top: 110,
    left: 16,
    right: 16,
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 100,
  },
  floatingBannerText: {
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    padding: 14,
    paddingBottom: 40,
  },
  sectionCard: {
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  sectionDesc: {
    fontSize: 12,
    marginTop: 4,
  },
  subHeading: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  mediaButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  mediaActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    gap: 6,
  },
  mediaActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  formGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  disabledInput: {
    opacity: 0.6,
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  pillGroup: {
    flexDirection: 'row',
    borderRadius: 6,
    borderWidth: 1,
    padding: 3,
    gap: 4,
  },
  pillOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 4,
  },
  pillOptionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryButtonSmall: {
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryButton: {
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  dangerZone: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 107, 107, 0.2)',
    gap: 10,
  },
  dangerZoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dangerZoneTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ff6b6b',
  },
  dangerZoneDesc: {
    fontSize: 11,
  },
  deleteAccountButton: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.35)',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  deleteAccountButtonText: {
    color: '#ff8080',
    fontSize: 12,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    marginTop: 10,
    gap: 10,
  },
  infoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRowTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  infoRowDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  navChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  navChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
  },
  navChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  reorderList: {
    gap: 6,
  },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    gap: 10,
  },
  reorderIndex: {
    fontSize: 11,
    fontWeight: '800',
    width: 16,
  },
  reorderLabel: {
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
  },
  reorderActions: {
    flexDirection: 'row',
    gap: 6,
  },
  arrowButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerScroll: {
    marginBottom: 14,
  },
  providerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    gap: 6,
  },
  providerPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  providerCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  providerCategoryPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  providerServicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginRight: 8,
    gap: 6,
  },
  providerServicePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotGreen: {
    backgroundColor: '#5fe388',
  },
  statusDotGray: {
    backgroundColor: '#6c706d',
  },
  providerForm: {
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
  },
  providerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  providerTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeGreen: {
    backgroundColor: 'rgba(95, 227, 136, 0.15)',
  },
  badgeGray: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  badgeTextGreen: {
    color: '#5fe388',
  },
  badgeTextGray: {
    color: '#8c908d',
  },
  disableButton: {
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disableButtonText: {
    color: '#ff8080',
    fontSize: 12,
    fontWeight: '800',
  },
  importLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    marginBottom: 14,
    gap: 10,
  },
  toolIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    gap: 10,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 20,
    gap: 6,
  },
  emptyCardText: {
    fontSize: 12,
  },
  backupList: {
    gap: 8,
  },
  backupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    gap: 10,
  },
  backupLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  backupMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.25)',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  exportButtonText: {
    fontSize: 11,
    fontWeight: '800',
  },
  storageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  storageCard: {
    width: '48.5%',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  storageLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  storageValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  storageDetail: {
    fontSize: 10,
  },
  pingStatusCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 6,
  },
  pingStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 8,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalMessage: {
    fontSize: 13,
    lineHeight: 18,
  },
  modalSubMessage: {
    fontSize: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  modalCancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalConfirmButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#ff6b6b',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  deleteSheetDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  deleteSheetSub: {
    fontSize: 12,
    marginTop: 4,
  },
  sheetBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  sheetSecondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 6,
    borderWidth: 1,
  },
  sheetSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sheetPrimaryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 6,
  },
  sheetPrimaryText: {
    fontSize: 13,
    fontWeight: '800',
  },
  sheetDangerBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 6,
    backgroundColor: '#ff6b6b',
  },
  sheetDangerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  sheetActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  sheetIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  sheetActionSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  sheetCancelBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
  },
  sheetCancelText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
