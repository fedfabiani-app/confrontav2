import { prisma } from './database';
import { enqueueWeeklyScrapeJob } from '../jobs';
import { WeeklyScraperInput } from '@shared/schema';
import { format } from 'date-fns';
import {
  getCurrentWeekStart,
  getMondayOfWeek,
  getSourceGroup,
  formatWeekUrlParams
} from '../utils/weekUtils';

export type SourceGroup = 'all' | 'elle_only' | 'saturday_group' | 'sunday_group';

export interface WeeklyScraperOptions {
  weekStart?: Date;
  forceRescrape?: boolean;
  specificSources?: number[];
  excludeSources?: number[];
  sourceGroup?: SourceGroup;
  dryRun?: boolean;
  triggerType?: 'scheduled' | 'fallback' | 'manual';
}

export interface WeeklyScraperStats {
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

/**
 * Check if a scrape has completed for this source_group and week
 * Used by guards to prevent duplicate scheduled runs
 */
export async function hasCompletedGroupScrapeForWeek(
  weekStart: Date,
  sourceGroup: SourceGroup
): Promise<boolean> {
  const execution = await prisma.weeklyScraperExecution.findFirst({
    where: {
      target_week: weekStart,
      source_group: sourceGroup,
      status: 'completed',
    },
  });
  
  return execution !== null;
}

/**
 * Get list of source IDs that failed for this week and source group
 * Used by fallback retry mechanism
 */
export async function getFailedWeeklySources(
  weekStart: Date,
  sourceGroup?: SourceGroup
): Promise<number[]> {
  const failedStatuses = await prisma.weeklyScraperSourceStatus.findMany({
    where: {
      target_week: weekStart,
      status: 'failed',
      ...(sourceGroup && sourceGroup !== 'all' ? {
        source: {
          slug: sourceGroup === 'elle_only' 
            ? { contains: 'elle' }
            : { in: ['d-repubblica', 'iodonna', 'sorrisi'] }
        }
      } : {})
    },
    select: {
      source_id: true,
    },
    distinct: ['source_id'],
  });
  
  return failedStatuses.map((s: { source_id: number }) => s.source_id);
}

export async function getMissingDataWeeklySources(weekStart: Date): Promise<number[]> {
  const attempted = await prisma.weeklyScraperSourceStatus.findMany({
    where: {
      target_week: weekStart,
      status: { in: ['pending', 'failed'] },
    },
    select: { source_id: true },
    distinct: ['source_id'],
  });

  if (attempted.length === 0) return [];

  const attemptedIds = attempted.map((s: { source_id: number }) => s.source_id);
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

  const [withDataExact, withDataBiweekly] = await Promise.all([
    prisma.weeklyHoroscopeData.findMany({
      where: {
        week_start_date: weekStart,
        source_id: { in: attemptedIds },
        summary: { not: '' },
      },
      select: { source_id: true },
      distinct: ['source_id'],
    }),
    prisma.weeklyHoroscopeData.findMany({
      where: {
        source_id: { in: attemptedIds },
        valid_from: { lte: weekEnd },
        valid_to: { gte: weekStart },
        summary: { not: '' },
        weekly_source: { is_biweekly: true },
      },
      select: { source_id: true },
      distinct: ['source_id'],
    }),
  ]);

  const withDataSet = new Set([
    ...withDataExact.map((s: { source_id: number }) => s.source_id),
    ...withDataBiweekly.map((s: { source_id: number }) => s.source_id),
  ]);

  return attemptedIds.filter((id: number) => !withDataSet.has(id));
}

function createWeeklyScraperInput(source: any, zodiacSign: any, weekStart: Date): WeeklyScraperInput {
  const isSaturdayBased = source.domain.includes('repubblica.it') || source.domain.includes('sorrisi.com');
  const useNumericMonth = source.domain.includes('repubblica.it');

  const { startDay, endDay, month, year } = formatWeekUrlParams(weekStart, isSaturdayBased, useNumericMonth);
  
  return {
    sourceId: source.id,
    sourceName: source.name,
    domain: source.domain,
    baseUrl: source.base_url,
    urlPattern: source.url_pattern,
    scrapeStrategy: source.scrape_strategy,
    signSlugIt: zodiacSign.name_italian,
    weekStartDate: format(weekStart, 'yyyy-MM-dd'),
    startDay,
    endDay,
    month,
    year,
    userAgent: process.env.SCRAPE_USER_AGENT || 'ItalianHoroscopeComparatorBot/1.0 (+contact)',
  };
}

async function buildProcessedCache(weekStart: Date): Promise<ProcessedCache> {
  
  const cache: ProcessedCache = {};
  
  // Query all successfully processed weekly horoscopes for the target week
  const processedHoroscopes = await prisma.weeklyHoroscopeData.findMany({
    where: {
      week_start_date: weekStart,
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
  weekStart: Date,
  sourceGroup: SourceGroup,
  triggerType: 'scheduled' | 'fallback' | 'manual'
): Promise<number> {
  const execution = await prisma.weeklyScraperExecution.create({
    data: {
      status: 'running',
      target_week: weekStart,
      source_group: sourceGroup,
      trigger_type: triggerType,
      started_at: new Date(),
    },
  });
  
  return execution.id;
}

async function updateExecutionRecord(
  executionId: number,
  stats: WeeklyScraperStats['stats'],
  status: 'completed' | 'failed'
): Promise<void> {
  await prisma.weeklyScraperExecution.update({
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
  weekStart: Date,
  status: 'pending' | 'skipped' | 'failed',
  errorMessage?: string
): Promise<void> {
  try {
    await prisma.weeklyScraperSourceStatus.upsert({
      where: {
        source_id_zodiac_sign_id_target_week: {
          source_id: sourceId,
          zodiac_sign_id: zodiacSignId,
          target_week: weekStart,
        },
      },
      create: {
        execution_id: executionId,
        source_id: sourceId,
        zodiac_sign_id: zodiacSignId,
        target_week: weekStart,
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
    console.error(`[Weekly Orchestrator] Failed to create source status record:`, error);
  }
}

export async function runWeeklyScraperCycle(
  options: WeeklyScraperOptions
): Promise<WeeklyScraperStats> {
  const startTime = Date.now();
  
  // Default to current week if not specified
  const weekStart = options.weekStart 
    ? getMondayOfWeek(options.weekStart) 
    : getCurrentWeekStart();
  
  // Default to 'all' source group if not specified
  const sourceGroup = options.sourceGroup || 'all';
  
  
  const stats: WeeklyScraperStats['stats'] = {
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
      executionId = await createExecutionRecord(weekStart, sourceGroup, triggerType);
    }
    
    // Step 2: Build processed cache for skip logic
    const processedCache = options.forceRescrape 
      ? {} 
      : await buildProcessedCache(weekStart);
    
    // Step 3: Get active weekly sources and zodiac signs
    let sources = await prisma.weeklySource.findMany({
      where: {
        is_active: true,
        ...(options.specificSources && options.specificSources.length > 0
          ? { id: { in: options.specificSources } }
          : {}),
      },
      orderBy: { id: 'asc' },
    });
    
    // Filter sources by group if not 'all'
    if (sourceGroup !== 'all') {
      sources = sources.filter(source => {
        // Get slug from source or extract from domain
        const slug = (source as any).slug || source.domain.split('.')[0];
        const group = getSourceGroup(slug);
        return group === sourceGroup;
      });
    }

    if (options.excludeSources && options.excludeSources.length > 0) {
      const excludeSet = new Set(options.excludeSources);
      sources = sources.filter(source => !excludeSet.has(source.id));
    }

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
              weekStart,
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
          const scraperInput = createWeeklyScraperInput(source, sign, weekStart);
          const jobId = await enqueueWeeklyScrapeJob(scraperInput);
          stats.enqueued++;
          
          if (executionId) {
            await createSourceStatusRecord(
              executionId,
              source.id,
              sign.id,
              weekStart,
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
              weekStart,
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
    
    
    return {
      executionId,
      duration,
      stats,
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[Weekly Orchestrator] Critical error:', error);
    
    // Mark execution as failed
    if (executionId) {
      await prisma.weeklyScraperExecution.update({
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
