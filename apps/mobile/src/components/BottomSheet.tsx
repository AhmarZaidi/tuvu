import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  children: React.ReactNode;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  iconColor,
  children,
}: BottomSheetProps) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [isRendered, setIsRendered] = useState(visible);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);

  const startOpenAnimation = useCallback(() => {
    isClosingRef.current = false;
    translateY.setValue(SCREEN_HEIGHT);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        damping: 26,
        stiffness: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, translateY]);

  const startCloseAnimation = useCallback((onComplete?: () => void) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsRendered(false);
      isClosingRef.current = false;
      if (onComplete) onComplete();
    });
  }, [backdropOpacity, translateY]);

  useEffect(() => {
    if (visible) {
      setIsRendered(true);
      startOpenAnimation();
    } else if (isRendered && !isClosingRef.current) {
      startCloseAnimation();
    }
  }, [visible, isRendered, startOpenAnimation, startCloseAnimation]);

  const handleBackdropOrClose = () => {
    startCloseAnimation(onClose);
  };

  if (!isRendered) return null;

  return (
    <Modal
      transparent
      visible={isRendered}
      animationType="none"
      onRequestClose={handleBackdropOrClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Animated backdrop */}
        <TouchableWithoutFeedback onPress={handleBackdropOrClose}>
          <Animated.View
            style={[
              styles.backdrop,
              {
                opacity: backdropOpacity.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.65],
                }),
              },
            ]}
          />
        </TouchableWithoutFeedback>

        {/* Sliding Bottom Sheet Container */}
        <Animated.View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: isDark ? '#141517' : colors.card,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Drag Handle Bar */}
          <View style={styles.handleWrap}>
            <View style={[styles.handleBar, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)' }]} />
          </View>

          {/* Header Row */}
          {(title || icon) && (
            <View style={styles.headerRow}>
              <View style={styles.headerTitleGroup}>
                {icon && (
                  <View style={[styles.iconBadge, { backgroundColor: isDark ? 'rgba(255, 207, 92, 0.12)' : 'rgba(240, 168, 36, 0.18)' }]}>
                    <Ionicons name={icon} size={20} color={iconColor || colors.accent} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  {title && <Text style={[styles.title, { color: colors.textStrong }]}>{title}</Text>}
                  {subtitle && <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>}
                </View>
              </View>
            </View>
          )}

          {/* Sheet Body Content */}
          <View style={styles.bodyContent}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
  },
  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: SCREEN_HEIGHT * 0.85,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 8,
  },
  handleBar: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  bodyContent: {
    gap: 12,
  },
});
