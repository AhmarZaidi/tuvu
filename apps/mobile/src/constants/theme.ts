export interface ThemeColors {
  background: string;
  backgroundElevated: string;
  backgroundPanel: string;
  surface: string;
  surfaceGlass: string;
  card: string;
  cardBorder: string;
  cardBorderStrong: string;
  accent: string;
  accentDark: string;
  accentContrast: string;
  text: string;
  textStrong: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  borderStrong: string;
  inputBg: string;
  danger: string;
  notification: string;
  isDark: boolean;
  status: {
    watching: { bg: string; text: string };
    planned: { bg: string; text: string };
    complete: { bg: string; text: string };
    paused: { bg: string; text: string };
    stopped: { bg: string; text: string };
  };
}

export const darkColors: ThemeColors = {
  background: '#101112',
  backgroundElevated: '#171819',
  backgroundPanel: 'rgba(16, 17, 18, 0.92)',
  surface: '#171819',
  surfaceGlass: 'rgba(255, 255, 255, 0.055)',
  card: '#171819',
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  cardBorderStrong: 'rgba(255, 255, 255, 0.12)',
  accent: '#ffcf5c',
  accentDark: '#ffbf47',
  accentContrast: '#1d1505',
  text: '#f8f7f2',
  textStrong: '#fff8e8',
  textMuted: '#b9bbb8',
  textSubtle: '#8f938e',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',
  inputBg: 'rgba(255, 255, 255, 0.05)',
  danger: '#ff6b6b',
  notification: '#ff2339',
  isDark: true,
  status: {
    watching: { bg: 'rgba(255, 207, 92, 0.15)', text: '#ffcf5c' },
    planned: { bg: 'rgba(255, 255, 255, 0.08)', text: '#b9bbb8' },
    complete: { bg: 'rgba(80, 200, 120, 0.15)', text: '#6ee7b7' },
    paused: { bg: 'rgba(251, 146, 60, 0.15)', text: '#fb923c' },
    stopped: { bg: 'rgba(239, 68, 68, 0.15)', text: '#fca5a5' },
  },
};

export const lightColors: ThemeColors = {
  background: '#f7f3ea',
  backgroundElevated: '#fffdf8',
  backgroundPanel: 'rgba(255, 253, 248, 0.96)',
  surface: '#fffdf8',
  surfaceGlass: 'rgba(255, 253, 248, 0.9)',
  card: '#ffffff',
  cardBorder: 'rgba(34, 31, 25, 0.14)',
  cardBorderStrong: 'rgba(34, 31, 25, 0.28)',
  accent: '#f0a824',
  accentDark: '#d48d14',
  accentContrast: '#1d1505',
  text: '#1d1a15',
  textStrong: '#0d0b08',
  textMuted: '#4a4337',
  textSubtle: '#6f6658',
  border: 'rgba(34, 31, 25, 0.14)',
  borderStrong: 'rgba(34, 31, 25, 0.24)',
  inputBg: '#ffffff',
  danger: '#e03e3e',
  notification: '#d91d30',
  isDark: false,
  status: {
    watching: { bg: 'rgba(240, 168, 36, 0.2)', text: '#996300' },
    planned: { bg: 'rgba(34, 31, 25, 0.08)', text: '#4a4337' },
    complete: { bg: 'rgba(46, 139, 87, 0.18)', text: '#1b6b3e' },
    paused: { bg: 'rgba(217, 119, 6, 0.18)', text: '#9a4700' },
    stopped: { bg: 'rgba(220, 38, 38, 0.18)', text: '#991b1b' },
  },
};

export const theme = {
  colors: darkColors,
  spacing: {
    xs: 4,
    sm: 8,
    md: 14,
    lg: 20,
    xl: 28,
  },
  borderRadius: {
    xs: 4,
    sm: 6,
    md: 8,
    lg: 14,
    pill: 9999,
  },
};
