import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '../constants/theme';
import { DashboardSection } from '../services/api';

interface SectionPillsProps {
  sections: DashboardSection[];
  activeSectionId: string;
  onSelectSection: (id: string) => void;
  totalTracked?: number;
  sectionCounts?: Record<string, number>;
}

export function SectionPills({
  sections,
  activeSectionId,
  onSelectSection,
  totalTracked,
  sectionCounts,
}: SectionPillsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scrollView}
      contentContainerStyle={styles.container}
    >
      {sections.map((section) => {
        const isActive = activeSectionId === section.id;
        const fallbackCount = section.entries?.length ?? 0;
        const count =
          section.id === 'all'
            ? totalTracked ?? fallbackCount
            : sectionCounts?.[section.id] ?? fallbackCount;

        return (
          <Pressable
            key={section.id}
            style={[styles.tabButton, isActive && styles.tabButtonActive]}
            onPress={() => onSelectSection(section.id)}
          >
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
              {section.label}
            </Text>
            {count > 0 && (
              <Text style={[styles.tabCount, isActive && styles.tabCountActive]}>
                {count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    maxHeight: 46,
    marginBottom: 8,
  },
  container: {
    paddingHorizontal: theme.spacing.md,
    gap: 6,
    alignItems: 'center',
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'transparent',
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#c9cac5',
  },
  tabTextActive: {
    color: '#fff4d3',
  },
  tabCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#858984',
  },
  tabCountActive: {
    color: theme.colors.accent,
  },
});
