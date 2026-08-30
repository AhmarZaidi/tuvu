import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { ConflictItem } from '../services/api';
import { BottomSheet } from './BottomSheet';

interface ConflictResolutionModalProps {
  open: boolean;
  onClose: () => void;
  conflicts: ConflictItem[];
  onResolve: (resolutions: Record<string, 'accept' | 'keep'>) => Promise<void>;
}

export function ConflictResolutionModal({
  open,
  onClose,
  conflicts,
  onResolve,
}: ConflictResolutionModalProps) {
  const [decisions, setDecisions] = useState<Record<string, 'accept' | 'keep'>>({});
  const [saving, setSaving] = useState(false);

  const handleSelect = (section: string, choice: 'accept' | 'keep') => {
    setDecisions((prev) => ({ ...prev, [section]: choice }));
  };

  const handleAcceptAll = () => {
    const all: Record<string, 'accept' | 'keep'> = {};
    for (const c of conflicts) {
      all[c.section] = 'accept';
    }
    setDecisions(all);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Default unselected to 'keep'
      const finalDecisions: Record<string, 'accept' | 'keep'> = {};
      for (const c of conflicts) {
        finalDecisions[c.section] = decisions[c.section] || 'keep';
      }
      await onResolve(finalDecisions);
      onClose();
    } catch (e) {
      console.error('Failed to resolve conflicts', e);
    } finally {
      setSaving(false);
    }
  };

  const isImageSection = (section: string) => section === 'poster' || section === 'backdrop';

  return (
    <BottomSheet
      visible={open}
      onClose={onClose}
      title="Review Provider Differences"
      subtitle="Resolve fresh provider metadata differences"
      icon="git-pull-request-outline"
    >
      <View style={styles.sheetContent}>
        <Text style={styles.description}>
          Fresh details from TMDB conflict with values currently saved in your library.
          Choose which information to keep or update for each section.
        </Text>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            {conflicts.map((item) => {
              const currentChoice = decisions[item.section];
              const isImage = isImageSection(item.section);

              return (
                <View key={item.section} style={styles.conflictCard}>
                  <Text style={styles.sectionLabel}>{item.label}</Text>

                  {/* Comparison Row */}
                  <View style={styles.compareRow}>
                    {/* Current Column */}
                    <View style={styles.compareCol}>
                      <Text style={styles.colHeader}>CURRENT SAVED</Text>
                      {isImage ? (
                        <Image source={{ uri: item.current }} style={styles.previewImage} contentFit="cover" />
                      ) : (
                        <Text style={styles.valText} numberOfLines={4}>
                          {item.current || '(empty)'}
                        </Text>
                      )}
                      <Pressable
                        style={[
                          styles.choiceButton,
                          currentChoice === 'keep' && styles.choiceButtonSelected,
                        ]}
                        onPress={() => handleSelect(item.section, 'keep')}
                      >
                        <Text
                          style={[
                            styles.choiceButtonText,
                            currentChoice === 'keep' && styles.choiceButtonTextSelected,
                          ]}
                        >
                          Keep Current
                        </Text>
                      </Pressable>
                    </View>

                    {/* Incoming Column */}
                    <View style={styles.compareCol}>
                      <Text style={[styles.colHeader, { color: theme.colors.accent }]}>INCOMING TMDB</Text>
                      {isImage ? (
                        <Image source={{ uri: item.incoming }} style={styles.previewImage} contentFit="cover" />
                      ) : (
                        <Text style={styles.valText} numberOfLines={4}>
                          {item.incoming || '(empty)'}
                        </Text>
                      )}
                      <Pressable
                        style={[
                          styles.choiceButton,
                          currentChoice === 'accept' && styles.choiceButtonSelectedAccent,
                        ]}
                        onPress={() => handleSelect(item.section, 'accept')}
                      >
                        <Text
                          style={[
                            styles.choiceButtonText,
                            currentChoice === 'accept' && styles.choiceButtonTextSelectedAccent,
                          ]}
                        >
                          Accept New
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <Pressable style={styles.acceptAllButton} onPress={handleAcceptAll} disabled={saving}>
              <Text style={styles.acceptAllText}>Accept All New</Text>
            </Pressable>

            <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#101112" />
              ) : (
                <Text style={styles.saveButtonText}>Apply Choices</Text>
              )}
            </Pressable>
          </View>
        </View>
      </BottomSheet>
    );
  }

  const styles = StyleSheet.create({
    sheetContent: {
      paddingTop: 4,
      maxHeight: 520,
    },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: theme.colors.accent,
    marginBottom: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8f7f2',
  },
  closeButton: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  description: {
    fontSize: 12,
    color: '#aeb1ac',
    lineHeight: 17,
    marginBottom: 12,
  },
  scrollArea: {
    maxHeight: 400,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 8,
  },
  conflictCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.borderRadius.md,
    padding: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8f7f2',
    marginBottom: 10,
  },
  compareRow: {
    flexDirection: 'row',
    gap: 10,
  },
  compareCol: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: theme.borderRadius.sm,
    padding: 10,
    justifyContent: 'space-between',
  },
  colHeader: {
    fontSize: 9,
    fontWeight: '700',
    color: '#8b8e89',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  valText: {
    fontSize: 12,
    color: '#dcded9',
    lineHeight: 16,
    minHeight: 50,
    marginBottom: 8,
  },
  previewImage: {
    width: '100%',
    height: 90,
    borderRadius: 6,
    marginBottom: 8,
  },
  choiceButton: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  choiceButtonSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: '#f8f7f2',
  },
  choiceButtonSelectedAccent: {
    backgroundColor: 'rgba(255, 191, 71, 0.18)',
    borderColor: theme.colors.accent,
  },
  choiceButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#aeb1ac',
  },
  choiceButtonTextSelected: {
    color: '#ffffff',
  },
  choiceButtonTextSelectedAccent: {
    color: theme.colors.accent,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  acceptAllButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  acceptAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f8f7f2',
  },
  saveButton: {
    flex: 1.3,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#101112',
  },
});
