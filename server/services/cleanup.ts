import prisma from './database';
import type { Prisma } from '@prisma/client';

export class CleanupService {
  async cleanupHoroscopeData(): Promise<void> {
    
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const deletedHoroscopes = await tx.$executeRaw`DELETE FROM horoscope_data`;

        const deletedWeekly = await tx.$executeRaw`DELETE FROM weekly_horoscope_data`;

        await tx.$executeRaw`ALTER SEQUENCE horoscope_data_id_seq RESTART WITH 1`;

        await tx.$executeRaw`ALTER SEQUENCE weekly_horoscope_data_id_seq RESTART WITH 1`;

        await tx.$executeRaw`DELETE FROM compatibility_results`;

        await tx.$executeRaw`ALTER SEQUENCE compatibility_results_id_seq RESTART WITH 1`;
      });

    } catch (error) {
      console.error('[CleanupService] Error during cleanup:', error);
      throw error;
    }
  }

  async getDataStats(): Promise<{ horoscopes: number; weeklyHoroscopes: number; compatibilityResults: number }> {
    const horoscopes = await prisma.horoscopeData.count();
    const weeklyHoroscopes = await prisma.weeklyHoroscopeData.count();
    const compatibilityResults = await prisma.compatibilityResult.count();

    return {
      horoscopes,
      weeklyHoroscopes,
      compatibilityResults,
    };
  }
}

export const cleanupService = new CleanupService();
