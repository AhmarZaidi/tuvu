import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../../context/ThemeContext';
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

const PROVIDER_FIELDS: Record<string, { label: string; fields: Array<{ key: string; label: string; placeholder: string; secure?: boolean }> }> = {
  tmdb: {
    label: 'TMDB',
    fields: [{ key: 'TMDB_API_KEY', label: 'API Key', placeholder: 'TMDB v3 API key', secure: true }],
  },
  rawg: {
    label: 'RAWG',
    fields: [{ key: 'RAWG_API_KEY', label: 'API Key', placeholder: 'RAWG Video Games API key', secure: true }],
  },
  igdb: {
    label: 'IGDB / Twitch',
    fields: [
      { key: 'TWITCH_IGDB_CLIENT_ID', label: 'Client ID', placeholder: 'Twitch Client ID' },
      { key: 'TWITCH_IGDB_CLIENT_SECRET', label: 'Client Secret', placeholder: 'Twitch Client Secret', secure: true },
    ],
  },
  openlibrary: {
    label: 'Open Library',
    fields: [{ key: 'OPEN_LIBRARY_CONTACT_EMAIL', label: 'Contact Email', placeholder: 'your@email.com' }],
  },
  jikan: {
    label: 'Jikan (MyAnimeList)',
    fields: [{ key: 'MAL_JIKAN_API_ENDPOINT', label: 'API Endpoint', placeholder: 'https://api.jikan.moe/v4/' }],
  },
  youtube: {
    label: 'YouTube',
    fields: [{ key: 'YOUTUBE_API_KEY', label: 'API Key', placeholder: 'Optional YouTube API key', secure: true }],
  },
  newsapi: {
    label: 'NewsAPI',
    fields: [{ key: 'NEWSAPI_KEY', label: 'API Key', placeholder: 'NewsAPI Key', secure: true }],
  },
};

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
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
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

  // Delete Account Modal State
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
      Alert.alert('Error', e?.message || 'Could not save profile.');
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
      Alert.alert('Always Present', 'Explore is always included in the bottom navigation bar.');
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
      Alert.alert('Error', e?.message || 'Could not save navigation.');
    } finally {
      setSavingNav(false);
    }
  };

  // ──────────────────────────────────────────────
  // 4. Providers Settings State
  // ──────────────────────────────────────────────
  const [providerStatuses, setProviderStatuses] = useState<ProviderCredentialStatus[]>([]);
  const [activeProviderKey, setActiveProviderKey] = useState<string>('tmdb');
  const [providerSecrets, setProviderSecrets] = useState<Record<string, string>>({});
  const [savingProvider, setSavingProvider] = useState(false);

  const loadProviders = useCallback(async () => {
    try {
      const res = await api.getProviderSettings();
      setProviderStatuses(res.providers || []);
    } catch {}
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const activeProviderStatus = providerStatuses.find((p) => p.provider === activeProviderKey && p.status === 'active');
  const activeProviderConfig = PROVIDER_FIELDS[activeProviderKey] || PROVIDER_FIELDS['tmdb'];

  const handleSaveProvider = async () => {
    setSavingProvider(true);
    try {
      await api.updateProviderSettings(activeProviderKey, providerSecrets);
      setProviderSecrets({});
      await loadProviders();
      showFeedback(`${activeProviderConfig.label} saved successfully.`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save provider credentials.');
    } finally {
      setSavingProvider(false);
    }
  };

  const handleDisableProvider = async () => {
    setSavingProvider(true);
    try {
      await api.disableProvider(activeProviderKey);
      await loadProviders();
      showFeedback(`${activeProviderConfig.label} disabled.`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to disable provider.');
    } finally {
      setSavingProvider(false);
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
      Alert.alert('Error', e?.message || 'Failed to create backup.');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleExportBackup = async (id: string) => {
    try {
      const res = await api.exportBackup(id);
      Alert.alert(
        'Backup Exported',
        `Backup ID: ${res.backup.id}\nSize: ${formatBytes(res.backup.byteSize)}\nPayload ready for offline archive.`
      );
    } catch (e: any) {
      Alert.alert('Export Error', e?.message || 'Could not export backup.');
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

      {/* Floating Status Notification */}
      {statusMessage && (
        <View style={[styles.floatingBanner, { backgroundColor: colors.isDark ? '#1d1911' : '#fff7e0', borderColor: colors.accent }]}>
          <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
          <Text style={[styles.floatingBannerText, { color: colors.textStrong }]}>{statusMessage}</Text>
        </View>
      )}

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
              <Text style={[styles.sectionTitle, { color: colors.textStrong }]}>Providers</Text>
              <Text style={[styles.sectionDesc, { color: colors.textMuted }]}>Connect custom API keys for search and catalog hydration.</Text>
            </View>

            {/* Provider Selector Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.providerScroll}>
              {Object.keys(PROVIDER_FIELDS).map((key) => {
                const conf = PROVIDER_FIELDS[key];
                const isSelected = activeProviderKey === key;
                const isConn = Boolean(providerStatuses.find((p) => p.provider === key && p.status === 'active'));
                return (
                  <Pressable
                    key={key}
                    style={[
                      styles.providerPill,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      isSelected && { backgroundColor: colors.isDark ? 'rgba(255, 207, 92, 0.12)' : 'rgba(240, 168, 36, 0.2)', borderColor: colors.accent },
                    ]}
                    onPress={() => setActiveProviderKey(key)}
                  >
                    <Text style={[styles.providerPillText, { color: colors.textMuted }, isSelected && { color: colors.textStrong, fontWeight: '800' }]}>
                      {conf.label}
                    </Text>
                    <View style={[styles.statusDot, isConn ? styles.statusDotGreen : styles.statusDotGray]} />
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Provider Form */}
            <View style={[styles.providerForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.providerHeader}>
                <Text style={[styles.providerTitle, { color: colors.textStrong }]}>{activeProviderConfig.label}</Text>
                <View style={[styles.badge, activeProviderStatus ? styles.badgeGreen : styles.badgeGray]}>
                  <Text style={[styles.badgeText, activeProviderStatus ? styles.badgeTextGreen : styles.badgeTextGray]}>
                    {activeProviderStatus ? 'Connected' : 'Fallback / not set'}
                  </Text>
                </View>
              </View>

              {activeProviderConfig.fields.map((f) => (
                <View key={f.key} style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.textStrong }]}>{f.label}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                    value={providerSecrets[f.key] || ''}
                    onChangeText={(val) => setProviderSecrets((prev) => ({ ...prev, [f.key]: val }))}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.textSubtle}
                    secureTextEntry={f.secure}
                    autoCapitalize="none"
                  />
                </View>
              ))}

              <View style={styles.buttonRow}>
                <Pressable
                  style={[styles.primaryButton, { flex: 1, backgroundColor: colors.accent }, savingProvider && { opacity: 0.7 }]}
                  onPress={handleSaveProvider}
                  disabled={savingProvider}
                >
                  {savingProvider ? (
                    <ActivityIndicator size="small" color={colors.accentContrast} />
                  ) : (
                    <Text style={[styles.primaryButtonText, { color: colors.accentContrast }]}>Save Provider</Text>
                  )}
                </Pressable>

                {activeProviderStatus && (
                  <Pressable
                    style={styles.disableButton}
                    onPress={handleDisableProvider}
                    disabled={savingProvider}
                  >
                    <Text style={styles.disableButtonText}>Disable</Text>
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
