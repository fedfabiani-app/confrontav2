import cron from 'node-cron';
import { scrapeWeeklyHoroscopes } from './jobs/weekly';
import { cleanupOldHoroscopeData } from './jobs/cleanup';

// Schedule weekly horoscope scraping for every Monday at 6:00 AM
export function initializeCronJobs() {
  // Cron expression: 0 6 * * 1
  // - 0: minute 0
  // - 6: hour 6 (6:00 AM)
  // - *: every day of month
  // - *: every month
  // - 1: Monday (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  
  cron.schedule('0 6 * * 1', async () => {
    console.log('[Cron] Starting weekly horoscope scraping task (Monday 6:00 AM)');
    
    try {
      await scrapeWeeklyHoroscopes();
      console.log('[Cron] Weekly horoscope scraping task completed');
    } catch (error) {
      console.error('[Cron] Weekly horoscope scraping task failed:', error);
    }
  }, {
    timezone: 'Europe/Rome' // Italian timezone for Monday 6:00 AM in Italy
  });

  console.log('[Cron] Scheduled weekly horoscope scraping for every Monday at 6:00 AM (Europe/Rome)');

  // Schedule daily cleanup of old horoscope data at 3:00 AM
  // Cron expression: 0 3 * * *
  // - 0: minute 0
  // - 3: hour 3 (3:00 AM)
  // - *: every day of month
  // - *: every month
  // - *: every day of week
  
  cron.schedule('0 3 * * *', async () => {
    console.log('[Cron] Starting daily cleanup of old horoscope data (3:00 AM)');
    
    try {
      await cleanupOldHoroscopeData();
      console.log('[Cron] Daily cleanup task completed');
    } catch (error) {
      console.error('[Cron] Daily cleanup task failed:', error);
    }
  }, {
    timezone: 'Europe/Rome' // Italian timezone for 3:00 AM in Italy
  });

  console.log('[Cron] Scheduled daily cleanup of old horoscope data at 3:00 AM (Europe/Rome)');
}
