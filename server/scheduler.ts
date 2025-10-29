import cron from 'node-cron';
import { cleanupService } from './services/cleanup';
import { cleanupTracker } from './services/cleanupTracker';
import { getScraperConfig, isWithinTimeWindow, getItalyToday } from './config/scraperConfig';
import { prisma } from './services/database';
import { runDailyScraperCycle } from './services/dailyScraperOrchestrator';

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
// HELPER FUNCTIONS
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
  console.log('  - Cleanup: Daily at 3 AM (31-day interval)');
  if (lastCleanup) {
    console.log(`[Scheduler] Last cleanup: ${lastCleanup.toISOString()}`);
  }
  console.log('==========================================================\n');
}
