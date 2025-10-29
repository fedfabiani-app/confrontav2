import cron from 'node-cron';
import { cleanupService } from './services/cleanup';
import { cleanupTracker } from './services/cleanupTracker';
import { getScraperConfig, isWithinTimeWindow, getItalyToday } from './config/scraperConfig';
import { prisma } from './services/database';
import { runDailyScraperCycle } from './services/dailyScraperOrchestrator';
import { 
  runWeeklyScraperCycle, 
  hasCompletedGroupScrapeForWeek,
  type SourceGroup 
} from './services/weeklyScraperOrchestrator';
import { getCurrentWeekStart } from './utils/weekUtils';

// ============================================================================
// TEST CONFIGURATION
// Calculate test time window: 2 minutes from now + 10 minute window
// ============================================================================
const now = new Date();
const italyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
const testStart = new Date(italyNow.getTime() + 2 * 60 * 1000); // 2 minutes from now
const testEnd = new Date(testStart.getTime() + 10 * 60 * 1000); // 10 minutes after start
const testFallback = new Date(testEnd.getTime() + 2 * 60 * 1000); // 2 minutes after end

const TEST_CONFIG = {
  START_HOUR: testStart.getHours(),
  START_MINUTE: testStart.getMinutes(),
  END_HOUR: testEnd.getHours(),
  END_MINUTE: testEnd.getMinutes(),
  FALLBACK_HOUR: testFallback.getHours(),
  FALLBACK_MINUTE: testFallback.getMinutes(),
};

console.log('\n========== [SCHEDULER] Test Configuration ==========');
console.log(`Current Italy time: ${italyNow.toTimeString().split(' ')[0]}`);
console.log(`Test window START: ${testStart.toTimeString().split(' ')[0]}`);
console.log(`Test window END:   ${testEnd.toTimeString().split(' ')[0]}`);
console.log(`Fallback trigger:  ${testFallback.toTimeString().split(' ')[0]}`);
console.log('====================================================\n');

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

/**
 * Check if current time is within the test window
 */
function isWithinTestWindow(): boolean {
  const now = new Date();
  const italyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  
  const currentMinutes = italyNow.getHours() * 60 + italyNow.getMinutes();
  const startMinutes = TEST_CONFIG.START_HOUR * 60 + TEST_CONFIG.START_MINUTE;
  const endMinutes = TEST_CONFIG.END_HOUR * 60 + TEST_CONFIG.END_MINUTE;
  
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
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
    console.log(`[Weekly Helper] Found ${staleExecutions.length} stale execution(s), marking as timeout...`);
    
    for (const stale of staleExecutions) {
      await prisma.weeklyScraperExecution.update({
        where: { id: stale.id },
        data: {
          status: 'timeout',
          completed_at: new Date(),
        },
      });
      
      console.log(`[Weekly Helper] Marked execution ${stale.id} as timeout (started ${stale.started_at.toISOString()})`);
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
// MAIN DAILY SCRAPER
// ============================================================================

async function executeDailyScraper() {
  console.log('\n========== [DailyScraper] Cron Triggered ==========');
  
  try {
    const targetDate = getItalyToday();
    const now = new Date();
    const italyTime = now.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    console.log(`[DailyScraper] Current time (Italy): ${italyTime}`);
    console.log(`[DailyScraper] Target date: ${targetDate}`);
    
    // Guard 1: Check enabled flag
    const config = await getScraperConfig();
    if (!config.enabled) {
      console.log('[DailyScraper] ⊘ Skipped - Scraping is disabled in configuration');
      console.log('==================================================\n');
      return;
    }
    console.log('[DailyScraper] ✓ Config check passed - Scraping enabled');
    
    // Guard 2: Check time window
    if (!isWithinTestWindow()) {
      console.log(`[DailyScraper] ⊘ Skipped - Outside test window (${TEST_CONFIG.START_HOUR}:${String(TEST_CONFIG.START_MINUTE).padStart(2, '0')}-${TEST_CONFIG.END_HOUR}:${String(TEST_CONFIG.END_MINUTE).padStart(2, '0')})`);
      console.log('==================================================\n');
      return;
    }
    console.log('[DailyScraper] ✓ Time window check passed');
    
    // Guard 3: Check if already completed today
    if (await hasCompletedExecutionToday()) {
      console.log('[DailyScraper] ⊘ Skipped - Successful execution already completed today');
      console.log('==================================================\n');
      return;
    }
    console.log('[DailyScraper] ✓ No completed execution today');
    
    // Guard 4: Check for running execution
    if (await hasRunningExecution(targetDate)) {
      console.log('[DailyScraper] ⊘ Skipped - Execution already in progress for today');
      console.log('==================================================\n');
      return;
    }
    console.log('[DailyScraper] ✓ No running execution detected');
    
    // Execute orchestrator
    console.log('[DailyScraper] → Starting orchestrator...');
    const result = await runDailyScraperCycle({ 
      targetDate,
      triggerType: 'scheduled'
    });
    
    console.log('[DailyScraper] ✓ Orchestrator completed successfully');
    console.log(`[DailyScraper] Results: ${result.stats.enqueued} enqueued, ${result.stats.skipped} skipped, ${result.stats.failed} failed`);
    console.log('==================================================\n');
    
  } catch (error) {
    console.error('[DailyScraper] ✗ Error:', error);
    console.log('==================================================\n');
    // Don't throw - let cron continue
  }
}

// ============================================================================
// FALLBACK RETRY SYSTEM
// ============================================================================

async function executeFallbackRetry() {
  console.log('\n========== [Fallback] Retry Triggered ==========');
  
  try {
    const targetDate = getItalyToday();
    const now = new Date();
    const italyTime = now.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    console.log(`[Fallback] Current time (Italy): ${italyTime}`);
    console.log(`[Fallback] Target date: ${targetDate}`);
    
    // Guard 1: Check enabled flag
    const config = await getScraperConfig();
    if (!config.enabled) {
      console.log('[Fallback] ⊘ Skipped - Scraping is disabled in configuration');
      console.log('================================================\n');
      return;
    }
    console.log('[Fallback] ✓ Config check passed');
    
    // Guard 2: Check if fallback already ran today
    if (await hasFallbackRunToday()) {
      console.log('[Fallback] ⊘ Skipped - Fallback already ran today');
      console.log('================================================\n');
      return;
    }
    console.log('[Fallback] ✓ No previous fallback execution today');
    
    // Guard 3: Check for running execution
    if (await hasRunningExecution(targetDate)) {
      console.log('[Fallback] ⊘ Skipped - Execution currently in progress');
      console.log('================================================\n');
      return;
    }
    console.log('[Fallback] ✓ No running execution detected');
    
    // Get failed sources
    const failedSourceIds = await getFailedSourceIds(targetDate);
    
    if (failedSourceIds.length === 0) {
      console.log('[Fallback] ✓ No failures detected - Nothing to retry');
      console.log('================================================\n');
      return;
    }
    
    console.log(`[Fallback] → Found ${failedSourceIds.length} failed source(s): ${failedSourceIds.join(', ')}`);
    console.log('[Fallback] → Starting retry orchestrator...');
    
    // Execute retry with specific sources
    const result = await runDailyScraperCycle({ 
      targetDate,
      specificSources: failedSourceIds,
      forceRescrape: true, // Force retry even if data exists
      triggerType: 'fallback'
    });
    
    console.log('[Fallback] ✓ Retry completed successfully');
    console.log(`[Fallback] Results: ${result.stats.enqueued} enqueued, ${result.stats.skipped} skipped, ${result.stats.failed} failed`);
    console.log('================================================\n');
    
  } catch (error) {
    console.error('[Fallback] ✗ Error:', error);
    console.log('================================================\n');
  }
}

// ============================================================================
// MONDAY WEEKLY SCRAPER (All Sources)
// ============================================================================

async function executeMondayWeeklyScraper() {
  console.log('\n========== [MondayWeekly] Cron Triggered ==========');
  
  try {
    const weekStart = getCurrentWeekStart();
    const now = new Date();
    const italyTime = now.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    console.log(`[MondayWeekly] Current time (Italy): ${italyTime}`);
    console.log(`[MondayWeekly] Target week: ${weekStart.toISOString().split('T')[0]}`);
    
    // Guard 1: Check enabled flag
    const config = await getScraperConfig();
    if (!config.enabled) {
      console.log('[MondayWeekly] ⊘ Skipped - Weekly scraping is disabled in configuration');
      console.log('====================================================\n');
      return;
    }
    console.log('[MondayWeekly] ✓ Config check passed - Scraping enabled');
    
    // Guard 2: Check time window (Monday 5:30-8:00 AM)
    if (!isWithinMondayWindow()) {
      console.log('[MondayWeekly] ⊘ Skipped - Outside Monday window (5:30-8:00 AM)');
      console.log('====================================================\n');
      return;
    }
    console.log('[MondayWeekly] ✓ Time window check passed');
    
    // Guard 3: Check if Monday scrape already completed this week
    if (await hasCompletedGroupScrapeForWeek(weekStart, 'all')) {
      console.log('[MondayWeekly] ⊘ Skipped - Monday scrape already completed this week');
      console.log('====================================================\n');
      return;
    }
    console.log('[MondayWeekly] ✓ No completed Monday scrape this week');
    
    // Guard 4: Check for running execution
    if (await hasRunningWeeklyExecution(weekStart)) {
      console.log('[MondayWeekly] ⊘ Skipped - Execution already in progress for this week');
      console.log('====================================================\n');
      return;
    }
    console.log('[MondayWeekly] ✓ No running execution detected');
    
    // Execute orchestrator
    console.log('[MondayWeekly] → Starting weekly orchestrator (ALL sources)...');
    const result = await runWeeklyScraperCycle({
      weekStart,
      sourceGroup: 'all',
      forceRescrape: false, // Use skip logic
      triggerType: 'scheduled'
    });
    
    console.log('[MondayWeekly] ✓ Orchestrator completed successfully');
    console.log(`[MondayWeekly] Results: ${result.stats.enqueued} enqueued, ${result.stats.skipped} skipped, ${result.stats.failed} failed`);
    console.log('====================================================\n');
    
  } catch (error) {
    console.error('[MondayWeekly] ✗ Error:', error);
    console.log('====================================================\n');
  }
}

// ============================================================================
// THURSDAY WEEKLY SCRAPER (Elle.com Update)
// ============================================================================

async function executeThursdayWeeklyScraper() {
  console.log('\n========== [ThursdayWeekly] Cron Triggered ==========');
  
  try {
    const weekStart = getCurrentWeekStart();
    const now = new Date();
    const italyTime = now.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    console.log(`[ThursdayWeekly] Current time (Italy): ${italyTime}`);
    console.log(`[ThursdayWeekly] Target week: ${weekStart.toISOString().split('T')[0]}`);
    
    // Guard 1: Check enabled flag
    const config = await getScraperConfig();
    if (!config.enabled) {
      console.log('[ThursdayWeekly] ⊘ Skipped - Weekly scraping is disabled in configuration');
      console.log('======================================================\n');
      return;
    }
    console.log('[ThursdayWeekly] ✓ Config check passed');
    
    // Guard 2: Sanity check - is it actually Thursday?
    const italyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    if (italyNow.getDay() !== 4) {
      console.log('[ThursdayWeekly] ⊘ Skipped - Not Thursday in Italy timezone');
      console.log('======================================================\n');
      return;
    }
    console.log('[ThursdayWeekly] ✓ Day check passed - It is Thursday');
    
    // Guard 3: Check if elle_only update already ran this week
    if (await hasCompletedGroupScrapeForWeek(weekStart, 'elle_only')) {
      console.log('[ThursdayWeekly] ⊘ Skipped - Elle update already completed this week');
      console.log('======================================================\n');
      return;
    }
    console.log('[ThursdayWeekly] ✓ No elle_only update this week yet');
    
    // Guard 4: Check if Monday scrape completed (prerequisite)
    if (!(await hasMondayScrapeCompleted(weekStart))) {
      console.log('[ThursdayWeekly] ⊘ Skipped - Monday scrape not yet completed');
      console.log('======================================================\n');
      return;
    }
    console.log('[ThursdayWeekly] ✓ Monday scrape prerequisite met');
    
    // Get Elle.com source ID
    const elleSourceIds = await getWeeklySourceIdsByDomain(['elle.com']);
    
    if (elleSourceIds.length === 0) {
      console.log('[ThursdayWeekly] ⊘ Skipped - Elle.com source not found');
      console.log('======================================================\n');
      return;
    }
    
    // Execute orchestrator
    console.log(`[ThursdayWeekly] → Starting weekly orchestrator (Elle.com update, source ID: ${elleSourceIds[0]})...`);
    const result = await runWeeklyScraperCycle({
      weekStart,
      specificSources: elleSourceIds,
      sourceGroup: 'elle_only',
      forceRescrape: true, // CRITICAL - bypass skip logic to replace data
      triggerType: 'scheduled'
    });
    
    console.log('[ThursdayWeekly] ✓ Orchestrator completed successfully');
    console.log(`[ThursdayWeekly] Results: ${result.stats.enqueued} enqueued, ${result.stats.skipped} skipped, ${result.stats.failed} failed`);
    console.log('======================================================\n');
    
  } catch (error) {
    console.error('[ThursdayWeekly] ✗ Error:', error);
    console.log('======================================================\n');
  }
}

// ============================================================================
// SATURDAY WEEKLY SCRAPER (3 Saturday Sources Update)
// ============================================================================

async function executeSaturdayWeeklyScraper() {
  console.log('\n========== [SaturdayWeekly] Cron Triggered ==========');
  
  try {
    const weekStart = getCurrentWeekStart();
    const now = new Date();
    const italyTime = now.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    console.log(`[SaturdayWeekly] Current time (Italy): ${italyTime}`);
    console.log(`[SaturdayWeekly] Target week: ${weekStart.toISOString().split('T')[0]}`);
    
    // Guard 1: Check enabled flag
    const config = await getScraperConfig();
    if (!config.enabled) {
      console.log('[SaturdayWeekly] ⊘ Skipped - Weekly scraping is disabled in configuration');
      console.log('======================================================\n');
      return;
    }
    console.log('[SaturdayWeekly] ✓ Config check passed');
    
    // Guard 2: Sanity check - is it actually Saturday?
    const italyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    if (italyNow.getDay() !== 6) {
      console.log('[SaturdayWeekly] ⊘ Skipped - Not Saturday in Italy timezone');
      console.log('======================================================\n');
      return;
    }
    console.log('[SaturdayWeekly] ✓ Day check passed - It is Saturday');
    
    // Guard 3: Check if saturday_group update already ran this week
    if (await hasCompletedGroupScrapeForWeek(weekStart, 'saturday_group')) {
      console.log('[SaturdayWeekly] ⊘ Skipped - Saturday update already completed this week');
      console.log('======================================================\n');
      return;
    }
    console.log('[SaturdayWeekly] ✓ No saturday_group update this week yet');
    
    // Guard 4: Check if Monday scrape completed (prerequisite)
    if (!(await hasMondayScrapeCompleted(weekStart))) {
      console.log('[SaturdayWeekly] ⊘ Skipped - Monday scrape not yet completed');
      console.log('======================================================\n');
      return;
    }
    console.log('[SaturdayWeekly] ✓ Monday scrape prerequisite met');
    
    // Get Saturday sources IDs
    const saturdaySourceIds = await getWeeklySourceIdsByDomain([
      'd.repubblica.it',
      'www.iodonna.it',
      'www.sorrisi.com'
    ]);
    
    if (saturdaySourceIds.length === 0) {
      console.log('[SaturdayWeekly] ⊘ Skipped - No Saturday sources found');
      console.log('======================================================\n');
      return;
    }
    
    // Execute orchestrator
    console.log(`[SaturdayWeekly] → Starting weekly orchestrator (${saturdaySourceIds.length} Saturday sources update)...`);
    const result = await runWeeklyScraperCycle({
      weekStart,
      specificSources: saturdaySourceIds,
      sourceGroup: 'saturday_group',
      forceRescrape: true, // CRITICAL - bypass skip logic to replace data
      triggerType: 'scheduled'
    });
    
    console.log('[SaturdayWeekly] ✓ Orchestrator completed successfully');
    console.log(`[SaturdayWeekly] Results: ${result.stats.enqueued} enqueued, ${result.stats.skipped} skipped, ${result.stats.failed} failed`);
    console.log('======================================================\n');
    
  } catch (error) {
    console.error('[SaturdayWeekly] ✗ Error:', error);
    console.log('======================================================\n');
  }
}

// ============================================================================
// CRON INITIALIZATION
// ============================================================================

export async function initializeScheduledTasks() {
  // Ensure tracker table exists
  await cleanupTracker.ensureTrackerTable();

  // ============================================================================
  // DAILY SCRAPER - TEST SCHEDULE
  // Runs every 2 minutes, guards enforce time window
  // ============================================================================
  cron.schedule('*/2 * * * *', executeDailyScraper, {
    timezone: 'Europe/Rome'
  });
  
  // ============================================================================
  // FALLBACK RETRY - TEST SCHEDULE
  // Runs at specific time (2 minutes after test window ends)
  // ============================================================================
  const fallbackCron = `${TEST_CONFIG.FALLBACK_MINUTE} ${TEST_CONFIG.FALLBACK_HOUR} * * *`;
  cron.schedule(fallbackCron, executeFallbackRetry, {
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
  // CLEANUP SCHEDULER (Existing)
  // Check daily at 3 AM if cleanup should run (every 31 days)
  // ============================================================================
  cron.schedule('0 3 * * *', async () => {
    try {
      const shouldRun = await cleanupTracker.shouldRunCleanup();
      
      if (shouldRun) {
        console.log('[Scheduler] Starting scheduled 31-day cleanup...');
        await cleanupService.cleanupHoroscopeData();
        await cleanupTracker.setLastCleanupDate(new Date());
        console.log('[Scheduler] Scheduled cleanup completed successfully');
      }
    } catch (error) {
      console.error('[Scheduler] Error during scheduled cleanup:', error);
    }
  }, {
    timezone: 'Europe/Rome'
  });

  const lastCleanup = await cleanupTracker.getLastCleanupDate();
  console.log('\n========== [Scheduler] Initialization Complete ==========');
  console.log('Scheduled tasks:');
  console.log('  - Daily Scraper: Every 2 minutes (test mode)');
  console.log(`  - Fallback Retry: ${String(TEST_CONFIG.FALLBACK_HOUR).padStart(2, '0')}:${String(TEST_CONFIG.FALLBACK_MINUTE).padStart(2, '0')} daily`);
  console.log('  - Monday Weekly: Every 20 min on Mondays (5:30-8:00 AM)');
  console.log('  - Thursday Weekly: Thursdays at 12:00 PM (Elle.com update)');
  console.log('  - Saturday Weekly: Saturdays at 12:00 PM (3 sources update)');
  console.log('  - Cleanup: Daily at 3 AM (31-day interval)');
  if (lastCleanup) {
    console.log(`[Scheduler] Last cleanup: ${lastCleanup.toISOString()}`);
  }
  console.log('==========================================================\n');
}
