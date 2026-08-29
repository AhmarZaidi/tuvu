import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { theme } from '../constants/theme';
import { api, DashboardEntry } from '../services/api';

interface CreateMediaModalProps {
  open: boolean;
  onClose: () => void;
  defaultType?: string;
  onMediaAdded?: () => void;
}

export function CreateMediaModal({
  open,
  onClose,
  defaultType = 'show',
  onMediaAdded,
}: CreateMediaModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DashboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.search(text.trim(), defaultType);
      setResults(res.results || []);
    } catch (e) {
      console.error('Search failed', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (item: DashboardEntry) => {
    setAddingId(item.mediaId);
    try {
      await api.addToLibrary(item.mediaId, 'watching');
      onMediaAdded?.();
      onClose();
    } catch (e) {
      console.error('Add failed', e);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Add {defaultType.toUpperCase()}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={theme.colors.textSubtle} />
            </Pressable>
          </View>

          {/* Search Box */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={theme.colors.textSubtle} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              placeholder={`Search ${defaultType} by title...`}
              placeholderTextColor={theme.colors.textSubtle}
              value={query}
              onChangeText={handleSearch}
              autoFocus
            />
            {query.length > 0 && (
              <Pressable onPress={() => handleSearch('')}>
                <Ionicons name="close-circle" size={16} color={theme.colors.textSubtle} />
              </Pressable>
            )}
          </View>

          {/* Search Results */}
          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="small" color={theme.colors.accent} />
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.mediaId}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => {
                const poster = item.posterPath
                  ? (item.posterPath.startsWith('http') ? item.posterPath : `https://image.tmdb.org/t/p/w185${item.posterPath}`)
                  : null;
                const isAdding = addingId === item.mediaId;

                return (
                  <View style={styles.resultItem}>
                    <View style={styles.thumb}>
                      {poster ? (
                        <Image source={{ uri: poster }} style={styles.thumbImg} contentFit="cover" />
                      ) : (
                        <Ionicons name="film-outline" size={18} color={theme.colors.textSubtle} />
                      )}
                    </View>
                    <View style={styles.resultMeta}>
                      <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
                      {item.year && <Text style={styles.resultYear}>{item.year}</Text>}
                    </View>
                    <Pressable
                      style={styles.addButton}
                      onPress={() => handleAdd(item)}
                      disabled={isAdding}
                    >
                      {isAdding ? (
                        <ActivityIndicator size="small" color={theme.colors.accentContrast} />
                      ) : (
                        <>
                          <Ionicons name="add" size={14} color={theme.colors.accentContrast} />
                          <Text style={styles.addButtonText}>Add</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                );
              }}
              ListEmptyComponent={
                query.trim().length >= 2 ? (
                  <View style={styles.centerBox}>
                    <Text style={styles.emptyText}>No matching titles found.</Text>
                  </View>
                ) : null
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#171819',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: 16,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.textStrong,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#101112',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
  },
  list: {
    paddingVertical: 4,
    gap: 8,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    gap: 10,
  },
  thumb: {
    width: 36,
    height: 54,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#1c1d1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  resultMeta: {
    flex: 1,
  },
  resultTitle: {
    color: theme.colors.textStrong,
    fontSize: 13,
    fontWeight: '700',
  },
  resultYear: {
    color: theme.colors.textSubtle,
    fontSize: 11,
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.xs,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  addButtonText: {
    color: theme.colors.accentContrast,
    fontSize: 12,
    fontWeight: '800',
  },
  centerBox: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.textSubtle,
    fontSize: 13,
  },
});
