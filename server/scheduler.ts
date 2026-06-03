import cron from 'node-cron';
import { cleanupService } from './services/cleanup';
import { cleanupTracker } from './services/cleanupTracker';
import { getDailyScraperConfig, getWeeklyScraperConfig, isWithinTimeWindow, getItalyToday } from './config/scraperConfig';
import { prisma } from './services/database';
import { runDailyScraperCycle } from './services/dailyScraperOrchestrator';
import { 
  runWeeklyScraperCycle, 
  hasCompletedGroupScrapeForWeek,
  getFailedWeeklySources,
  type SourceGroup 
} from './services/weeklyScraperOrchestrator';
import { getCurrentWeekStart, getNextWeekStart } from './utils/weekUtils';

// ============================================================================
// HELPER FUNCTIONS - DAILY SCRAPER
// ============================================================================

/**
 * Check if there's a running execution for the target date
 */
async function hasRunningExecution(targetDate: string): Promise<boolean> {
  const targetDateObj = new Date(targetDate + 'T00:00:00.000Z');
  
  const running = await prisma.scraperExecution.findFirst({
    where: {
      target_date: targetDateObj,
      status: 'running',
    },
  });
  
  return running !== null;
}

/**
 * Check if a successful execution already completed today
 */
async function hasCompletedExecutionToday(): Promise<boolean> {
  const targetDate = getItalyToday();
  const targetDateObj = new Date(targetDate + 'T00:00:00.000Z');
  
  const completed = await prisma.scraperExecution.findFirst({
    where: {
      target_date: targetDateObj,
      status: 'completed',
      trigger_type: 'scheduled',
    },
  });
  
  return completed !== null;
}

/**
 * Check if fallback retry already ran today
 */
async function hasFallbackRunToday(): Promise<boolean> {
  const targetDate = getItalyToday();
  const targetDateObj = new Date(targetDate + 'T00:00:00.000Z');
  
  const fallback = await prisma.scraperExecution.findFirst({
    where: {
      target_date: targetDateObj,
      trigger_type: 'fallback',
    },
  });
  
  return fallback !== null;
}

/**
 * Check if late fallback already ran today
 */
async function hasLateFallbackRunToday(): Promise<boolean> {
  const targetDate = getItalyToday();
  const targetDateObj = new Date(targetDate + 'T00:00:00.000Z');

  const fallback = await prisma.scraperExecution.findFirst({
    where: {
      target_date: targetDateObj,
      trigger_type: 'fallback_late',
    },
  });

  return fallback !== null;
}

async function hasTenAmRunToday(): Promise<boolean> {
  const targetDate = getItalyToday();
  const targetDateObj = new Date(targetDate + 'T00:00:00.000Z');

  const run = await prisma.scraperExecution.findFirst({
    where: {
      target_date: targetDateObj,
      trigger_type: 'late_start_ten',
    },
  });

  return run !== null;
}

/**
 * Get IDs of sources that failed during scraping today
 */
async function getFailedSourceIds(targetDate: string): Promise<number[]> {
  const targetDateObj = new Date(targetDate + 'T00:00:00.000Z');
  
  const failedStatuses = await prisma.scraperSourceStatus.findMany({
    where: {
      target_date: targetDateObj,
      status: 'failed',
    },
    select: {
      source_id: true,
    },
    distinct: ['source_id'],
  });
  
  return failedStatuses.map(s => s.source_id);
}

// ============================================================================
// HELPER FUNCTIONS - WEEKLY SCRAPER
// ============================================================================

/**
 * Check if there's a running weekly execution for the target week
 * Also cleans up stale executions (running > 2 hours)
 */
async function hasRunningWeeklyExecution(weekStart: Date): Promise<boolean> {
  // First, clean up stale executions across all weeks
  const staleThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000);
  
  const staleExecutions = await prisma.weeklyScraperExecution.findMany({
    where: {
      status: 'running',
      started_at: {
        lt: staleThreshold,
      },
    },
    select: {
      id: true,
      target_week: true,
      source_group: true,
      started_at: true,
    },
  });
  
  if (staleExecutions.length > 0) {
    
    for (const stale of staleExecutions) {
      await prisma.weeklyScraperExecution.update({
        where: { id: stale.id },
        data: {
          status: 'timeout',
          completed_at: new Date(),
        },
      });
      
    }
  }
  
  // Now check for actual running executions
  const running = await prisma.weeklyScraperExecution.findFirst({
    where: {
      target_week: weekStart,
      status: 'running',
      started_at: {
        gte: staleThreshold, // Only count recent runs
      },
    },
  });
  
  return running !== null;
}

/**
 * Check if Monday scrape completed this week (prerequisite for Thu/Sat)
 */
async function hasMondayScrapeCompleted(weekStart: Date): Promise<boolean> {
  const completed = await prisma.weeklyScraperExecution.findFirst({
    where: {
      target_week: weekStart,
      source_group: 'all',
      status: 'completed',
      trigger_type: 'scheduled',
    },
  });
  
  return completed !== null;
}

/**
 * Get weekly source IDs by domain patterns
 */
async function getWeeklySourceIdsByDomain(domains: string[]): Promise<number[]> {
  const sources = await prisma.weeklySource.findMany({
    where: {
      domain: { in: domains },
      is_active: true,
    },
    select: { id: true },
  });
  
  return sources.map(s => s.id);
}

/**
 * Check if current time is Monday between 5:30-8:00 AM (Italy time)
 */
function isWithinMondayWindow(): boolean {
  const now = new Date();
  const italyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  
  const dayOfWeek = italyNow.getDay(); // 1 = Monday
  if (dayOfWeek !== 1) return false;
  
  const currentMinutes = italyNow.getHours() * 60 + italyNow.getMinutes();
  const startMinutes = 5 * 60 + 30; // 5:30 AM
  const endMinutes = 8 * 60; // 8:00 AM
  
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

// ============================================================================
// SOURCES WITH DELAYED SCRAPING
// Vogue.it (ID 13) publishes the daily horoscope after 9:00 AM — scraping
// earlier retrieves the previous day's content.
// ============================================================================
const LATE_START_SOURCES: number[] = [13];

// ============================================================================
// SOURCES WITH 10 AM SCRAPING
// Corriere della Sera (ID 9) pubblica l'oroscopo dopo le 10:00 AM —
// il tentativo alle 9:15 restituisce dati vuoti.
// ============================================================================
const TEN_AM_SOURCES: number[] = [9];

// ============================================================================
// MAIN DAILY SCRAPER
// ============================================================================

async function executeDailyScraper() {
  
  try {
    const targetDate = getItalyToday();
    const now = new Date();
    const italyTime = now.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    
    // Guard 1: Check enabled flag
    const config = await getDailyScraperConfig();
    if (!config.enabled) {
      return;
    }
    
    // Guard 2: Check time window
    if (!isWithinTimeWindow(config)) {
      return;
    }
    
    // Guard 3: Check if already completed today
    if (await hasCompletedExecutionToday()) {
      return;
    }
    
    // Guard 4: Check for running execution
    if (await hasRunningExecution(targetDate)) {
      return;
    }
    
    // Execute orchestrator — skip late-start sources (e.g. Vogue, scraped at 9 AM)
    const result = await runDailyScraperCycle({
      targetDate,
      excludeSources: LATE_START_SOURCES,
      triggerType: 'scheduled'
    });
    
    
  } catch (error) {
    console.error('[DailyScraper] ✗ Error:', error);
    // Don't throw - let cron continue
  }
}

// ============================================================================
// LATE-START SCRAPER (9:00 AM CET)
// Runs sources that publish after the main window (e.g. Vogue.it)
// ============================================================================

async function executeLateStartSources() {
  try {
    const config = await getDailyScraperConfig();
    if (!config.enabled) return;

    const targetDate = getItalyToday();

    // Guard: skip if a late-start run already completed today
    const targetDateObj = new Date(targetDate + 'T00:00:00.000Z');
    const alreadyRan = await prisma.scraperExecution.findFirst({
      where: {
        target_date: targetDateObj,
        trigger_type: 'late_start',
        status: 'completed',
      },
    });
    if (alreadyRan) return;

    // Guard: skip if a late-start run is currently in progress
    const running = await prisma.scraperExecution.findFirst({
      where: {
        target_date: targetDateObj,
        trigger_type: 'late_start',
        status: 'running',
      },
    });
    if (running) return;

    await runDailyScraperCycle({
      targetDate,
      specificSources: LATE_START_SOURCES,
      forceRescrape: true,
      triggerType: 'late_start',
    });
  } catch (error) {
    console.error('[LateStartScraper] ✗ Error:', error);
  }
}

// ============================================================================
// FALLBACK RETRY SYSTEM
// ============================================================================

async function executeFallbackRetry() {
  
  try {
    const targetDate = getItalyToday();
    const now = new Date();
    const italyTime = now.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    
    // Guard 1: Check enabled flag
    const config = await getDailyScraperConfig();
    if (!config.enabled) {
      return;
    }
    
    // Guard 2: Check if fallback already ran today
    if (await hasFallbackRunToday()) {
      return;
    }
    
    // Guard 3: Check for running execution
    if (await hasRunningExecution(targetDate)) {
      return;
    }
    
    // Get failed sources
    const failedSourceIds = await getFailedSourceIds(targetDate);
    
    if (failedSourceIds.length === 0) {
      return;
    }
    
    
    // Execute retry with specific sources
    const result = await runDailyScraperCycle({ 
      targetDate,
      specificSources: failedSourceIds,
      forceRescrape: true, // Force retry even if data exists
      triggerType: 'fallback'
    });
    
    
  } catch (error) {
    console.error('[Fallback] ✗ Error:', error);
  }
}

// ============================================================================
// LATE FALLBACK (9:15 AM CET)
// Riprova tutte le fonti senza HoroscopeData valido oggi (summary mancante o vuoto).
// buildProcessedCache skippa automaticamente le coppie source+sign con dati corretti.
// ============================================================================

async function executeLateDailyFallback() {
  try {
    const config = await getDailyScraperConfig();
    if (!config.enabled) return;

    const targetDate = getItalyToday();

    // Guard: skip se il fallback tardivo è già girato oggi
    if (await hasLateFallbackRunToday()) return;

    // Guard: skip se c'è un'esecuzione in corso
    if (await hasRunningExecution(targetDate)) return;

    // forceRescrape: false → buildProcessedCache skippa le coppie con summary valido
    // e riprova tutto ciò che non ha dati corretti (no record, summary vuoto, failed).
    // TEN_AM_SOURCES escluse: non ancora pubblicate alle 9:15, gestite dal job delle 10 AM.
    const result = await runDailyScraperCycle({
      targetDate,
      forceRescrape: false,
      excludeSources: TEN_AM_SOURCES,
      triggerType: 'fallback_late',
    });

    console.log(`[LateFallback] Enqueued ${result.stats.enqueued}, skipped ${result.stats.skipped}`);
  } catch (error) {
    console.error('[LateFallback] ✗ Error:', error);
  }
}

// ============================================================================
// 10 AM SCRAPER (Corriere della Sera — ID 9)
// Corriere pubblica l'oroscopo dopo le 10:00 AM. Esclusa dal fallback delle
// 9:15, viene riprocessata qui con forceRescrape: true.
// ============================================================================

async function executeTenAmSources() {
  try {
    const config = await getDailyScraperConfig();
    if (!config.enabled) return;

    const targetDate = getItalyToday();

    if (await hasTenAmRunToday()) return;
    if (await hasRunningExecution(targetDate)) return;

    await runDailyScraperCycle({
      targetDate,
      specificSources: TEN_AM_SOURCES,
      forceRescrape: true,
      triggerType: 'late_start_ten',
    });
  } catch (error) {
    console.error('[TenAmScraper] ✗ Error:', error);
  }
}

// ============================================================================
// MONDAY WEEKLY SCRAPER (All Sources)
// ============================================================================

async function executeMondayWeeklyScraper() {
  
  try {
    const weekStart = getCurrentWeekStart();
    const now = new Date();
    const italyTime = now.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    
    // Guard 1: Check enabled flag
    const config = await getWeeklyScraperConfig();
    if (!config.enabled) {
      return;
    }
    
    // Guard 2: Check time window (Monday 5:30-8:00 AM)
    if (!isWithinMondayWindow()) {
      return;
    }
    
    // Guard 3: Check if Monday scrape already completed this week
    if (await hasCompletedGroupScrapeForWeek(weekStart, 'all')) {
      return;
    }
    
    // Guard 4: Check for running execution
    if (await hasRunningWeeklyExecution(weekStart)) {
      return;
    }
    
    // Execute orchestrator
    const result = await runWeeklyScraperCycle({
      weekStart,
      sourceGroup: 'all',
      forceRescrape: false, // Use skip logic
      triggerType: 'scheduled'
    });
    
    
  } catch (error) {
    console.error('[MondayWeekly] ✗ Error:', error);
  }
}

// ============================================================================
// THURSDAY WEEKLY SCRAPER (Elle.com Update)
// ============================================================================

async function executeThursdayWeeklyScraper() {
  
  try {
    const weekStart = getCurrentWeekStart();
    const now = new Date();
    const italyTime = now.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    
    // Guard 1: Check enabled flag
    const config = await getWeeklyScraperConfig();
    if (!config.enabled) {
      return;
    }
    
    // Guard 2: Sanity check - is it actually Thursday?
    const italyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    if (italyNow.getDay() !== 4) {
      return;
    }
    
    // Guard 3: Check if elle_only update already ran this week
    if (await hasCompletedGroupScrapeForWeek(weekStart, 'elle_only')) {
      return;
    }
    
    // Guard 4: Check if Monday scrape completed (prerequisite)
    if (!(await hasMondayScrapeCompleted(weekStart))) {
      return;
    }
    
    // Get Elle.com source ID
    const elleSourceIds = await getWeeklySourceIdsByDomain(['elle.com']);
    
    if (elleSourceIds.length === 0) {
      return;
    }
    
    // Execute orchestrator
    const result = await runWeeklyScraperCycle({
      weekStart,
      specificSources: elleSourceIds,
      sourceGroup: 'elle_only',
      forceRescrape: true, // CRITICAL - bypass skip logic to replace data
      triggerType: 'scheduled'
    });
    
    
  } catch (error) {
    console.error('[ThursdayWeekly] ✗ Error:', error);
  }
}

// ============================================================================
// SATURDAY WEEKLY SCRAPER (3 Saturday Sources Update)
// ============================================================================

async function executeSaturdayWeeklyScraper() {
  
  try {
    const weekStart = getCurrentWeekStart();
    const now = new Date();
    const italyTime = now.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    
    // Guard 1: Check enabled flag
    const config = await getWeeklyScraperConfig();
    if (!config.enabled) {
      return;
    }
    
    // Guard 2: Sanity check - is it actually Saturday?
    const italyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    if (italyNow.getDay() !== 6) {
      return;
    }
    
    // Guard 3: Check if saturday_group update already ran this week
    if (await hasCompletedGroupScrapeForWeek(weekStart, 'saturday_group')) {
      return;
    }
    
    // Guard 4: Check if Monday scrape completed (prerequisite)
    if (!(await hasMondayScrapeCompleted(weekStart))) {
      return;
    }
    
    // Get Saturday sources IDs
    const saturdaySourceIds = await getWeeklySourceIdsByDomain([
      'd.repubblica.it',
      'www.iodonna.it',
      'www.sorrisi.com'
    ]);
    
    if (saturdaySourceIds.length === 0) {
      return;
    }
    
    // Execute orchestrator
    const result = await runWeeklyScraperCycle({
      weekStart,
      specificSources: saturdaySourceIds,
      sourceGroup: 'saturday_group',
      forceRescrape: true, // CRITICAL - bypass skip logic to replace data
      triggerType: 'scheduled'
    });
    
    
  } catch (error) {
    console.error('[SaturdayWeekly] ✗ Error:', error);
  }
}

// ============================================================================
// SUNDAY WEEKLY SCRAPER (SuperGuida TV / Branko)
// ============================================================================

async function executeSundayWeeklyScraper() {

  try {
    // CRITICAL: on Sunday we store content under NEXT Monday's week,
    // because the article covers the upcoming Mon-Sun period.
    const weekStart = getNextWeekStart();
    const now = new Date();
    const italyTime = now.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });


    // Guard 1: Check enabled flag
    const config = await getWeeklyScraperConfig();
    if (!config.enabled) {
      return;
    }

    // Guard 2: Sanity check - is it actually Sunday?
    const italyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    if (italyNow.getDay() !== 0) {
      return;
    }

    // Guard 3: Check if sunday_group update already ran for next week
    if (await hasCompletedGroupScrapeForWeek(weekStart, 'sunday_group')) {
      return;
    }

    // Guard 4: No Monday prerequisite (Sunday runs before Monday)

    const sundaySourceIds = await getWeeklySourceIdsByDomain(['superguidatv.it']);
    if (sundaySourceIds.length === 0) {
      return;
    }

    const result = await runWeeklyScraperCycle({
      weekStart,
      specificSources: sundaySourceIds,
      sourceGroup: 'sunday_group',
      forceRescrape: false,
      triggerType: 'scheduled'
    });


  } catch (error) {
    console.error('[SundayWeekly] ✗ Error:', error);
  }
}

// ============================================================================
// WEEKLY FALLBACK RETRY SYSTEM
// ============================================================================

async function executeWeeklyFallbackRetry() {
  
  try {
    const weekStart = getCurrentWeekStart();
    const now = new Date();
    const italyTime = now.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    
    // Guard 1: Check enabled flag
    const config = await getWeeklyScraperConfig();
    if (!config.enabled) {
      return;
    }
    
    // Guard 2: Check if fallback already ran this week
    const existingFallback = await prisma.weeklyScraperExecution.findFirst({
      where: {
        target_week: weekStart,
        trigger_type: 'fallback',
      },
    });
    
    if (existingFallback) {
      return;
    }
    
    // Guard 3: Check for running execution
    if (await hasRunningWeeklyExecution(weekStart)) {
      return;
    }
    
    // Get failed sources for this week
    const failedSourceIds = await getFailedWeeklySources(weekStart, 'all');
    
    if (failedSourceIds.length === 0) {
      return;
    }
    
    
    // Execute retry with specific sources
    const result = await runWeeklyScraperCycle({ 
      weekStart,
      specificSources: failedSourceIds,
      sourceGroup: 'all',
      forceRescrape: true, // Force retry even if data exists
      triggerType: 'fallback'
    });
    
    
  } catch (error) {
    console.error('[WeeklyFallback] ✗ Error:', error);
  }
}

// ============================================================================
// CRON INITIALIZATION
// ============================================================================

export async function initializeScheduledTasks() {
  // Ensure tracker table exists
  await cleanupTracker.ensureTrackerTable();

  // Get config to determine schedules
  const dailyConfig = await getDailyScraperConfig();
  
  // Parse fallback time (1 hour after end time)
  const [endHour, endMinute] = dailyConfig.endTime.split(':').map(Number);
  const fallbackHour = (endHour + 1) % 24; // Add 1 hour for fallback
  
  // ============================================================================
  // DAILY SCRAPER - PRODUCTION SCHEDULE
  // Runs based on config interval, guards enforce time window
  // ============================================================================
  cron.schedule(`*/${dailyConfig.intervalMinutes} * * * *`, executeDailyScraper, {
    timezone: 'Europe/Rome'
  });
  
  // ============================================================================
  // LATE-START SCRAPER - 9:00 AM CET
  // Sources (e.g. Vogue.it ID 13) that publish after the main window
  // ============================================================================
  cron.schedule('0 9 * * *', executeLateStartSources, {
    timezone: 'Europe/Rome'
  });

  // ============================================================================
  // FALLBACK RETRY - PRODUCTION SCHEDULE
  // Runs 1 hour after scraping window ends
  // ============================================================================
  cron.schedule(`${endMinute} ${fallbackHour} * * *`, executeFallbackRetry, {
    timezone: 'Europe/Rome'
  });

  // ============================================================================
  // LATE FALLBACK - 9:15 AM CET
  // Riprova fonti senza HoroscopeData valido (published after main window / fallback)
  // ============================================================================
  cron.schedule('15 9 * * *', executeLateDailyFallback, {
    timezone: 'Europe/Rome'
  });

  // ============================================================================
  // 10 AM SCRAPER - Corriere della Sera (ID 9)
  // ============================================================================
  cron.schedule('0 10 * * *', executeTenAmSources, {
    timezone: 'Europe/Rome'
  });

  // ============================================================================
  // MONDAY WEEKLY SCRAPER
  // Runs every 20 minutes on Mondays, guards enforce 5:30-8:00 AM window
  // ============================================================================
  cron.schedule('*/20 5-7 * * 1', executeMondayWeeklyScraper, {
    timezone: 'Europe/Rome'
  });
  
  // ============================================================================
  // THURSDAY WEEKLY SCRAPER (Elle.com Update)
  // Runs at 12:00 PM on Thursdays
  // ============================================================================
  cron.schedule('0 12 * * 4', executeThursdayWeeklyScraper, {
    timezone: 'Europe/Rome'
  });
  
  // ============================================================================
  // SATURDAY WEEKLY SCRAPER (3 Saturday Sources Update)
  // Runs at 12:00 PM on Saturdays
  // ============================================================================
  cron.schedule('0 12 * * 6', executeSaturdayWeeklyScraper, {
    timezone: 'Europe/Rome'
  });

  // ============================================================================
  // SUNDAY WEEKLY SCRAPER (SuperGuida TV / Branko)
  // Runs at 18:00 on Sundays — article is live by early afternoon
  // Stores content under NEXT Monday's week key
  // ============================================================================
  cron.schedule('0 18 * * 0', executeSundayWeeklyScraper, {
    timezone: 'Europe/Rome'
  });
  
  // ============================================================================
  // WEEKLY FALLBACK RETRY
  // Runs at 9:00 AM on Mondays (after main scraping window)
  // ============================================================================
  cron.schedule('0 9 * * 1', executeWeeklyFallbackRetry, {
    timezone: 'Europe/Rome'
  });

  // ============================================================================
  // CLEANUP SCHEDULER (Existing)
  // Check daily at 3 AM if cleanup should run (every 31 days)
  // ============================================================================
  cron.schedule('0 3 * * *', async () => {
    try {
      const shouldRun = await cleanupTracker.shouldRunCleanup();
      
      if (shouldRun) {
        await cleanupService.cleanupHoroscopeData();
        await cleanupTracker.setLastCleanupDate(new Date());
      }
    } catch (error) {
      console.error('[Scheduler] Error during scheduled cleanup:', error);
    }
  }, {
    timezone: 'Europe/Rome'
  });

  const lastCleanup = await cleanupTracker.getLastCleanupDate();
  const weeklyConfig = await getWeeklyScraperConfig();
  
  if (lastCleanup) {
  }
}
