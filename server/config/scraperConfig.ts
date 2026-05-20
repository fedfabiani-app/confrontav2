import { prisma } from '../services/database';

export interface EnvConfig {
  adminSecret: string;
  timezone: string;
}

export type ScraperType = 'daily' | 'weekly';

export interface DatabaseConfig {
  id: number;
  scraperType: ScraperType;
  enabled: boolean;
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  maxRetriesPerSource: number;
  autoRetryDelayMinutes: number;
  skipAlreadyProcessed: boolean;
}

export interface ScraperConfig extends EnvConfig, DatabaseConfig {}

const DEFAULT_ENV_CONFIG: EnvConfig = {
  adminSecret: 'default-admin-secret-change-me',
  timezone: 'Europe/Rome',
};

const DEFAULT_DAILY_CONFIG: DatabaseConfig = {
  id: 1,
  scraperType: 'daily',
  enabled: true,
  startTime: '05:30:00',
  endTime: '08:00:00',
  intervalMinutes: 20,
  maxRetriesPerSource: 3,
  autoRetryDelayMinutes: 10,
  skipAlreadyProcessed: true,
};

const DEFAULT_WEEKLY_CONFIG: DatabaseConfig = {
  id: 2,
  scraperType: 'weekly',
  enabled: false,
  startTime: '05:30:00',
  endTime: '08:00:00',
  intervalMinutes: 20,
  maxRetriesPerSource: 3,
  autoRetryDelayMinutes: 10,
  skipAlreadyProcessed: true,
};

export function getEnvConfig(): EnvConfig {
  return {
    adminSecret: process.env.ADMIN_SECRET || DEFAULT_ENV_CONFIG.adminSecret,
    timezone: process.env.SCRAPER_TIMEZONE || process.env.TZ || DEFAULT_ENV_CONFIG.timezone,
  };
}

export async function ensureScraperConfigExists(scraperType: ScraperType): Promise<void> {
  try {
    const existing = await prisma.scraperConfig.findUnique({
      where: { scraper_type: scraperType },
    });

    if (!existing) {
      const defaults = scraperType === 'daily' ? DEFAULT_DAILY_CONFIG : DEFAULT_WEEKLY_CONFIG;
      await prisma.scraperConfig.create({
        data: {
          scraper_type: scraperType,
          enabled: defaults.enabled,
          start_time: defaults.startTime,
          end_time: defaults.endTime,
          interval_minutes: defaults.intervalMinutes,
          max_retries_per_source: defaults.maxRetriesPerSource,
          auto_retry_delay_minutes: defaults.autoRetryDelayMinutes,
          skip_already_processed: defaults.skipAlreadyProcessed,
        },
      });
    }
  } catch (error) {
    console.error(`[ScraperConfig] Error ensuring ${scraperType} config exists:`, error);
  }
}

export async function getDatabaseConfig(scraperType: ScraperType): Promise<DatabaseConfig | null> {
  try {
    // Ensure row exists before querying
    await ensureScraperConfigExists(scraperType);
    
    const config = await prisma.scraperConfig.findUnique({
      where: { scraper_type: scraperType },
    });

    if (!config) {
      return null;
    }

    return {
      id: config.id,
      scraperType: config.scraper_type as ScraperType,
      enabled: config.enabled,
      startTime: config.start_time,
      endTime: config.end_time,
      intervalMinutes: config.interval_minutes,
      maxRetriesPerSource: config.max_retries_per_source,
      autoRetryDelayMinutes: config.auto_retry_delay_minutes,
      skipAlreadyProcessed: config.skip_already_processed,
    };
  } catch (error) {
    console.error(`[ScraperConfig] Error reading ${scraperType} config:`, error);
    return null;
  }
}

export async function getScraperConfig(scraperType: ScraperType): Promise<ScraperConfig> {
  const envConfig = getEnvConfig();
  
  let dbConfig: DatabaseConfig;
  const dbConfigFromDb = await getDatabaseConfig(scraperType);
  
  if (dbConfigFromDb) {
    dbConfig = dbConfigFromDb;
  } else {
    dbConfig = scraperType === 'daily' ? DEFAULT_DAILY_CONFIG : DEFAULT_WEEKLY_CONFIG;
  }

  return {
    ...envConfig,
    ...dbConfig,
  };
}

// Convenience functions
export async function getDailyScraperConfig(): Promise<ScraperConfig> {
  return getScraperConfig('daily');
}

export async function getWeeklyScraperConfig(): Promise<ScraperConfig> {
  return getScraperConfig('weekly');
}

export async function updateDatabaseConfig(
  scraperType: ScraperType,
  updates: Partial<Omit<DatabaseConfig, 'id' | 'scraperType'>>
): Promise<DatabaseConfig> {
  try {
    // Filter out undefined values to avoid clobbering columns
    const data: any = {};
    if (updates.enabled !== undefined) data.enabled = updates.enabled;
    if (updates.startTime !== undefined) data.start_time = updates.startTime;
    if (updates.endTime !== undefined) data.end_time = updates.endTime;
    if (updates.intervalMinutes !== undefined) data.interval_minutes = updates.intervalMinutes;
    if (updates.maxRetriesPerSource !== undefined) data.max_retries_per_source = updates.maxRetriesPerSource;
    if (updates.autoRetryDelayMinutes !== undefined) data.auto_retry_delay_minutes = updates.autoRetryDelayMinutes;
    if (updates.skipAlreadyProcessed !== undefined) data.skip_already_processed = updates.skipAlreadyProcessed;

    const updated = await prisma.scraperConfig.update({
      where: { scraper_type: scraperType },
      data,
    });

    return {
      id: updated.id,
      scraperType: updated.scraper_type as ScraperType,
      enabled: updated.enabled,
      startTime: updated.start_time,
      endTime: updated.end_time,
      intervalMinutes: updated.interval_minutes,
      maxRetriesPerSource: updated.max_retries_per_source,
      autoRetryDelayMinutes: updated.auto_retry_delay_minutes,
      skipAlreadyProcessed: updated.skip_already_processed,
    };
  } catch (error) {
    console.error(`[ScraperConfig] Error updating ${scraperType} config:`, error);
    throw new Error(`Failed to update ${scraperType} scraper configuration`);
  }
}

export function isWithinTimeWindow(config: ScraperConfig): boolean {
  const now = new Date();
  const timezone = config.timezone;
  
  const currentTime = now.toLocaleString('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const [currentHour, currentMinute, currentSecond] = currentTime.split(':').map(Number);
  const currentSeconds = currentHour * 3600 + currentMinute * 60 + currentSecond;

  const [startHour, startMinute, startSecond] = config.startTime.split(':').map(Number);
  const startSeconds = startHour * 3600 + startMinute * 60 + startSecond;

  const [endHour, endMinute, endSecond] = config.endTime.split(':').map(Number);
  const endSeconds = endHour * 3600 + endMinute * 60 + endSecond;

  return currentSeconds >= startSeconds && currentSeconds <= endSeconds;
}

export function getItalyToday(): string {
  const timezone = process.env.SCRAPER_TIMEZONE || process.env.TZ || 'Europe/Rome';
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
}
