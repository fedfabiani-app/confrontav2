import prisma from './database';

const CLEANUP_INTERVAL_DAYS = 31;

export class CleanupTracker {
  async getLastCleanupDate(): Promise<Date | null> {
    const result = await prisma.$queryRaw<Array<{ last_cleanup: Date }>>`
      SELECT last_cleanup FROM cleanup_tracker ORDER BY last_cleanup DESC LIMIT 1
    `;
    
    return result.length > 0 ? result[0].last_cleanup : null;
  }

  async setLastCleanupDate(date: Date): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO cleanup_tracker (last_cleanup) VALUES (${date})
    `;
  }

  async shouldRunCleanup(): Promise<boolean> {
    const lastCleanup = await this.getLastCleanupDate();
    
    if (!lastCleanup) {
      return true; // Never run before
    }

    const daysSinceLastCleanup = Math.floor(
      (Date.now() - lastCleanup.getTime()) / (1000 * 60 * 60 * 24)
    );

    return daysSinceLastCleanup >= CLEANUP_INTERVAL_DAYS;
  }

  async ensureTrackerTable(): Promise<void> {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS cleanup_tracker (
        id SERIAL PRIMARY KEY,
        last_cleanup TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
  }
}

export const cleanupTracker = new CleanupTracker();
