import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '../constants/theme';
import { DashboardSection } from '../services/api';

interface SectionPillsProps {
  sections: DashboardSection[];
  activeSectionId: string;
  onSelectSection: (id: string) => void;
}

export function SectionPills({ sections, activeSectionId, onSelectSection }: SectionPillsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scrollView}
      contentContainerStyle={styles.container}
    >
      {sections.map((section) => {
        const isActive = activeSectionId === section.id;
        const count = section.entries?.length ?? 0;
        return (
          <Pressable
            key={section.id}
            style={[styles.pill, isActive && styles.pillActive]}
            onPress={() => onSelectSection(section.id)}
          >
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
              {section.label}
            </Text>
            {count > 0 && (
              <View style={[styles.badge, isActive && styles.badgeActive]}>
                <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>
                  {count}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    maxHeight: 44,
    marginBottom: 8,
  },
  container: {
    paddingHorizontal: theme.spacing.md,
    gap: 8,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 6,
  },
  pillActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  pillTextActive: {
    color: theme.colors.accentContrast,
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: theme.borderRadius.pill,
  },
  badgeActive: {
    backgroundColor: 'rgba(29, 21, 5, 0.2)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textSubtle,
  },
  badgeTextActive: {
    color: theme.colors.accentContrast,
  },
});
