import { WeeklyScraperInput, WeeklyScraperOutput } from '@shared/schema';
import { scrapeWeeklyWithRetry } from '../services/weeklyScraper';

export class WeeklyScraperWorker {
  async process(input: WeeklyScraperInput): Promise<WeeklyScraperOutput> {
    console.log(`[WeeklyScraperWorker] Processing ${input.sourceName} - ${input.signSlugIt} for week starting ${input.weekStartDate}`);
    
    try {
      const result = await scrapeWeeklyWithRetry(input, 3);
      
      console.log(`[WeeklyScraperWorker] Successfully scraped ${input.sourceName} - ${input.signSlugIt}`);
      return result;
    } catch (error) {
      console.error(`[WeeklyScraperWorker] Failed to scrape ${input.sourceName} - ${input.signSlugIt}:`, error);
      throw error;
    }
  }
}

export const weeklyScraperWorker = new WeeklyScraperWorker();
