import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { config, getDefaultApiBase } from '../../constants/config';
import { api } from '../../services/api';

type SettingsTab = 'account' | 'appearance' | 'navigation' | 'providers' | 'data' | 'connection';

export default function SettingsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');

  // Account State
  const [displayName, setDisplayName] = useState('Tuvu User');
  const [username, setUsername] = useState('tuvu_local');
  const [bio, setBio] = useState('Personal media tracking');
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Appearance State
  const [selectedTheme, setSelectedTheme] = useState<'dark' | 'light' | 'system'>('dark');

  // Backend Connection State
  const [serverUrl, setServerUrl] = useState(config.getApiBase());
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  const handleSaveAccount = () => {
    setSavedMessage('Account preferences saved locally.');
    setTimeout(() => setSavedMessage(null), 2500);
  };

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
        setPingStatus(`⚠️ Server responded: ${JSON.stringify(res)}`);
      }
    } catch (e: any) {
      setPingStatus(`❌ Connection failed: ${e.message}`);
    } finally {
      setIsPinging(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Settings Navigation Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContainer}
      >
        <Pressable
          style={[styles.tabButton, activeTab === 'account' && styles.tabButtonActive]}
          onPress={() => setActiveTab('account')}
        >
          <Ionicons
            name="person-outline"
            size={16}
            color={activeTab === 'account' ? theme.colors.accentContrast : theme.colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'account' && styles.tabTextActive]}>
            Account
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tabButton, activeTab === 'appearance' && styles.tabButtonActive]}
          onPress={() => setActiveTab('appearance')}
        >
          <Ionicons
            name="moon-outline"
            size={16}
            color={activeTab === 'appearance' ? theme.colors.accentContrast : theme.colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'appearance' && styles.tabTextActive]}>
            Appearance
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tabButton, activeTab === 'data' && styles.tabButtonActive]}
          onPress={() => setActiveTab('data')}
        >
          <Ionicons
            name="cloud-upload-outline"
            size={16}
            color={activeTab === 'data' ? theme.colors.accentContrast : theme.colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'data' && styles.tabTextActive]}>
            Data & Import
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tabButton, activeTab === 'connection' && styles.tabButtonActive]}
          onPress={() => setActiveTab('connection')}
        >
          <Ionicons
            name="wifi-outline"
            size={16}
            color={activeTab === 'connection' ? theme.colors.accentContrast : theme.colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'connection' && styles.tabTextActive]}>
            Server
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tabButton, activeTab === 'providers' && styles.tabButtonActive]}
          onPress={() => setActiveTab('providers')}
        >
          <Ionicons
            name="cube-outline"
            size={16}
            color={activeTab === 'providers' ? theme.colors.accentContrast : theme.colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'providers' && styles.tabTextActive]}>
            Providers
          </Text>
        </Pressable>
      </ScrollView>

      {/* Main Tab Panels */}
      <ScrollView style={styles.panelContainer} contentContainerStyle={styles.panelContent}>
        {/* Account Panel */}
        {activeTab === 'account' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Account Identity</Text>
            <Text style={styles.cardDesc}>Profile name, username, and bio for your local session.</Text>

            <Text style={styles.inputLabel}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
            />

            <Text style={styles.inputLabel}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Bio</Text>
            <TextInput
              style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
              value={bio}
              onChangeText={setBio}
              multiline
            />

            {savedMessage && <Text style={styles.savedMessage}>{savedMessage}</Text>}

            <Pressable style={styles.primaryButton} onPress={handleSaveAccount}>
              <Text style={styles.primaryButtonText}>Save Account Settings</Text>
            </Pressable>
          </View>
        )}

        {/* Appearance Panel */}
        {activeTab === 'appearance' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Appearance & Theme</Text>
            <Text style={styles.cardDesc}>Choose your visual presentation.</Text>

            <View style={styles.themeOptions}>
              {(['dark', 'light', 'system'] as const).map((t) => (
                <Pressable
                  key={t}
                  style={[styles.themePill, selectedTheme === t && styles.themePillActive]}
                  onPress={() => setSelectedTheme(t)}
                >
                  <Text style={[styles.themePillText, selectedTheme === t && styles.themePillTextActive]}>
                    {t.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingTitle}>Accent Color</Text>
              <View style={styles.accentBadge}>
                <View style={[styles.accentDot, { backgroundColor: theme.colors.accent }]} />
                <Text style={styles.accentText}>Obsidian Gold (#ffcf5c)</Text>
              </View>
            </View>
          </View>
        )}

        {/* Data & Import Panel */}
        {activeTab === 'data' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Data & Import</Text>
            <Text style={styles.cardDesc}>Import history from TV Time or create local backups.</Text>

            <Pressable
              style={styles.toolButton}
              onPress={() => router.push('/settings/import' as any)}
            >
              <View style={styles.toolIconWrap}>
                <Ionicons name="cloud-upload" size={20} color={theme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toolTitle}>Import TV Time Data</Text>
                <Text style={styles.toolSubtitle}>Upload your TV Time export ZIP or CSV files</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSubtle} />
            </Pressable>

            <View style={[styles.toolButton, { marginTop: 10 }]}>
              <View style={styles.toolIconWrap}>
                <Ionicons name="download" size={20} color={theme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toolTitle}>Database Backup</Text>
                <Text style={styles.toolSubtitle}>Managed automatically via D1 / Cloudflare</Text>
              </View>
            </View>
          </View>
        )}

        {/* Server Connection Panel */}
        {activeTab === 'connection' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Backend Server Connection</Text>
            <Text style={styles.cardDesc}>
              Connect the mobile client to your local worker server.
            </Text>

            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.presetRow}>
              <Pressable
                style={styles.presetPill}
                onPress={() => {
                  const auto = getDefaultApiBase();
                  setServerUrl(auto);
                  config.setApiBase(auto);
                }}
              >
                <Text style={styles.presetText}>Auto LAN</Text>
              </Pressable>
              <Pressable
                style={styles.presetPill}
                onPress={() => {
                  setServerUrl('http://10.0.2.2:8787');
                  config.setApiBase('http://10.0.2.2:8787');
                }}
              >
                <Text style={styles.presetText}>Emulator</Text>
              </Pressable>
              <Pressable
                style={styles.presetPill}
                onPress={() => {
                  setServerUrl('http://127.0.0.1:8787');
                  config.setApiBase('http://127.0.0.1:8787');
                }}
              >
                <Text style={styles.presetText}>127.0.0.1</Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.primaryButton, isPinging && { opacity: 0.7 }]}
              onPress={handleTestConnection}
              disabled={isPinging}
            >
              {isPinging ? (
                <ActivityIndicator size="small" color={theme.colors.accentContrast} />
              ) : (
                <Text style={styles.primaryButtonText}>Test Server Connection</Text>
              )}
            </Pressable>

            {pingStatus && (
              <View style={[styles.statusBanner, pingStatus.startsWith('✓') ? styles.statusOk : styles.statusErr]}>
                <Text style={styles.statusBannerText}>{pingStatus}</Text>
              </View>
            )}
          </View>
        )}

        {/* Providers Panel */}
        {activeTab === 'providers' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Metadata Providers</Text>
            <Text style={styles.cardDesc}>Configured providers for posters, metadata, and episodes.</Text>

            <View style={styles.providerRow}>
              <Text style={styles.providerName}>TMDB (The Movie Database)</Text>
              <View style={styles.providerBadgeOk}><Text style={styles.providerBadgeText}>Active</Text></View>
            </View>
            <View style={styles.providerRow}>
              <Text style={styles.providerName}>OpenLibrary (Books)</Text>
              <View style={styles.providerBadgeOk}><Text style={styles.providerBadgeText}>Active</Text></View>
            </View>
            <View style={styles.providerRow}>
              <Text style={styles.providerName}>RAWG (Video Games)</Text>
              <View style={styles.providerBadgeOk}><Text style={styles.providerBadgeText}>Active</Text></View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  tabsScroll: {
    maxHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  tabsContainer: {
    paddingHorizontal: theme.spacing.md,
    gap: 8,
    alignItems: 'center',
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: theme.colors.accent,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  tabTextActive: {
    color: theme.colors.accentContrast,
  },
  panelContainer: {
    flex: 1,
  },
  panelContent: {
    padding: theme.spacing.md,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.textStrong,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: 16,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textSubtle,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#101112',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.text,
    fontSize: 14,
    height: 42,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.sm,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryButtonText: {
    color: theme.colors.accentContrast,
    fontSize: 14,
    fontWeight: '800',
  },
  savedMessage: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  themeOptions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  themePill: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  themePillActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  themePillText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  themePillTextActive: {
    color: theme.colors.accentContrast,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  settingTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  accentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  accentText: {
    color: theme.colors.textStrong,
    fontSize: 12,
    fontWeight: '700',
  },
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 12,
  },
  toolIconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: 'rgba(255, 207, 92, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTitle: {
    color: theme.colors.textStrong,
    fontSize: 14,
    fontWeight: '700',
  },
  toolSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  presetPill: {
    flex: 1,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
  },
  presetText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  statusBanner: {
    marginTop: 10,
    padding: 10,
    borderRadius: theme.borderRadius.sm,
  },
  statusOk: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
  },
  statusErr: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderColor: 'rgba(255, 107, 107, 0.3)',
    borderWidth: 1,
  },
  statusBannerText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  providerName: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  providerBadgeOk: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.pill,
  },
  providerBadgeText: {
    color: '#6ee7b7',
    fontSize: 11,
    fontWeight: '700',
  },
});
