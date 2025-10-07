
import { useState, useEffect, useCallback } from 'react';

const FAVORITES_STORAGE_KEY = 'horoscope:favorites:v1';
const HOME_FAVORITES_STORAGE_KEY = 'horoscope:home-favorites:v1';

interface HoroscopeData {
  id: number;
  source: {
    id: number;
    name: string;
    domain: string;
    logo_url: string | null;
    reliability_score: number;
  };
  [key: string]: any;
}

// Hook for managing home page sign favorites
export function useHomeFavorites() {
  const [homeFavorites, setHomeFavorites] = useState<Set<string>>(new Set());

  // Load home favorites from localStorage on mount
  useEffect(() => {
    const loadHomeFavorites = () => {
      try {
        const stored = localStorage.getItem(HOME_FAVORITES_STORAGE_KEY);
        if (stored) {
          const favorites = JSON.parse(stored);
          setHomeFavorites(new Set(favorites));
        }
      } catch (error) {
        console.warn('Failed to load home favorites:', error);
      }
    };

    loadHomeFavorites();

    // Listen for storage changes from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === HOME_FAVORITES_STORAGE_KEY) {
        loadHomeFavorites();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Save home favorites to localStorage
  const saveHomeFavorites = useCallback((newFavorites: Set<string>) => {
    try {
      localStorage.setItem(HOME_FAVORITES_STORAGE_KEY, JSON.stringify([...newFavorites]));
      setHomeFavorites(newFavorites);
    } catch (error) {
      console.warn('Failed to save home favorites:', error);
    }
  }, []);

  // Check if a sign is favorited on home page
  const isHomeFavorite = useCallback((signEnglish: string): boolean => {
    return homeFavorites.has(signEnglish);
  }, [homeFavorites]);

  // Toggle home favorite status
  const toggleHomeFavorite = useCallback((signEnglish: string) => {
    const newFavorites = new Set(homeFavorites);
    if (newFavorites.has(signEnglish)) {
      newFavorites.delete(signEnglish);
    } else {
      newFavorites.add(signEnglish);
    }
    saveHomeFavorites(newFavorites);
  }, [homeFavorites, saveHomeFavorites]);

  return {
    homeFavorites,
    isHomeFavorite,
    toggleHomeFavorite,
    hasFavorites: homeFavorites.size > 0
  };
}

// Global favorites hook - applies to all signs and both daily/weekly tabs
// Note: signEnglish parameter is kept for backwards compatibility but not used
// Favorites are stored globally by source ID and persist across all signs and tabs
export function useFavorites(signEnglish?: string) {
  const [favorites, setFavorites] = useState<number[]>([]);

  // Load favorites from localStorage on mount
  useEffect(() => {
    const loadFavorites = () => {
      try {
        const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          
          // Handle migration from old per-sign format to global format
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            // Old format - extract all unique source IDs and migrate
            const allSourceIds = new Set<number>();
            Object.values(data).forEach((signData: any) => {
              if (signData && signData.pinnedSourceIds) {
                signData.pinnedSourceIds.forEach((id: number) => allSourceIds.add(id));
              }
            });
            const migratedFavorites = Array.from(allSourceIds);
            
            // Save in new format
            localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(migratedFavorites));
            setFavorites(migratedFavorites);
          } else if (Array.isArray(data)) {
            // New format - already an array of source IDs
            setFavorites(data);
          }
        }
      } catch (error) {
        console.warn('Failed to load favorites from localStorage:', error);
      }
    };

    loadFavorites();

    // Listen for storage changes from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === FAVORITES_STORAGE_KEY) {
        loadFavorites();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Save favorites to localStorage
  const saveFavorites = useCallback((newFavorites: number[]) => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(newFavorites));
      setFavorites(newFavorites);
    } catch (error) {
      console.warn('Failed to save favorites to localStorage:', error);
    }
  }, []);

  // Check if a source is favorited
  const isFavorite = useCallback((sourceId: number): boolean => {
    return favorites.includes(sourceId);
  }, [favorites]);

  // Toggle favorite status
  const toggleFavorite = useCallback((sourceId: number) => {
    const newFavorites = isFavorite(sourceId)
      ? favorites.filter(id => id !== sourceId)
      : [...favorites, sourceId];
    
    saveFavorites(newFavorites);
  }, [favorites, isFavorite, saveFavorites]);

  // Reorder horoscopes to show pinned sources first
  const reorderSources = useCallback((horoscopes: HoroscopeData[]): HoroscopeData[] => {
    if (favorites.length === 0) {
      return horoscopes;
    }

    const pinned: HoroscopeData[] = [];
    const regular: HoroscopeData[] = [];

    // Separate pinned and regular sources
    horoscopes.forEach(horoscope => {
      if (favorites.includes(horoscope.source.id)) {
        pinned.push(horoscope);
      } else {
        regular.push(horoscope);
      }
    });

    // Sort pinned sources by their order in favorites array (user's preference)
    pinned.sort((a, b) => {
      const indexA = favorites.indexOf(a.source.id);
      const indexB = favorites.indexOf(b.source.id);
      return indexA - indexB;
    });

    // Return pinned first, then regular (both maintain their internal order)
    return [...pinned, ...regular];
  }, [favorites]);

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    reorderSources,
    hasFavorites: favorites.length > 0
  };
}
