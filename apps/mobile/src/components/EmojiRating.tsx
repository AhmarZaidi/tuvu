import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { theme } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';

interface EmojiRatingProps {
  value: number | null;
  onChange: (rating: number | null) => void;
  label?: string;
}

const RATING_EMOJIS = ['😐', '🙂', '😄', '😍', '🤩'];
const RATING_LABELS: Record<number, string> = {
  1: 'Meh (1/5)',
  2: 'Fine (2/5)',
  3: 'Good (3/5)',
  4: 'Great (4/5)',
  5: 'Masterpiece (5/5)',
};

export function EmojiRating({ value, onChange, label = 'Your rating' }: EmojiRatingProps) {
  const { colors, isDark } = useAppTheme();
  const normalized = value ? Math.min(5, Math.max(1, value)) : null;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.emojiRow}>
        {RATING_EMOJIS.map((emoji, index) => {
          const rating = index + 1;
          const isSelected = normalized === rating;

          return (
            <Pressable
              key={rating}
              style={[
                styles.emojiButton,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(34, 31, 25, 0.06)',
                  borderColor: colors.border,
                },
                isSelected && [
                  styles.emojiButtonActive,
                  {
                    backgroundColor: isDark ? 'rgba(255, 191, 71, 0.18)' : 'rgba(240, 168, 36, 0.22)',
                    borderColor: isDark ? colors.accent : colors.accentDark,
                  },
                ],
              ]}
              onPress={() => onChange(isSelected ? null : rating)}
              hitSlop={6}
            >
              <Text style={styles.emojiText}>{emoji}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.statusText, { color: colors.textSubtle }]}>
        {normalized ? RATING_LABELS[normalized] : 'Not rated'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8b8e89',
    marginBottom: 6,
  },
  emojiRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  emojiButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiButtonActive: {
    backgroundColor: 'rgba(255, 191, 71, 0.18)',
    borderColor: theme.colors.accent,
    transform: [{ scale: 1.08 }],
  },
  emojiText: {
    fontSize: 19,
  },
  statusText: {
    fontSize: 11,
    color: '#aeb1ac',
    marginTop: 5,
  },
});
