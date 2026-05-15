import { ScraperInput, ScraperOutput } from '@shared/schema';
import { scrapeWithRetry } from '../services/scraper';

export class ScraperWorker {
  async process(input: ScraperInput): Promise<ScraperOutput> {
    
    try {
      const result = await scrapeWithRetry(input, 3);
      
      return result;
    } catch (error) {
      console.error(`[ScraperWorker] Failed to scrape ${input.sourceName} - ${input.signSlugIt}:`, error);
      throw error;
    }
  }
}

export const scraperWorker = new ScraperWorker();
