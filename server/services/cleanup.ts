import prisma from './database';
import type { Prisma } from '@prisma/client';

export class CleanupService {
  async cleanupHoroscopeData(): Promise<void> {
    
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`DELETE FROM horoscope_data WHERE date < NOW() - INTERVAL '31 days'`;

        await tx.$executeRaw`DELETE FROM weekly_horoscope_data WHERE week_start_date < NOW() - INTERVAL '31 days'`;

        await tx.$executeRaw`DELETE FROM compatibility_results WHERE period_date < NOW() - INTERVAL '31 days'`;
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
