import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Linking,
  Modal,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

interface EmbeddedStreamPlayerProps {
  url: string;
  provider?: '7reels' | 'anikoto' | string;
  title?: string;
  subtitle?: string;
  height?: number;
}

const INJECTED_CSS_ANIKOTO = `
  header, footer, nav, .header, .footer, .sidebar, .banner, #header, #footer,
  .watch-second, .watch-order, .comment-box, .anime-related, #disqus_thread,
  .sidebar-section, .w2g-create, #w2g-create, .announcement, .alert {
    display: none !important;
  }
  body, html {
    background-color: #0c0d0e !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow-x: hidden !important;
  }
  #watch-main, .watch-wrap, .watch-container {
    padding: 0 !important;
    margin: 0 !important;
    max-width: 100% !important;
    width: 100% !important;
  }
  #w-player, #player-wrapper, #player {
    width: 100vw !important;
    max-width: 100vw !important;
    margin: 0 !important;
    border-radius: 0 !important;
  }
`;

const INJECTED_CSS_7REELS = `
  nav, footer, .header, .footer, .navbar, .nav-bar, header, #header, #footer, .sidebar {
    display: none !important;
  }
  body, html {
    background-color: #0c0d0e !important;
    margin: 0 !important;
    padding: 0 !important;
  }
`;

const RNWebView: any = WebView;

export function EmbeddedStreamPlayer({
  url,
  provider = '7reels',
  title = 'Watch Stream',
  subtitle,
  height = 230,
}: EmbeddedStreamPlayerProps) {
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const webViewRef = useRef<any>(null);
  const fullscreenWebViewRef = useRef<any>(null);

  const isAnikoto = provider === 'anikoto' || url.includes('anikototv');
  const providerLabel = isAnikoto ? 'anikototv.to' : '7reels.cc';

  const injectedJS = `
    (function() {
      // 1. Block aggressive popups & new windows
      window.open = function() { return null; };

      // 2. Inject tailored styling
      var style = document.createElement('style');
      style.innerHTML = \`${isAnikoto ? INJECTED_CSS_ANIKOTO : INJECTED_CSS_7REELS}\`;
      document.head.appendChild(style);

      // 3. Auto-scroll to player container
      setTimeout(function() {
        var player = document.getElementById('w-player') || document.getElementById('player') || document.querySelector('.player') || document.querySelector('video') || document.querySelector('iframe');
        if (player) {
          player.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 600);
    })();
    true;
  `;

  const handleOpenExternal = () => {
    Linking.openURL(url).catch(() => {});
  };

  const handleReload = () => {
    setLoading(true);
    setHasError(false);
    webViewRef.current?.reload?.();
    fullscreenWebViewRef.current?.reload?.();
  };

  const webViewProps: any = {
    source: { uri: url },
    style: styles.webView,
    javaScriptEnabled: true,
    domStorageEnabled: true,
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: false,
    injectedJavaScript: injectedJS,
    injectedJavaScriptBeforeContentLoaded: 'window.open = function() { return null; };',
    onLoadStart: () => setLoading(true),
    onLoadEnd: () => setLoading(false),
    onError: () => {
      setLoading(false);
      setHasError(true);
    },
    setSupportMultipleWindows: false,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  const fullscreenWebViewProps: any = {
    source: { uri: url },
    style: styles.fullscreenWebView,
    javaScriptEnabled: true,
    domStorageEnabled: true,
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: false,
    injectedJavaScript: injectedJS,
    setSupportMultipleWindows: false,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  return (
    <View style={styles.container}>
      {/* Header Bar: Title, Provider Badge, Controls */}
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.eyebrow}>STREAM PLAYER</Text>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>

        <View style={styles.actionsRow}>
          {/* Provider Badge */}
          <View style={styles.providerBadge}>
            <Ionicons name="play-circle-outline" size={13} color="#ffcf5c" />
            <Text style={styles.providerBadgeText}>{providerLabel}</Text>
          </View>

          {/* Reload button */}
          <Pressable style={styles.iconBtn} onPress={handleReload} hitSlop={6}>
            <Ionicons name="reload-outline" size={15} color="#dcded9" />
          </Pressable>

          {/* Fullscreen button */}
          <Pressable style={styles.iconBtn} onPress={() => setIsFullscreen(true)} hitSlop={6}>
            <Ionicons name="expand-outline" size={15} color="#dcded9" />
          </Pressable>

          {/* External browser button */}
          <Pressable style={styles.iconBtn} onPress={handleOpenExternal} hitSlop={6}>
            <Ionicons name="open-outline" size={15} color="#dcded9" />
          </Pressable>
        </View>
      </View>

      {/* Embedded WebView Container */}
      <View style={[styles.playerBox, { height }]}>
        <RNWebView ref={webViewRef} {...webViewProps} />

        {/* Loading Overlay */}
        {loading && (
          <View style={styles.overlayCenter}>
            <ActivityIndicator size="small" color={theme.colors.accent} />
            <Text style={styles.overlayText}>Loading stream player...</Text>
          </View>
        )}

        {/* Error Fallback */}
        {hasError && (
          <View style={styles.overlayCenter}>
            <Ionicons name="alert-circle-outline" size={28} color="#ff6b6b" />
            <Text style={styles.errorText}>Could not load embedded stream.</Text>
            <Pressable style={styles.retryBtn} onPress={handleReload}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Fullscreen Modal */}
      <Modal visible={isFullscreen} animationType="fade" onRequestClose={() => setIsFullscreen(false)}>
        <View style={styles.fullscreenContainer}>
          {/* Fullscreen Header */}
          <View style={styles.fullscreenHeader}>
            <Pressable style={styles.closeFullscreenBtn} onPress={() => setIsFullscreen(false)}>
              <Ionicons name="close" size={20} color="#f8f7f2" />
              <Text style={styles.closeFullscreenText}>Close Fullscreen</Text>
            </Pressable>

            <Pressable style={styles.iconBtn} onPress={handleOpenExternal}>
              <Ionicons name="open-outline" size={16} color="#f8f7f2" />
            </Pressable>
          </View>

          <RNWebView ref={fullscreenWebViewRef} {...fullscreenWebViewProps} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#141517',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    gap: 8,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#ffcf5c',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8f7f2',
  },
  subtitle: {
    fontSize: 12,
    color: '#8b8e89',
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  providerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 207, 92, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.25)',
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  providerBadgeText: {
    color: '#ffcf5c',
    fontSize: 11,
    fontWeight: '700',
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerBox: {
    width: '100%',
    backgroundColor: '#0c0d0e',
    position: 'relative',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0c0d0e',
  },
  overlayCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0c0d0e',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    zIndex: 5,
  },
  overlayText: {
    color: '#8b8e89',
    fontSize: 12,
  },
  errorText: {
    color: '#f8f7f2',
    fontSize: 13,
    fontWeight: '600',
  },
  retryBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginTop: 4,
  },
  retryBtnText: {
    color: '#f8f7f2',
    fontSize: 12,
    fontWeight: '600',
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#0c0d0e',
  },
  fullscreenHeader: {
    height: 52,
    backgroundColor: '#141517',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  closeFullscreenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  closeFullscreenText: {
    color: '#f8f7f2',
    fontSize: 13,
    fontWeight: '600',
  },
  fullscreenWebView: {
    flex: 1,
    backgroundColor: '#0c0d0e',
  },
});
