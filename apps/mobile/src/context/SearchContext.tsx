import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { TextInput } from 'react-native';
import { useRouter, usePathname } from 'expo-router';

interface SearchContextValue {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchInputRef: React.RefObject<TextInput | null>;
  focusSearchInput: () => void;
  clearSearch: () => void;
  submitSearch: (queryOverride?: string) => void;
}

const SearchContext = createContext<SearchContextValue | undefined>(undefined);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput | null>(null);

  const focusSearchInput = useCallback(() => {
    if (!pathname || !pathname.includes('explore')) {
      router.push('/explore' as any);
    }
    setTimeout(() => {
      searchInputRef.current?.blur();
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }, 50);
  }, [pathname, router]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const submitSearch = useCallback((queryOverride?: string) => {
    const q = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
    if (!pathname || !pathname.includes('explore')) {
      router.push('/explore' as any);
    }
  }, [searchQuery, pathname, router]);

  return (
    <SearchContext.Provider
      value={{
        searchQuery,
        setSearchQuery,
        searchInputRef,
        focusSearchInput,
        clearSearch,
        submitSearch,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
}
