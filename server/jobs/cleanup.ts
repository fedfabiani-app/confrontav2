
import prisma from '../services/database';

/**
 * Delete horoscope data older than 90 days and reset the ID sequence
 */
export async function cleanupOldHoroscopeData(): Promise<{ dailyDeleted: number; weeklyDeleted: number }> {
  console.log('[Cleanup] Starting cleanup of old horoscope data...');
  
  try {
    // Calculate the cutoff date (90 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    
    console.log(`[Cleanup] Deleting horoscope data older than ${cutoffDate.toISOString()}`);
    
    // Delete old daily horoscope records
    const dailyDeleteResult = await prisma.horoscopeData.deleteMany({
      where: {
        date: {
          lt: cutoffDate
        }
      }
    });
    
    console.log(`[Cleanup] Deleted ${dailyDeleteResult.count} old daily horoscope records`);
    
    // Delete old weekly horoscope records
    const weeklyDeleteResult = await prisma.weeklyHoroscopeData.deleteMany({
      where: {
        week_start_date: {
          lt: cutoffDate
        }
      }
    });
    
    console.log(`[Cleanup] Deleted ${weeklyDeleteResult.count} old weekly horoscope records`);
    
    // Reset the daily horoscope ID sequence if any records were deleted
    if (dailyDeleteResult.count > 0) {
      // Get the maximum ID currently in the table
      const maxIdResult = await prisma.$queryRaw<Array<{ max: number | null }>>`
        SELECT MAX(id) as max FROM horoscope_data
      `;
      
      const maxId = maxIdResult[0]?.max || 0;
      const nextId = maxId + 1;
      
      // Reset the sequence to the next available ID
      await prisma.$executeRaw`
        SELECT setval('horoscope_data_id_seq', ${nextId}, false)
      `;
      
      console.log(`[Cleanup] Reset daily horoscope ID sequence to start at ${nextId}`);
    }
    
    // Reset the weekly horoscope ID sequence if any records were deleted
    if (weeklyDeleteResult.count > 0) {
      // Get the maximum ID currently in the table
      const maxIdResult = await prisma.$queryRaw<Array<{ max: number | null }>>`
        SELECT MAX(id) as max FROM weekly_horoscope_data
      `;
      
      const maxId = maxIdResult[0]?.max || 0;
      const nextId = maxId + 1;
      
      // Reset the sequence to the next available ID
      await prisma.$executeRaw`
        SELECT setval('weekly_horoscope_data_id_seq', ${nextId}, false)
      `;
      
      console.log(`[Cleanup] Reset weekly horoscope ID sequence to start at ${nextId}`);
    }
    
    return { 
      dailyDeleted: dailyDeleteResult.count,
      weeklyDeleted: weeklyDeleteResult.count
    };
  } catch (error) {
    console.error('[Cleanup] Error during cleanup:', error);
    throw error;
  }
}
