import { WeeklyScraperInput, WeeklyScraperOutput } from '@shared/schema';
import { scrapeWeeklyWithRetry } from '../services/weeklyScraper';
import axios from 'axios';
import * as cheerio from 'cheerio';

export class WeeklyScraperWorker {
  async process(input: WeeklyScraperInput): Promise<WeeklyScraperOutput> {

    try {
      let modifiedInput = { ...input };

      // Check if this is Marie Claire
      const isMarieClair = input.sourceName.toLowerCase().includes('marie') || 
                           input.domain.includes('marieclaire.it') ||
                           input.baseUrl.includes('marieclaire.it');

      if (isMarieClair) {
        const resolvedUrl = await this.resolveMarieClairUrl(input.weekStartDate);

        if (resolvedUrl) {
          modifiedInput = {
            ...input,
            baseUrl: resolvedUrl,
            urlPattern: '',
            scrapeStrategy: 'pattern' // Prevent re-entering archive logic with the article URL
          };
        } else {
          console.warn('[WeeklyScraperWorker] Could not resolve URL from archive, trying fallback...');
          const fallbackUrl = await this.findMarieClairUrlFromLifestyle();

          if (fallbackUrl) {
            modifiedInput = {
              ...input,
              baseUrl: fallbackUrl,
              urlPattern: '',
              scrapeStrategy: 'pattern'
            };
          } else {
            throw new Error('Could not find valid Marie Claire horoscope URL');
          }
        }
      }


      const result = await scrapeWeeklyWithRetry(modifiedInput, 3);


      return result;
    } catch (error) {
      console.error(`[WeeklyScraperWorker] Failed to scrape ${input.sourceName} - ${input.signSlugIt}:`, error);
      throw error;
    }
  }

  private async resolveMarieClairUrl(weekStartDate: string): Promise<string | null> {
    try {

      const response = await axios.get('https://www.marieclaire.it/oroscopo/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'it-IT,it;q=0.9'
        },
        timeout: 15000
      });


      const $ = cheerio.load(response.data);
      const urls: string[] = [];

      $('a').each((_, element) => {
        const href = $(element).attr('href');

        if (href && /oroscopo[-_](?:settimana|\d)/.test(href) && href.includes('/lifestyle/coolmix/a')) {
          const fullUrl = href.startsWith('http') ? href : `https://www.marieclaire.it${href}`;

          if (!urls.includes(fullUrl)) {
            urls.push(fullUrl);
          }
        }
      });


      if (urls.length > 0) {
        // Ordina per ID più alto (più recente)
        urls.sort((a, b) => {
          const matchA = a.match(/\/a(\d+)\//);
          const matchB = b.match(/\/a(\d+)\//);
          const idA = matchA ? parseInt(matchA[1]) : 0;
          const idB = matchB ? parseInt(matchB[1]) : 0;
          return idB - idA;
        });

        return urls[0];
      }

      console.warn('[MarieClair] No URLs found in archive');
      return null;
    } catch (error) {
      console.error('[MarieClair] Error resolving URL:', error);
      return null;
    }
  }

  private async findMarieClairUrlFromLifestyle(): Promise<string | null> {
    try {

      const response = await axios.get('https://www.marieclaire.it/lifestyle/coolmix/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 15000
      });

      const $ = cheerio.load(response.data);
      const urls: string[] = [];

      $('a').each((_, element) => {
        const href = $(element).attr('href');
        const text = $(element).text().toLowerCase();

        if (href &&
            (/oroscopo[-_](?:settimana|\d)/.test(href) || text.includes('oroscopo')) &&
            href.includes('/lifestyle/coolmix/a')) {
          const fullUrl = href.startsWith('http') ? href : `https://www.marieclaire.it${href}`;

          if (!urls.includes(fullUrl)) {
            urls.push(fullUrl);
          }
        }
      });


      if (urls.length > 0) {
        urls.sort((a, b) => {
          const matchA = a.match(/\/a(\d+)\//);
          const matchB = b.match(/\/a(\d+)\//);
          const idA = matchA ? parseInt(matchA[1]) : 0;
          const idB = matchB ? parseInt(matchB[1]) : 0;
          return idB - idA;
        });

        return urls[0];
      }

      return null;
    } catch (error) {
      console.error('[MarieClair] Error in fallback:', error);
      return null;
    }
  }
}

export const weeklyScraperWorker = new WeeklyScraperWorker();
