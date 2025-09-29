import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import prisma from "./services/database";
import { enqueueScrapeJob, getAllJobStatuses, getJobStatus } from "./jobs";
import { ScraperInput } from "@shared/schema";
import { ZODIAC_SIGNS_IT_EN, ITALIAN_WEEKDAYS } from "@shared/constants";

export async function registerRoutes(app: Express): Promise<Server> {

  // GET /api/zodiac-signs
  app.get("/api/zodiac-signs", async (req, res) => {
    try {
      const signs = await prisma.zodiacSign.findMany({
        orderBy: { name_english: 'asc' }
      });
      res.json(signs);
    } catch (error) {
      console.error('Error fetching zodiac signs:', error);
      res.status(500).json({ error: 'Failed to fetch zodiac signs' });
    }
  });

  // GET /api/sources
  app.get("/api/sources", async (req, res) => {
    try {
      const sources = await prisma.source.findMany({
        where: { is_active: true },
        orderBy: { name: 'asc' }
      });
      res.json(sources);
    } catch (error) {
      console.error('Error fetching sources:', error);
      res.status(500).json({ error: 'Failed to fetch sources' });
    }
  });

  // GET /api/horoscopes
  app.get("/api/horoscopes", async (req, res) => {
    try {
      const { date, sign } = req.query;

      if (!date || !sign) {
        return res.status(400).json({ error: 'Date and sign parameters are required' });
      }

      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date as string)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      // Validate sign and convert to English if needed
      const signString = sign as string;
      let englishSign = signString;

      // Check if it's Italian sign and convert to English
      if (signString in ZODIAC_SIGNS_IT_EN) {
        englishSign = ZODIAC_SIGNS_IT_EN[signString as keyof typeof ZODIAC_SIGNS_IT_EN];
      } 
      // Check if it's already English
      else if (!Object.values(ZODIAC_SIGNS_IT_EN).includes(signString as any)) {
        return res.status(400).json({ error: 'Invalid zodiac sign' });
      }

      const zodiacSign = await prisma.zodiacSign.findFirst({
        where: { name_english: englishSign }
      });

      if (!zodiacSign) {
        return res.status(404).json({ error: 'Zodiac sign not found' });
      }

      const horoscopes = await prisma.horoscopeData.findMany({
        where: {
          zodiac_sign_id: zodiacSign.id,
          date: new Date(date as string),
        },
        include: {
          source: true,
        },
        orderBy: {
          source: { reliability_score: 'desc' }
        }
      });

      res.json(horoscopes);
    } catch (error) {
      console.error('Error fetching horoscopes:', error);
      res.status(500).json({ error: 'Failed to fetch horoscopes' });
    }
  });

  // GET /api/horoscopes/aggregate
  app.get("/api/horoscopes/aggregate", async (req, res) => {
    try {
      const { date, sign } = req.query;

      if (!date || !sign) {
        return res.status(400).json({ error: 'Date and sign parameters are required' });
      }

      // Validate sign and convert to English if needed
      const signString = sign as string;
      let englishSign = signString;

      // Check if it's Italian sign and convert to English
      if (signString in ZODIAC_SIGNS_IT_EN) {
        englishSign = ZODIAC_SIGNS_IT_EN[signString as keyof typeof ZODIAC_SIGNS_IT_EN];
      } 
      // Check if it's already English
      else if (!Object.values(ZODIAC_SIGNS_IT_EN).includes(signString as any)) {
        return res.status(400).json({ error: 'Invalid zodiac sign' });
      }

      const zodiacSign = await prisma.zodiacSign.findFirst({
        where: { name_english: englishSign }
      });

      if (!zodiacSign) {
        return res.status(404).json({ error: 'Zodiac sign not found' });
      }

      const horoscopes = await prisma.horoscopeData.findMany({
        where: {
          zodiac_sign_id: zodiacSign.id,
          date: new Date(date as string),
        },
      });

      if (horoscopes.length === 0) {
        return res.json({
          avgRelazioni: 0,
          avgLavoro: 0,
          avgBenessere: 0,
          overallAverage: 0,
          majorityTone: 'neutral'
        });
      }

      // Calculate averages
      const avgRelazioni = horoscopes.reduce((sum: number, h: any) => sum + h.relazioni_rating, 0) / horoscopes.length;
      const avgLavoro = horoscopes.reduce((sum: number, h: any) => sum + h.lavoro_rating, 0) / horoscopes.length;
      const avgBenessere = horoscopes.reduce((sum: number, h: any) => sum + h.salute_rating, 0) / horoscopes.length;
      const overallAverage = (avgRelazioni + avgLavoro + avgBenessere) / 3;

      // Calculate majority tone
      const toneCount = horoscopes.reduce((count: Record<string, number>, h: any) => {
        count[h.tone_analysis] = (count[h.tone_analysis] || 0) + 1;
        return count;
      }, {} as Record<string, number>);

      const majorityTone = Object.entries(toneCount)
        .sort(([,a], [,b]) => (b as number) - (a as number))[0]?.[0] || 'neutral';

      res.json({
        avgRelazioni: Math.round(avgRelazioni * 10) / 10,
        avgLavoro: Math.round(avgLavoro * 10) / 10,
        avgBenessere: Math.round(avgBenessere * 10) / 10,
        overallAverage: Math.round(overallAverage * 10) / 10,
        majorityTone: majorityTone as 'positive' | 'neutral' | 'negative',
      });
    } catch (error) {
      console.error('Error calculating aggregates:', error);
      res.status(500).json({ error: 'Failed to calculate aggregates' });
    }
  });

  // POST /api/refresh/all
  app.post("/api/refresh/all", async (req, res) => {
    try {
      const { date } = req.query;
      const targetDate = date as string || new Date().toISOString().split('T')[0];

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(targetDate)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      // Get all active sources and zodiac signs
      const [sources, zodiacSigns] = await Promise.all([
        prisma.source.findMany({ where: { is_active: true } }),
        prisma.zodiacSign.findMany(),
      ]);

      const jobIds: string[] = [];
      const errors: string[] = [];

      // Enqueue jobs for all combinations
      for (const source of sources) {
        for (const sign of zodiacSigns) {
          try {
            const jobId = await enqueueScrapeJob(createScraperInput(source, sign, targetDate));
            jobIds.push(jobId);
          } catch (error) {
            const errorMsg = `Failed to enqueue ${source.name} - ${sign.name_italian}`;
            errors.push(errorMsg);
            console.error(errorMsg, error);
          }
        }
      }

      res.json({
        message: 'Refresh started',
        jobsEnqueued: jobIds.length,
        errors: errors.length,
        jobIds,
        date: targetDate,
      });
    } catch (error) {
      console.error('Error starting refresh all:', error);
      res.status(500).json({ error: 'Failed to start refresh' });
    }
  });

  // POST /api/refresh/sign/:sign
  app.post("/api/refresh/sign/:sign", async (req, res) => {
    try {
      const { sign } = req.params;
      const { date } = req.query;
      const targetDate = date as string || new Date().toISOString().split('T')[0];

      // Validate sign and convert to English if needed
      const signString = sign as string;
      let englishSign = signString;

      // Check if it's Italian sign and convert to English
      if (signString in ZODIAC_SIGNS_IT_EN) {
        englishSign = ZODIAC_SIGNS_IT_EN[signString as keyof typeof ZODIAC_SIGNS_IT_EN];
      } 
      // Check if it's already English
      else if (!Object.values(ZODIAC_SIGNS_IT_EN).includes(signString as any)) {
        return res.status(400).json({ error: 'Invalid zodiac sign' });
      }

      const zodiacSign = await prisma.zodiacSign.findFirst({
        where: { name_english: englishSign }
      });

      if (!zodiacSign) {
        return res.status(404).json({ error: 'Zodiac sign not found' });
      }

      // Get all active sources
      const sources = await prisma.source.findMany({ where: { is_active: true } });

      const jobIds: string[] = [];
      const errors: string[] = [];

      // Enqueue jobs for this sign across all sources
      for (const source of sources) {
        try {
          const jobId = await enqueueScrapeJob(createScraperInput(source, zodiacSign, targetDate));
          jobIds.push(jobId);
        } catch (error) {
          const errorMsg = `Failed to enqueue ${source.name} - ${sign}`;
          errors.push(errorMsg);
          console.error(errorMsg, error);
        }
      }

      res.json({
        message: `Refresh started for ${sign}`,
        jobsEnqueued: jobIds.length,
        errors: errors.length,
        jobIds,
        sign,
        date: targetDate,
      });
    } catch (error) {
      console.error(`Error starting refresh for sign ${req.params.sign}:`, error);
      res.status(500).json({ error: 'Failed to start refresh' });
    }
  });

  // GET /api/refresh/status (optional - for job monitoring)
  app.get("/api/refresh/status", async (req, res) => {
    try {
      const jobs = getAllJobStatuses();

      const summary = {
        total: jobs.length,
        pending: jobs.filter(j => j.status === 'pending').length,
        running: jobs.filter(j => j.status === 'running').length,
        completed: jobs.filter(j => j.status === 'completed').length,
        failed: jobs.filter(j => j.status === 'failed').length,
      };

      res.json({
        summary,
        jobs: jobs.slice(0, 50), // Limit to last 50 jobs for performance
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
        where: signSlugs ? { name_english: { in: signSlugs } } : {}
      });

      const jobIds: string[] = [];

      // Enqueue scraping jobs for each combination
      for (const source of sources) {
        for (const sign of zodiacSigns) {
          const scraperInput = {
            sourceId: source.id,
            sourceName: source.name,
            domain: source.domain,
            baseUrl: source.base_url,
            urlPattern: source.url_pattern,
            signSlugIt: sign.name_english,
            dateISO: targetDate,
            weekdayItNoAccent: '',
            gazzettaDatePath: '',
            userAgent: source.user_agent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          };

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