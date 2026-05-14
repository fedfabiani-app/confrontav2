import { 
  startOfWeek, 
  endOfWeek, 
  format, 
  isSameWeek as dateFnsIsSameWeek
} from 'date-fns';
import { it } from 'date-fns/locale';

const TIMEZONE = 'Europe/Rome';

/**
 * Source scraping schedule configuration
 * Maps source slugs to their designated scraping days
 * Extensible: add more days or sources as needed
 */
const SOURCE_SCHEDULE = {
  // Thursday sources
  thursday: ['elle'] as const,
  
  // Saturday sources  
  saturday: ['d-repubblica', 'iodonna', 'sorrisi'] as const,
  
  // All other sources scrape on Monday (default)
};

export type SourceGroup = 'all' | 'elle_only' | 'saturday_group';

/**
 * Get current date/time in Europe/Rome timezone
 */
function getNowInRome(): Date {
  // Create date string in Rome timezone and parse it back
  const romeTimeString = new Date().toLocaleString('en-US', { timeZone: TIMEZONE });
  return new Date(romeTimeString);
}

/**
 * Get the Monday (start of week) for any given date
 * Uses ISO week definition where Monday is the first day
 * 
 * @param date - Any date to find the Monday for
 * @returns Date object representing the Monday of that week
 */
export function getMondayOfWeek(date: Date): Date {
  // Get Monday (weekStartsOn: 1 = Monday per ISO 8601)
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  
  // Set to start of day (00:00:00)
  monday.setHours(0, 0, 0, 0);
  
  return monday;
}

/**
 * Get the current week's Monday in CET/CEST
 * This is the primary function for determining "week_start" database key
 * 
 * @returns Date object for this week's Monday at 00:00:00 Rome time
 */
export function getCurrentWeekStart(): Date {
  const now = getNowInRome();
  return getMondayOfWeek(now);
}

/**
 * Get the full week range (Monday-Sunday) for a given Monday
 * 
 * @param monday - The Monday date (should be a Monday, but will be normalized)
 * @returns Object with start (Monday) and end (Sunday) dates
 */
export function getWeekRange(monday: Date): { start: Date; end: Date } {
  // Ensure we have the actual Monday
  const weekStart = getMondayOfWeek(monday);
  
  // Get Sunday (end of week)
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  weekEnd.setHours(23, 59, 59, 999);
  
  return {
    start: weekStart,
    end: weekEnd
  };
}

/**
 * Format week for display to Italian users
 * Returns format like "21-27 ottobre" or "30 dic - 5 gen" for year boundaries
 * 
 * @param monday - The Monday date for the week
 * @returns Human-readable week range string
 */
export function formatWeekForDisplay(monday: Date): string {
  const { start, end } = getWeekRange(monday);
  
  // Check if week spans across months
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  
  if (sameMonth && sameYear) {
    // Same month: "21-27 ottobre"
    const startDay = format(start, 'd', { locale: it });
    const endDayMonth = format(end, 'd MMMM', { locale: it });
    return `${startDay}-${endDayMonth}`;
  } else if (sameYear) {
    // Different months, same year: "30 dic - 5 gen"
    const startDayMonth = format(start, 'd MMM', { locale: it });
    const endDayMonth = format(end, 'd MMM', { locale: it });
    return `${startDayMonth} - ${endDayMonth}`;
  } else {
    // Different years: "30 dic 2024 - 5 gen 2025"
    const startFull = format(start, 'd MMM yyyy', { locale: it });
    const endFull = format(end, 'd MMM yyyy', { locale: it });
    return `${startFull} - ${endFull}`;
  }
}

/**
 * Check if two dates fall within the same week
 * Useful for comparing execution dates
 * 
 * @param date1 - First date to compare
 * @param date2 - Second date to compare
 * @returns true if both dates are in the same week (same Monday)
 */
export function isSameWeek(date1: Date, date2: Date): boolean {
  return dateFnsIsSameWeek(date1, date2, { weekStartsOn: 1 });
}

/**
 * Classify a source by its scraping schedule group
 * Determines when this source should be scraped during the week
 * 
 * @param sourceSlug - The source slug (e.g., 'elle', 'd-repubblica')
 * @returns Source group classification
 */
export function getSourceGroup(sourceSlug: string): SourceGroup {
  // Normalize slug for comparison
  const normalizedSlug = sourceSlug.toLowerCase();
  
  // Check Thursday sources
  if (SOURCE_SCHEDULE.thursday.some(slug => normalizedSlug.includes(slug))) {
    return 'elle_only';
  }
  
  // Check Saturday sources
  if (SOURCE_SCHEDULE.saturday.some(slug => normalizedSlug.includes(slug))) {
    return 'saturday_group';
  }
  
  // Default: all sources (Monday scrape)
  return 'all';
}

/**
 * Check if a source should be scraped today based on its schedule
 * Used by Thursday/Saturday schedulers to filter sources
 * 
 * @param sourceSlug - The source slug to check
 * @returns true if today is the designated scraping day for this source
 */
export function shouldSourceBeScrapedToday(sourceSlug: string): boolean {
  const now = getNowInRome();
  const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  
  const sourceGroup = getSourceGroup(sourceSlug);
  
  // Monday (1): All sources should be scraped
  if (dayOfWeek === 1) {
    return true;
  }
  
  // Thursday (4): Only elle.com
  if (dayOfWeek === 4) {
    return sourceGroup === 'elle_only';
  }
  
  // Saturday (6): Only saturday_group sources
  if (dayOfWeek === 6) {
    return sourceGroup === 'saturday_group';
  }
  
  // Any other day: no sources should be scraped
  return false;
}

/**
 * Get the Saturday of the week containing the given date (for Repubblica)
 * Repubblica weeks run Saturday to Friday
 */
export function getSaturdayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Calculate days to subtract/add to get to Saturday
  const diff = day === 6 ? 0 : (day === 0 ? -1 : -(day + 1));
  
  const saturday = new Date(d);
  saturday.setDate(d.getDate() + diff);
  return saturday;
}

/**
 * Format date components for weekly URL patterns
 * Used by weekly scraper to construct source-specific URLs
 * 
 * @param weekStartDate - The Monday date for the week
 * @param isSaturdayBased - Whether source uses Saturday-Friday weeks (default: false)
 * @param useNumericMonth - Whether to use numeric month format (default: false)
 * @returns Object with formatted date components for URL construction
 */
export function formatWeekUrlParams(
  weekStartDate: Date,
  isSaturdayBased: boolean = false,
  useNumericMonth: boolean = false,
  isThursdayBased: boolean = false
): {
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

  if (isThursdayBased) {
    // Thursday-to-Wednesday weeks (e.g. SuperGuida TV / Branko)
    // From the Monday weekStartDate, go back 4 days to get the previous Thursday
    start = new Date(weekStartDate);
    start.setDate(weekStartDate.getDate() - 4);
    end = new Date(start);
    end.setDate(start.getDate() + 6); // Wednesday
  } else if (isSaturdayBased) {
    // Some sources (Repubblica, Sorrisi) use Saturday-Friday weeks
    start = getSaturdayOfWeek(weekStartDate);
    end = new Date(start);
    end.setDate(start.getDate() + 6); // Friday
  } else {
    // Standard Monday-Sunday weeks
    const weekDates = getWeekRange(weekStartDate);
    start = weekDates.start;
    end = weekDates.end;
  }
  
  const monthIndex = start.getMonth();
  const monthValue = useNumericMonth 
    ? (monthIndex + 1).toString().padStart(2, '0')  // Numeric format: "10" for October
    : ITALIAN_MONTH_NAMES[monthIndex];               // Italian name: "ottobre"
  
  return {
    startDay: start.getDate().toString().padStart(2, '0'),
    endDay: end.getDate().toString().padStart(2, '0'),
    month: monthValue,
    year: start.getFullYear().toString()
  };
}
