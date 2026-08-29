import React, { useRef, useState } from 'react';
import { View, TextInput, StyleSheet, Pressable, Text, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

export type SortMode = 'updated' | 'title' | 'year' | 'progress';
export type DashboardLayoutMode = 'grid' | 'sections';

interface DashboardToolbarProps {
  search: string;
  onSearchChange: (text: string) => void;
  layoutMode: DashboardLayoutMode;
  onToggleLayoutMode: () => void;
  sortMode: SortMode;
  onSelectSort?: (mode: SortMode) => void;
  onCycleSort?: () => void;
  placeholder?: string;
}

interface SortOption {
  value: SortMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const sortOptions: SortOption[] = [
  { value: 'updated', label: 'Recently updated', icon: 'time-outline' },
  { value: 'title', label: 'Title', icon: 'list-outline' },
  { value: 'year', label: 'Release year', icon: 'calendar-outline' },
  { value: 'progress', label: 'Progress', icon: 'stats-chart-outline' },
];

export function DashboardToolbar({
  search,
  onSearchChange,
  layoutMode,
  onToggleLayoutMode,
  sortMode,
  onSelectSort,
  onCycleSort,
  placeholder = 'Filter shows...',
}: DashboardToolbarProps) {
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [dropdownCoords, setDropdownCoords] = useState<{ x: number; y: number }>({ x: 16, y: 150 });
  const buttonRef = useRef<View>(null);

  const activeOption = sortOptions.find((opt) => opt.value === sortMode) || sortOptions[0];

  const handleOpenMenu = () => {
    if (buttonRef.current) {
      buttonRef.current.measureInWindow((x, y, width, height) => {
        if (typeof x === 'number' && typeof y === 'number') {
          setDropdownCoords({
            x: Math.max(12, x),
            y: y + (height || 38) + 6,
          });
        }
        setDropdownVisible(true);
      });
    } else {
      setDropdownVisible(true);
    }
  };

  const handleSelect = (mode: SortMode) => {
    if (onSelectSort) {
      onSelectSort(mode);
    } else if (onCycleSort) {
      onCycleSort();
    }
    setDropdownVisible(false);
  };

  return (
    <View style={styles.container}>
      {/* 1. Sort Menu Button (Square with gold active icon) */}
      <View ref={buttonRef} collapsable={false}>
        <Pressable
          style={[styles.squareButton, dropdownVisible && styles.squareButtonActive]}
          onPress={handleOpenMenu}
          accessibilityLabel={`Sort: ${activeOption.label}`}
        >
          <Ionicons name={activeOption.icon} size={17} color={theme.colors.accent} />
        </Pressable>
      </View>

      {/* Floating Sort Dropdown Menu Modal */}
      <Modal
        visible={dropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setDropdownVisible(false)}>
          <View
            style={[
              styles.dropdownPanel,
              {
                top: dropdownCoords.y,
                left: dropdownCoords.x,
              },
            ]}
          >
            {sortOptions.map((opt) => {
              const isSelected = sortMode === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                  onPress={() => handleSelect(opt.value)}
                >
                  <Ionicons
                    name={opt.icon}
                    size={17}
                    color={isSelected ? theme.colors.accent : '#94a3b8'}
                    style={styles.dropdownIcon}
                  />
                  <Text style={[styles.dropdownText, isSelected && styles.dropdownTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* 2. In-Dashboard Search Pill (Squared off to match buttons) */}
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

      {/* 3. Main View Mode Toggle: Grid with Top Chips vs Horizontal Section Carousels */}
      <Pressable
        style={[styles.squareButton, layoutMode === 'sections' && styles.squareButtonActive]}
        onPress={onToggleLayoutMode}
        accessibilityLabel={layoutMode === 'grid' ? 'Switch to section carousels' : 'Switch to grid'}
      >
        <Ionicons
          name={layoutMode === 'grid' ? 'albums-outline' : 'grid-outline'}
          size={17}
          color={layoutMode === 'sections' ? theme.colors.accent : theme.colors.textSubtle}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    gap: 8,
    marginBottom: 12,
    zIndex: 10,
  },
  squareButton: {
    width: 38,
    height: 38,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  squareButtonActive: {
    backgroundColor: 'rgba(240, 168, 36, 0.12)',
    borderColor: 'rgba(240, 168, 36, 0.35)',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  dropdownPanel: {
    position: 'absolute',
    minWidth: 190,
    backgroundColor: '#191a1d',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 5,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 14,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginVertical: 1,
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(240, 168, 36, 0.09)',
  },
  dropdownIcon: {
    marginRight: 10,
  },
  dropdownText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '500',
  },
  dropdownTextActive: {
    color: theme.colors.accent,
    fontWeight: '600',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderRadius: theme.borderRadius.sm,
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
});
