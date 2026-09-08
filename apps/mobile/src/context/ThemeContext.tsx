import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { theme as baseTheme, darkColors, lightColors, ThemeColors } from '../constants/theme';
import { api } from '../services/api';

type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextType {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
  gradientIntensity: number;
  setGradientIntensity: (intensity: number) => Promise<void>;
  theme: typeof baseTheme & { colors: ThemeColors };
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'dark',
  colors: darkColors,
  isDark: true,
  setMode: async () => {},
  gradientIntensity: 0.2,
  setGradientIntensity: async () => {},
  theme: { ...baseTheme, colors: darkColors },
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [gradientIntensity, setGradientIntensityState] = useState<number>(0.2);

  // Load server appearance settings on mount
  useEffect(() => {
    api.getAppearanceSettings()
      .then((res) => {
        if (res.appearance?.theme) {
          setModeState(res.appearance.theme);
        }
        if (typeof res.appearance?.gradientIntensity === 'number') {
          setGradientIntensityState(res.appearance.gradientIntensity);
        }
      })
      .catch(() => {});
  }, []);

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const colors = isDark ? darkColors : lightColors;

  const setMode = async (newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      await api.updateAppearanceSettings(newMode, gradientIntensity);
    } catch {
      // Offline fallback
    }
  };

  const setGradientIntensity = async (newIntensity: number) => {
    setGradientIntensityState(newIntensity);
    try {
      await api.updateAppearanceSettings(mode, newIntensity);
    } catch {
      // Offline fallback
    }
  };

  const currentTheme = {
    ...baseTheme,
    colors,
  };

  return (
    <ThemeContext.Provider
      value={{
        mode,
        colors,
        isDark,
        setMode,
        gradientIntensity,
        setGradientIntensity,
        theme: currentTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
