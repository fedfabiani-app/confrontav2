
import { useState, useEffect } from 'react';

const STORAGE_KEY = 'horoscope:selected-date';

export function useSelectedDate() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    // Try to load from localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const date = new Date(saved);
      // Validate the date is within last 90 days
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const earliestStart = new Date(todayStart);
      earliestStart.setDate(earliestStart.getDate() - 90);
      
      if (date >= earliestStart && date <= todayStart) {
        return date;
      }
    }
    return new Date();
  });

  // Save to localStorage whenever date changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, selectedDate.toISOString());
  }, [selectedDate]);

  return { selectedDate, setSelectedDate };
}
