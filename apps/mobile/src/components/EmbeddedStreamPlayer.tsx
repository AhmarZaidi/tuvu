import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Linking,
  ScrollView,
  Modal,
  StatusBar,
  BackHandler,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { StreamSourceItem, StreamServer } from '../services/api';

const RNWebView: any = WebView;

interface EmbeddedStreamPlayerProps {
  url: string;
  provider?: string;
  title?: string;
  subtitle?: string;
  height?: number;
  sources?: StreamSourceItem[];
}

export function EmbeddedStreamPlayer({
  url: initialUrl,
  provider: initialProvider = 'videasy',
  title = 'Watch Stream',
  subtitle,
  height = 230,
  sources = [],
}: EmbeddedStreamPlayerProps) {
  // Source & Server State
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [activeServerIndex, setActiveServerIndex] = useState(0);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [keyCounter, setKeyCounter] = useState(0);

  // Status & Fullscreen State
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [fallbackToast, setFallbackToast] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const webViewRef = useRef<any>(null);
  const fullscreenWebViewRef = useRef<any>(null);
  const controlsTimeoutRef = useRef<any>(null);

  // Normalize source list
  const sourceList: StreamSourceItem[] = sources.length > 0
    ? sources
    : [{ id: 'default', name: initialProvider, url: initialUrl, provider: initialProvider, servers: [{ id: 'srv_1', name: 'Default Server', url: initialUrl }] }];

  const activeSource = sourceList[activeSourceIndex] || sourceList[0];
  const activeServers = activeSource.servers && activeSource.servers.length > 0
    ? activeSource.servers
    : [{ id: 'srv_1', name: 'Default Server', url: activeSource.url }];
  const activeServer = activeServers[activeServerIndex] || activeServers[0];

  useEffect(() => {
    if (activeServer && activeServer.url) {
      setCurrentUrl(activeServer.url);
    } else if (activeSource && activeSource.url) {
      setCurrentUrl(activeSource.url);
    } else {
      setCurrentUrl(initialUrl);
    }
  }, [activeSource, activeServer, initialUrl]);

  // Clean up orientation when unmounting
  useEffect(() => {
    const handleBack = () => {
      if (isFullscreen) {
        toggleFullscreen();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => {
      sub.remove();
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, [isFullscreen]);

  const handleSelectSource = (index: number) => {
    if (index === activeSourceIndex) return;
    setActiveSourceIndex(index);
    setActiveServerIndex(0);
    const newSrc = sourceList[index];
    const initialSrvUrl = newSrc.servers && newSrc.servers.length > 0 ? newSrc.servers[0].url : newSrc.url;
    setCurrentUrl(initialSrvUrl);
    setLoading(true);
    setHasError(false);
    setKeyCounter((k) => k + 1);
  };

  const handleSelectServer = (index: number) => {
    if (index === activeServerIndex) return;
    setActiveServerIndex(index);
    const srv = activeServers[index];
    if (srv && srv.url) {
      setCurrentUrl(srv.url);
      setLoading(true);
      setHasError(false);
      setKeyCounter((k) => k + 1);
    }
  };

  const handleAutoFallback = useCallback(() => {
    // 1. Try next server within same source
    if (activeServerIndex < activeServers.length - 1) {
      const nextSrvIdx = activeServerIndex + 1;
      const nextSrv = activeServers[nextSrvIdx];
      setFallbackToast(`Switching to ${nextSrv.name}`);
      setTimeout(() => setFallbackToast(null), 3000);
      handleSelectServer(nextSrvIdx);
      return;
    }

    // 2. Try next source
    if (activeSourceIndex < sourceList.length - 1) {
      const nextSrcIdx = activeSourceIndex + 1;
      const nextSrc = sourceList[nextSrcIdx];
      setFallbackToast(`Switched to: ${nextSrc.name}`);
      setTimeout(() => setFallbackToast(null), 3500);
      handleSelectSource(nextSrcIdx);
    } else {
      setHasError(true);
    }
  }, [activeServerIndex, activeServers, activeSourceIndex, sourceList]);

  const toggleFullscreen = async () => {
    if (isFullscreen) {
      // Exit fullscreen -> portrait
      setIsFullscreen(false);
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    } else {
      // Enter fullscreen -> landscape
      setIsFullscreen(true);
      setShowControls(true);
      resetControlsTimer();
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT).catch(() => {});
    }
  };

  const resetControlsTimer = () => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 4000);
  };

  const handleScreenTouch = () => {
    if (isFullscreen) {
      if (showControls) {
        setShowControls(false);
      } else {
        resetControlsTimer();
      }
    }
  };

  // Reset to original stream link
  const handleResetToStream = () => {
    setLoading(true);
    setHasError(false);
    setCurrentUrl(activeServer.url || activeSource.url);
    setKeyCounter((k) => k + 1);
  };

  const handleOpenExternal = () => {
    Linking.openURL(currentUrl).catch(() => {});
  };

  // Injected JavaScript: only cleans site chrome when loading 7reels or Anikoto wrapper sites
  const injectedJS = `
    (function() {
      var is7reels = window.location.hostname.includes('7reels');
      var isAnikoto = window.location.hostname.includes('anikoto');

      if (is7reels || isAnikoto) {
        var style = document.getElementById('tuvu-embed-style');
        if (!style) {
          style = document.createElement('style');
          style.id = 'tuvu-embed-style';
          style.innerHTML = \`
            header, nav, footer, .navbar, .nav-bar, #header, #footer,
            #disqus_thread, #smart-tv-controls, .related-shows, .sidebar,
            .back-btn, .back-button, a[href^="/tv/"], a[href^="/movie/"] {
              display: none !important;
            }
          \`;
          document.head.appendChild(style);
        }

        function fit7reels() {
          var playerContainers = document.querySelectorAll('div[data-player-fs], #w-player, .watch-container');
          for (var c = 0; c < playerContainers.length; c++) {
            var pc = playerContainers[c];
            pc.style.position = 'fixed';
            pc.style.top = '0';
            pc.style.left = '0';
            pc.style.right = '0';
            pc.style.bottom = '0';
            pc.style.width = '100%';
            pc.style.height = '100%';
            pc.style.margin = '0';
            pc.style.padding = '0';
            pc.style.borderRadius = '0';
            pc.style.zIndex = '99999';
          }

          var allButtons = document.querySelectorAll('button, a');
          for (var i = 0; i < allButtons.length; i++) {
            var btn = allButtons[i];
            if (btn.closest && !btn.closest('iframe')) {
              var rect = btn.getBoundingClientRect();
              if (rect.top >= 0 && rect.top < 90 && rect.left >= 0 && rect.left < 90) {
                btn.style.display = 'none';
              }
            }
          }
        }

        setInterval(fit7reels, 500);
        fit7reels();
      }
    })();
    true;
  `;

  // Navigation filter that allows all streaming CDNs, worker scripts, and internal probes
  const handleShouldStartLoad = (req: any) => {
    const u = (req.url || '').toLowerCase();
    // Always allow internal data, blob, and about:blank
    if (!u || u === 'about:blank' || u.startsWith('data:') || u.startsWith('blob:')) {
      return true;
    }

    // Block android intent / market hijackers
    if (u.startsWith('intent:') || u.startsWith('market:') || u.startsWith('vnd.youtube:')) {
      return false;
    }

    // Only block external search engines on top frame
    if (req.isTopFrame && (u.includes('google.com') || u.includes('bing.com') || u.includes('yahoo.com'))) {
      return false;
    }

    // Allow all embed, CDN, worker, and media requests
    return true;
  };

  const getRefererHeader = (url: string) => {
    if (url.includes('anikoto') || url.includes('megaplay')) return 'https://anikototv.to/';
    if (url.includes('videasy')) return 'https://player.videasy.to/';
    if (url.includes('vidnest')) return 'https://vidnest.fun/';
    if (url.includes('strigil')) return 'https://strigil.cc/';
    return undefined;
  };

  const referer = getRefererHeader(currentUrl);
  const webViewSource: any = {
    uri: currentUrl,
    headers: referer ? { Referer: referer } : undefined,
  };

  const webViewProps: any = {
    source: webViewSource,
    style: styles.webView,
    javaScriptEnabled: true,
    domStorageEnabled: true,
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: false,
    injectedJavaScript: injectedJS,
    onShouldStartLoadWithRequest: handleShouldStartLoad,
    onOpenWindow: (syntheticEvent: any) => {
      syntheticEvent?.preventDefault?.();
    },
    onLoadStart: () => setLoading(true),
    onLoadEnd: () => setLoading(false),
    onError: () => {
      setLoading(false);
      handleAutoFallback();
    },
    setSupportMultipleWindows: false,
    nestedScrollEnabled: true,
    overScrollMode: 'never',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  return (
    <View style={styles.container}>
      {/* Normal Mode Header */}
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
          {/* Reset to stream button */}
          <Pressable
            style={styles.iconBtn}
            onPress={handleResetToStream}
            hitSlop={6}
            accessibilityLabel="Reset to stream"
          >
            <Ionicons name="home-outline" size={15} color="#dcded9" />
          </Pressable>

          {/* Reload button */}
          <Pressable
            style={styles.iconBtn}
            onPress={() => {
              setLoading(true);
              setHasError(false);
              webViewRef.current?.reload?.();
            }}
            hitSlop={6}
          >
            <Ionicons name="reload-outline" size={15} color="#dcded9" />
          </Pressable>

          {/* Fullscreen Button */}
          <Pressable style={styles.iconBtnAccent} onPress={toggleFullscreen} hitSlop={6}>
            <Ionicons name="expand" size={15} color="#101112" />
          </Pressable>

          {/* External browser button */}
          <Pressable style={styles.iconBtn} onPress={handleOpenExternal} hitSlop={6}>
            <Ionicons name="open-outline" size={15} color="#dcded9" />
          </Pressable>
        </View>
      </View>

      {/* Row 1: Primary Source Selector Chips */}
      {sourceList.length > 1 && (
        <View style={styles.sourceScrollWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sourceRow}>
            {sourceList.map((src, idx) => {
              const isSelected = idx === activeSourceIndex;
              return (
                <Pressable
                  key={src.id || idx}
                  style={[styles.sourceChip, isSelected && styles.sourceChipActive]}
                  onPress={() => handleSelectSource(idx)}
                >
                  {isSelected && <Ionicons name="play" size={10} color="#ffcf5c" style={{ marginRight: 4 }} />}
                  <Text style={[styles.sourceChipText, isSelected && styles.sourceChipTextActive]}>
                    {src.name}
                  </Text>
                  {src.badge && (
                    <View style={[styles.sourceBadge, isSelected && styles.sourceBadgeActive]}>
                      <Text style={[styles.sourceBadgeText, isSelected && styles.sourceBadgeTextActive]}>
                        {src.badge}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Row 2: Server / Mirror Selector Chips for Selected Source */}
      {activeServers.length > 1 && (
        <View style={styles.serverScrollWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serverRow}>
            <Text style={styles.serverLabel}>SERVER:</Text>
            {activeServers.map((srv, sIdx) => {
              const isServerActive = sIdx === activeServerIndex;
              return (
                <Pressable
                  key={srv.id || sIdx}
                  style={[styles.serverChip, isServerActive && styles.serverChipActive]}
                  onPress={() => handleSelectServer(sIdx)}
                >
                  <Text style={[styles.serverChipText, isServerActive && styles.serverChipTextActive]}>
                    {srv.name}
                  </Text>
                  {srv.badge && (
                    <View style={[styles.serverBadge, isServerActive && styles.serverBadgeActive]}>
                      <Text style={[styles.serverBadgeText, isServerActive && styles.serverBadgeTextActive]}>
                        {srv.badge}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Normal Embedded Player Box */}
      {!isFullscreen && (
        <View
          style={[styles.playerBox, { height }]}
          onStartShouldSetResponderCapture={() => true}
          onMoveShouldSetResponderCapture={() => false}
        >
          <RNWebView key={`webview-${keyCounter}-${activeSourceIndex}-${activeServerIndex}`} ref={webViewRef} {...webViewProps} />

          {/* Fallback Toast Banner */}
          {fallbackToast && (
            <View style={styles.fallbackToast} pointerEvents="none">
              <Ionicons name="swap-horizontal" size={14} color="#ffcf5c" />
              <Text style={styles.fallbackToastText}>{fallbackToast}</Text>
            </View>
          )}

          {/* Loading Overlay */}
          {loading && (
            <View style={styles.overlayCenter} pointerEvents="none">
              <ActivityIndicator size="small" color={theme.colors.accent} />
              <Text style={styles.overlayText}>Connecting to {activeSource.name} ({activeServer.name})...</Text>
            </View>
          )}

          {/* Error Fallback */}
          {hasError && (
            <View style={styles.overlayCenter}>
              <Ionicons name="alert-circle-outline" size={28} color="#ff6b6b" />
              <Text style={styles.errorText}>Could not load stream from {activeSource.name}.</Text>
              <View style={styles.errorActionsRow}>
                <Pressable style={styles.retryBtn} onPress={handleResetToStream}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </Pressable>
                {activeSourceIndex < sourceList.length - 1 && (
                  <Pressable
                    style={[styles.retryBtn, { backgroundColor: 'rgba(255, 207, 92, 0.15)', borderColor: '#ffcf5c' }]}
                    onPress={() => handleSelectSource(activeSourceIndex + 1)}
                  >
                    <Text style={[styles.retryBtnText, { color: '#ffcf5c' }]}>Try Next Source</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Native Immersive Landscape Fullscreen Modal */}
      <Modal
        visible={isFullscreen}
        animationType="fade"
        transparent={false}
        statusBarTranslucent={true}
        hardwareAccelerated={true}
        onRequestClose={toggleFullscreen}
      >
        <StatusBar hidden={true} />
        <View style={styles.fullscreenModalContainer} onTouchEnd={handleScreenTouch}>
          <RNWebView
            key={`fullscreen-webview-${keyCounter}-${activeSourceIndex}-${activeServerIndex}`}
            ref={fullscreenWebViewRef}
            {...webViewProps}
          />

          {/* Fullscreen Loading Overlay */}
          {loading && (
            <View style={styles.overlayCenter} pointerEvents="none">
              <ActivityIndicator size="large" color={theme.colors.accent} />
              <Text style={styles.overlayText}>Connecting to {activeSource.name} ({activeServer.name})...</Text>
            </View>
          )}

          {/* Floating Controls HUD in Fullscreen Mode */}
          {showControls && (
            <View style={styles.floatingFullscreenBar}>
              <View style={styles.floatingLeft}>
                <Pressable style={styles.floatingCloseBtn} onPress={toggleFullscreen}>
                  <Ionicons name="contract" size={16} color="#f8f7f2" />
                  <Text style={styles.floatingCloseText}>Exit</Text>
                </Pressable>

                <View style={styles.floatingSourceBadge}>
                  <Text style={styles.floatingSourceText}>
                    {activeSource.name} • {activeServer.name}
                  </Text>
                </View>
              </View>

              <View style={styles.floatingRight}>
                {/* Reset to stream button */}
                <Pressable style={styles.floatingIconBtn} onPress={handleResetToStream} hitSlop={6}>
                  <Ionicons name="home-outline" size={16} color="#f8f7f2" />
                </Pressable>

                {/* Reload button */}
                <Pressable
                  style={styles.floatingIconBtn}
                  onPress={() => {
                    setLoading(true);
                    setHasError(false);
                    fullscreenWebViewRef.current?.reload?.();
                  }}
                  hitSlop={6}
                >
                  <Ionicons name="reload-outline" size={16} color="#f8f7f2" />
                </Pressable>

                {/* External browser button */}
                <Pressable style={styles.floatingIconBtn} onPress={handleOpenExternal} hitSlop={6}>
                  <Ionicons name="open-outline" size={16} color="#f8f7f2" />
                </Pressable>
              </View>
            </View>
          )}
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
  fullscreenModalContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
    position: 'relative',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    gap: 8,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffcf5c',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#f8f7f2',
  },
  subtitle: {
    fontSize: 11.5,
    color: '#8b8e89',
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  iconBtnAccent: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffcf5c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceScrollWrap: {
    backgroundColor: '#0f1011',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: 7,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 7,
  },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 8,
  },
  sourceChipActive: {
    backgroundColor: 'rgba(255, 207, 92, 0.12)',
    borderColor: 'rgba(255, 207, 92, 0.4)',
  },
  sourceChipText: {
    color: '#aeb1ac',
    fontSize: 11.5,
    fontWeight: '600',
  },
  sourceChipTextActive: {
    color: '#ffcf5c',
    fontWeight: '700',
  },
  sourceBadge: {
    marginLeft: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  sourceBadgeActive: {
    backgroundColor: 'rgba(255, 207, 92, 0.2)',
  },
  sourceBadgeText: {
    fontSize: 9.5,
    color: '#8b8e89',
    fontWeight: '600',
  },
  sourceBadgeTextActive: {
    color: '#ffcf5c',
    fontWeight: '700',
  },
  serverScrollWrap: {
    backgroundColor: '#0a0b0c',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
    paddingVertical: 6,
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  serverLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#6b6e68',
    letterSpacing: 0.8,
    marginRight: 2,
  },
  serverChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  serverChipActive: {
    backgroundColor: 'rgba(255, 207, 92, 0.09)',
    borderColor: 'rgba(255, 207, 92, 0.35)',
  },
  serverChipText: {
    color: '#8b8e89',
    fontSize: 11,
    fontWeight: '500',
  },
  serverChipTextActive: {
    color: '#ffcf5c',
    fontWeight: '700',
  },
  serverBadge: {
    marginLeft: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  serverBadgeActive: {
    backgroundColor: 'rgba(255, 207, 92, 0.18)',
  },
  serverBadgeText: {
    fontSize: 8.5,
    color: '#717570',
    fontWeight: '600',
  },
  serverBadgeTextActive: {
    color: '#ffcf5c',
  },
  playerBox: {
    width: '100%',
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fallbackToast: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(20, 21, 23, 0.92)',
    borderWidth: 1,
    borderColor: '#ffcf5c',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    zIndex: 10,
  },
  fallbackToastText: {
    color: '#ffcf5c',
    fontSize: 12,
    fontWeight: '600',
  },
  overlayCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
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
  errorActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  retryBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  retryBtnText: {
    color: '#f8f7f2',
    fontSize: 12,
    fontWeight: '600',
  },
  floatingFullscreenBar: {
    position: 'absolute',
    top: 16,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  floatingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  floatingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  floatingCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 16, 18, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  floatingCloseText: {
    color: '#f8f7f2',
    fontSize: 12.5,
    fontWeight: '700',
  },
  floatingSourceBadge: {
    backgroundColor: 'rgba(255, 207, 92, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 207, 92, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  floatingSourceText: {
    color: '#ffcf5c',
    fontSize: 11.5,
    fontWeight: '700',
  },
  floatingIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 16, 18, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
