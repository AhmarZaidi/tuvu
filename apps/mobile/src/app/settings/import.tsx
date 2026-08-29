import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { useSubpageBack } from '../../hooks/useSubpageBack';

export default function ImportScreen() {
  const router = useRouter();
  useSubpageBack('/(tabs)/settings');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="cloud-upload" size={32} color={theme.colors.accent} />
        </View>

        <Text style={styles.title}>TV Time Import</Text>
        <Text style={styles.subtitle}>
          Migrate your entire TV Time watch history, shows, ratings, and movies directly into Tuvu.
        </Text>

        <View style={styles.stepBox}>
          <Text style={styles.stepTitle}>How to export from TV Time:</Text>
          <Text style={styles.stepText}>1. Open the TV Time mobile app or website.</Text>
          <Text style={styles.stepText}>2. Go to Settings → Account → Request Data Export.</Text>
          <Text style={styles.stepText}>3. When you receive the email, download the ZIP archive.</Text>
          <Text style={styles.stepText}>4. You can also drag-and-drop the ZIP into the Tuvu web app on your laptop.</Text>
        </View>

        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={18} color={theme.colors.accent} />
          <Text style={styles.infoText}>
            Your local Tuvu database already contains your imported library (1,694 tracked items).
          </Text>
        </View>

        <Pressable
          style={styles.primaryButton}
          onPress={() => router.back()}
        >
          <Text style={styles.primaryButtonText}>Return to Settings</Text>
        </Pressable>
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
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderRadius: theme.borderRadius.md,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    alignItems: 'center',
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 207, 92, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.textStrong,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  stepBox: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.sm,
    padding: 14,
    marginBottom: 16,
    gap: 6,
  },
  stepTitle: {
    color: theme.colors.textStrong,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  stepText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 207, 92, 0.08)',
    borderRadius: theme.borderRadius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.2)',
    gap: 8,
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 17,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.sm,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: theme.colors.accentContrast,
    fontSize: 14,
    fontWeight: '800',
  },
});
