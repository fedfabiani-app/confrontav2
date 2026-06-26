import { prisma } from '../services/database';

/**
 * Coverage statistics for a specific week
 */
export interface WeeklyCoverageResult {
  sourceId: number;
  sourceName: string;
  domain: string;
  signsCovered: number;
  expectedSigns: number;
  lastScraped: Date | null;
  isComplete: boolean;
}

/**
 * Execution history record
 */
export interface ExecutionHistoryResult {
  id: number;
  sourceGroup: string;
  status: string;
  triggerType: string;
  startedAt: Date;
  completedAt: Date | null;
  durationMinutes: number | null;
  targetWeek: Date;
}

/**
 * UPSERT verification result
 */
export interface UpsertVerificationResult {
  sourceName: string;
  domain: string;
  sign: string;
  scrapedAt: Date;
  dayOfWeek: number;
  wasReplaced: boolean;
}

/**
 * Gap in coverage
 */
export interface CoverageGap {
  sourceId: number;
  sourceName: string;
  domain: string;
  actualRows: number;
  expectedRows: number;
  missingRows: number;
}

/**
 * Failed source details
 */
export interface FailedSourceResult {
  sourceId: number;
  sourceName: string;
  domain: string;
  signId: number;
  signName: string;
  failedAt: Date;
  errorMessage: string | null;
}

/**
 * Get coverage statistics for a specific week
 * Shows which sources have data and how complete they are
 */
export async function getWeeklyCoverage(weekStart: Date): Promise<WeeklyCoverageResult[]> {
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const results = await prisma.$queryRaw<any[]>`
    SELECT
      ws.id as "sourceId",
      ws.name as "sourceName",
      ws.domain,
      COUNT(DISTINCT whd.sign_id)::int as "signsCovered",
      12 as "expectedSigns",
      MAX(whd.scraped_at) as "lastScraped",
      (COUNT(DISTINCT whd.sign_id) = 12) as "isComplete"
    FROM weekly_sources ws
    LEFT JOIN weekly_horoscope_data whd
      ON ws.id = whd.source_id
      AND (
        (ws.is_biweekly = false AND whd.week_start_date = ${weekStart})
        OR
        (ws.is_biweekly = true AND whd.valid_from <= ${weekEnd} AND whd.valid_to >= ${weekStart})
      )
    WHERE ws.is_active = true
    GROUP BY ws.id, ws.name, ws.domain
    ORDER BY "signsCovered" DESC, ws.name
  `;

  return results.map(row => ({
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    domain: row.domain,
    signsCovered: row.signsCovered,
    expectedSigns: row.expectedSigns,
    lastScraped: row.lastScraped,
    isComplete: row.isComplete,
  }));
}

/**
 * Get execution history with optional filtering
 * SECURITY: Uses Prisma query builder to prevent SQL injection
 */
export async function getExecutionHistory(
  limit: number = 10,
  sourceGroup?: string
): Promise<ExecutionHistoryResult[]> {
  // Validate sourceGroup if provided (whitelist approach)
  if (sourceGroup && !['all', 'elle_only', 'saturday_group'].includes(sourceGroup)) {
    throw new Error(`Invalid source group: ${sourceGroup}`);
  }

  const executions = await prisma.weeklyScraperExecution.findMany({
    where: sourceGroup ? { source_group: sourceGroup } : {},
    orderBy: { started_at: 'desc' },
    take: limit,
  });

  return executions.map(exec => {
    const durationMinutes = exec.completed_at && exec.started_at
      ? (exec.completed_at.getTime() - exec.started_at.getTime()) / (1000 * 60)
      : null;

    return {
      id: exec.id,
      sourceGroup: exec.source_group,
      status: exec.status,
      triggerType: exec.trigger_type,
      startedAt: exec.started_at,
      completedAt: exec.completed_at,
      durationMinutes,
      targetWeek: exec.target_week,
    };
  });
}

/**
 * Verify UPSERT replacements (check if Thursday/Saturday updates actually replaced Monday data)
 * Shows scraped_at timestamps and day of week to verify replacement scrapes worked
 */
export async function getUpsertVerification(weekStart: Date): Promise<UpsertVerificationResult[]> {
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const results = await prisma.$queryRaw<any[]>`
    SELECT
      ws.name as "sourceName",
      ws.domain,
      zs.name_it as "sign",
      whd.scraped_at as "scrapedAt",
      EXTRACT(DOW FROM whd.scraped_at)::int as "dayOfWeek",
      (
        EXTRACT(DOW FROM whd.scraped_at) != 1 AND
        ws.domain IN ('elle.com', 'd.repubblica.it', 'www.iodonna.it', 'www.sorrisi.com')
      ) as "wasReplaced"
    FROM weekly_horoscope_data whd
    JOIN weekly_sources ws ON ws.id = whd.source_id
    JOIN zodiac_signs zs ON zs.id = whd.sign_id
    WHERE (
      (ws.is_biweekly = false AND whd.week_start_date = ${weekStart})
      OR
      (ws.is_biweekly = true AND whd.valid_from <= ${weekEnd} AND whd.valid_to >= ${weekStart})
    )
      AND ws.domain IN ('elle.com', 'd.repubblica.it', 'www.iodonna.it', 'www.sorrisi.com')
    ORDER BY ws.name, zs.id
  `;

  return results.map(row => ({
    sourceName: row.sourceName,
    domain: row.domain,
    sign: row.sign,
    scrapedAt: row.scrapedAt,
    dayOfWeek: row.dayOfWeek, // 0=Sunday, 1=Monday, 4=Thursday, 6=Saturday
    wasReplaced: row.wasReplaced,
  }));
}

/**
 * Find gaps in coverage (sources with incomplete data)
 */
export async function findGapsInCoverage(weekStart: Date): Promise<CoverageGap[]> {
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const results = await prisma.$queryRaw<any[]>`
    SELECT
      ws.id as "sourceId",
      ws.name as "sourceName",
      ws.domain,
      COUNT(whd.id)::int as "actualRows",
      12 as "expectedRows",
      (12 - COUNT(whd.id))::int as "missingRows"
    FROM weekly_sources ws
    LEFT JOIN weekly_horoscope_data whd
      ON ws.id = whd.source_id
      AND (
        (ws.is_biweekly = false AND whd.week_start_date = ${weekStart})
        OR
        (ws.is_biweekly = true AND whd.valid_from <= ${weekEnd} AND whd.valid_to >= ${weekStart})
      )
    WHERE ws.is_active = true
    GROUP BY ws.id, ws.name, ws.domain
    HAVING COUNT(whd.id) < 12
    ORDER BY "missingRows" DESC, ws.name
  `;

  return results.map(row => ({
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    domain: row.domain,
    actualRows: row.actualRows,
    expectedRows: row.expectedRows,
    missingRows: row.missingRows,
  }));
}

/**
 * Get failed sources for a specific week
 * Returns sources that failed during scraping and need retry
 */
export async function getFailedSources(weekStart: Date): Promise<FailedSourceResult[]> {
  const results = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT ON (wsss.source_id, wsss.sign_id)
      wsss.source_id as "sourceId",
      ws.name as "sourceName",
      ws.domain,
      wsss.sign_id as "signId",
      zs.name_it as "signName",
      wsss.updated_at as "failedAt",
      wsss.error_message as "errorMessage"
    FROM weekly_scraper_source_status wsss
    JOIN weekly_sources ws ON ws.id = wsss.source_id
    JOIN zodiac_signs zs ON zs.id = wsss.sign_id
    JOIN weekly_scraper_execution wse ON wse.id = wsss.execution_id
    WHERE wse.target_week = ${weekStart}
      AND wsss.status = 'failed'
    ORDER BY wsss.source_id, wsss.sign_id, wsss.updated_at DESC
  `;

  return results.map(row => ({
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    domain: row.domain,
    signId: row.signId,
    signName: row.signName,
    failedAt: row.failedAt,
    errorMessage: row.errorMessage,
  }));
}

/**
 * Get health statistics for monitoring
 */
export async function getHealthStats(weekStart: Date) {
  const coverage = await getWeeklyCoverage(weekStart);
  const gaps = await findGapsInCoverage(weekStart);
  const failed = await getFailedSources(weekStart);
  
  const totalSources = coverage.length;
  const completeSources = coverage.filter(c => c.isComplete).length;
  const coveragePercent = totalSources > 0 ? (completeSources / totalSources) * 100 : 0;
  
  return {
    totalSources,
    completeSources,
    coveragePercent: Math.round(coveragePercent * 10) / 10,
    sourcesWithGaps: gaps.length,
    failedSourcesCount: failed.length,
    lastScraped: coverage[0]?.lastScraped || null,
  };
}

/**
 * Find stale executions (running for more than specified hours)
 */
export async function findStaleExecutions(hoursThreshold: number = 2): Promise<any[]> {
  const threshold = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);
  
  return await prisma.weeklyScraperExecution.findMany({
    where: {
      status: 'running',
      started_at: {
        lt: threshold,
      },
    },
    select: {
      id: true,
      target_week: true,
      source_group: true,
      started_at: true,
      trigger_type: true,
    },
  });
}

/**
 * Mark stale executions as timed out
 */
export async function markStaleExecutionsAsTimeout(hoursThreshold: number = 2): Promise<number> {
  const threshold = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);
  
  const result = await prisma.weeklyScraperExecution.updateMany({
    where: {
      status: 'running',
      started_at: {
        lt: threshold,
      },
    },
    data: {
      status: 'timeout',
      completed_at: new Date(),
    },
  });
  
  return result.count;
}
