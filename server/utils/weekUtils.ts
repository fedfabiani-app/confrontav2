/**
 * Week calculation utilities for weekly horoscopes
 * All weeks start on Monday
 */

/**
 * Get the Monday of the week containing the given date
 */
export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

/**
 * Get the Saturday of the week containing the given date (for Repubblica)
 * Repubblica weeks run Saturday to Friday
 */
export function getSaturdayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Calculate days to subtract/add to get to Saturday
  // If today is Saturday (6), diff = 0
  // If today is Sunday (0), diff = -1 (go back to yesterday's Saturday)
  // If today is Monday (1), diff = -2 (go back to Saturday)
  // etc.
  const diff = day === 6 ? 0 : (day === 0 ? -1 : -(day + 1));
  
  const saturday = new Date(d);
  saturday.setDate(d.getDate() + diff);
  return saturday;
}

/**
 * Get the week start and end dates (Monday to Sunday) for a given date
 */
export function getWeekDates(date: Date = new Date()): { start: Date; end: Date } {
  const start = getMondayOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

/**
 * Format week range in Italian format: "6 ott - 12 ott 2025"
 */
export function formatWeekRange(startDate: Date, endDate: Date): string {
  const monthsIt = [
    'gen', 'feb', 'mar', 'apr', 'mag', 'giu',
    'lug', 'ago', 'set', 'ott', 'nov', 'dic'
  ];

  const startDay = startDate.getDate();
  const startMonth = monthsIt[startDate.getMonth()];
  const endDay = endDate.getDate();
  const endMonth = monthsIt[endDate.getMonth()];
  const year = endDate.getFullYear();

  if (startDate.getMonth() === endDate.getMonth()) {
    return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${year}`;
  } else {
    return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${year}`;
  }
}

/**
 * Get current week's Monday date in ISO format (YYYY-MM-DD)
 */
export function getCurrentWeekMonday(): string {
  const { start } = getWeekDates();
  return start.toISOString().split('T')[0];
}

/**
 * Format date components for weekly URL patterns
 */
export function formatWeekUrlParams(weekStartDate: Date, isSaturdayBased: boolean = false): {
  startDay: string;
  endDay: string;
  month: string;
  year: string;
} {
  // Italian month names for URL patterns
  const ITALIAN_MONTH_NAMES = [
    'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'
  ];
  
  let start: Date, end: Date;
  
  if (isSaturdayBased) {
    // Repubblica uses Saturday-Friday weeks
    start = getSaturdayOfWeek(weekStartDate);
    end = new Date(start);
    end.setDate(start.getDate() + 6); // Friday
  } else {
    // Standard Monday-Sunday weeks
    const weekDates = getWeekDates(weekStartDate);
    start = weekDates.start;
    end = weekDates.end;
  }
  
  // Use Italian month name instead of number for sources that require it
  const monthIndex = end.getMonth();
  const italianMonthName = ITALIAN_MONTH_NAMES[monthIndex];
  
  return {
    startDay: start.getDate().toString(),
    endDay: end.getDate().toString(),
    month: italianMonthName,
    year: end.getFullYear().toString()
  };
}

/**
 * Get the display text for week range: "Settimana: 6 ott - 12 ott 2025"
 */
export function getWeekDisplayText(weekStartDate: Date): string {
  const { start, end } = getWeekDates(weekStartDate);
  return `Settimana: ${formatWeekRange(start, end)}`;
}
