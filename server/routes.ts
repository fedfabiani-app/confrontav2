import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import prisma from "./services/database";
import { enqueueScrapeJob, enqueueWeeklyScrapeJob, getAllJobStatuses, getJobStatus } from "./jobs";
import { ScraperInput, WeeklyScraperInput } from "@shared/schema";
import { ZODIAC_SIGNS_IT_EN, ITALIAN_WEEKDAYS, ITALIAN_MONTHS } from "@shared/constants";
import { getMondayOfWeek, formatWeekUrlParams } from "./utils/weekUtils";

export async function registerRoutes(app: Express): Promise<Server> {

  // POST /api/cleanup/manual - Trigger manual database cleanup
  app.post("/api/cleanup/manual", async (req, res) => {
    try {
      console.log('[API] Manual cleanup triggered');
      const { triggerManualCleanup } = await import('./jobs/cleanup');
      const result = await triggerManualCleanup();

      if (result.success) {
        res.json({
          success: true,
          message: 'Database cleanup completed successfully',
          horoscopeDataDeleted: result.horoscopeDataDeleted,
          weeklyHoroscopeDataDeleted: result.weeklyHoroscopeDataDeleted,
          timestamp: result.timestamp,
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Database cleanup failed',
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Error during manual cleanup:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to perform cleanup' 
      });
    }
  });

  // GET /api/refresh/status
  app.get("/api/refresh/status", async (req, res) => {
    try {
      const allJobs = getAllJobStatuses();

      const summary = {
        total: allJobs.length,
        pending: allJobs.filter(j => j.status === 'pending').length,
        running: allJobs.filter(j => j.status === 'running').length,
        completed: allJobs.filter(j => j.status === 'completed').length,
        failed: allJobs.filter(j => j.status === 'failed').length,
      };

      res.json({
        summary,
        jobs: allJobs.slice(0, 50), // Limit to last 50 jobs for performance
      });
    } catch (error) {
      console.error('Error fetching job status:', error);
      res.status(500).json({ error: 'Failed to fetch job status' });
    }
  });

  // GET /health
  app.get("/health", (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      queues: {
        scrape: 'active',
        nlp: 'active',
      }
    });
  });

  // GET /api/debug/sources - Debug route to inspect source configurations
  app.get("/api/debug/sources", async (req, res) => {
    try {
      const sources = await prisma.source.findMany({
        where: { is_active: true },
        select: {
          id: true,
          name: true,
          domain: true,
          base_url: true,
          url_pattern: true,
          reliability_score: true
        }
      });

      // Test URL building for each source
      const testResults = sources.map(source => {
        const testInput = createScraperInput(source, { name_italian: 'Ariete' }, '2025-09-29');
        const testUrls = buildHoroscopeUrl(testInput);
        return {
          ...source,
          testUrls: Array.isArray(testUrls) ? testUrls : [testUrls]
        };
      });

      res.json({
        sources: testResults
      });
    } catch (error) {
      console.error('Error in debug sources route:', error);
      res.status(500).json({ error: 'Failed to fetch debug sources info' });
    }
  });

  // GET /api/debug/database - Debug route to inspect database contents
  app.get("/api/debug/database", async (req, res) => {
    try {
      const { date } = req.query;
      const targetDate = date as string || new Date().toISOString().split('T')[0];

      const [totalHoroscopes, recentHoroscopes, zodiacSigns, sources] = await Promise.all([
        prisma.horoscopeData.count({
          where: { date: new Date(targetDate) }
        }),
        prisma.horoscopeData.findMany({
          where: { date: new Date(targetDate) },
          include: {
            source: { select: { name: true } },
            zodiac_sign: { select: { name_italian: true, name_english: true } }
          },
          orderBy: { created_at: 'desc' },
          take: 10
        }),
        prisma.zodiacSign.count(),
        prisma.source.count({ where: { is_active: true } })
      ]);

      res.json({
        targetDate,
        counts: {
          totalHoroscopesForDate: totalHoroscopes,
          zodiacSigns,
          activeSources: sources
        },
        recentEntries: recentHoroscopes.map(h => ({
          id: h.id,
          source: h.source.name,
          sign: `${h.zodiac_sign.name_italian} (${h.zodiac_sign.name_english})`,
          summary: h.summary.substring(0, 100) + '...',
          ratings: {
            relazioni: h.relazioni_rating,
            lavoro: h.lavoro_rating,
            salute: h.salute_rating
          },
          tone: h.tone_analysis,
          createdAt: h.created_at
        }))
      });
    } catch (error) {
      console.error('Error in debug route:', error);
      res.status(500).json({ error: 'Failed to fetch debug info' });
    }
  });

  // Manual trigger for scraping and processing
  app.post('/api/scrape/trigger', async (req, res) => {
    try {
      const { sourceIds, signSlugs, dateISO } = req.body;

      // Default to today if no date provided
      const targetDate = dateISO || new Date().toISOString().split('T')[0];

      // Get sources and signs from database
      const sources = await prisma.source.findMany({
        where: sourceIds ? { id: { in: sourceIds } } : { is_active: true }
      });

      const zodiacSigns = await prisma.zodiacSign.findMany({
        where: signSlugs ? { name_english: { in: signSlugs } } : {},
        orderBy: { id: 'asc' }
      });

      const jobIds: string[] = [];

      // Enqueue scraping jobs for each combination
      for (const source of sources) {
        for (const sign of zodiacSigns) {
          const scraperInput = createScraperInput(source, sign, targetDate);
          const jobId = await enqueueScrapeJob(scraperInput);
          jobIds.push(jobId);
        }
      }

      res.json({
        message: `Enqueued ${jobIds.length} scraping jobs`,
        jobIds,
        targetDate
      });
    } catch (error) {
      console.error('Manual scraping trigger error:', error);
      res.status(500).json({
        error: 'Failed to trigger scraping',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function to build horoscope URLs (for debugging)
function buildHoroscopeUrl(input: ScraperInput): string | string[] {
  // Define signMap for URL building
  const signMap: Record<string, string> = {
    'Ariete': 'ariete', 'Toro': 'toro', 'Gemelli': 'gemelli', 'Cancro': 'cancro',
    'Leone': 'leone', 'Vergine': 'vergine', 'Bilancia': 'bilancia', 'Scorpione': 'scorpione',
    'Sagittario': 'sagittario', 'Capricorno': 'capricorno', 'Acquario': 'acquario', 'Pesci': 'pesci'
  };

  // Handle Repubblica.it special case - use index page first
  if (input.domain.includes('repubblica.it')) {
    return input.baseUrl + input.urlPattern;
  }

  // Handle IO Donna special case - try date-specific URL first
  if (input.domain.includes('iodonna.it')) {
    const signSlug = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();
    const targetDate = new Date(input.dateISO);
    const day = targetDate.getDate().toString().padStart(2, '0');
    const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');
    const year = targetDate.getFullYear();
    return `${input.baseUrl}/oroscopo/giorno/${signSlug}-${day}-${month}-${year}/`;
  }

  let url = input.baseUrl + input.urlPattern;
  const targetDate = new Date(input.dateISO);

  // Handle date-specific URLs for sources that need them
  if ((input.domain.includes('alfemminile.com') || input.domain.includes('fanpage.it') || input.domain.includes('gazzetta.it')) && url.includes('{weekday}')) {
    const day = targetDate.getDate();
    const month = targetDate.getMonth();
    const year = targetDate.getFullYear();
    const weekday = ITALIAN_WEEKDAYS[targetDate.getDay()];
    const monthName = ITALIAN_MONTHS[month];

    url = url.replace('{weekday}', weekday);
    url = url.replace('{day}', day.toString());
    url = url.replace('{month}', monthName);
    url = url.replace('{year}', year.toString());

    // Enhanced handling for Gazzetta.it - they use multiple URL patterns
    if (input.domain.includes('gazzetta.it')) {
      const prevDate = new Date(targetDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateFormatted = prevDate.toISOString().split('T')[0].split('-').reverse().join('-');
      const currentDateFormatted = targetDate.toISOString().split('T')[0].split('-').reverse().join('-');

      const gazzettaSignSlug = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();
      const baseSlug = `oroscopo-${weekday}-${day}-${monthName}-${year}`;
      const slug1 = `${baseSlug}-previsioni-per-12-i-segni`;
      const slug2 = `${baseSlug}-previsioni-per-tutti-i-segni`;

      const url1 = `${input.baseUrl}/oroscopo/storie/${prevDateFormatted}/${slug1}/${gazzettaSignSlug}.shtml`;
      const url2 = `${input.baseUrl}/oroscopo/storie/${prevDateFormatted}/${slug2}/${gazzettaSignSlug}.shtml`;
      const url3 = `${input.baseUrl}/oroscopo/storie/${currentDateFormatted}/${slug1}/${gazzettaSignSlug}.shtml`;
      const url4 = `${input.baseUrl}/oroscopo/storie/${currentDateFormatted}/${slug2}/${gazzettaSignSlug}.shtml`;

      return [url1, url2, url3, url4];
    }
  }

  // Standard replacements
  let signSlug = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();

  // Oggi.it uses capitalized zodiac sign names
  if (input.domain.includes('oggi.it')) {
    signSlug = input.signSlugIt;
  }

  url = url.replace('{sign}', signSlug);
  url = url.replace('{dd}', targetDate.getDate().toString().padStart(2, '0'));
  url = url.replace('{day}', targetDate.getDate().toString());
  url = url.replace('{mm}', (targetDate.getMonth() + 1).toString().padStart(2, '0'));
  url = url.replace('{month}', ITALIAN_MONTHS[targetDate.getMonth()]);
  url = url.replace('{yyyy}', targetDate.getFullYear().toString());
  url = url.replace('{year}', targetDate.getFullYear().toString());
  url = url.replace('{weekday}', ITALIAN_WEEKDAYS[targetDate.getDay()]);

  return url;
}

// Helper function to create scraper input
function createScraperInput(source: any, zodiacSign: any, dateISO: string): ScraperInput {
  const date = new Date(dateISO);
  const weekdayIndex = date.getDay();
  const weekdayItNoAccent = ITALIAN_WEEKDAYS[weekdayIndex];

  // Special date format for Gazzetta
  const gazzettaDatePath = `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;

  return {
    sourceId: source.id,
    sourceName: source.name,
    domain: source.domain,
    baseUrl: source.base_url,
    urlPattern: source.url_pattern,
    signSlugIt: zodiacSign.name_italian,
    dateISO,
    weekdayItNoAccent,
    gazzettaDatePath,
    userAgent: process.env.SCRAPE_USER_AGENT || 'ItalianHoroscopeComparatorBot/1.0 (+contact)',
  };
}

// Helper function to create weekly scraper input
function createWeeklyScraperInput(source: any, zodiacSign: any, weekStartDateISO: string): WeeklyScraperInput {
  const weekStartDate = new Date(weekStartDateISO);

  // Repubblica uses Saturday-based weeks (Saturday to Friday)
  const isSaturdayBased = source.domain.includes('repubblica.it');
  const useNumericMonth = source.domain.includes('repubblica.it');

  const { startDay, endDay, month, year } = formatWeekUrlParams(weekStartDate, isSaturdayBased, useNumericMonth);

  return {
    sourceId: source.id,
    sourceName: source.name,
    domain: source.domain,
    baseUrl: source.base_url,
    urlPattern: source.url_pattern,
    scrapeStrategy: source.scrape_strategy || 'pattern',
    signSlugIt: zodiacSign.name_italian,
    weekStartDate: weekStartDateISO,
    startDay,
    endDay,
    month,
    year,
    userAgent: process.env.SCRAPE_USER_AGENT || 'ItalianHoroscopeComparatorBot/1.0 (+contact)',
  };
}