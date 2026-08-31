import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Linking,
  ScrollView,
  Dimensions,
  StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { StreamSourceItem } from '../services/api';

const RNWebView: any = WebView;

interface EmbeddedStreamPlayerProps {
  url: string;
  provider?: string;
  title?: string;
  subtitle?: string;
  height?: number;
  sources?: StreamSourceItem[];
}

// Injected CSS for 7reels to isolate and maximize only the video player
const INJECTED_CSS_7REELS = `
  header, nav, footer, .top-bar, .header, .back-btn, .back-button, .search-bar,
  .related-shows, .sidebar, .navbar, .nav-bar, #header, #footer {
    display: none !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background: #000 !important;
    overflow: hidden !important;
  }
  #root, .player-container, .video-wrap, iframe, video {
    width: 100vw !important;
    height: 100vh !important;
    max-width: 100vw !important;
    max-height: 100vh !important;
    margin: 0 !important;
    padding: 0 !important;
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
  }
`;

// Injected CSS for anikoto to isolate only the player container
const INJECTED_CSS_ANIKOTO = `
  header, footer, nav, #header, #footer, .sidebar, .watch-second, .watch-order,
  .comment-box, .anime-related, #disqus_thread, .sidebar-section, .w2g-create,
  #w2g-create, .announcement, .alert, .header-bottom, .navbar {
    display: none !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background: #000 !important;
    overflow: hidden !important;
  }
  #watch-main, .watch-wrap, .watch-container, #w-player, #player-wrapper, #player, iframe, video {
    width: 100vw !important;
    height: 100vh !important;
    max-width: 100vw !important;
    max-height: 100vh !important;
    margin: 0 !important;
    padding: 0 !important;
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    z-index: 99999 !important;
  }
`;

// Injected CSS for other standard embed providers (VidSrc, AutoEmbed, Archive)
const INJECTED_CSS_GENERIC = `
  html, body, #player, .player, iframe, video {
    margin: 0 !important;
    padding: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background: #000 !important;
    overflow: hidden !important;
  }
`;

export function EmbeddedStreamPlayer({
  url: initialUrl,
  provider: initialProvider = '7reels',
  title = 'Watch Stream',
  subtitle,
  height = 230,
  sources = [],
}: EmbeddedStreamPlayerProps) {
  // Source State
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [keyCounter, setKeyCounter] = useState(0);

  // Status & Fullscreen State
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [fallbackToast, setFallbackToast] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const webViewRef = useRef<any>(null);
  const controlsTimeoutRef = useRef<any>(null);

  // Normalize source list
  const sourceList = sources.length > 0 ? sources : [{ id: 'default', name: initialProvider, url: initialUrl, provider: initialProvider }];
  const activeSource = sourceList[activeSourceIndex] || sourceList[0];

  useEffect(() => {
    if (sources.length > 0 && sources[activeSourceIndex]) {
      setCurrentUrl(sources[activeSourceIndex].url);
    } else {
      setCurrentUrl(initialUrl);
    }
  }, [initialUrl, sources, activeSourceIndex]);

  // Clean up orientation when unmounting
  useEffect(() => {
    return () => {
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, []);

  const handleSelectSource = (index: number) => {
    if (index === activeSourceIndex) return;
    setActiveSourceIndex(index);
    setCurrentUrl(sourceList[index].url);
    setLoading(true);
    setHasError(false);
    setKeyCounter((k) => k + 1);
  };

  const handleAutoFallback = useCallback(() => {
    if (activeSourceIndex < sourceList.length - 1) {
      const nextIdx = activeSourceIndex + 1;
      const nextSrc = sourceList[nextIdx];
      setFallbackToast(`Switched to fallback: ${nextSrc.name}`);
      setTimeout(() => setFallbackToast(null), 3500);
      handleSelectSource(nextIdx);
    } else {
      setHasError(true);
    }
  }, [activeSourceIndex, sourceList]);

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
    }, 3800);
  };

  const handleScreenTouch = () => {
    if (isFullscreen) {
      resetControlsTimer();
    }
  };

  // Reset to original stream link
  const handleResetToStream = () => {
    setLoading(true);
    setHasError(false);
    setCurrentUrl(activeSource.url);
    setKeyCounter((k) => k + 1);
  };

  const handleOpenExternal = () => {
    Linking.openURL(currentUrl).catch(() => {});
  };

  const isAnikoto = activeSource.provider === 'anikoto' || currentUrl.includes('anikototv');
  const is7reels = activeSource.provider === '7reels' || currentUrl.includes('7reels');

  const injectedCSS = isAnikoto ? INJECTED_CSS_ANIKOTO : is7reels ? INJECTED_CSS_7REELS : INJECTED_CSS_GENERIC;

  const injectedJS = `
    (function() {
      // 1. Neutralize popups and redirects
      window.open = function() { return null; };
      window.alert = function() {};
      window.confirm = function() { return true; };
      window.prompt = function() { return null; };

      // 2. Inject fit CSS
      var style = document.getElementById('tuvu-embed-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'tuvu-embed-style';
        style.innerHTML = \`${injectedCSS}\`;
        document.head.appendChild(style);
      }

      // 3. Remove fake overlay clickjackers every 500ms
      var clearAds = function() {
        var bads = document.querySelectorAll('div[style*="z-index: 9999"], div[style*="z-index:9999"], a[target="_blank"], .ad-overlay, .pop-overlay, #disqus_thread');
        bads.forEach(function(el) { el.remove(); });
      };
      setInterval(clearAds, 500);

      // 4. Auto-scroll to player container
      setTimeout(function() {
        var player = document.getElementById('w-player') || document.getElementById('player') || document.querySelector('.player') || document.querySelector('video') || document.querySelector('iframe');
        if (player) {
          player.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
      }, 500);
    })();
    true;
  `;

  // Safe navigation filter to prevent Google / ad redirects
  const handleShouldStartLoad = (req: any) => {
    const u = req.url.toLowerCase();
    if (u === 'about:blank' || u.startsWith('data:') || u.startsWith('blob:')) return true;

    // Check if domain is allowed stream provider / cdn / recaptcha
    const allowed = [
      '7reels.cc',
      'anikototv.to',
      'vidsrc',
      'embed.su',
      'autoembed.cc',
      'multiembed.mov',
      'superembed.stream',
      'archive.org',
      'youtube.com',
      'youtu.be',
      'hianime.to',
      'anipixcdn.co',
      'tmdb-image-prod',
      'cloudflare',
      'recaptcha',
      'gstatic.com',
    ];

    const isMatch = allowed.some((domain) => u.includes(domain));
    if (isMatch) {
      return true;
    }

    // Block unknown / redirect domains (like google search, ad redirectors)
    return false;
  };

  const webViewProps: any = {
    source: { uri: currentUrl },
    style: styles.webView,
    javaScriptEnabled: true,
    domStorageEnabled: true,
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: false,
    injectedJavaScript: injectedJS,
    injectedJavaScriptBeforeContentLoaded: `
      window.open = function() { return null; };
    `,
    onShouldStartLoadWithRequest: handleShouldStartLoad,
    onLoadStart: () => setLoading(true),
    onLoadEnd: () => setLoading(false),
    onError: () => {
      setLoading(false);
      handleAutoFallback();
    },
    setSupportMultipleWindows: false,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  return (
    <View style={[styles.container, isFullscreen && styles.fullscreenContainer]}>
      {/* Normal Mode Header (hidden in Fullscreen mode) */}
      {!isFullscreen && (
        <>
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

          {/* Horizontal Source Selector Chips */}
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
        </>
      )}

      {/* Embedded Video Player Box (Single continuous WebView) */}
      <View
        style={[styles.playerBox, isFullscreen ? styles.playerBoxFullscreen : { height }]}
        onTouchEnd={handleScreenTouch}
      >
        <RNWebView key={`webview-${keyCounter}-${activeSourceIndex}`} ref={webViewRef} {...webViewProps} />

        {/* Fallback Toast Banner */}
        {fallbackToast && (
          <View style={styles.fallbackToast}>
            <Ionicons name="swap-horizontal" size={14} color="#ffcf5c" />
            <Text style={styles.fallbackToastText}>{fallbackToast}</Text>
          </View>
        )}

        {/* Loading Overlay */}
        {loading && (
          <View style={styles.overlayCenter}>
            <ActivityIndicator size="small" color={theme.colors.accent} />
            <Text style={styles.overlayText}>Connecting to {activeSource.name}...</Text>
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

        {/* Floating Controls Overlay in Fullscreen Mode */}
        {isFullscreen && showControls && (
          <View style={styles.floatingFullscreenBar}>
            <View style={styles.floatingLeft}>
              <Pressable style={styles.floatingCloseBtn} onPress={toggleFullscreen}>
                <Ionicons name="contract" size={16} color="#f8f7f2" />
                <Text style={styles.floatingCloseText}>Exit Fullscreen</Text>
              </Pressable>

              <View style={styles.floatingSourceBadge}>
                <Text style={styles.floatingSourceText}>{activeSource.name}</Text>
              </View>
            </View>

            <View style={styles.floatingRight}>
              {/* Reset to stream link button */}
              <Pressable style={styles.floatingIconBtn} onPress={handleResetToStream} hitSlop={6}>
                <Ionicons name="home-outline" size={16} color="#f8f7f2" />
              </Pressable>

              {/* Reload button */}
              <Pressable
                style={styles.floatingIconBtn}
                onPress={() => {
                  setLoading(true);
                  setHasError(false);
                  webViewRef.current?.reload?.();
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
  fullscreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
    backgroundColor: '#000',
    borderWidth: 0,
    borderRadius: 0,
    marginBottom: 0,
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
  playerBox: {
    width: '100%',
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  playerBoxFullscreen: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  webView: {
    flex: 1,
    backgroundColor: '#000',
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
    backgroundColor: '#000',
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
    top: 14,
    left: 14,
    right: 14,
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
    backgroundColor: 'rgba(20, 21, 23, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
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
    paddingHorizontal: 8,
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
    backgroundColor: 'rgba(20, 21, 23, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
