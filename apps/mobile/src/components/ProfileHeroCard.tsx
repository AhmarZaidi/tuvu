import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../context/ThemeContext';
import { api, MeResponse } from '../services/api';

interface ProfileHeroCardProps {
  meData: MeResponse | undefined;
  editable?: boolean;
  onRefresh?: () => void;
  style?: any;
}

export function ProfileHeroCard({ meData, editable = false, onRefresh, style }: ProfileHeroCardProps) {
  const { colors } = useAppTheme();
  const [uploadingKind, setUploadingKind] = useState<'avatar' | 'banner' | null>(null);

  // URL input modal state
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlKind, setUrlKind] = useState<'avatar' | 'banner'>('avatar');
  const [inputUrl, setInputUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);

  const displayName = meData?.user?.displayName || 'Tuvu User';
  const username = meData?.user?.username || 'usr_local_test';

  const getInitials = (name: string) => {
    if (!name) return 'TU';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const handlePickImage = async (kind: 'avatar' | 'banner') => {
    Alert.alert(
      `Change ${kind.charAt(0).toUpperCase() + kind.slice(1)}`,
      'Choose how you want to set your image:',
      [
        {
          text: 'Choose from Library',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Denied', 'Media library access is needed to select an image.');
              return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: kind === 'avatar' ? [1, 1] : [16, 7],
              quality: 0.85,
            });

            if (!result.canceled && result.assets && result.assets[0]?.uri) {
              await uploadImage(kind, result.assets[0].uri);
            }
          },
        },
        {
          text: 'Enter Image URL',
          onPress: () => {
            setUrlKind(kind);
            setInputUrl(kind === 'avatar' ? meData?.profile?.avatarUrl || '' : meData?.profile?.bannerUrl || '');
            setShowUrlModal(true);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const uploadImage = async (kind: 'avatar' | 'banner', uri: string) => {
    setUploadingKind(kind);
    try {
      await api.uploadProfileMedia(kind, uri);
      if (onRefresh) onRefresh();
      Alert.alert('Success', `${kind.charAt(0).toUpperCase() + kind.slice(1)} image updated.`);
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.message || 'Could not upload image.');
    } finally {
      setUploadingKind(null);
    }
  };

  const handleSaveUrl = async () => {
    if (!inputUrl.trim()) {
      Alert.alert('Error', 'Please enter a valid image URL.');
      return;
    }
    setSavingUrl(true);
    try {
      if (urlKind === 'avatar') {
        await api.updateProfile({ avatarUrl: inputUrl.trim() });
      } else {
        await api.updateProfile({ bannerUrl: inputUrl.trim() });
      }
      setShowUrlModal(false);
      if (onRefresh) onRefresh();
      Alert.alert('Success', `${urlKind.charAt(0).toUpperCase() + urlKind.slice(1)} URL saved.`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save image URL.');
    } finally {
      setSavingUrl(false);
    }
  };

  return (
    <View
      style={[
        styles.heroCard,
        {
          backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.055)' : colors.card,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {/* Banner Section */}
      <View style={styles.banner}>
        {meData?.profile?.bannerUrl ? (
          <Image source={{ uri: meData.profile.bannerUrl }} style={styles.bannerImage} contentFit="cover" />
        ) : (
          /* Yellow to Blue/Green Gradient matching web client .profile-banner */
          <LinearGradient
            colors={['rgba(255, 191, 71, 0.84)', 'rgba(53, 85, 109, 0.86)', 'rgba(22, 24, 25, 0.9)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Banner Edit Camera Button */}
        {editable && (
          <Pressable
            style={styles.bannerCameraBtn}
            onPress={() => handlePickImage('banner')}
            disabled={uploadingKind !== null}
            hitSlop={8}
          >
            {uploadingKind === 'banner' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="camera-outline" size={16} color="#f8f7f2" />
            )}
          </Pressable>
        )}
      </View>

      {/* User Row with Avatar */}
      <View style={styles.userRow}>
        <View style={styles.avatarWrapper}>
          <View style={styles.avatar}>
            {meData?.profile?.avatarUrl ? (
              <Image source={{ uri: meData.profile.avatarUrl }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
            )}
          </View>

          {/* Avatar Edit Camera Badge Button */}
          {editable && (
            <Pressable
              style={styles.avatarCameraBtn}
              onPress={() => handlePickImage('avatar')}
              disabled={uploadingKind !== null}
              hitSlop={6}
            >
              {uploadingKind === 'avatar' ? (
                <ActivityIndicator size="small" color="#1d1505" />
              ) : (
                <Ionicons name="camera-outline" size={12} color="#1d1505" />
              )}
            </Pressable>
          )}
        </View>

        <View style={styles.userDetails}>
          <Text style={[styles.displayName, { color: colors.textStrong }]}>{displayName}</Text>
          <Text style={[styles.username, { color: colors.isDark ? colors.accent : colors.accentDark }]}>@{username}</Text>
        </View>
      </View>

      {/* URL Input Modal */}
      <Modal visible={showUrlModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.isDark ? '#171819' : colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="link-outline" size={20} color={colors.accent} />
              <Text style={[styles.modalTitle, { color: colors.textStrong }]}>
                Set {urlKind === 'avatar' ? 'Avatar' : 'Banner'} URL
              </Text>
            </View>
            <Text style={[styles.modalDesc, { color: colors.textMuted }]}>
              Enter a direct image link (HTTPS) for your profile {urlKind}.
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  color: colors.text,
                  backgroundColor: colors.inputBg,
                  borderColor: colors.border,
                },
              ]}
              value={inputUrl}
              onChangeText={setInputUrl}
              placeholder="https://example.com/image.jpg"
              placeholderTextColor={colors.textSubtle}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalCancelBtn, { backgroundColor: colors.surface }]}
                onPress={() => setShowUrlModal(false)}
                disabled={savingUrl}
              >
                <Text style={[styles.modalCancelText, { color: colors.textMuted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveBtn, { backgroundColor: colors.accent }]}
                onPress={handleSaveUrl}
                disabled={savingUrl}
              >
                {savingUrl ? (
                  <ActivityIndicator size="small" color={colors.accentContrast} />
                ) : (
                  <Text style={[styles.modalSaveText, { color: colors.accentContrast }]}>Save URL</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  banner: {
    height: 120,
    position: 'relative',
    backgroundColor: '#161819',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerCameraBtn: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16, 17, 18, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 14,
    marginTop: -28,
    gap: 14,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ffcf5c',
    borderWidth: 3,
    borderColor: '#101112',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    elevation: 3,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1d1505',
    letterSpacing: -0.5,
  },
  avatarCameraBtn: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffcf5c',
    borderWidth: 2,
    borderColor: '#101112',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  userDetails: {
    flex: 1,
    marginTop: 22,
  },
  displayName: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  username: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
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
    maxWidth: 340,
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 6,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  modalSaveText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
