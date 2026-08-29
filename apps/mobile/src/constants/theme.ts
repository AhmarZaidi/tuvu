export const theme = {
  colors: {
    background: '#101112',       // deep slate / charcoal
    surface: '#171819',          // elevated panel
    surfaceGlass: 'rgba(255, 255, 255, 0.055)',
    card: '#171819',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    cardBorderStrong: 'rgba(255, 255, 255, 0.12)',
    
    // Iconic Tuvu Warm Yellow/Gold Accent (TV Time style)
    accent: '#ffcf5c',
    accentDark: '#ffbf47',
    accentContrast: '#1d1505',   // deep charcoal text on yellow buttons
    
    // Text tokens from web
    text: '#f8f7f2',             // warm off-white
    textStrong: '#fff8e8',       // bright warm ivory
    textMuted: '#b9bbb8',        // secondary text
    textSubtle: '#8f938e',       // hints, captions
    
    // Status Tones (matching web status chips)
    status: {
      watching: { bg: 'rgba(255, 207, 92, 0.15)', text: '#ffcf5c' },
      planned: { bg: 'rgba(255, 255, 255, 0.08)', text: '#b9bbb8' },
      complete: { bg: 'rgba(80, 200, 120, 0.15)', text: '#6ee7b7' },
      paused: { bg: 'rgba(251, 146, 60, 0.15)', text: '#fb923c' },
      stopped: { bg: 'rgba(239, 68, 68, 0.15)', text: '#fca5a5' },
    },

    danger: '#ff6b6b',
    notification: '#ff2339',
    border: 'rgba(255, 255, 255, 0.08)',
    inputBg: '#171819',
  },
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
    md: 8,                       // 0.5rem from web
    lg: 14,                      // 0.85rem panel from web
    pill: 9999,
  },
};
