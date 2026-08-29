import React from 'react';
import { View, TextInput, StyleSheet, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

export type SortMode = 'updated' | 'title' | 'year' | 'progress';

interface DashboardToolbarProps {
  search: string;
  onSearchChange: (text: string) => void;
  viewMode: 'grid' | 'compact';
  onToggleViewMode: () => void;
  sortMode: SortMode;
  onCycleSort: () => void;
  placeholder?: string;
}

const sortLabels: Record<SortMode, string> = {
  updated: 'Updated',
  title: 'Title',
  year: 'Year',
  progress: 'Progress',
};

export function DashboardToolbar({
  search,
  onSearchChange,
  viewMode,
  onToggleViewMode,
  sortMode,
  onCycleSort,
  placeholder = 'Filter shows...',
}: DashboardToolbarProps) {
  return (
    <View style={styles.container}>
      {/* 1. Sort Menu Button (Square with gold icon) */}
      <Pressable style={styles.sortButton} onPress={onCycleSort}>
        <Ionicons name="swap-vertical" size={17} color={theme.colors.accent} />
      </Pressable>

      {/* 2. In-Dashboard Search Pill */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={15} color={theme.colors.textSubtle} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textSubtle}
          value={search}
          onChangeText={onSearchChange}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <Pressable onPress={() => onSearchChange('')} hitSlop={8}>
            <Ionicons name="close-circle" size={15} color={theme.colors.textSubtle} />
          </Pressable>
        )}
      </View>

      {/* 3. View Mode Toggle (Grid vs List) */}
      <View style={styles.viewToggleGroup}>
        <Pressable
          style={[styles.viewToggleButton, viewMode === 'grid' && styles.viewToggleActive]}
          onPress={() => viewMode !== 'grid' && onToggleViewMode()}
        >
          <Ionicons
            name="grid"
            size={16}
            color={viewMode === 'grid' ? theme.colors.accent : theme.colors.textSubtle}
          />
        </Pressable>
        <Pressable
          style={[styles.viewToggleButton, viewMode === 'compact' && styles.viewToggleActive]}
          onPress={() => viewMode !== 'compact' && onToggleViewMode()}
        >
          <Ionicons
            name="list"
            size={16}
            color={viewMode === 'compact' ? theme.colors.accent : theme.colors.textSubtle}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    gap: 8,
    marginBottom: 10,
  },
  sortButton: {
    width: 38,
    height: 38,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    height: 38,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    height: '100%',
  },
  viewToggleGroup: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  viewToggleButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
  },
});
