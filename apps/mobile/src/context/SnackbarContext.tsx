import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from './ThemeContext';

export type NoticeTone = 'info' | 'success' | 'error';

export interface AppNotice {
  id: string;
  message: string;
  tone: NoticeTone;
  dismissible?: boolean;
}

interface SnackbarContextType {
  showNotice: (message: string, tone?: NoticeTone, dismissible?: boolean) => void;
  hideNotice: (id?: string) => void;
}

const SnackbarContext = createContext<SnackbarContextType>({
  showNotice: () => {},
  hideNotice: () => {},
});

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();

  const [activeNotice, setActiveNotice] = useState<AppNotice | null>(null);
  const translateY = useRef(new Animated.Value(120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const queueRef = useRef<AppNotice[]>([]);
  const isAnimatingRef = useRef(false);

  const animateOut = useCallback((onComplete?: () => void) => {
    isAnimatingRef.current = true;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 120,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isAnimatingRef.current = false;
      setActiveNotice(null);
      if (onComplete) onComplete();
      if (queueRef.current.length > 0) {
        const next = queueRef.current.shift()!;
        displayNotice(next);
      }
    });
  }, [opacity, translateY]);

  const displayNotice = useCallback((notice: AppNotice) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setActiveNotice(notice);
    translateY.setValue(120);
    opacity.setValue(0);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        damping: 20,
        stiffness: 240,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();

    const duration = notice.tone === 'error' ? 5500 : 3800;
    timeoutRef.current = setTimeout(() => {
      animateOut();
    }, duration);
  }, [animateOut, opacity, translateY]);

  const showNotice = useCallback((message: string, tone: NoticeTone = 'info', dismissible = true) => {
    if (!message) return;
    const notice: AppNotice = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      message,
      tone,
      dismissible,
    };

    if (activeNotice || isAnimatingRef.current) {
      queueRef.current.push(notice);
    } else {
      displayNotice(notice);
    }
  }, [activeNotice, displayNotice]);

  const hideNotice = useCallback((id?: string) => {
    if (!id || activeNotice?.id === id) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      animateOut();
    }
  }, [activeNotice, animateOut]);

  // Position directly above bottom navigation menu
  const bottomPosition = Math.max(insets.bottom, 10) + 68;

  const getToneBorder = (tone: NoticeTone) => {
    switch (tone) {
      case 'success':
        return 'rgba(90, 214, 142, 0.45)';
      case 'error':
        return 'rgba(255, 107, 107, 0.55)';
      case 'info':
      default:
        return 'rgba(255, 207, 92, 0.45)';
    }
  };

  const getToneIcon = (tone: NoticeTone): { name: keyof typeof Ionicons.glyphMap; color: string } => {
    switch (tone) {
      case 'success':
        return { name: 'checkmark-circle', color: '#5ad68e' };
      case 'error':
        return { name: 'alert-circle', color: '#ff6b6b' };
      case 'info':
      default:
        return { name: 'information-circle', color: colors.accent };
    }
  };

  return (
    <SnackbarContext.Provider value={{ showNotice, hideNotice }}>
      {children}
      {activeNotice && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.container,
            {
              bottom: bottomPosition,
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <View
            style={[
              styles.snackbar,
              {
                backgroundColor: isDark ? 'rgba(21, 23, 24, 0.96)' : 'rgba(248, 245, 238, 0.98)',
                borderColor: getToneBorder(activeNotice.tone),
              },
            ]}
          >
            <View style={styles.contentRow}>
              <Ionicons
                name={getToneIcon(activeNotice.tone).name}
                size={18}
                color={getToneIcon(activeNotice.tone).color}
                style={styles.toneIcon}
              />
              <Text
                style={[
                  styles.messageText,
                  { color: isDark ? '#f8f7f2' : '#1d1912' },
                ]}
                numberOfLines={3}
              >
                {activeNotice.message}
              </Text>
            </View>

            {activeNotice.dismissible !== false && (
              <Pressable
                style={[
                  styles.dismissBtn,
                  { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' },
                ]}
                onPress={() => hideNotice(activeNotice.id)}
                hitSlop={8}
              >
                <Ionicons name="close" size={15} color={isDark ? '#f8f7f2' : '#1d1912'} />
              </Pressable>
            )}
          </View>
        </Animated.View>
      )}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  return useContext(SnackbarContext);
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 9999,
    alignItems: 'center',
  },
  snackbar: {
    width: '100%',
    maxWidth: 440,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
    gap: 10,
  },
  contentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toneIcon: {
    flexShrink: 0,
  },
  messageText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  dismissBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 4,
  },
});
