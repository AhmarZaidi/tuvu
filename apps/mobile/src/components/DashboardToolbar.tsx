import React from 'react';
import { View, TextInput, StyleSheet, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

export type SortMode = 'updated' | 'title' | 'year' | 'rating';

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
  rating: 'Rating',
};

export function DashboardToolbar({
  search,
  onSearchChange,
  viewMode,
  onToggleViewMode,
  sortMode,
  onCycleSort,
  placeholder = 'Filter dashboard...',
}: DashboardToolbarProps) {
  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={theme.colors.textSubtle} style={styles.searchIcon} />
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
            <Ionicons name="close-circle" size={16} color={theme.colors.textSubtle} />
          </Pressable>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.actionButton} onPress={onCycleSort}>
          <Ionicons name="swap-vertical" size={15} color={theme.colors.accent} />
          <Text style={styles.actionText}>{sortLabels[sortMode]}</Text>
        </Pressable>

        <Pressable style={styles.iconButton} onPress={onToggleViewMode}>
          <Ionicons
            name={viewMode === 'grid' ? 'grid-outline' : 'list-outline'}
            size={18}
            color={theme.colors.textStrong}
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
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 10,
    height: 38,
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textStrong,
  },
  iconButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.borderRadius.sm,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
