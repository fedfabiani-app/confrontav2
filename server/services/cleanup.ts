import prisma from './database';
import type { Prisma } from '@prisma/client';

export class CleanupService {
  async cleanupHoroscopeData(): Promise<void> {
    console.log('[CleanupService] Starting horoscope data cleanup...');
    
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        console.log('[CleanupService] Deleting all horoscope_data entries...');
        const deletedHoroscopes = await tx.$executeRaw`DELETE FROM horoscope_data`;
        console.log(`[CleanupService] Deleted ${deletedHoroscopes} horoscope_data entries`);

        console.log('[CleanupService] Deleting all weekly_horoscope_data entries...');
        const deletedWeekly = await tx.$executeRaw`DELETE FROM weekly_horoscope_data`;
        console.log(`[CleanupService] Deleted ${deletedWeekly} weekly_horoscope_data entries`);

        console.log('[CleanupService] Resetting horoscope_data ID sequence...');
        await tx.$executeRaw`ALTER SEQUENCE horoscope_data_id_seq RESTART WITH 1`;
        
        console.log('[CleanupService] Resetting weekly_horoscope_data ID sequence...');
        await tx.$executeRaw`ALTER SEQUENCE weekly_horoscope_data_id_seq RESTART WITH 1`;
      });

      console.log('[CleanupService] Cleanup completed successfully');
    } catch (error) {
      console.error('[CleanupService] Error during cleanup:', error);
      throw error;
    }
  }

  async getDataStats(): Promise<{ horoscopes: number; weeklyHoroscopes: number }> {
    const horoscopes = await prisma.horoscopeData.count();
    const weeklyHoroscopes = await prisma.weeklyHoroscopeData.count();
    
    return {
      horoscopes,
      weeklyHoroscopes,
    };
  }
}

export const cleanupService = new CleanupService();
