import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Linking,
  ScrollView,
  StatusBar,
  BackHandler,
  Dimensions,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';
import { StreamSourceItem, StreamServer } from '../services/api';

const RNWebView: any = WebView;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
];

const getRandomUserAgent = () => {
  const idx = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[idx];
};

const SERVER_TIMEOUT_MS = 14000;
const SERVER_RETRY_TIMEOUT_MS = 7000;

interface EmbeddedStreamPlayerProps {
  url: string;
  provider?: string;
  title?: string;
  subtitle?: string;
  height?: number;
  sources?: StreamSourceItem[];
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

export function EmbeddedStreamPlayer({
  url: initialUrl,
  provider: initialProvider = 'videasy',
  title = 'Watch Stream',
  subtitle,
  height = 230,
  sources = [],
  onFullscreenChange,
}: EmbeddedStreamPlayerProps) {
  const { colors, isDark } = useAppTheme();
  // Source & Server State
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [activeServerIndex, setActiveServerIndex] = useState(0);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [keyCounter, setKeyCounter] = useState(0);
  const [currentUserAgent, setCurrentUserAgent] = useState(getRandomUserAgent);

  // Status & Fullscreen State
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [fallbackToast, setFallbackToast] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const webViewRef = useRef<any>(null);
  const controlsTimeoutRef = useRef<any>(null);
  const userInteractedRef = useRef<boolean>(false);
  const isVideoPlayingRef = useRef<boolean>(false);
  const isPlayerReadyRef = useRef<boolean>(false);
  const hasRetriedCurrentServerRef = useRef<boolean>(false);
  const serverTimeoutRef = useRef<any>(null);
  const serverRetryTimeoutRef = useRef<any>(null);

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

  // Lock orientation strictly to landscape and hide Android navigation bar / gesture pill in fullscreen
  useEffect(() => {
    if (isFullscreen) {
      if (Platform.OS === 'android') {
        NavigationBar.setVisibilityAsync('hidden').catch(() => {});
      }
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      const sub = ScreenOrientation.addOrientationChangeListener((event) => {
        const o = event.orientationInfo.orientation;
        if (
          isFullscreen &&
          o !== ScreenOrientation.Orientation.LANDSCAPE_LEFT &&
          o !== ScreenOrientation.Orientation.LANDSCAPE_RIGHT
        ) {
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
        }
      });
      return () => {
        ScreenOrientation.removeOrientationChangeListener(sub);
      };
    } else {
      if (Platform.OS === 'android') {
        NavigationBar.setVisibilityAsync('visible').catch(() => {});
      }
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
  }, [isFullscreen]);

  // Handle hardware back button in fullscreen
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
    };
  }, [isFullscreen]);

  const clearServerTimeouts = useCallback(() => {
    if (serverTimeoutRef.current) {
      clearTimeout(serverTimeoutRef.current);
      serverTimeoutRef.current = null;
    }
    if (serverRetryTimeoutRef.current) {
      clearTimeout(serverRetryTimeoutRef.current);
      serverRetryTimeoutRef.current = null;
    }
  }, []);

  const handleAutoFallback = useCallback(() => {
    clearServerTimeouts();
    userInteractedRef.current = false;
    isVideoPlayingRef.current = false;
    isPlayerReadyRef.current = false;
    hasRetriedCurrentServerRef.current = false;

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
  }, [activeServerIndex, activeServers, activeSourceIndex, sourceList, clearServerTimeouts]);

  const startServerTimeout = useCallback(() => {
    clearServerTimeouts();
    serverTimeoutRef.current = setTimeout(() => {
      // If user interacted with the webview, video is playing, or player container is ready, cancel auto-switch
      if (userInteractedRef.current || isVideoPlayingRef.current || isPlayerReadyRef.current) {
        return;
      }

      // First attempt: try home/reset once automatically
      if (!hasRetriedCurrentServerRef.current) {
        hasRetriedCurrentServerRef.current = true;
        setFallbackToast('Checking stream connectivity...');
        setTimeout(() => setFallbackToast(null), 2500);

        // Perform home action: re-init with randomized user-agent & fresh webview context
        setLoading(true);
        setHasError(false);
        setCurrentUserAgent(getRandomUserAgent());
        setKeyCounter((k) => k + 1);

        serverRetryTimeoutRef.current = setTimeout(() => {
          if (userInteractedRef.current || isVideoPlayingRef.current || isPlayerReadyRef.current) {
            return;
          }
          handleAutoFallback();
        }, SERVER_RETRY_TIMEOUT_MS);
        return;
      }

      // Second attempt failed: switch to next server
      handleAutoFallback();
    }, SERVER_TIMEOUT_MS);
  }, [clearServerTimeouts, handleAutoFallback]);

  // Restart timeout on url / server / source changes
  useEffect(() => {
    userInteractedRef.current = false;
    isVideoPlayingRef.current = false;
    isPlayerReadyRef.current = false;
    hasRetriedCurrentServerRef.current = false;
    startServerTimeout();

    return () => {
      clearServerTimeouts();
    };
  }, [currentUrl, startServerTimeout, clearServerTimeouts]);

  const handleSelectSource = (index: number) => {
    if (index === activeSourceIndex) return;
    clearServerTimeouts();
    userInteractedRef.current = false;
    isVideoPlayingRef.current = false;
    isPlayerReadyRef.current = false;
    hasRetriedCurrentServerRef.current = false;
    setActiveSourceIndex(index);
    setActiveServerIndex(0);
    const newSrc = sourceList[index];
    const initialSrvUrl = newSrc.servers && newSrc.servers.length > 0 ? newSrc.servers[0].url : newSrc.url;
    setCurrentUserAgent(getRandomUserAgent());
    setCurrentUrl(initialSrvUrl);
    setLoading(true);
    setHasError(false);
    setKeyCounter((k) => k + 1);
  };

  const handleSelectServer = (index: number) => {
    if (index === activeServerIndex) return;
    clearServerTimeouts();
    userInteractedRef.current = false;
    isVideoPlayingRef.current = false;
    isPlayerReadyRef.current = false;
    hasRetriedCurrentServerRef.current = false;
    setActiveServerIndex(index);
    const srv = activeServers[index];
    if (srv && srv.url) {
      setCurrentUserAgent(getRandomUserAgent());
      setCurrentUrl(srv.url);
      setLoading(true);
      setHasError(false);
      setKeyCounter((k) => k + 1);
    }
  };

  const toggleFullscreen = async () => {
    const nextState = !isFullscreen;
    setIsFullscreen(nextState);
    onFullscreenChange?.(nextState);
    if (nextState) {
      setShowControls(true);
      resetControlsTimer();
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    } else {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
  };

  const resetControlsTimer = () => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 2500);
  };

  // Reset to original stream link with randomizer & fresh context
  const handleResetToStream = (silent = false) => {
    clearServerTimeouts();
    userInteractedRef.current = false;
    isVideoPlayingRef.current = false;
    isPlayerReadyRef.current = false;
    hasRetriedCurrentServerRef.current = false;
    setLoading(true);
    setHasError(false);
    setCurrentUserAgent(getRandomUserAgent());
    if (!silent) {
      setFallbackToast('Resetting stream connection');
      setTimeout(() => setFallbackToast(null), 2500);
    }
    setCurrentUrl(activeServer.url || activeSource.url);
    setKeyCounter((k) => k + 1);
  };

  // Reload with cache clear and randomized user agent
  const handleReloadWithCacheClear = () => {
    clearServerTimeouts();
    userInteractedRef.current = false;
    isVideoPlayingRef.current = false;
    isPlayerReadyRef.current = false;
    hasRetriedCurrentServerRef.current = false;
    setLoading(true);
    setHasError(false);
    setCurrentUserAgent(getRandomUserAgent());
    setFallbackToast('Cache cleared & re-connecting');
    setTimeout(() => setFallbackToast(null), 2500);

    try {
      webViewRef.current?.injectJavaScript?.(`
        try {
          localStorage.clear();
          sessionStorage.clear();
          if (window.caches && caches.keys) {
            caches.keys().then(function(names) {
              for (var n = 0; n < names.length; n++) caches.delete(names[n]);
            });
          }
        } catch(e) {}
        true;
      `);
    } catch(e) {}

    setKeyCounter((k) => k + 1);
  };

  const handleOpenExternal = () => {
    Linking.openURL(currentUrl).catch(() => {});
  };

  const isDubSelected = (activeServer?.id || '').startsWith('dub') || (activeServer?.name || '').toLowerCase().includes('dub') || (currentUrl || '').toLowerCase().includes('dub');
  const targetServerType = isDubSelected ? 'dub' : 'sub';
  const targetServerCode = (activeServer?.name || '').toLowerCase().replace(/^(dub|sub)[:\s_-]*/i, '').replace(/[^a-z0-9]/g, '');

  // Injected JavaScript: isolates player on Anikoto & 7reels, enforces object-fit contain, and triggers Dub/Sub selection
  const injectedJS = `
    (function() {
      var expectedType = '${targetServerType}';
      var expectedServerCode = '${targetServerCode}';

      // Anti-bot detection masking
      try {
        Object.defineProperty(navigator, 'webdriver', { get: function() { return undefined; } });
        if (!window.chrome) {
          window.chrome = { runtime: {} };
        }
      } catch(e) {}

      // Anti-ad hijacking & popup blocking
      try {
        window.open = function() { return null; };
        window.onbeforeunload = null;
        if (window.top && window.top !== window.self) {
          try {
            window.top.onbeforeunload = null;
          } catch(e) {}
        }
      } catch(e) {}

      // 1. Post message to React Native on user interaction
      function reportTouch() {
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCREEN_TOUCH' }));
          }
        } catch(e) {}
      }

      window.addEventListener('click', reportTouch, true);
      window.addEventListener('touchstart', reportTouch, { passive: true, capture: true });
      window.addEventListener('pointerdown', reportTouch, { passive: true, capture: true });
      window.addEventListener('blur', function() {
        reportTouch();
      }, true);

      function attachIframeTouches() {
        var iframes = document.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
          try {
            var doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
            if (doc && !doc._tuvuTouchAttached) {
              doc._tuvuTouchAttached = true;
              doc.addEventListener('click', reportTouch, true);
              doc.addEventListener('touchstart', reportTouch, { passive: true, capture: true });
              doc.addEventListener('pointerdown', reportTouch, { passive: true, capture: true });
            }
          } catch(e) {}
        }
      }
      setInterval(attachIframeTouches, 1000);
      attachIframeTouches();

      // Video and player container readiness detection to disarm server fallback timer
      function checkPlayerReadiness() {
        try {
          // 1. Check for video element with metadata, duration, or stream loaded
          var allVideos = document.querySelectorAll('video');
          for (var i = 0; i < allVideos.length; i++) {
            var v = allVideos[i];
            if (
              v.currentTime > 0 ||
              !v.paused ||
              v.readyState >= 1 ||
              v.duration > 0 ||
              (v.src && v.src.length > 5) ||
              (v.currentSrc && v.currentSrc.length > 5)
            ) {
              if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PLAYER_READY' }));
              }
              return;
            }
          }

          // 2. Check for player container UIs or buttons
          var playerUIs = document.querySelectorAll(
            '.jwplayer, .plyr, .vjs-tech, .video-js, .art-video-player, .dplayer, #player, #w-player, #player-wrapper, .play-button, [data-plyr="play"], .vjs-big-play-button, .jw-display-icon-container, .vjs-poster, .vjs-control-bar'
          );
          if (playerUIs && playerUIs.length > 0) {
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PLAYER_READY' }));
            }
            return;
          }

          // 3. Check inside iframes as well
          var iframes = document.querySelectorAll('iframe');
          for (var j = 0; j < iframes.length; j++) {
            try {
              var idoc = iframes[j].contentDocument || iframes[j].contentWindow.document;
              if (idoc) {
                var iv = idoc.querySelectorAll('video');
                for (var k = 0; k < iv.length; k++) {
                  if (
                    iv[k].currentTime > 0 ||
                    !iv[k].paused ||
                    iv[k].readyState >= 1 ||
                    iv[k].duration > 0 ||
                    (iv[k].src && iv[k].src.length > 5) ||
                    (iv[k].currentSrc && iv[k].currentSrc.length > 5)
                  ) {
                    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PLAYER_READY' }));
                    }
                    return;
                  }
                }

                var iUIs = idoc.querySelectorAll(
                  '.jwplayer, .plyr, .vjs-tech, .video-js, .art-video-player, .dplayer, #player, #w-player, #player-wrapper, .play-button, [data-plyr="play"], .vjs-big-play-button, .jw-display-icon-container, .vjs-poster, .vjs-control-bar'
                );
                if (iUIs && iUIs.length > 0) {
                  if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PLAYER_READY' }));
                  }
                  return;
                }
              }
            } catch(e) {}
          }
        } catch(e) {}
      }
      setInterval(checkPlayerReadiness, 1000);
      checkPlayerReadiness();

      // 2. Global video fit rule & hide player's internal fullscreen button
      var globalStyle = document.getElementById('tuvu-global-fit-style');
      if (!globalStyle) {
        globalStyle = document.createElement('style');
        globalStyle.id = 'tuvu-global-fit-style';
        globalStyle.innerHTML = \`
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #000000 !important;
            overflow: hidden !important;
            width: 100% !important;
            height: 100% !important;
          }
          video {
            object-fit: contain !important;
            width: 100% !important;
            height: 100% !important;
            max-width: 100vw !important;
            max-height: 100vh !important;
          }
          .jwplayer, .plyr, .vjs-tech, .art-video-player, .dplayer-video, .video-js, iframe {
            max-width: 100vw !important;
            max-height: 100vh !important;
          }
          /* Hide in-player internal fullscreen buttons across all players */
          [data-plyr="fullscreen"],
          .vjs-fullscreen-control,
          .jw-icon-fullscreen,
          .jw-btn-fullscreen,
          .art-control-fullscreen,
          .dplayer-full-icon,
          .dplayer-full-in-icon,
          .dplayer-full,
          .fullscreen-btn,
          .btn-fullscreen,
          .fullscreen-button,
          .player-fullscreen,
          .jw-display-icon-fullscreen,
          .shaka-fullscreen-button,
          .plyr__controls__item--fullscreen,
          button[title*="ullscreen" i],
          button[title*="ull screen" i],
          button[aria-label*="ullscreen" i],
          button[aria-label*="ull screen" i],
          [class*="fullscreen-btn" i],
          [class*="btn-fullscreen" i],
          [class*="fullscreen-toggle" i],
          [class*="fullscreen-button" i] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }
        \`;
        document.head.appendChild(globalStyle);
      }

      // Continuously ensure video contain and hide in-player fullscreen buttons
      function hidePlayerFullscreenButtons(root) {
        try {
          var targetRoot = root || document;
          var buttons = targetRoot.querySelectorAll('button, [role="button"], a, div');
          for (var i = 0; i < buttons.length; i++) {
            var b = buttons[i];
            var title = (b.getAttribute('title') || '').toLowerCase();
            var aria = (b.getAttribute('aria-label') || '').toLowerCase();
            var cls = (b.className || '').toString().toLowerCase();
            if (
              title.includes('fullscreen') ||
              title.includes('full screen') ||
              aria.includes('fullscreen') ||
              aria.includes('full screen') ||
              cls.includes('fullscreen-btn') ||
              cls.includes('vjs-fullscreen') ||
              cls.includes('art-control-fullscreen') ||
              cls.includes('jw-icon-fullscreen') ||
              cls.includes('dplayer-full')
            ) {
              b.style.setProperty('display', 'none', 'important');
              b.style.setProperty('visibility', 'hidden', 'important');
              b.style.setProperty('pointer-events', 'none', 'important');
            }
          }
        } catch(e) {}
      }

      function applyVideoContain() {
        var videos = document.querySelectorAll('video');
        for (var v = 0; v < videos.length; v++) {
          videos[v].style.setProperty('object-fit', 'contain', 'important');
        }
      }

      function processIframes() {
        var iframes = document.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
          try {
            var doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
            if (doc) {
              hidePlayerFullscreenButtons(doc);
            }
          } catch(e) {}
        }
      }

      setInterval(function() {
        applyVideoContain();
        hidePlayerFullscreenButtons(document);
        processIframes();
      }, 500);
      applyVideoContain();
      hidePlayerFullscreenButtons(document);

      var isAnikoto = window.location.hostname.includes('anikoto');
      var is7reels = window.location.hostname.includes('7reels');

      function simulateRealClick(element) {
        if (!element) return;
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function(evtName) {
          try {
            var evt = new MouseEvent(evtName, {
              bubbles: true,
              cancelable: true,
              view: window,
              detail: 1,
              buttons: 1
            });
            element.dispatchEvent(evt);
          } catch(e) {}
        });
        try {
          if (typeof element.click === 'function') {
            element.click();
          }
        } catch(e) {}
        try {
          var jq = window.jQuery || window.$;
          if (jq) {
            jq(element).trigger('click');
          }
        } catch(e) {}
      }

      if (isAnikoto) {
        var style = document.getElementById('tuvu-anikoto-style');
        if (!style) {
          style = document.createElement('style');
          style.id = 'tuvu-anikoto-style';
          style.innerHTML = \`
            header, nav, footer, #wrapper > header, #menu, #quick-menu,
            #ani-seasons, #watch-order, #watch-second, #comments, #socials,
            .alert, #sign, #downloadModal, #w-report, .search-popup, .logo,
            .binfo, .rating, .watch-extra, aside:not(.main) {
              display: none !important;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #000000 !important;
              overflow: hidden !important;
            }
            #w-player {
              position: fixed !important;
              top: 0 !important;
              left: 0 !important;
              width: 100% !important;
              height: 100% !important;
              max-width: 100vw !important;
              max-height: 100vh !important;
              z-index: 999999 !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #000000 !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
            }
            #player-wrapper, #player, #player iframe {
              width: 100% !important;
              height: 100% !important;
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              border: none !important;
            }
          \`;
          document.head.appendChild(style);
        }

        // Simulate click on selected Anikoto server (DUB / SUB)
        var lastTargetHash = '';

        function handleAnikotoServerSelection() {
          var targetType = expectedType;
          var targetServerName = expectedServerCode;

          var typeBlock = document.querySelector('.servers .type[data-type="' + targetType + '"]');
          if (!typeBlock) return;

          var items = typeBlock.querySelectorAll('li');
          if (!items || items.length === 0) return;

          var targetItem = null;
          if (targetServerName) {
            for (var i = 0; i < items.length; i++) {
              var txt = (items[i].textContent || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              if (targetServerName.includes(txt) || txt.includes(targetServerName)) {
                targetItem = items[i];
                break;
              }
            }
          }
          if (!targetItem) {
            targetItem = items[0];
          }

          if (!targetItem) return;

          var linkId = targetItem.getAttribute('data-link-id') || '';
          var svId = targetItem.getAttribute('data-sv-id') || '';
          var selectionKey = targetType + '_' + svId + '_' + linkId;

          if (lastTargetHash !== selectionKey) {
            lastTargetHash = selectionKey;

            document.cookie = 'prefered_server_type=' + targetType + '; path=/;';
            if (svId) document.cookie = 'prefered_server_id=' + svId + '; path=/;';

            // Simulate real user click sequence on the server button
            simulateRealClick(targetItem);

            // Fetch Anikoto server AJAX endpoint as direct guarantee
            if (linkId) {
              try {
                fetch('/ajax/server?get=' + encodeURIComponent(linkId), {
                  headers: { 'X-Requested-With': 'XMLHttpRequest' }
                })
                  .then(function(r) { return r.json(); })
                  .then(function(res) {
                    if (res && res.status === 200 && res.result && res.result.url) {
                      var playerIframe = document.querySelector('#player iframe, iframe');
                      if (playerIframe && playerIframe.src !== res.result.url) {
                        playerIframe.src = res.result.url;
                      }
                    }
                  })
                  .catch(function() {});
              } catch(e) {}
            }
          }
        }

        setInterval(handleAnikotoServerSelection, 400);
        handleAnikotoServerSelection();
      }

      if (is7reels) {
        var style7 = document.getElementById('tuvu-7reels-style');
        if (!style7) {
          style7 = document.createElement('style');
          style7.id = 'tuvu-7reels-style';
          style7.innerHTML = \`
            header, nav, footer, .navbar, .nav-bar, #header, #footer,
            #disqus_thread, #smart-tv-controls, .related-shows, .sidebar,
            .back-btn, .back-button, a[href^="/tv/"], a[href^="/movie/"] {
              display: none !important;
            }
            html, body, #root {
              margin: 0 !important;
              padding: 0 !important;
              background: #000000 !important;
              overflow: hidden !important;
            }
          \`;
          document.head.appendChild(style7);
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

  // Safe navigation filter allowing all streaming CDNs and player embeds while blocking ad redirects
  const handleShouldStartLoad = (req: any) => {
    const u = (req.url || '').toLowerCase();
    // Always allow data:, blob:, and about:blank
    if (!u || u === 'about:blank' || u.startsWith('data:') || u.startsWith('blob:')) {
      return true;
    }

    // Block android intent / market hijackers
    if (u.startsWith('intent:') || u.startsWith('market:') || u.startsWith('vnd.youtube:')) {
      return false;
    }

    // Protect top frame from ad redirects and search engine hijacking
    if (req.isTopFrame) {
      if (
        u.includes('google.') ||
        u.includes('bing.com') ||
        u.includes('yahoo.com') ||
        u.includes('youtube.com') ||
        u.includes('youtu.be') ||
        u.includes('doubleclick') ||
        u.includes('adservice') ||
        u.includes('popads') ||
        u.includes('histats')
      ) {
        return false;
      }
    }

    // Allow all embed, CDN, and media requests
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

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'SCREEN_TOUCH') {
        userInteractedRef.current = true;
        clearServerTimeouts();
        if (isFullscreen) {
          setShowControls(true);
          resetControlsTimer();
        }
      } else if (data.type === 'VIDEO_PLAYING' || data.type === 'PLAYER_READY') {
        isPlayerReadyRef.current = true;
        clearServerTimeouts();
      }
    } catch {}
  };

  const webViewProps: any = {
    source: webViewSource,
    style: styles.webView,
    javaScriptEnabled: true,
    domStorageEnabled: true,
    allowsInlineMediaPlayback: true,
    allowsFullscreenVideo: false,
    mediaPlaybackRequiresUserAction: false,
    injectedJavaScript: injectedJS,
    injectedJavaScriptBeforeContentLoaded: `
      try {
        document.cookie = 'prefered_server_type=${targetServerType}; path=/;';
      } catch(e) {}
    `,
    onShouldStartLoadWithRequest: handleShouldStartLoad,
    onMessage: handleMessage,
    onOpenWindow: (syntheticEvent: any) => {
      syntheticEvent?.preventDefault?.();
    },
    onLoadStart: () => setLoading(true),
    onLoadEnd: () => {
      setLoading(false);
      // Verify player readiness 2s after load completion
      setTimeout(() => {
        if (!hasError) {
          webViewRef.current?.injectJavaScript?.(`
            try {
              var hasP = document.querySelector('video, iframe, #player, #w-player, .jwplayer, .plyr, .video-js, .art-video-player, .play-button');
              if (hasP && window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PLAYER_READY' }));
              }
            } catch(e) {}
            true;
          `);
        }
      }, 2000);
    },
    onError: () => {
      setLoading(false);
      handleAutoFallback();
    },
    setSupportMultipleWindows: false,
    nestedScrollEnabled: true,
    overScrollMode: 'never',
    userAgent: currentUserAgent,
  };

  return (
    <View style={isFullscreen ? styles.fullscreenContainer : [styles.container, { backgroundColor: isDark ? '#141517' : colors.card, borderColor: colors.cardBorder }]}>
      <StatusBar hidden={isFullscreen} />
      {Platform.OS === 'android' && <NavigationBar.NavigationBar hidden={isFullscreen} />}

      {/* Normal Mode Header */}
      {!isFullscreen && (
        <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
          <View style={styles.titleWrap}>
            <Text style={[styles.eyebrow, { color: isDark ? colors.accent : colors.accentDark }]}>STREAM PLAYER</Text>
            <Text style={[styles.title, { color: colors.textStrong }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle && (
              <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>

          <View style={styles.actionsRow}>
            {/* Reset to stream button */}
            <Pressable
              style={[styles.iconBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(34, 31, 25, 0.06)', borderColor: colors.border }]}
              onPress={() => handleResetToStream(false)}
              hitSlop={6}
              accessibilityLabel="Reset to stream"
            >
              <Ionicons name="home-outline" size={15} color={colors.textMuted} />
            </Pressable>

            {/* Reload button with cache clear & randomizer */}
            <Pressable
              style={[styles.iconBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(34, 31, 25, 0.06)', borderColor: colors.border }]}
              onPress={handleReloadWithCacheClear}
              hitSlop={6}
              accessibilityLabel="Reload with cache clear"
            >
              <Ionicons name="reload-outline" size={15} color={colors.textMuted} />
            </Pressable>

            {/* Fullscreen Button */}
            <Pressable style={[styles.iconBtnAccent, { backgroundColor: isDark ? colors.accent : colors.accentDark }]} onPress={toggleFullscreen} hitSlop={6}>
              <Ionicons name="expand" size={15} color={colors.accentContrast} />
            </Pressable>

            {/* External browser button */}
            <Pressable style={[styles.iconBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(34, 31, 25, 0.06)', borderColor: colors.border }]} onPress={handleOpenExternal} hitSlop={6}>
              <Ionicons name="open-outline" size={15} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      )}

      {/* Row 1: Primary Source Selector Chips */}
      {!isFullscreen && sourceList.length > 1 && (
        <View style={[styles.sourceScrollWrap, { backgroundColor: isDark ? '#0f1011' : colors.backgroundElevated, borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sourceRow}>
            {sourceList.map((src, idx) => {
              const isSelected = idx === activeSourceIndex;
              return (
                <Pressable
                  key={src.id || idx}
                  style={[
                    styles.sourceChip,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(34, 31, 25, 0.05)',
                      borderColor: colors.border,
                    },
                    isSelected && styles.sourceChipActive,
                  ]}
                  onPress={() => handleSelectSource(idx)}
                >
                  {isSelected && <Ionicons name="play" size={10} color={isDark ? colors.accent : colors.accentDark} style={{ marginRight: 4 }} />}
                  <Text style={[styles.sourceChipText, { color: colors.textMuted }, isSelected && [styles.sourceChipTextActive, { color: isDark ? colors.accent : colors.accentDark }]]}>
                    {src.name}
                  </Text>
                  {src.badge && (
                    <View style={[styles.sourceBadge, isSelected && styles.sourceBadgeActive]}>
                      <Text style={[styles.sourceBadgeText, isSelected && [styles.sourceBadgeTextActive, { color: isDark ? colors.accent : colors.accentDark }]]}>
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
      {!isFullscreen && activeServers.length > 1 && (
        <View style={[styles.serverScrollWrap, { backgroundColor: isDark ? '#0a0b0c' : colors.background, borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serverRow}>
            <Text style={[styles.serverLabel, { color: colors.textSubtle }]}>SERVER:</Text>
            {activeServers.map((srv, sIdx) => {
              const isServerActive = sIdx === activeServerIndex;
              return (
                <Pressable
                  key={srv.id || sIdx}
                  style={[
                    styles.serverChip,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(34, 31, 25, 0.04)',
                      borderColor: colors.border,
                    },
                    isServerActive && styles.serverChipActive,
                  ]}
                  onPress={() => handleSelectServer(sIdx)}
                >
                  <Text style={[styles.serverChipText, { color: colors.textSubtle }, isServerActive && [styles.serverChipTextActive, { color: isDark ? colors.accent : colors.accentDark }]]}>
                    {srv.name}
                  </Text>
                  {srv.badge && (
                    <View style={[styles.serverBadge, isServerActive && styles.serverBadgeActive]}>
                      <Text style={[styles.serverBadgeText, isServerActive && [styles.serverBadgeTextActive, { color: isDark ? colors.accent : colors.accentDark }]]}>
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

      {/* Persistent Single Embedded Player Box (Never unmounts on fullscreen toggle) */}
      <View
        style={[
          styles.playerBox,
          isFullscreen ? styles.playerBoxFullscreen : { height },
        ]}
        onTouchEnd={() => {
          if (isFullscreen) {
            setShowControls(true);
            resetControlsTimer();
          }
        }}
      >
        <RNWebView
          key={`webview-${keyCounter}-${activeSourceIndex}-${activeServerIndex}`}
          ref={webViewRef}
          {...webViewProps}
        />

        {/* Floating Controls HUD in Fullscreen Mode */}
        {isFullscreen && showControls && (
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
              <Pressable style={styles.floatingIconBtn} onPress={() => handleResetToStream(false)} hitSlop={6}>
                <Ionicons name="home-outline" size={16} color="#f8f7f2" />
              </Pressable>

              {/* Reload button with cache clear & randomizer */}
              <Pressable
                style={styles.floatingIconBtn}
                onPress={handleReloadWithCacheClear}
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
            <ActivityIndicator size={isFullscreen ? 'large' : 'small'} color={theme.colors.accent} />
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
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
    borderWidth: 0,
    borderRadius: 0,
    margin: 0,
    padding: 0,
    overflow: 'hidden',
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
  playerBoxFullscreen: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
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
    zIndex: 9999999,
    elevation: 9999999,
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
