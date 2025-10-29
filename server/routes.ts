import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import prisma from "./services/database";
import { enqueueScrapeJob, enqueueWeeklyScrapeJob, getAllJobStatuses, getJobStatus } from "./jobs";
import { ScraperInput, WeeklyScraperInput } from "@shared/schema";
import { ZODIAC_SIGNS_IT_EN, ITALIAN_WEEKDAYS, ITALIAN_MONTHS } from "@shared/constants";
import { getMondayOfWeek, formatWeekUrlParams } from "./utils/weekUtils";

export async function registerRoutes(app: Express): Promise<Server> {

  // GET /api/zodiac-signs
  app.get("/api/zodiac-signs", async (req, res) => {
    try {
      const signs = await prisma.zodiacSign.findMany({
        orderBy: { id: 'asc' }
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
      
      // Convert Decimal to number for JSON serialization
      const serializedSources = sources.map(source => ({
        ...source,
        reliability_score: Number(source.reliability_score)
      }));
      
      res.json(serializedSources);
    } catch (error) {
      console.error('Error fetching sources:', error);
      res.status(500).json({ error: 'Failed to fetch sources' });
    }
  });

  // GET /api/weekly-sources
  app.get("/api/weekly-sources", async (req, res) => {
    try {
      const sources = await prisma.weeklySource.findMany({
        where: { is_active: true },
        orderBy: { name: 'asc' }
      });
      
      const serializedSources = sources.map(source => ({
        ...source,
        reliability_score: Number(source.reliability_score)
      }));
      
      res.json(serializedSources);
    } catch (error) {
      console.error('Error fetching weekly sources:', error);
      res.status(500).json({ error: 'Failed to fetch weekly sources' });
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
          avgRelazioni: null,
          avgLavoro: null,
          avgBenessere: null,
          overallAverage: null,
          majorityTone: 'neutral'
        });
      }

      // Calculate averages excluding 0 ratings (not mentioned categories)
      const relazioniRatings = horoscopes.filter((h: any) => h.relazioni_rating > 0).map((h: any) => h.relazioni_rating);
      const lavoroRatings = horoscopes.filter((h: any) => h.lavoro_rating > 0).map((h: any) => h.lavoro_rating);
      const benessereRatings = horoscopes.filter((h: any) => h.salute_rating > 0).map((h: any) => h.salute_rating);
      
      const avgRelazioni = relazioniRatings.length > 0 
        ? relazioniRatings.reduce((sum: number, rating: number) => sum + rating, 0) / relazioniRatings.length 
        : null;
      const avgLavoro = lavoroRatings.length > 0 
        ? lavoroRatings.reduce((sum: number, rating: number) => sum + rating, 0) / lavoroRatings.length 
        : null;
      const avgBenessere = benessereRatings.length > 0 
        ? benessereRatings.reduce((sum: number, rating: number) => sum + rating, 0) / benessereRatings.length 
        : null;
      // Calculate overall average only from categories with valid ratings
      const validAverages = [avgRelazioni, avgLavoro, avgBenessere].filter(avg => avg !== null) as number[];
      const overallAverage = validAverages.length > 0 
        ? validAverages.reduce((sum, avg) => sum + avg, 0) / validAverages.length 
        : null;

      // Calculate tone based on overall average rating
      const majorityTone = overallAverage === null ? 'neutral' :
                           overallAverage < 3 ? 'negative' : 
                           overallAverage > 3 ? 'positive' : 'neutral';

      res.json({
        avgRelazioni: avgRelazioni !== null ? Math.round(avgRelazioni * 10) / 10 : null,
        avgLavoro: avgLavoro !== null ? Math.round(avgLavoro * 10) / 10 : null,
        avgBenessere: avgBenessere !== null ? Math.round(avgBenessere * 10) / 10 : null,
        overallAverage: overallAverage !== null ? Math.round(overallAverage * 10) / 10 : null,
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
        prisma.zodiacSign.findMany({ orderBy: { id: 'asc' } }),
      ]);

      const jobIds: string[] = [];
      const errors: string[] = [];

      // Process signs sequentially to avoid overwhelming OpenAI rate limits
      // Start background processing with automatic retry fallback
      (async () => {
        for (let i = 0; i < zodiacSigns.length; i++) {
          const sign = zodiacSigns[i];
          console.log(`[Refresh] Processing sign ${i + 1}/${zodiacSigns.length}: ${sign.name_italian}`);
          
          // Enqueue all sources for this sign
          for (const source of sources) {
            try {
              const jobId = await enqueueScrapeJob(createScraperInput(source, sign, targetDate));
              jobIds.push(jobId);
            } catch (error) {
              const errorMsg = `Failed to enqueue ${source.name} - ${sign.name_italian}`;
              errors.push(errorMsg);
              console.error(errorMsg, error);
            }
          }
          
          // Wait 5 seconds before processing the next sign (except after the last one)
          if (i < zodiacSigns.length - 1) {
            console.log(`[Refresh] Waiting 5 seconds before processing next sign...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        console.log(`[Refresh] All signs enqueued. Total jobs: ${jobIds.length}, Errors: ${errors.length}`);
        
        // Automatic fallback retry mechanism
        // Wait for all jobs to complete (estimated: ~20 jobs/min with OpenAI rate limiting)
        const expectedJobCount = sources.length * zodiacSigns.length;
        const estimatedMinutes = Math.ceil(expectedJobCount / 20) + 2; // Add 2 min buffer
        const waitTimeMs = estimatedMinutes * 60 * 1000;
        
        console.log(`[Auto-Retry] Waiting ${estimatedMinutes} minutes for initial scraping to complete before checking for failures...`);
        await new Promise(resolve => setTimeout(resolve, waitTimeMs));
        
        // Check for missing/failed sources
        console.log(`[Auto-Retry] Checking for failed sources...`);
        const [allActiveSources, allZodiacSigns] = await Promise.all([
          prisma.source.findMany({ where: { is_active: true } }),
          prisma.zodiacSign.findMany(),
        ]);
        
        const missingSources: Array<{ source: any; sign: any }> = [];
        
        for (const sign of allZodiacSigns) {
          for (const source of allActiveSources) {
            const entry = await prisma.horoscopeData.findFirst({
              where: {
                source_id: source.id,
                zodiac_sign_id: sign.id,
                date: new Date(targetDate),
              }
            });
            
            // Retry if missing OR if summary is empty (failed scrape)
            if (!entry || entry.summary === '') {
              missingSources.push({ source, sign });
            }
          }
        }
        
        if (missingSources.length > 0) {
          console.log(`[Auto-Retry] Found ${missingSources.length} missing sources. Starting automatic retry...`);
          
          // Group by sign for sequential processing
          const missingBySign = missingSources.reduce((acc, { source, sign }) => {
            if (!acc[sign.id]) {
              acc[sign.id] = { sign, sources: [] };
            }
            acc[sign.id].sources.push(source);
            return acc;
          }, {} as Record<number, { sign: any; sources: any[] }>);
          
          // Retry failed sources sequentially
          const signIds = Object.keys(missingBySign).map(Number);
          for (let i = 0; i < signIds.length; i++) {
            const signId = signIds[i];
            const { sign, sources: failedSources } = missingBySign[signId];
            
            console.log(`[Auto-Retry] Retrying sign ${i + 1}/${signIds.length}: ${sign.name_italian} (${failedSources.length} sources)`);
            
            for (const source of failedSources) {
              try {
                await enqueueScrapeJob(createScraperInput(source, sign, targetDate));
                console.log(`[Auto-Retry] Re-enqueued ${source.name} - ${sign.name_italian}`);
              } catch (error) {
                console.error(`[Auto-Retry] Failed to re-enqueue ${source.name} - ${sign.name_italian}:`, error);
              }
            }
            
            // Wait 5 seconds before next sign
            if (i < signIds.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
          }
          
          console.log(`[Auto-Retry] Automatic retry completed`);
        } else {
          console.log(`[Auto-Retry] No failed sources found. All scraping completed successfully!`);
        }
      })();

      res.json({
        message: 'Refresh started (processing signs sequentially)',
        expectedJobs: sources.length * zodiacSigns.length,
        totalSigns: zodiacSigns.length,
        totalSources: sources.length,
        date: targetDate,
        note: 'Signs will be processed one at a time with 5-second delays to respect API rate limits',
      });
    } catch (error) {
      console.error('Error starting refresh all:', error);
      res.status(500).json({ error: 'Failed to start refresh' });
    }
  });

  // GET /api/weekly-horoscopes
  app.get("/api/weekly-horoscopes", async (req, res) => {
    try {
      const { weekStartDate, sign } = req.query;

      if (!weekStartDate || !sign) {
        return res.status(400).json({ error: 'weekStartDate and sign parameters are required' });
      }

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(weekStartDate as string)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      const signString = sign as string;
      let englishSign = signString;

      if (signString in ZODIAC_SIGNS_IT_EN) {
        englishSign = ZODIAC_SIGNS_IT_EN[signString as keyof typeof ZODIAC_SIGNS_IT_EN];
      } else if (!Object.values(ZODIAC_SIGNS_IT_EN).includes(signString as any)) {
        return res.status(400).json({ error: 'Invalid zodiac sign' });
      }

      const zodiacSign = await prisma.zodiacSign.findFirst({
        where: { name_english: englishSign }
      });

      if (!zodiacSign) {
        return res.status(404).json({ error: 'Zodiac sign not found' });
      }

      const horoscopes = await prisma.weeklyHoroscopeData.findMany({
        where: {
          zodiac_sign_id: zodiacSign.id,
          week_start_date: new Date(weekStartDate as string),
        },
        include: {
          weekly_source: true,
        },
        orderBy: {
          weekly_source: { reliability_score: 'desc' }
        }
      });

      // Transform weekly_source to source for frontend compatibility
      const transformedHoroscopes = horoscopes.map((h: any) => ({
        ...h,
        source: h.weekly_source,
        weekly_source: undefined
      }));

      res.json(transformedHoroscopes);
    } catch (error) {
      console.error('Error fetching weekly horoscopes:', error);
      res.status(500).json({ error: 'Failed to fetch weekly horoscopes' });
    }
  });

  // GET /api/weekly-horoscopes/aggregate
  app.get("/api/weekly-horoscopes/aggregate", async (req, res) => {
    try {
      const { weekStartDate, sign } = req.query;

      if (!weekStartDate || !sign) {
        return res.status(400).json({ error: 'weekStartDate and sign parameters are required' });
      }

      const signString = sign as string;
      let englishSign = signString;

      if (signString in ZODIAC_SIGNS_IT_EN) {
        englishSign = ZODIAC_SIGNS_IT_EN[signString as keyof typeof ZODIAC_SIGNS_IT_EN];
      } else if (!Object.values(ZODIAC_SIGNS_IT_EN).includes(signString as any)) {
        return res.status(400).json({ error: 'Invalid zodiac sign' });
      }

      const zodiacSign = await prisma.zodiacSign.findFirst({
        where: { name_english: englishSign }
      });

      if (!zodiacSign) {
        return res.status(404).json({ error: 'Zodiac sign not found' });
      }

      const horoscopes = await prisma.weeklyHoroscopeData.findMany({
        where: {
          zodiac_sign_id: zodiacSign.id,
          week_start_date: new Date(weekStartDate as string),
        },
      });

      if (horoscopes.length === 0) {
        return res.json({
          avgRelazioni: null,
          avgLavoro: null,
          avgBenessere: null,
          overallAverage: null,
          majorityTone: 'neutral'
        });
      }

      const relazioniRatings = horoscopes.filter((h: any) => h.relazioni_rating > 0).map((h: any) => h.relazioni_rating);
      const lavoroRatings = horoscopes.filter((h: any) => h.lavoro_rating > 0).map((h: any) => h.lavoro_rating);
      const benessereRatings = horoscopes.filter((h: any) => h.salute_rating > 0).map((h: any) => h.salute_rating);
      
      const avgRelazioni = relazioniRatings.length > 0 
        ? relazioniRatings.reduce((sum: number, rating: number) => sum + rating, 0) / relazioniRatings.length 
        : null;
      const avgLavoro = lavoroRatings.length > 0 
        ? lavoroRatings.reduce((sum: number, rating: number) => sum + rating, 0) / lavoroRatings.length 
        : null;
      const avgBenessere = benessereRatings.length > 0 
        ? benessereRatings.reduce((sum: number, rating: number) => sum + rating, 0) / benessereRatings.length 
        : null;

      const validAverages = [avgRelazioni, avgLavoro, avgBenessere].filter(avg => avg !== null) as number[];
      const overallAverage = validAverages.length > 0 
        ? validAverages.reduce((sum, avg) => sum + avg, 0) / validAverages.length 
        : null;

      const majorityTone = overallAverage === null ? 'neutral' :
                           overallAverage < 3 ? 'negative' : 
                           overallAverage > 3 ? 'positive' : 'neutral';

      res.json({
        avgRelazioni: avgRelazioni !== null ? Math.round(avgRelazioni * 10) / 10 : null,
        avgLavoro: avgLavoro !== null ? Math.round(avgLavoro * 10) / 10 : null,
        avgBenessere: avgBenessere !== null ? Math.round(avgBenessere * 10) / 10 : null,
        overallAverage: overallAverage !== null ? Math.round(overallAverage * 10) / 10 : null,
        majorityTone: majorityTone as 'positive' | 'neutral' | 'negative',
      });
    } catch (error) {
      console.error('Error calculating weekly aggregates:', error);
      res.status(500).json({ error: 'Failed to calculate weekly aggregates' });
    }
  });

  // POST /api/refresh-weekly/all
  app.post("/api/refresh-weekly/all", async (req, res) => {
    try {
      const { weekStartDate } = req.query;
      const targetWeekStart = weekStartDate as string || getMondayOfWeek(new Date()).toISOString().split('T')[0];

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(targetWeekStart)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      const [sources, zodiacSigns] = await Promise.all([
        prisma.weeklySource.findMany({ where: { is_active: true } }),
        prisma.zodiacSign.findMany({ orderBy: { id: 'asc' } }),
      ]);

      const jobIds: string[] = [];
      const errors: string[] = [];

      // Process signs sequentially to avoid overwhelming OpenAI rate limits
      // Start background processing with automatic retry fallback
      (async () => {
        for (let i = 0; i < zodiacSigns.length; i++) {
          const sign = zodiacSigns[i];
          console.log(`[Weekly Refresh] Processing sign ${i + 1}/${zodiacSigns.length}: ${sign.name_italian}`);
          
          // Enqueue all sources for this sign
          for (const source of sources) {
            try {
              const jobId = await enqueueWeeklyScrapeJob(createWeeklyScraperInput(source, sign, targetWeekStart));
              jobIds.push(jobId);
            } catch (error) {
              const errorMsg = `Failed to enqueue ${source.name} - ${sign.name_italian}`;
              errors.push(errorMsg);
              console.error(errorMsg, error);
            }
          }
          
          // Wait 5 seconds before processing the next sign (except after the last one)
          if (i < zodiacSigns.length - 1) {
            console.log(`[Weekly Refresh] Waiting 5 seconds before processing next sign...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        console.log(`[Weekly Refresh] All signs enqueued. Total jobs: ${jobIds.length}, Errors: ${errors.length}`);
        
        // Automatic fallback retry mechanism
        const expectedJobCount = sources.length * zodiacSigns.length;
        const estimatedMinutes = Math.ceil(expectedJobCount / 20) + 2; // Add 2 min buffer
        const waitTimeMs = estimatedMinutes * 60 * 1000;
        
        console.log(`[Auto-Retry Weekly] Waiting ${estimatedMinutes} minutes for initial scraping to complete before checking for failures...`);
        await new Promise(resolve => setTimeout(resolve, waitTimeMs));
        
        // Check for missing/failed sources
        console.log(`[Auto-Retry Weekly] Checking for failed sources...`);
        const [allActiveSources, allZodiacSigns] = await Promise.all([
          prisma.weeklySource.findMany({ where: { is_active: true } }),
          prisma.zodiacSign.findMany(),
        ]);
        
        const missingSources: Array<{ source: any; sign: any }> = [];
        
        for (const sign of allZodiacSigns) {
          for (const source of allActiveSources) {
            const entry = await prisma.weeklyHoroscopeData.findFirst({
              where: {
                source_id: source.id,
                zodiac_sign_id: sign.id,
                week_start_date: new Date(targetWeekStart),
              }
            });
            
            // Retry if missing OR if summary is empty (failed scrape)
            if (!entry || entry.summary === '') {
              missingSources.push({ source, sign });
            }
          }
        }
        
        if (missingSources.length > 0) {
          console.log(`[Auto-Retry Weekly] Found ${missingSources.length} missing sources. Starting automatic retry...`);
          
          // Group by sign for sequential processing
          const missingBySign = missingSources.reduce((acc, { source, sign }) => {
            if (!acc[sign.id]) {
              acc[sign.id] = { sign, sources: [] };
            }
            acc[sign.id].sources.push(source);
            return acc;
          }, {} as Record<number, { sign: any; sources: any[] }>);
          
          // Retry failed sources sequentially
          const signIds = Object.keys(missingBySign).map(Number);
          for (let i = 0; i < signIds.length; i++) {
            const signId = signIds[i];
            const { sign, sources: failedSources } = missingBySign[signId];
            
            console.log(`[Auto-Retry Weekly] Retrying sign ${i + 1}/${signIds.length}: ${sign.name_italian} (${failedSources.length} sources)`);
            
            for (const source of failedSources) {
              try {
                await enqueueWeeklyScrapeJob(createWeeklyScraperInput(source, sign, targetWeekStart));
                console.log(`[Auto-Retry Weekly] Re-enqueued ${source.name} - ${sign.name_italian}`);
              } catch (error) {
                console.error(`[Auto-Retry Weekly] Failed to re-enqueue ${source.name} - ${sign.name_italian}:`, error);
              }
            }
            
            // Wait 5 seconds before next sign
            if (i < signIds.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
          }
          
          console.log(`[Auto-Retry Weekly] Automatic retry completed`);
        } else {
          console.log(`[Auto-Retry Weekly] No failed sources found. All scraping completed successfully!`);
        }
      })();

      res.json({
        message: 'Weekly refresh started (processing signs sequentially)',
        expectedJobs: sources.length * zodiacSigns.length,
        totalSigns: zodiacSigns.length,
        totalSources: sources.length,
        weekStartDate: targetWeekStart,
        note: 'Signs will be processed one at a time with 5-second delays to respect API rate limits',
      });
    } catch (error) {
      console.error('Error starting weekly refresh all:', error);
      res.status(500).json({ error: 'Failed to start weekly refresh' });
    }
  });

  // POST /api/refresh-weekly/sign/:sign
  app.post("/api/refresh-weekly/sign/:sign", async (req, res) => {
    try {
      const { sign } = req.params;
      const { weekStartDate } = req.query;
      const targetWeekStart = weekStartDate as string || getMondayOfWeek(new Date()).toISOString().split('T')[0];

      const signString = sign as string;
      let englishSign = signString;

      if (signString in ZODIAC_SIGNS_IT_EN) {
        englishSign = ZODIAC_SIGNS_IT_EN[signString as keyof typeof ZODIAC_SIGNS_IT_EN];
      } else if (!Object.values(ZODIAC_SIGNS_IT_EN).includes(signString as any)) {
        return res.status(400).json({ error: 'Invalid zodiac sign' });
      }

      const zodiacSign = await prisma.zodiacSign.findFirst({
        where: { name_english: englishSign }
      });

      if (!zodiacSign) {
        return res.status(404).json({ error: 'Zodiac sign not found' });
      }

      const sources = await prisma.weeklySource.findMany({ where: { is_active: true } });

      const jobIds: string[] = [];
      const errors: string[] = [];

      for (const source of sources) {
        try {
          const jobId = await enqueueWeeklyScrapeJob(createWeeklyScraperInput(source, zodiacSign, targetWeekStart));
          jobIds.push(jobId);
        } catch (error) {
          const errorMsg = `Failed to enqueue ${source.name} - ${sign}`;
          errors.push(errorMsg);
          console.error(errorMsg, error);
        }
      }

      res.json({
        message: `Weekly refresh started for ${sign}`,
        jobsEnqueued: jobIds.length,
        errors: errors.length,
        jobIds,
        sign,
        weekStartDate: targetWeekStart,
      });
    } catch (error) {
      console.error(`Error starting weekly refresh for sign ${req.params.sign}:`, error);
      res.status(500).json({ error: 'Failed to start weekly refresh' });
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

  // POST /api/retry-failed/all - Retry only failed daily horoscope sources
  app.post("/api/retry-failed/all", async (req, res) => {
    try {
      const { date } = req.query;
      const targetDate = date as string || new Date().toISOString().split('T')[0];

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(targetDate)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      // Find all failed entries (where summary is empty)
      const failedEntries = await prisma.horoscopeData.findMany({
        where: {
          date: new Date(targetDate),
          summary: ''
        },
        include: {
          source: true,
          zodiac_sign: true,
        }
      });

      if (failedEntries.length === 0) {
        return res.json({
          message: 'No failed sources found',
          failedCount: 0,
          date: targetDate,
        });
      }

      console.log(`[Retry Failed] Found ${failedEntries.length} failed entries for ${targetDate}`);

      const jobIds: string[] = [];
      const errors: string[] = [];

      type FailedEntry = typeof failedEntries[0];
      
      // Group by sign for sequential processing
      const entriesBySign = failedEntries.reduce((acc, entry) => {
        const signId = entry.zodiac_sign_id;
        if (!acc[signId]) {
          acc[signId] = [];
        }
        acc[signId].push(entry);
        return acc;
      }, {} as Record<number, FailedEntry[]>);

      // Process signs sequentially in background
      (async () => {
        const signIds = Object.keys(entriesBySign).map(Number);
        for (let i = 0; i < signIds.length; i++) {
          const signId = signIds[i];
          const entries = entriesBySign[signId];
          const signName = entries[0].zodiac_sign.name_italian;
          
          console.log(`[Retry Failed] Processing sign ${i + 1}/${signIds.length}: ${signName} (${entries.length} failed sources)`);
          
          // Enqueue all failed sources for this sign
          for (const entry of entries) {
            try {
              const jobId = await enqueueScrapeJob(createScraperInput(entry.source, entry.zodiac_sign, targetDate));
              jobIds.push(jobId);
            } catch (error) {
              const errorMsg = `Failed to enqueue retry for ${entry.source.name} - ${signName}`;
              errors.push(errorMsg);
              console.error(errorMsg, error);
            }
          }
          
          // Wait 5 seconds before processing the next sign (except after the last one)
          if (i < signIds.length - 1) {
            console.log(`[Retry Failed] Waiting 5 seconds before processing next sign...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        console.log(`[Retry Failed] All failed sources enqueued. Total jobs: ${jobIds.length}, Errors: ${errors.length}`);
      })();

      res.json({
        message: 'Retry started for failed sources (processing signs sequentially)',
        failedCount: failedEntries.length,
        affectedSigns: Object.keys(entriesBySign).length,
        date: targetDate,
        note: 'Only sources with blank/null summaries will be re-scraped',
      });
    } catch (error) {
      console.error('Error starting retry for failed sources:', error);
      res.status(500).json({ error: 'Failed to start retry' });
    }
  });

  // POST /api/retry-failed-weekly/all - Retry only failed weekly horoscope sources
  app.post("/api/retry-failed-weekly/all", async (req, res) => {
    try {
      const { weekStartDate } = req.query;
      const targetWeekStart = weekStartDate as string || getMondayOfWeek(new Date()).toISOString().split('T')[0];

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(targetWeekStart)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      // Find all failed entries (where summary is empty)
      const failedEntries = await prisma.weeklyHoroscopeData.findMany({
        where: {
          week_start_date: new Date(targetWeekStart),
          summary: ''
        },
        include: {
          weekly_source: true,
          zodiac_sign: true,
        }
      });

      if (failedEntries.length === 0) {
        return res.json({
          message: 'No failed weekly sources found',
          failedCount: 0,
          weekStartDate: targetWeekStart,
        });
      }

      console.log(`[Retry Failed Weekly] Found ${failedEntries.length} failed entries for week starting ${targetWeekStart}`);

      const jobIds: string[] = [];
      const errors: string[] = [];

      type FailedWeeklyEntry = typeof failedEntries[0];
      
      // Group by sign for sequential processing
      const entriesBySign = failedEntries.reduce((acc, entry) => {
        const signId = entry.zodiac_sign_id;
        if (!acc[signId]) {
          acc[signId] = [];
        }
        acc[signId].push(entry);
        return acc;
      }, {} as Record<number, FailedWeeklyEntry[]>);

      // Process signs sequentially in background
      (async () => {
        const signIds = Object.keys(entriesBySign).map(Number);
        for (let i = 0; i < signIds.length; i++) {
          const signId = signIds[i];
          const entries = entriesBySign[signId];
          const signName = entries[0].zodiac_sign.name_italian;
          
          console.log(`[Retry Failed Weekly] Processing sign ${i + 1}/${signIds.length}: ${signName} (${entries.length} failed sources)`);
          
          // Enqueue all failed sources for this sign
          for (const entry of entries) {
            try {
              const jobId = await enqueueWeeklyScrapeJob(createWeeklyScraperInput(entry.weekly_source, entry.zodiac_sign, targetWeekStart));
              jobIds.push(jobId);
            } catch (error) {
              const errorMsg = `Failed to enqueue retry for ${entry.weekly_source.name} - ${signName}`;
              errors.push(errorMsg);
              console.error(errorMsg, error);
            }
          }
          
          // Wait 5 seconds before processing the next sign (except after the last one)
          if (i < signIds.length - 1) {
            console.log(`[Retry Failed Weekly] Waiting 5 seconds before processing next sign...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        console.log(`[Retry Failed Weekly] All failed sources enqueued. Total jobs: ${jobIds.length}, Errors: ${errors.length}`);
      })();

      res.json({
        message: 'Retry started for failed weekly sources (processing signs sequentially)',
        failedCount: failedEntries.length,
        affectedSigns: Object.keys(entriesBySign).length,
        weekStartDate: targetWeekStart,
        note: 'Only sources with blank/null summaries will be re-scraped',
      });
    } catch (error) {
      console.error('Error starting retry for failed weekly sources:', error);
      res.status(500).json({ error: 'Failed to start retry' });
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

  // POST /api/cleanup - Manual cleanup endpoint (ADMIN ONLY - requires admin_secret header)
  app.post("/api/cleanup", async (req, res) => {
    // Security: Require admin secret for destructive operations
    const adminSecret = req.headers['x-admin-secret'];
    const expectedSecret = process.env.ADMIN_SECRET || 'default-admin-secret-change-me';
    
    if (adminSecret !== expectedSecret) {
      console.warn('[API] Unauthorized cleanup attempt blocked');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid admin credentials required for cleanup operations'
      });
    }

    try {
      const { cleanupService } = await import('./services/cleanup');
      const { cleanupTracker } = await import('./services/cleanupTracker');
      
      const statsBefore = await cleanupService.getDataStats();
      console.log('[API] Data stats before cleanup:', statsBefore);
      
      await cleanupService.cleanupHoroscopeData();
      await cleanupTracker.setLastCleanupDate(new Date());
      
      const statsAfter = await cleanupService.getDataStats();
      console.log('[API] Data stats after cleanup:', statsAfter);
      
      res.json({
        success: true,
        message: 'Cleanup completed successfully',
        statsBefore,
        statsAfter,
        lastCleanup: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[API] Cleanup error:', error);
      res.status(500).json({
        error: 'Failed to cleanup data',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/cleanup/stats - Get data statistics
  app.get("/api/cleanup/stats", async (req, res) => {
    try {
      const { cleanupService } = await import('./services/cleanup');
      const stats = await cleanupService.getDataStats();
      res.json(stats);
    } catch (error) {
      console.error('[API] Error fetching cleanup stats:', error);
      res.status(500).json({
        error: 'Failed to fetch stats',
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
      
      const baseUrlWithSlash = input.baseUrl.endsWith('/') ? input.baseUrl : input.baseUrl + '/';
      const slug1 = 'oroscopo-di-oggi';
      const slug3 = 'oroscopo-del-giorno';
      
      const gazzettaSignSlug = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();
      const url1 = `${baseUrlWithSlash}oroscopo/storie/${prevDateFormatted}/${slug3}/${gazzettaSignSlug}.shtml`;
      const url2 = `${baseUrlWithSlash}oroscopo/storie/${prevDateFormatted}/${slug1}/${gazzettaSignSlug}.shtml`;
      const url3 = `${baseUrlWithSlash}oroscopo/storie/${currentDateFormatted}/${slug3}/${gazzettaSignSlug}.shtml`;
      const url4 = `${baseUrlWithSlash}oroscopo/storie/${currentDateFormatted}/${slug1}/${gazzettaSignSlug}.shtml`;
      
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
  
  // Some sources use Saturday-based weeks (Saturday to Friday)
  const isSaturdayBased = source.domain.includes('repubblica.it') || source.domain.includes('sorrisi.com');
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