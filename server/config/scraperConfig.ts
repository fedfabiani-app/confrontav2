import { prisma } from '../services/database';

export interface EnvConfig {
  adminSecret: string;
  timezone: string;
}

export interface DatabaseConfig {
  id: number;
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

const DEFAULT_DATABASE_CONFIG: DatabaseConfig = {
  id: 1,
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

export async function getDatabaseConfig(): Promise<DatabaseConfig | null> {
  try {
    const config = await prisma.scraperConfig.findUnique({
      where: { id: 1 },
    });

    if (!config) {
      return null;
    }

    return {
      id: config.id,
      enabled: config.enabled,
      startTime: config.start_time,
      endTime: config.end_time,
      intervalMinutes: config.interval_minutes,
      maxRetriesPerSource: config.max_retries_per_source,
      autoRetryDelayMinutes: config.auto_retry_delay_minutes,
      skipAlreadyProcessed: config.skip_already_processed,
    };
  } catch (error) {
    console.error('[ScraperConfig] Error reading database config:', error);
    return null;
  }
}

export async function getScraperConfig(): Promise<ScraperConfig> {
  const envConfig = getEnvConfig();
  
  let dbConfig: DatabaseConfig;
  const dbConfigFromDb = await getDatabaseConfig();
  
  if (dbConfigFromDb) {
    dbConfig = dbConfigFromDb;
    console.log('[ScraperConfig] Using database configuration');
  } else {
    dbConfig = DEFAULT_DATABASE_CONFIG;
    console.log('[ScraperConfig] Database config not available, using defaults');
  }

  return {
    ...envConfig,
    ...dbConfig,
  };
}

export async function updateDatabaseConfig(updates: Partial<Omit<DatabaseConfig, 'id'>>): Promise<DatabaseConfig> {
  try {
    const updated = await prisma.scraperConfig.update({
      where: { id: 1 },
      data: {
        enabled: updates.enabled,
        start_time: updates.startTime,
        end_time: updates.endTime,
        interval_minutes: updates.intervalMinutes,
        max_retries_per_source: updates.maxRetriesPerSource,
        auto_retry_delay_minutes: updates.autoRetryDelayMinutes,
        skip_already_processed: updates.skipAlreadyProcessed,
      },
    });

    return {
      id: updated.id,
      enabled: updated.enabled,
      startTime: updated.start_time,
      endTime: updated.end_time,
      intervalMinutes: updated.interval_minutes,
      maxRetriesPerSource: updated.max_retries_per_source,
      autoRetryDelayMinutes: updated.auto_retry_delay_minutes,
      skipAlreadyProcessed: updated.skip_already_processed,
    };
  } catch (error) {
    console.error('[ScraperConfig] Error updating database config:', error);
    throw new Error('Failed to update scraper configuration');
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
