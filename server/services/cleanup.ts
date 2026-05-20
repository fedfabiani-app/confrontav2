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
      });

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
