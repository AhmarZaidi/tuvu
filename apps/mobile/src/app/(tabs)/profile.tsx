import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { config, getDefaultApiBase } from '../../constants/config';
import { theme } from '../../constants/theme';

export default function ProfileScreen() {
  const [serverUrl, setServerUrl] = useState(config.getApiBase());
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  const { data: statsData, isLoading: isStatsLoading } = useQuery({
    queryKey: ['profileStats'],
    queryFn: () => api.getProfileStats(),
  });

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

  const setPreset = (url: string) => {
    setServerUrl(url);
    config.setApiBase(url);
  };

  const autoDetected = getDefaultApiBase();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User Header Card */}
      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={32} color={theme.colors.accent} />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>Tuvu User</Text>
          <Text style={styles.userRole}>Owner / Local Admin</Text>
        </View>
      </View>

      {/* Stats Section matching web .stats-grid */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Library Overview</Text>
        {isStatsLoading ? (
          <ActivityIndicator size="small" color={theme.colors.accent} style={{ marginVertical: 16 }} />
        ) : (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{statsData?.stats?.showsCount ?? '-'}</Text>
              <Text style={styles.statLabel}>Shows</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{statsData?.stats?.moviesCount ?? '-'}</Text>
              <Text style={styles.statLabel}>Movies</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{statsData?.stats?.animeCount ?? '-'}</Text>
              <Text style={styles.statLabel}>Anime</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{statsData?.stats?.episodesWatched ?? '-'}</Text>
              <Text style={styles.statLabel}>Episodes</Text>
            </View>
          </View>
        )}
      </View>

      {/* Backend Server Configuration */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Backend Server Connection</Text>
        <Text style={styles.sectionDesc}>
          Tuvu connects to your local worker server. The address below was auto-detected from your network.
        </Text>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://192.168.1.X:8787"
            placeholderTextColor={theme.colors.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Quick Presets */}
        <View style={styles.presetRow}>
          <Pressable
            style={styles.presetButton}
            onPress={() => setPreset(autoDetected)}
          >
            <Text style={styles.presetText}>Auto-detected</Text>
          </Pressable>
          <Pressable
            style={styles.presetButton}
            onPress={() => setPreset('http://10.0.2.2:8787')}
          >
            <Text style={styles.presetText}>Emulator (10.0.2.2)</Text>
          </Pressable>
          <Pressable
            style={styles.presetButton}
            onPress={() => setPreset('http://127.0.0.1:8787')}
          >
            <Text style={styles.presetText}>USB / 127.0.0.1</Text>
          </Pressable>
        </View>

        {/* Test Connection Button */}
        <Pressable
          style={[styles.testButton, isPinging && { opacity: 0.7 }]}
          onPress={handleTestConnection}
          disabled={isPinging}
        >
          {isPinging ? (
            <ActivityIndicator size="small" color={theme.colors.accentContrast} />
          ) : (
            <Text style={styles.testButtonText}>Test Connection</Text>
          )}
        </Pressable>

        {/* Ping Result */}
        {pingStatus && (
          <View style={[
            styles.statusBanner,
            pingStatus.startsWith('✓') ? styles.statusSuccess : styles.statusError,
          ]}>
            <Text style={styles.statusText}>{pingStatus}</Text>
          </View>
        )}
      </View>

      {/* App Info */}
      <View style={styles.infoFooter}>
        <Text style={styles.infoText}>Tuvu Mobile v1.0.0 (Expo SDK 57 / React Native 0.86)</Text>
        <Text style={styles.infoSubtext}>Designed with Tuvu Signature Obsidian & Gold Theme</Text>
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
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: 'rgba(255, 207, 92, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.textStrong,
  },
  userRole: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.textStrong,
    marginBottom: 6,
  },
  sectionDesc: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.md,
    lineHeight: 18,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff4d3',
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.textSubtle,
    marginTop: 2,
    fontWeight: '600',
  },
  inputContainer: {
    backgroundColor: '#101112',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    marginBottom: theme.spacing.sm,
  },
  input: {
    color: theme.colors.text,
    fontSize: 14,
    height: 42,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: theme.spacing.md,
  },
  presetButton: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  presetText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: '700',
  },
  testButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.sm,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testButtonText: {
    color: theme.colors.accentContrast,
    fontSize: 14,
    fontWeight: '800',
  },
  statusBanner: {
    marginTop: theme.spacing.sm,
    padding: 10,
    borderRadius: theme.borderRadius.sm,
  },
  statusSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
  },
  statusError: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderColor: 'rgba(255, 107, 107, 0.3)',
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    color: theme.colors.text,
    fontWeight: '600',
  },
  infoFooter: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
  },
  infoText: {
    fontSize: 12,
    color: theme.colors.textSubtle,
  },
  infoSubtext: {
    fontSize: 11,
    color: theme.colors.textSubtle,
    marginTop: 3,
  },
});
