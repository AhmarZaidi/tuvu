import { useEffect, useCallback } from 'react';
import { BackHandler } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * Hook to handle both hardware/gesture Android back navigation
 * and programmatic back navigation to a safe fallback parent route.
 */
export function useSubpageBack(fallbackParent = '/(tabs)', forceParent = false) {
  const router = useRouter();

  const handleBack = useCallback(() => {
    if (forceParent) {
      router.replace(fallbackParent as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackParent as any);
    }
    return true; // Stop default OS back action
  }, [router, fallbackParent, forceParent]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [handleBack]);

  return handleBack;
}
