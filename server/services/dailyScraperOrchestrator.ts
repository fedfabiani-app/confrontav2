import { prisma } from './database';
import { enqueueScrapeJob } from '../jobs';
import { ScraperInput } from '@shared/schema';
import { ITALIAN_WEEKDAYS } from '@shared/constants';

const FALLBACK_DELAY_MS =
  parseInt(process.env.SCRAPER_FALLBACK_DELAY_MS || '', 10) || 30 * 60 * 1000;

export interface DailyScraperOptions {
  targetDate: string;
  forceRescrape?: boolean;
  specificSources?: number[];
  excludeSources?: number[];
  dryRun?: boolean;
  triggerType?: 'scheduled' | 'fallback' | 'manual' | 'late_start';
}

export interface DailyScraperStats {
  executionId: number | null;
  duration: number;
  stats: {
    total: number;
    enqueued: number;
    skipped: number;
    failed: number;
  };
}

interface ProcessedCache {
  [key: string]: boolean;
}

function createScraperInput(source: any, zodiacSign: any, dateISO: string): ScraperInput {
  const date = new Date(dateISO);
  const weekdayIndex = date.getDay();
  const weekdayItNoAccent = ITALIAN_WEEKDAYS[weekdayIndex];
  const gazzettaDatePath = `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;

  return {
    sourceId: source.id,
    sourceName: source.name,
    domain: source.domain,
    baseUrl: source.base_url,
    urlPattern: source.url_pattern,
    signSlugIt: zodiacSign.name_italian,
    dateISO,
    weekdayItNoAccent,
    gazzettaDatePath,
    userAgent: process.env.SCRAPE_USER_AGENT || 'ItalianHoroscopeComparatorBot/1.0 (+contact)',
  };
}

async function buildProcessedCache(targetDate: string): Promise<ProcessedCache> {
  
  const cache: ProcessedCache = {};
  const targetDateObj = new Date(targetDate + 'T00:00:00.000Z');
  
  // Query all successfully processed horoscopes for the target date
  const processedHoroscopes = await prisma.horoscopeData.findMany({
    where: {
      date: targetDateObj,
      summary: {
        not: '',
      },
    },
    select: {
      source_id: true,
      zodiac_sign_id: true,
    },
  });
  
  // Build cache key: "sourceId-signId"
  for (const record of processedHoroscopes) {
    const key = `${record.source_id}-${record.zodiac_sign_id}`;
    cache[key] = true;
  }
  
  return cache;
}

function isAlreadyProcessed(
  cache: ProcessedCache,
  sourceId: number,
  zodiacSignId: number
): boolean {
  const key = `${sourceId}-${zodiacSignId}`;
  return cache[key] === true;
}

async function createExecutionRecord(
  targetDate: string,
  triggerType: 'scheduled' | 'fallback' | 'manual' | 'late_start'
): Promise<number> {
  const targetDateObj = new Date(targetDate + 'T00:00:00.000Z');
  
  const execution = await prisma.scraperExecution.create({
    data: {
      status: 'running',
      target_date: targetDateObj,
      trigger_type: triggerType,
      started_at: new Date(),
    },
  });
  
  return execution.id;
}

async function updateExecutionRecord(
  executionId: number,
  stats: DailyScraperStats['stats'],
  status: 'completed' | 'failed'
): Promise<void> {
  await prisma.scraperExecution.update({
    where: { id: executionId },
    data: {
      status,
      completed_at: new Date(),
      total_jobs_enqueued: stats.enqueued,
      successful_jobs: stats.enqueued - stats.failed,
      failed_jobs: stats.failed,
    },
  });
  
}

async function createSourceStatusRecord(
  executionId: number,
  sourceId: number,
  zodiacSignId: number,
  targetDate: string,
  status: 'pending' | 'skipped' | 'failed',
  errorMessage?: string
): Promise<void> {
  const targetDateObj = new Date(targetDate + 'T00:00:00.000Z');
  
  try {
    await prisma.scraperSourceStatus.upsert({
      where: {
        source_id_zodiac_sign_id_target_date: {
          source_id: sourceId,
          zodiac_sign_id: zodiacSignId,
          target_date: targetDateObj,
        },
      },
      create: {
        execution_id: executionId,
        source_id: sourceId,
        zodiac_sign_id: zodiacSignId,
        target_date: targetDateObj,
        status,
        error_message: errorMessage,
      },
      update: {
        execution_id: executionId,
        status,
        error_message: errorMessage,
        attempt_count: {
          increment: 1,
        },
      },
    });
  } catch (error) {
    console.error(`[Orchestrator] Failed to create source status record:`, error);
  }
}

async function findMissingSourcesForDate(
  targetDate: string
): Promise<Array<{ id: number; name: string }>> {
  const targetDateObj = new Date(targetDate + 'T00:00:00.000Z');

  const [activeSources, coveredGroups] = await Promise.all([
    prisma.source.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    }),
    prisma.horoscopeData.groupBy({
      by: ['source_id'],
      where: {
        date: targetDateObj,
        summary: { not: '' },
      },
    }),
  ]);

  const coveredIds = new Set(coveredGroups.map((r) => r.source_id));
  return activeSources.filter((s) => !coveredIds.has(s.id));
}

export async function runDailyScraperCycle(
  options: DailyScraperOptions
): Promise<DailyScraperStats> {
  const startTime = Date.now();
  
  
  const stats: DailyScraperStats['stats'] = {
    total: 0,
    enqueued: 0,
    skipped: 0,
    failed: 0,
  };
  
  let executionId: number | null = null;
  
  try {
    // Step 1: Create execution record (unless dry run)
    if (!options.dryRun) {
      const triggerType = options.triggerType || 'manual';
      executionId = await createExecutionRecord(options.targetDate, triggerType);
    }
    
    // Step 2: Build processed cache for skip logic
    const processedCache = options.forceRescrape 
      ? {} 
      : await buildProcessedCache(options.targetDate);
    
    // Step 3: Get active sources and zodiac signs
    const sources = await prisma.source.findMany({
      where: {
        is_active: true,
        ...(options.specificSources && options.specificSources.length > 0
          ? { id: { in: options.specificSources } }
          : options.excludeSources && options.excludeSources.length > 0
          ? { id: { notIn: options.excludeSources } }
          : {}),
      },
      orderBy: { id: 'asc' },
    });
    
    const zodiacSigns = await prisma.zodiacSign.findMany({
      orderBy: { id: 'asc' },
    });
    
    
    // Step 4: Process each sign sequentially
    for (let i = 0; i < zodiacSigns.length; i++) {
      const sign = zodiacSigns[i];
      
      // Process all sources for this sign
      for (const source of sources) {
        stats.total++;
        
        // Skip logic: check if already processed
        if (!options.forceRescrape && isAlreadyProcessed(processedCache, source.id, sign.id)) {
          stats.skipped++;
          
          if (!options.dryRun && executionId) {
            await createSourceStatusRecord(
              executionId,
              source.id,
              sign.id,
              options.targetDate,
              'skipped'
            );
          }
          continue;
        }
        
        // Dry run mode: just count, don't enqueue
        if (options.dryRun) {
          stats.enqueued++;
          continue;
        }
        
        // Enqueue the scrape job using existing infrastructure
        try {
          const scraperInput = createScraperInput(source, sign, options.targetDate);
          const jobId = await enqueueScrapeJob(scraperInput);
          stats.enqueued++;
          
          if (executionId) {
            await createSourceStatusRecord(
              executionId,
              source.id,
              sign.id,
              options.targetDate,
              'pending'
            );
          }
        } catch (error) {
          stats.failed++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          console.error(`  ✗ Failed to enqueue: ${source.name} - ${errorMsg}`);
          
          if (executionId) {
            await createSourceStatusRecord(
              executionId,
              source.id,
              sign.id,
              options.targetDate,
              'failed',
              errorMsg
            );
          }
        }
      }
      
      // Add 5-second delay between signs (except after the last one)
      if (i < zodiacSigns.length - 1 && !options.dryRun) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // Step 5: Update execution record with final stats
    if (!options.dryRun && executionId) {
      await updateExecutionRecord(executionId, stats, 'completed');
    }
    
    const duration = Date.now() - startTime;
    

    // Step 6: Fallback cycle — retry sources with zero coverage (main cycle only)
    if (!options.dryRun && options.triggerType !== 'fallback') {
      const missingSources = await findMissingSourcesForDate(options.targetDate);
      if (missingSources.length > 0) {
        const missingDesc = missingSources.map((s) => `${s.name} (${s.id})`).join(', ');
        const delayMin = (FALLBACK_DELAY_MS / 60_000).toFixed(0);
        await new Promise((resolve) => setTimeout(resolve, FALLBACK_DELAY_MS));
        const missingIds = missingSources.map((s) => s.id);
        await runDailyScraperCycle({
          targetDate: options.targetDate,
          forceRescrape: false,
          specificSources: missingIds,
          triggerType: 'fallback',
        });
      }
    }

    return {
      executionId,
      duration,
      stats,
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[Orchestrator] Critical error:', error);
    
    // Mark execution as failed
    if (executionId) {
      await prisma.scraperExecution.update({
        where: { id: executionId },
        data: {
          status: 'failed',
          completed_at: new Date(),
          error_message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
    
    throw error;
  }
}
