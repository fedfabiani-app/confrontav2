
import { useState, useCallback } from 'react';

const COLLAPSED_STORAGE_KEY = 'horoscope:collapsed:v1';

interface CollapsedData {
  [signEnglish: string]: {
    isCollapsed: boolean;
    updatedAt: string;
  };
}

export function useCollapsedCards() {
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({});

  // Load collapsed state from localStorage
  const loadCollapsedState = useCallback(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (stored) {
        const data: CollapsedData = JSON.parse(stored);
        const collapsed: Record<string, boolean> = {};
        Object.entries(data).forEach(([sign, config]) => {
          collapsed[sign] = config.isCollapsed;
        });
        setCollapsedCards(collapsed);
      }
    } catch (error) {
      console.warn('Failed to load collapsed state from localStorage:', error);
    }
  }, []);

  // Save collapsed state to localStorage
  const saveCollapsedState = useCallback((signEnglish: string, isCollapsed: boolean) => {
    try {
      const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      const data: CollapsedData = stored ? JSON.parse(stored) : {};
      
      data[signEnglish] = {
        isCollapsed,
        updatedAt: new Date().toISOString()
      };

      localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(data));
      setCollapsedCards(prev => ({
        ...prev,
        [signEnglish]: isCollapsed
      }));
    } catch (error) {
      console.warn('Failed to save collapsed state to localStorage:', error);
    }
  }, []);

  // Toggle collapsed state for a sign
  const toggleCollapsed = useCallback((signEnglish: string) => {
    const currentState = collapsedCards[signEnglish] ?? false;
    saveCollapsedState(signEnglish, !currentState);
  }, [collapsedCards, saveCollapsedState]);

  // Initialize on first load
  const initializeCollapsedState = useCallback(() => {
    loadCollapsedState();
  }, [loadCollapsedState]);

  return {
    collapsedCards,
    toggleCollapsed,
    initializeCollapsedState,
    isCollapsed: (signEnglish: string) => collapsedCards[signEnglish] ?? true
  };
}
