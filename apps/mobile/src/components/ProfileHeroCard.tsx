import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  ViewStyle,
} from 'react-native';
import { Image } from './AppImage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { useAppTheme } from '../context/ThemeContext';
import { useSnackbar } from '../context/SnackbarContext';
import { api, MeResponse } from '../services/api';
import { BottomSheet } from './BottomSheet';
import { resolveImageUrl } from '../utils/images';

interface ProfileHeroCardProps {
  meData?: MeResponse;
  editable?: boolean;
  onRefresh?: () => void;
  style?: ViewStyle;
}

export function ProfileHeroCard({ meData, editable = false, onRefresh, style }: ProfileHeroCardProps) {
  const queryClient = useQueryClient();
  const { colors, isDark } = useAppTheme();
  const { showNotice } = useSnackbar();
  const [uploadingKind, setUploadingKind] = useState<'avatar' | 'banner' | null>(null);

  // BottomSheet state
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [activeMediaKind, setActiveMediaKind] = useState<'avatar' | 'banner'>('avatar');

  const showToast = (msg: string, tone: 'info' | 'success' | 'error' = 'info') => {
    showNotice(msg, tone);
  };

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

  const handleMediaPress = (kind: 'avatar' | 'banner') => {
    setActiveMediaKind(kind);
    const hasImage = kind === 'avatar' ? Boolean(meData?.profile?.avatarUrl) : Boolean(meData?.profile?.bannerUrl);
    if (!hasImage) {
      // If no image is added, directly open Android's image/gallery selector
      openImagePicker(kind);
    } else {
      // If image already exists, open bottom sheet with Replace & Remove options
      setShowActionSheet(true);
    }
  };

  const openImagePicker = async (kind: 'avatar' | 'banner') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast('Media library permission is required to choose photos.');
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
        await uploadImage(kind, asset.uri, asset.mimeType, asset.fileName ?? undefined);
      }
    } catch (err: any) {
      // Graceful fallback if native cropper reports an issue on specific devices
      try {
        const fallbackResult = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.85,
        });
        if (!fallbackResult.canceled && fallbackResult.assets && fallbackResult.assets[0]?.uri) {
          const asset = fallbackResult.assets[0];
          await uploadImage(kind, asset.uri, asset.mimeType, asset.fileName ?? undefined);
        }
      } catch (fallbackErr: any) {
        showToast(fallbackErr?.message || 'Could not open image picker.');
      }
    }
  };

  const handleReplaceImage = () => {
    setShowActionSheet(false);
    setTimeout(() => {
      openImagePicker(activeMediaKind);
    }, 250);
  };

  const handleRemoveImage = async () => {
    setShowActionSheet(false);
    setUploadingKind(activeMediaKind);
    try {
      await api.removeProfileMedia(activeMediaKind);
      queryClient.invalidateQueries({ queryKey: ['me'] });
      if (onRefresh) onRefresh();
      showToast(`${activeMediaKind === 'avatar' ? 'Avatar' : 'Banner'} removed.`);
    } catch (e: any) {
      showToast(e?.message || `Could not remove ${activeMediaKind}.`);
    } finally {
      setUploadingKind(null);
    }
  };

  const uploadImage = async (kind: 'avatar' | 'banner', uri: string, mimeType?: string, fileName?: string) => {
    setUploadingKind(kind);
    try {
      await api.uploadProfileMedia(kind, uri, mimeType, fileName);
      queryClient.invalidateQueries({ queryKey: ['me'] });
      if (onRefresh) onRefresh();
      showToast(`${kind.charAt(0).toUpperCase() + kind.slice(1)} image updated.`);
    } catch (e: any) {
      showToast(e?.message || 'Could not upload image.');
    } finally {
      setUploadingKind(null);
    }
  };

  return (
    <View
      style={[
        styles.heroCard,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.055)' : colors.card,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {/* Banner Section */}
      <View style={styles.banner}>
        {resolveImageUrl(meData?.profile?.bannerUrl) ? (
          <Image source={{ uri: resolveImageUrl(meData?.profile?.bannerUrl)! }} style={styles.bannerImage} contentFit="cover" />
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
            onPress={() => handleMediaPress('banner')}
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

      {/* User Row with Avatar - Display Name is cleanly separated below banner with NO overlap */}
      <View style={styles.userRow}>
        <View style={styles.avatarWrapper}>
          <View style={styles.avatar}>
            {resolveImageUrl(meData?.profile?.avatarUrl) ? (
              <Image source={{ uri: resolveImageUrl(meData?.profile?.avatarUrl)! }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
            )}
          </View>

          {/* Avatar Edit Camera Badge Button */}
          {editable && (
            <Pressable
              style={styles.avatarCameraBtn}
              onPress={() => handleMediaPress('avatar')}
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

        {/* User details placed below banner without any text overlap */}
        <View style={styles.userDetails}>
          <Text style={[styles.displayName, { color: colors.textStrong }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.username, { color: isDark ? colors.accent : colors.accentDark }]} numberOfLines={1}>
            @{username}
          </Text>
        </View>
      </View>

      {/* ────────────────────────────────────────────── */}
      {/* Media Action Bottom Sheet (Replace / Remove)   */}
      {/* ────────────────────────────────────────────── */}
      <BottomSheet
        visible={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        title={activeMediaKind === 'avatar' ? 'Profile Avatar' : 'Profile Banner'}
        subtitle={`Manage your profile ${activeMediaKind}`}
        icon={activeMediaKind === 'avatar' ? 'person-circle-outline' : 'image-outline'}
      >
        <Pressable
          style={[styles.sheetActionItem, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)', borderColor: colors.border }]}
          onPress={handleReplaceImage}
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
          onPress={handleRemoveImage}
        >
          <View style={[styles.sheetIconBox, { backgroundColor: 'rgba(255, 92, 92, 0.15)' }]}>
            <Ionicons name="trash-outline" size={20} color="#ff5c5c" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sheetActionTitle, { color: '#ff5c5c' }]}>Remove image</Text>
            <Text style={[styles.sheetActionSubtitle, { color: colors.textMuted }]}>Delete current {activeMediaKind}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#ff5c5c" />
        </Pressable>

        <Pressable
          style={[styles.sheetCancelBtn, { borderColor: colors.border }]}
          onPress={() => setShowActionSheet(false)}
        >
          <Text style={[styles.sheetCancelText, { color: colors.textMuted }]}>Cancel</Text>
        </Pressable>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: 10,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  banner: {
    height: 125,
    width: '100%',
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(22, 24, 25, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 14,
  },
  avatarWrapper: {
    position: 'relative',
    marginTop: -38, // Avatar overlaps banner edge
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ffcf5c',
    borderWidth: 3,
    borderColor: '#101112',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    elevation: 4,
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
    paddingTop: 4, // Clean separation below the banner
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
  urlInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
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
});
