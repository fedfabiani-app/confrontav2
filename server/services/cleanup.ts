
import prisma from './database';

interface CleanupResult {
  success: boolean;
  horoscopeDataDeleted: number;
  weeklyHoroscopeDataDeleted: number;
  timestamp: Date;
  error?: string;
}

export async function performDatabaseCleanup(): Promise<CleanupResult> {
  const timestamp = new Date();
  console.log(`[Cleanup] Starting database cleanup at ${timestamp.toISOString()}`);

  try {
    // Use a transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Count records before deletion
      const horoscopeCount = await tx.horoscopeData.count();
      const weeklyCount = await tx.weeklyHoroscopeData.count();

      console.log(`[Cleanup] Found ${horoscopeCount} records in horoscope_data`);
      console.log(`[Cleanup] Found ${weeklyCount} records in weekly_horoscope_data`);

      // Delete all records from both tables
      await tx.horoscopeData.deleteMany({});
      await tx.weeklyHoroscopeData.deleteMany({});

      // Reset auto-increment sequences (PostgreSQL specific)
      await tx.$executeRawUnsafe('ALTER SEQUENCE horoscope_data_id_seq RESTART WITH 1');
      await tx.$executeRawUnsafe('ALTER SEQUENCE weekly_horoscope_data_id_seq RESTART WITH 1');

      console.log(`[Cleanup] Successfully deleted ${horoscopeCount} horoscope records`);
      console.log(`[Cleanup] Successfully deleted ${weeklyCount} weekly horoscope records`);
      console.log(`[Cleanup] Reset auto-increment sequences`);

      return {
        horoscopeDataDeleted: horoscopeCount,
        weeklyHoroscopeDataDeleted: weeklyCount,
      };
    });

    // Log the cleanup operation
    await logCleanupOperation({
      success: true,
      horoscopeDataDeleted: result.horoscopeDataDeleted,
      weeklyHoroscopeDataDeleted: result.weeklyHoroscopeDataDeleted,
      timestamp,
    });

    return {
      success: true,
      horoscopeDataDeleted: result.horoscopeDataDeleted,
      weeklyHoroscopeDataDeleted: result.weeklyHoroscopeDataDeleted,
      timestamp,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Cleanup] Database cleanup failed:`, error);

    // Log the failed operation
    await logCleanupOperation({
      success: false,
      horoscopeDataDeleted: 0,
      weeklyHoroscopeDataDeleted: 0,
      timestamp,
      error: errorMessage,
    });

    return {
      success: false,
      horoscopeDataDeleted: 0,
      weeklyHoroscopeDataDeleted: 0,
      timestamp,
      error: errorMessage,
    };
  }
}

async function logCleanupOperation(result: CleanupResult): Promise<void> {
  try {
    await prisma.cleanupLog.create({
      data: {
        timestamp: result.timestamp,
        success: result.success,
        horoscope_data_deleted: result.horoscopeDataDeleted,
        weekly_horoscope_data_deleted: result.weeklyHoroscopeDataDeleted,
        error_message: result.error || null,
      },
    });

    console.log('[Cleanup] Operation logged to database');
  } catch (error) {
    console.error('[Cleanup] Failed to log cleanup operation:', error);
  }
}

export async function getLastCleanupStatus(): Promise<CleanupResult | null> {
  try {
    const lastLog = await prisma.cleanupLog.findFirst({
      orderBy: { timestamp: 'desc' },
    });

    if (!lastLog) return null;

    return {
      success: lastLog.success,
      horoscopeDataDeleted: lastLog.horoscope_data_deleted,
      weeklyHoroscopeDataDeleted: lastLog.weekly_horoscope_data_deleted,
      timestamp: lastLog.timestamp,
      error: lastLog.error_message || undefined,
    };
  } catch (error) {
    console.error('[Cleanup] Failed to get last cleanup status:', error);
    return null;
  }
}
