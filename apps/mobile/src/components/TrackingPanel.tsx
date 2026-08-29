import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';
import { api, MediaDetailData } from '../services/api';
import { StatusBadge, StatusTone } from './StatusBadge';
import { BottomSheet } from './BottomSheet';

interface TrackingPanelProps {
  mediaId: string;
  mediaType: string;
  userMedia?: MediaDetailData['userMedia'];
  onUpdated: () => void;
}

const STATUS_OPTIONS = [
  { value: 'watching', label: 'Watching', tone: 'watching' as StatusTone },
  { value: 'watch_later', label: 'Plan to Watch', tone: 'planned' as StatusTone },
  { value: 'completed', label: 'Completed', tone: 'complete' as StatusTone },
  { value: 'on_hold', label: 'On Hold', tone: 'paused' as StatusTone },
  { value: 'dropped', label: 'Dropped', tone: 'stopped' as StatusTone },
];

export function TrackingPanel({ mediaId, mediaType, userMedia, onUpdated }: TrackingPanelProps) {
  const { colors, isDark } = useAppTheme();
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [notes, setNotes] = useState(userMedia?.notes || '');
  const [saving, setSaving] = useState(false);

  const currentStatus = userMedia?.status || 'watch_later';
  const isFavorite = Boolean(userMedia?.isFavorite);
  const currentRating = userMedia?.rating || null;

  const handleUpdateStatus = async (newStatus: string) => {
    setStatusModalOpen(false);
    setSaving(true);
    try {
      await api.updateMediaLibrary(mediaId, { status: newStatus });
      onUpdated();
    } catch (e) {
      console.error('Failed to update status', e);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFavorite = async () => {
    setSaving(true);
    try {
      await api.updateMediaLibrary(mediaId, { isFavorite: !isFavorite });
      onUpdated();
    } catch (e) {
      console.error('Failed to toggle favorite', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSetRating = async (newRating: number | null) => {
    setRatingModalOpen(false);
    setSaving(true);
    try {
      await api.updateMediaLibrary(mediaId, { rating: newRating });
      onUpdated();
    } catch (e) {
      console.error('Failed to set rating', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await api.updateMediaLibrary(mediaId, { notes });
      setNotesModalOpen(false);
      onUpdated();
    } catch (e) {
      console.error('Failed to save notes', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {/* Status Dropdown Trigger */}
        <Pressable style={styles.statusTrigger} onPress={() => setStatusModalOpen(true)}>
          <Text style={styles.label}>Status</Text>
          <View style={styles.valueRow}>
            <Text style={styles.statusValueText}>{currentStatus.replace(/_/g, ' ')}</Text>
            <Ionicons name="chevron-down" size={14} color={theme.colors.textSubtle} />
          </View>
        </Pressable>

        {/* Rating Button Trigger */}
        <Pressable style={styles.ratingTrigger} onPress={() => setRatingModalOpen(true)}>
          <Text style={styles.label}>Rating</Text>
          <View style={styles.valueRow}>
            <Ionicons
              name={currentRating ? 'star' : 'star-outline'}
              size={14}
              color={currentRating ? theme.colors.accent : theme.colors.textSubtle}
            />
            <Text style={[styles.ratingValueText, currentRating ? { color: theme.colors.accent } : null]}>
              {currentRating ? `${currentRating}/10` : 'Rate'}
            </Text>
          </View>
        </Pressable>

        {/* Favorite Heart Button */}
        <Pressable style={styles.iconAction} onPress={handleToggleFavorite}>
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={20}
            color={isFavorite ? theme.colors.accent : theme.colors.textSubtle}
          />
        </Pressable>

        {/* Notes Button */}
        <Pressable style={styles.iconAction} onPress={() => setNotesModalOpen(true)}>
          <Ionicons
            name={userMedia?.notes ? 'document-text' : 'document-text-outline'}
            size={20}
            color={userMedia?.notes ? theme.colors.accent : theme.colors.textSubtle}
          />
        </Pressable>
      </View>

      {/* Status Picker BottomSheet */}
      <BottomSheet
        visible={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title="Select Status"
        subtitle="Update your library tracking state"
        icon="bookmarks-outline"
      >
        {STATUS_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            style={[
              styles.modalOption,
              { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)', borderColor: colors.border },
              currentStatus === opt.value && styles.modalOptionSelected,
            ]}
            onPress={() => handleUpdateStatus(opt.value)}
          >
            <StatusBadge label={opt.label} tone={opt.tone} />
            {currentStatus === opt.value && (
              <Ionicons name="checkmark" size={18} color={colors.accent} />
            )}
          </Pressable>
        ))}
        <Pressable
          style={[styles.sheetCancelBtn, { borderColor: colors.border }]}
          onPress={() => setStatusModalOpen(false)}
        >
          <Text style={[styles.sheetCancelText, { color: colors.textMuted }]}>Cancel</Text>
        </Pressable>
      </BottomSheet>

      {/* Rating Picker BottomSheet */}
      <BottomSheet
        visible={ratingModalOpen}
        onClose={() => setRatingModalOpen(false)}
        title="Rate Media"
        subtitle="Choose a score from 1 to 10"
        icon="star-outline"
      >
        <View style={styles.ratingGrid}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
            <Pressable
              key={score}
              style={[
                styles.ratingScorePill,
                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)', borderColor: colors.border },
                currentRating === score && { backgroundColor: colors.accent, borderColor: colors.accent },
              ]}
              onPress={() => handleSetRating(score)}
            >
              <Text
                style={[
                  styles.ratingScoreText,
                  { color: colors.textStrong },
                  currentRating === score && { color: colors.accentContrast },
                ]}
              >
                {score}
              </Text>
            </Pressable>
          ))}
        </View>
        {currentRating && (
          <Pressable style={styles.clearRatingButton} onPress={() => handleSetRating(null)}>
            <Text style={styles.clearRatingText}>Clear Rating</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.sheetCancelBtn, { borderColor: colors.border }]}
          onPress={() => setRatingModalOpen(false)}
        >
          <Text style={[styles.sheetCancelText, { color: colors.textMuted }]}>Cancel</Text>
        </Pressable>
      </BottomSheet>

      {/* Notes Editor BottomSheet */}
      <BottomSheet
        visible={notesModalOpen}
        onClose={() => setNotesModalOpen(false)}
        title="Personal Notes"
        subtitle="Keep your thoughts, reminders, or private review"
        icon="create-outline"
      >
        <TextInput
          style={[
            styles.notesInput,
            {
              backgroundColor: colors.inputBg,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder="Write your thoughts, reminders, or review..."
          placeholderTextColor={colors.textSubtle}
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <View style={styles.notesActions}>
          <Pressable
            style={[styles.cancelButton, { borderColor: colors.border }]}
            onPress={() => setNotesModalOpen(false)}
          >
            <Text style={[styles.cancelButtonText, { color: colors.textMuted }]}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.saveButton, { backgroundColor: colors.accent }]}
            onPress={handleSaveNotes}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.accentContrast} />
            ) : (
              <Text style={[styles.saveButtonText, { color: colors.accentContrast }]}>Save Notes</Text>
            )}
          </Pressable>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 10,
    marginTop: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusTrigger: {
    flex: 1.3,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  ratingTrigger: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textSubtle,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusValueText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textStrong,
    textTransform: 'capitalize',
  },
  ratingValueText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textStrong,
  },
  iconAction: {
    width: 38,
    height: 38,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#171819',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: 16,
    gap: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.textStrong,
    marginBottom: 8,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  modalOptionSelected: {
    backgroundColor: 'rgba(255, 207, 92, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.3)',
  },
  ratingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginVertical: 8,
  },
  ratingScorePill: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  ratingScoreSelected: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  ratingScoreText: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.textStrong,
  },
  ratingScoreTextSelected: {
    color: theme.colors.accentContrast,
  },
  clearRatingButton: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 6,
  },
  clearRatingText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  notesModalContent: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#171819',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: 16,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  notesInput: {
    backgroundColor: '#101112',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.text,
    fontSize: 13,
    padding: 12,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  notesActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  cancelButtonText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.accent,
  },
  saveButtonText: {
    color: theme.colors.accentContrast,
    fontSize: 13,
    fontWeight: '800',
  },
  sheetCancelBtn: {
    paddingVertical: 12,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginTop: 6,
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
