import { ScraperInput, ScraperOutput } from '@shared/schema';
import { scrapeWithRetry } from '../services/scraper';

export class ScraperWorker {
  async process(input: ScraperInput): Promise<ScraperOutput> {
    console.log(`[ScraperWorker] Processing ${input.sourceName} - ${input.signSlugIt} for ${input.dateISO}`);
    
    try {
      const result = await scrapeWithRetry(input, 3);
      
      console.log(`[ScraperWorker] Successfully scraped ${input.sourceName} - ${input.signSlugIt}`);
      return result;
    } catch (error) {
      console.error(`[ScraperWorker] Failed to scrape ${input.sourceName} - ${input.signSlugIt}:`, error);
      throw error;
    }
  }
}

export const scraperWorker = new ScraperWorker();
