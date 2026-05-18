import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import Stripe from "stripe";
import { createClerkClient } from "@clerk/backend";
import { Resend } from "resend";
import prisma from "./services/database";
import { enqueueScrapeJob, enqueueWeeklyScrapeJob, enqueueAggregatedNlpJob, enqueueAggregatedWeeklyNlpJob, getAllJobStatuses, getJobStatus } from "./jobs";
import { ScraperInput, WeeklyScraperInput, ScraperOutput, WeeklyScraperOutput, OpenAIInput } from "@shared/schema";
import { ZODIAC_SIGNS_IT_EN, ITALIAN_WEEKDAYS, ITALIAN_MONTHS } from "@shared/constants";
import { format } from 'date-fns';
import { getMondayOfWeek, formatWeekUrlParams, getCurrentWeekStart } from "./utils/weekUtils";
import { runWeeklyScraperCycle, type SourceGroup } from "./services/weeklyScraperOrchestrator";
import {
  getWeeklyCoverage,
  getExecutionHistory,
  getUpsertVerification,
  findGapsInCoverage,
  getFailedSources,
  getHealthStats,
  findStaleExecutions,
  markStaleExecutionsAsTimeout,
} from "./utils/weeklyScraperQueries";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY non configurata');
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' as any });
}

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
    const { date } = req.query;
    const targetDate = (date as string) || new Date().toISOString().split('T')[0];

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(targetDate)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    res.json({ message: 'Full refresh started' });

    (async () => {
      let executionId: number | null = null;
      try {
        const targetDateObj = new Date(targetDate + 'T00:00:00.000Z');
        const execution = await prisma.scraperExecution.create({
          data: {
            status: 'running',
            target_date: targetDateObj,
            trigger_type: 'scheduled',
            started_at: new Date(),
          },
        });
        executionId = execution.id;

        const [sources, zodiacSigns] = await Promise.all([
          prisma.source.findMany({ where: { is_active: true } }),
          prisma.zodiacSign.findMany({ orderBy: { id: 'asc' } }),
        ]);

        let totalEnqueued = 0;
        let totalFailed = 0;

        for (let i = 0; i < zodiacSigns.length; i++) {
          const sign = zodiacSigns[i];

          const collected: Array<{ scraperOutput: ScraperOutput; nlpInput: OpenAIInput }> = [];

          await new Promise<void>((resolve, reject) => {
            let pending = sources.length;
            if (pending === 0) { resolve(); return; }

            (async () => {
              for (const source of sources) {
                const sourceName = source.name;
                await enqueueScrapeJob(
                  createScraperInput(source, sign, targetDate),
                  (result) => {
                    if (result) collected.push({
                      scraperOutput: result,
                      nlpInput: {
                        sourceId: result.sourceId,
                        sourceName,
                        signSlugIt: result.signSlugIt,
                        dateISO: result.dateISO,
                        extracted_text: result.extracted_text,
                      },
                    });
                    pending--;
                    if (pending === 0) resolve();
                  }
                );
              }
            })().catch(reject);
          });

          if (collected.length > 0) {
            await enqueueAggregatedNlpJob(collected);
            totalEnqueued += collected.length;
          }
          totalFailed += sources.length - collected.length;

          if (i < zodiacSigns.length - 1) {
            await new Promise(r => setTimeout(r, 3000));
          }
        }

        await prisma.scraperExecution.update({
          where: { id: executionId },
          data: {
            status: 'completed',
            completed_at: new Date(),
            total_jobs_enqueued: totalEnqueued,
            successful_jobs: totalEnqueued,
            failed_jobs: totalFailed,
          },
        });

      } catch (error) {
        console.error('[Refresh All] Critical error:', error);
        if (executionId) {
          await prisma.scraperExecution.update({
            where: { id: executionId },
            data: {
              status: 'failed',
              completed_at: new Date(),
              error_message: error instanceof Error ? error.message : 'Unknown error',
            },
          });
        }
      }
    })();
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

  /**
   * POST /api/refresh-weekly/all
   * Batch weekly refresh for all signs × all sources.
   * Requires X-Admin-Secret header.
   * Query params: ?weekStartDate=YYYY-MM-DD  ?forceRescrape=true
   */
  app.post("/api/refresh-weekly/all", async (req, res) => {
    const adminSecret = req.headers['x-admin-secret'];
    const expectedSecret = process.env.ADMIN_SECRET || 'default-admin-secret-change-me';
    if (adminSecret !== expectedSecret) {
      console.warn('[Weekly Refresh All] Unauthorized attempt blocked');
      return res.status(401).json({ error: 'Unauthorized - X-Admin-Secret header required' });
    }

    const forceRescrape = req.query.forceRescrape === 'true' || req.body?.forceRescrape === true;
    const weekStartParam = (req.query.weekStartDate as string) || req.body?.targetWeek;

    let weekStart: Date;
    if (weekStartParam) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(weekStartParam)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }
      weekStart = new Date(weekStartParam);
      if (weekStart.getDay() !== 1) {
        return res.status(400).json({ error: 'Target week must be a Monday' });
      }
    } else {
      weekStart = getCurrentWeekStart();
    }

    res.json({ message: 'Full refresh started' });

    (async () => {
      let executionId: number | null = null;
      try {
        const execution = await prisma.weeklyScraperExecution.create({
          data: {
            status: 'running',
            target_week: weekStart,
            source_group: 'all',
            trigger_type: 'scheduled',
            started_at: new Date(),
          },
        });
        executionId = execution.id;

        const [sources, zodiacSigns] = await Promise.all([
          prisma.weeklySource.findMany({ where: { is_active: true } }),
          prisma.zodiacSign.findMany({ orderBy: { id: 'asc' } }),
        ]);

        let totalEnqueued = 0;
        let totalSkipped = 0;
        let totalFailed = 0;

        for (let i = 0; i < zodiacSigns.length; i++) {
          const sign = zodiacSigns[i];

          // Apply skip logic: exclude sources already scraped with non-empty summary
          const sourcesToProcess: typeof sources = [];
          for (const source of sources) {
            if (!forceRescrape) {
              const existing = await prisma.weeklyHoroscopeData.findFirst({
                where: {
                  source_id: source.id,
                  zodiac_sign_id: sign.id,
                  week_start_date: weekStart,
                  summary: { not: '' },
                },
              });
              if (existing) {
                totalSkipped++;
                continue;
              }
            }
            sourcesToProcess.push(source);
          }

          if (sourcesToProcess.length === 0) {
            if (i < zodiacSigns.length - 1) await new Promise(r => setTimeout(r, 3000));
            continue;
          }

          const collected: Array<{ scraperOutput: WeeklyScraperOutput; sourceName: string }> = [];

          await new Promise<void>(resolve => {
            let pending = sourcesToProcess.length;
            if (pending === 0) { resolve(); return; }

            for (const source of sourcesToProcess) {
              const sourceName = source.name;
              enqueueWeeklyScrapeJobWithCallback(
                createWeeklyScraperInput(source, sign, weekStart.toISOString().split('T')[0]),
                (result) => {
                  if (result) collected.push({ scraperOutput: result, sourceName });
                  pending--;
                  if (pending === 0) resolve();
                }
              );
            }
          });

          if (collected.length > 0) {
            await enqueueAggregatedWeeklyNlpJob(collected);
            totalEnqueued += collected.length;
          }
          totalFailed += sourcesToProcess.length - collected.length;

          if (i < zodiacSigns.length - 1) {
            await new Promise(r => setTimeout(r, 3000));
          }
        }

        await prisma.weeklyScraperExecution.update({
          where: { id: executionId },
          data: {
            status: 'completed',
            completed_at: new Date(),
            total_jobs_enqueued: totalEnqueued,
            successful_jobs: totalEnqueued,
            failed_jobs: totalFailed,
          },
        });

      } catch (error) {
        console.error('[Weekly Refresh All] Critical error:', error);
        if (executionId) {
          await prisma.weeklyScraperExecution.update({
            where: { id: executionId },
            data: {
              status: 'failed',
              completed_at: new Date(),
              error_message: error instanceof Error ? error.message : 'Unknown error',
            },
          });
        }
      }
    })();
  });

  /**
   * POST /api/refresh-weekly/sign/:sign
   * Manual trigger for weekly scraper - single sign, all sources
   */
  app.post("/api/refresh-weekly/sign/:sign", async (req, res) => {
    try {
      const { sign } = req.params;
      const { targetWeek, forceRescrape, dryRun } = req.body;
      
      // Validate and convert sign
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
      
      // Parse target week
      let weekStart: Date;
      if (targetWeek) {
        weekStart = new Date(targetWeek);
        if (weekStart.getDay() !== 1) {
          return res.status(400).json({ error: 'Target week must be a Monday' });
        }
      } else {
        weekStart = getCurrentWeekStart();
      }
      
      
      // Trigger weekly scrape for all sources but only this sign
      // We'll do this by enqueueing jobs directly for this sign
      const sources = await prisma.weeklySource.findMany({
        where: { is_active: true },
        orderBy: { id: 'asc' }
      });
      
      let enqueued = 0;
      let skipped = 0;

      // Accumulate scraper outputs to run one batch NLP call per sign
      let weeklyDoneCount = 0;
      let weeklyTotalExpected = 0;
      const weeklyAccumulatedPairs: Array<{ nlpInput: OpenAIInput; scraperOutput: WeeklyScraperOutput }> = [];

      const handleWeeklyScrapeComplete = (output: WeeklyScraperOutput | null, sourceName: string) => {
        weeklyDoneCount++;
        if (output) {
          weeklyAccumulatedPairs.push({
            scraperOutput: output,
            nlpInput: {
              sourceId: output.sourceId,
              sourceName,
              signSlugIt: output.signSlugIt,
              dateISO: output.weekStartDate,
              extracted_text: output.extracted_text,
            },
          });
        }
        if (weeklyDoneCount === weeklyTotalExpected && weeklyTotalExpected > 0 && weeklyAccumulatedPairs.length > 0) {
          enqueueAggregatedWeeklyNlpJob(weeklyAccumulatedPairs).catch(err =>
            console.error(`[API Weekly Refresh Sign] Failed to enqueue aggregated NLP job for ${zodiacSign.name_italian}:`, err)
          );
        }
      };

      for (const source of sources) {
        // Check if already processed (unless force rescrape)
        if (!forceRescrape) {
          const existing = await prisma.weeklyHoroscopeData.findFirst({
            where: {
              source_id: source.id,
              zodiac_sign_id: zodiacSign.id,
              week_start_date: weekStart,
              summary: { not: '' }
            }
          });

          if (existing) {
            skipped++;
            continue;
          }
        }

        // Enqueue the job
        try {
          const isSaturdayBased = source.domain.includes('repubblica.it') || source.domain.includes('sorrisi.com');
          const useNumericMonth = source.domain.includes('repubblica.it');
          const { startDay, endDay, month, year } = formatWeekUrlParams(weekStart, isSaturdayBased, useNumericMonth);

          const scraperInput = {
            sourceId: source.id,
            sourceName: source.name,
            domain: source.domain,
            baseUrl: source.base_url,
            urlPattern: source.url_pattern,
            scrapeStrategy: source.scrape_strategy,
            signSlugIt: zodiacSign.name_italian,
            weekStartDate: format(weekStart, 'yyyy-MM-dd'),
            startDay,
            endDay,
            month,
            year,
            userAgent: process.env.SCRAPE_USER_AGENT || 'ItalianHoroscopeComparatorBot/1.0 (+contact)',
          };

          await enqueueWeeklyScrapeJob(scraperInput, (output) => handleWeeklyScrapeComplete(output, source.name));
          enqueued++;
          weeklyTotalExpected++;
        } catch (error) {
          console.error(`[API Weekly Refresh Sign] Failed to enqueue ${source.name}:`, error);
        }
      }
      
      res.json({
        success: true,
        sign: zodiacSign.name_italian,
        weekStart: format(weekStart, 'yyyy-MM-dd'),
        stats: {
          total: sources.length,
          enqueued,
          skipped
        },
        message: `Weekly scrape triggered for ${zodiacSign.name_italian}`
      });
      
    } catch (error) {
      console.error('[API Weekly Refresh Sign] Error:', error);
      res.status(500).json({ error: 'Failed to trigger weekly refresh' });
    }
  });

  /**
   * POST /api/refresh-weekly/source/:sourceId
   * Manual trigger for weekly scraper - single source, all signs
   */
  app.post("/api/refresh-weekly/source/:sourceId", async (req, res) => {
    try {
      // Admin auth check
      const adminSecret = req.headers['x-admin-secret'];
      const expectedSecret = process.env.ADMIN_SECRET || 'default-admin-secret-change-me';
      
      if (adminSecret !== expectedSecret) {
        console.warn('[API Weekly Refresh Source] Unauthorized attempt blocked');
        return res.status(401).json({ error: 'Unauthorized - X-Admin-Secret header required' });
      }
      
      const { sourceId } = req.params;
      const { targetWeek, forceRescrape, dryRun } = req.body;
      
      // Validate source exists
      const source = await prisma.weeklySource.findUnique({
        where: { id: parseInt(sourceId) }
      });
      
      if (!source) {
        return res.status(404).json({ error: 'Weekly source not found' });
      }
      
      if (!source.is_active) {
        return res.status(400).json({ error: 'Source is not active' });
      }
      
      // Parse target week
      let weekStart: Date;
      if (targetWeek) {
        weekStart = new Date(targetWeek);
        if (weekStart.getDay() !== 1) {
          return res.status(400).json({ error: 'Target week must be a Monday' });
        }
      } else {
        weekStart = getCurrentWeekStart();
      }
      
      // Trigger orchestrator with specific source
      const resultPromise = runWeeklyScraperCycle({
        weekStart,
        specificSources: [source.id],
        sourceGroup: 'all',
        forceRescrape: forceRescrape || false,
        dryRun: dryRun || false,
        triggerType: 'manual'
      });
      
      // For dry run, wait for result
      if (dryRun) {
        const result = await resultPromise;
        return res.json({
          success: true,
          dryRun: true,
          source: source.name,
          weekStart: weekStart.toISOString().split('T')[0],
          stats: result.stats,
          message: `[DRY RUN] Would process ${result.stats.enqueued} jobs for ${source.name}`,
        });
      }
      
      // For actual run, return immediately
      res.json({
        success: true,
        dryRun: false,
        source: source.name,
        weekStart: weekStart.toISOString().split('T')[0],
        message: `Weekly scrape triggered for ${source.name}`,
        note: 'Processing will continue in background'
      });
      
    } catch (error) {
      console.error('[API Weekly Refresh Source] Error:', error);
      res.status(500).json({ error: 'Failed to trigger weekly refresh' });
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

      // Accumulate scraper outputs to run one batch NLP call per sign
      let doneCount = 0;
      const totalExpected = sources.length;
      const accumulatedPairs: Array<{ nlpInput: OpenAIInput; scraperOutput: ScraperOutput }> = [];

      const handleScrapeComplete = (output: ScraperOutput | null, sourceName: string) => {
        doneCount++;
        if (output) {
          accumulatedPairs.push({
            scraperOutput: output,
            nlpInput: {
              sourceId: output.sourceId,
              sourceName,
              signSlugIt: output.signSlugIt,
              dateISO: output.dateISO,
              extracted_text: output.extracted_text,
            },
          });
        }
        if (doneCount === totalExpected && accumulatedPairs.length > 0) {
          enqueueAggregatedNlpJob(accumulatedPairs).catch(err =>
            console.error(`[API Refresh Sign] Failed to enqueue aggregated NLP job for ${sign}:`, err)
          );
        }
      };

      // Enqueue scrape jobs for this sign across all sources
      for (const source of sources) {
        try {
          const jobId = await enqueueScrapeJob(
            createScraperInput(source, zodiacSign, targetDate),
            (output) => handleScrapeComplete(output, source.name)
          );
          jobIds.push(jobId);
        } catch (error) {
          const errorMsg = `Failed to enqueue ${source.name} - ${sign}`;
          errors.push(errorMsg);
          console.error(errorMsg, error);
          // Count enqueue failures so the batch trigger is not permanently blocked
          doneCount++;
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
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
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
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
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
      
      await cleanupService.cleanupHoroscopeData();
      await cleanupTracker.setLastCleanupDate(new Date());
      
      const statsAfter = await cleanupService.getDataStats();
      
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

  // ============================================================================
  // WEEKLY SCRAPER MONITORING & ADMIN ENDPOINTS
  // ============================================================================

  /**
   * GET /api/admin/weekly-scraper/guards
   * Test all guard functions without triggering scrapes
   * Shows current state of all guards for debugging
   */
  app.get("/api/admin/weekly-scraper/guards", async (req, res) => {
    try {
      const weekStart = getCurrentWeekStart();
      const now = new Date();
      const italyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
      
      const { hasCompletedGroupScrapeForWeek } = await import('./services/weeklyScraperOrchestrator');
      
      // Check all guards
      const [mondayDone, elleDone, saturdayDone, staleExecutions] = await Promise.all([
        hasCompletedGroupScrapeForWeek(weekStart, 'all'),
        hasCompletedGroupScrapeForWeek(weekStart, 'elle_only'),
        hasCompletedGroupScrapeForWeek(weekStart, 'saturday_group'),
        findStaleExecutions(2),
      ]);
      
      const dayOfWeek = italyNow.getDay(); // 0=Sun, 1=Mon, 4=Thu, 6=Sat
      const currentHour = italyNow.getHours();
      const currentMinute = italyNow.getMinutes();
      const currentTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
      
      const isMonday = dayOfWeek === 1;
      const isThursday = dayOfWeek === 4;
      const isSaturday = dayOfWeek === 6;
      const isInMondayWindow = isMonday && currentHour >= 5 && currentHour < 8;
      
      res.json({
        currentWeek: weekStart.toISOString().split('T')[0],
        currentTime: {
          italy: currentTime,
          dayOfWeek: italyNow.toLocaleDateString('en-US', { weekday: 'long' }),
          isMonday,
          isThursday,
          isSaturday,
          isInMondayWindow,
        },
        guards: {
          mondayDone,
          elleDone,
          saturdayDone,
          hasStaleExecutions: staleExecutions.length > 0,
          staleCount: staleExecutions.length,
        },
        staleExecutions: staleExecutions.map(ex => ({
          id: ex.id,
          targetWeek: ex.target_week.toISOString().split('T')[0],
          sourceGroup: ex.source_group,
          startedAt: ex.started_at.toISOString(),
          triggerType: ex.trigger_type,
        })),
      });
    } catch (error) {
      console.error('[Admin API] Guard check error:', error);
      res.status(500).json({ 
        error: 'Failed to check guards',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/admin/weekly-scraper/coverage
   * Check current week coverage - which sources have data, which are missing
   */
  app.get("/api/admin/weekly-scraper/coverage", async (req, res) => {
    try {
      const { weekStart } = req.query;
      const targetWeek = weekStart 
        ? new Date(weekStart as string)
        : getCurrentWeekStart();
      
      const coverage = await getWeeklyCoverage(targetWeek);
      const gaps = await findGapsInCoverage(targetWeek);
      
      const totalSources = coverage.length;
      const completeSources = coverage.filter(c => c.isComplete).length;
      const coveragePercent = totalSources > 0 
        ? Math.round((completeSources / totalSources) * 1000) / 10 
        : 0;
      
      res.json({
        weekStart: targetWeek.toISOString().split('T')[0],
        summary: {
          totalSources,
          completeSources,
          incompleteSources: totalSources - completeSources,
          coveragePercent,
        },
        sources: coverage,
        gaps,
      });
    } catch (error) {
      console.error('[Admin API] Coverage check error:', error);
      res.status(500).json({ 
        error: 'Failed to check coverage',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/admin/weekly-scraper/executions
   * Recent execution history with optional filtering
   */
  app.get("/api/admin/weekly-scraper/executions", async (req, res) => {
    try {
      const { limit, sourceGroup } = req.query;
      
      // Validate limit parameter
      const limitNum = limit ? parseInt(limit as string) : 10;
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({ error: 'Invalid limit parameter (must be 1-100)' });
      }
      
      // Validate sourceGroup parameter (whitelist)
      const validGroups: SourceGroup[] = ['all', 'elle_only', 'saturday_group'];
      const groupFilter = sourceGroup as SourceGroup | undefined;
      if (groupFilter && !validGroups.includes(groupFilter)) {
        return res.status(400).json({ 
          error: 'Invalid sourceGroup parameter',
          validValues: validGroups
        });
      }
      
      const executions = await getExecutionHistory(limitNum, groupFilter);
      
      res.json({
        count: executions.length,
        limit: limitNum,
        sourceGroupFilter: groupFilter || 'all',
        executions,
      });
    } catch (error) {
      console.error('[Admin API] Execution history error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch execution history',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/admin/weekly-scraper/health
   * Health check endpoint with warnings for monitoring
   */
  app.get("/api/admin/weekly-scraper/health", async (req, res) => {
    try {
      const weekStart = getCurrentWeekStart();
      const now = new Date();
      const italyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
      const dayOfWeek = italyNow.getDay();
      
      const [stats, staleExecutions, failed, mondayDone, gaps] = await Promise.all([
        getHealthStats(weekStart),
        findStaleExecutions(2),
        getFailedSources(weekStart),
        import('./services/weeklyScraperOrchestrator').then(m => 
          m.hasCompletedGroupScrapeForWeek(weekStart, 'all')
        ),
        findGapsInCoverage(weekStart),
      ]);
      
      const warnings: string[] = [];
      
      // Warning 1: No Monday scrape by Tuesday
      if (dayOfWeek >= 2 && !mondayDone) {
        warnings.push('Monday scrape not completed yet (expected by Tuesday)');
      }
      
      // Warning 2: Stale executions
      if (staleExecutions.length > 0) {
        warnings.push(`${staleExecutions.length} stale execution(s) found (running > 2 hours)`);
      }
      
      // Warning 3: Low coverage
      if (stats.coveragePercent < 95) {
        warnings.push(`Low coverage: ${stats.coveragePercent}% (expected > 95%)`);
      }
      
      // Warning 4: Failed sources need attention
      if (failed.length > 0) {
        warnings.push(`${failed.length} failed source(s) need retry`);
      }
      
      // Warning 5: Significant gaps
      if (gaps.length > 3) {
        warnings.push(`${gaps.length} sources have incomplete data`);
      }
      
      const healthy = warnings.length === 0;
      
      res.json({
        healthy,
        weekStart: weekStart.toISOString().split('T')[0],
        checkTime: now.toISOString(),
        warnings,
        stats: {
          ...stats,
          staleExecutionsCount: staleExecutions.length,
          failedSourcesCount: failed.length,
          gapsCount: gaps.length,
        },
        details: {
          staleExecutions: staleExecutions.map(ex => ({
            id: ex.id,
            targetWeek: ex.target_week.toISOString().split('T')[0],
            sourceGroup: ex.source_group,
            hoursRunning: Math.round((now.getTime() - ex.started_at.getTime()) / (1000 * 60 * 60) * 10) / 10,
          })),
          failedSources: failed.map(f => ({
            source: f.sourceName,
            sign: f.signName,
            failedAt: f.failedAt.toISOString(),
          })),
        },
      });
    } catch (error) {
      console.error('[Admin API] Health check error:', error);
      res.status(500).json({ 
        error: 'Failed to check health',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // POST /api/test/daily-orchestrator - Test daily scraper orchestrator
  app.post("/api/test/daily-orchestrator", async (req, res) => {
    try {
      const { runDailyScraperCycle } = await import('./services/dailyScraperOrchestrator');
      
      const { targetDate, forceRescrape, specificSources, dryRun } = req.body;
      
      // Default to today if no date provided
      const dateToUse = targetDate || new Date().toISOString().split('T')[0];
      
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateToUse)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      const result = await runDailyScraperCycle({
        targetDate: dateToUse,
        forceRescrape: forceRescrape || false,
        specificSources: specificSources || undefined,
        dryRun: dryRun || false,
      });
      
      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error('[Test] Daily orchestrator error:', error);
      res.status(500).json({
        error: 'Failed to run daily orchestrator',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/user/me
  app.get("/api/user/me", async (req, res) => {
    const clerkId = req.headers['x-clerk-user-id'] as string | undefined;
    if (!clerkId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const user = await prisma.user.upsert({
        where: { clerkId },
        update: {},
        create: { clerkId, email: `clerk_${clerkId}@noemail.local`, tier: 'free' },
      });
      return res.json({ id: user.id, clerkId: user.clerkId, tier: user.tier, email: user.email });
    } catch (error) {
      console.error('[User] Error in /api/user/me:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/stripe/webhook
  app.post("/api/stripe/webhook", async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[Stripe] STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('[Stripe] Webhook signature verification failed:', err);
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    try {
      const obj = event.data.object as { metadata?: { clerkId?: string }; status?: string };
      const clerkId = obj.metadata?.clerkId;

      switch (event.type) {
        case 'customer.subscription.created':
          if (clerkId) {
            await prisma.user.update({ where: { clerkId }, data: { tier: 'premium' } });
          }
          break;

        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const sessionClerkId = session.metadata?.clerkId;
          if (sessionClerkId) {
            // Tracking lato server (opzionale, per maggior accuratezza)
            console.log('[Analytics] Purchase completed:', sessionClerkId);
            await prisma.user.update({
              where: { clerkId: sessionClerkId },
              data: {
                tier: 'premium',
                stripe_customer_id: session.customer as string
              }
            });
          }
          break;
        }

        case 'customer.subscription.deleted':
          if (clerkId) {
            await prisma.user.update({ where: { clerkId }, data: { tier: 'free' } });
          }
          break;

        case 'customer.subscription.updated':
          if (clerkId && (obj.status === 'canceled' || obj.status === 'past_due')) {
            await prisma.user.update({ where: { clerkId }, data: { tier: 'free' } });
          }
          break;
      }
    } catch (error) {
      console.error('[Stripe] Error handling event:', error);
      return res.status(500).json({ error: 'Failed to process webhook' });
    }

    return res.json({ received: true });
  });

  app.get("/api/user/preferences", async (req, res) => {
    const clerkId = req.headers['x-clerk-user-id'] as string;
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const user = await prisma.user.findUnique({
        where: { clerkId },
        include: { preferences: true },
      });
      if (!user) return res.status(404).json({ error: 'User not found' });

      return res.json({
        favoriteSigns: user.preferences?.favorite_signs ?? [],
        favoriteSources: (user.preferences?.favorite_sources ?? []).map(Number),
      });
    } catch (error) {
      console.error('[Preferences GET] Error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post("/api/user/preferences", async (req, res) => {
    const clerkId = req.headers['x-clerk-user-id'] as string;
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' });

    const { favoriteSigns, favoriteSources } = req.body;

    try {
      const user = await prisma.user.findUnique({ where: { clerkId } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      await prisma.userPreferences.upsert({
        where: { user_id: user.id },
        update: {
          favorite_signs: favoriteSigns ?? [],
          favorite_sources: favoriteSources ?? [],
        },
        create: {
          user_id: user.id,
          favorite_signs: favoriteSigns ?? [],
          favorite_sources: favoriteSources ?? [],
        },
      });

      return res.json({ ok: true });
    } catch (error) {
      console.error('[Preferences] Error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/stripe/portal
  app.post("/api/stripe/portal", async (req, res) => {
    const clerkId = req.headers['x-clerk-user-id'] as string;
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const user = await prisma.user.findUnique({ where: { clerkId } });
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (!user.stripe_customer_id) return res.status(400).json({ error: 'No Stripe customer found' });

      const session = await getStripe().billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: `${req.headers.origin}/account`
      });

      return res.json({ portalUrl: session.url });
    } catch (error) {
      console.error('[Stripe Portal] Error:', error);
      return res.status(500).json({ error: 'Failed to create portal session' });
    }
  });

  // POST /api/stripe/checkout
  app.post("/api/stripe/checkout", async (req, res) => {
    const clerkId = req.headers['x-clerk-user-id'] as string;
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' });

    const { priceId } = req.body;
    if (!priceId) return res.status(400).json({ error: 'Price ID required' });

    try {
      const session = await getStripe().checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${req.headers.origin}/`,
        cancel_url: `${req.headers.origin}/pricing`,
        customer_email: (await prisma.user.findUnique({ where: { clerkId } }))?.email || undefined,
        metadata: { clerkId }
      });

      return res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
      console.error('[Stripe Checkout] Error:', error);
      return res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  // POST /api/compatibility
  app.post("/api/compatibility", async (req, res) => {
    const clerkId = req.headers['x-clerk-user-id'] as string;
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' });

    const { sign1, sign2, date } = req.body;
    if (!sign1 || !sign2) return res.status(400).json({ error: 'Both signs required' });

    const targetDate = date ? new Date(date) : new Date();
    const dateLabel = targetDate.toISOString().split('T')[0];

    try {
      const [horo1, horo2] = await Promise.all([
        prisma.horoscopeData.findMany({
          where: { zodiac_sign: { name_english: sign1 }, date: targetDate },
          select: { summary: true },
          take: 3,
        }),
        prisma.horoscopeData.findMany({
          where: { zodiac_sign: { name_english: sign2 }, date: targetDate },
          select: { summary: true },
          take: 3,
        }),
      ]);

      if (horo1.length === 0 || horo2.length === 0) {
        return res.status(404).json({ error: 'Nessun oroscopo disponibile per quella data' });
      }

      const { Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const prompt =
        `Oroscopo di ${sign1} del ${dateLabel}:\n${horo1.map(h => h.summary).join(' ')}\n\n` +
        `Oroscopo di ${sign2} del ${dateLabel}:\n${horo2.map(h => h.summary).join(' ')}\n\n` +
        `Scrivi 1-2 frasi sulla compatibilità amorosa tra ${sign1} e ${sign2} secondo i loro oroscopi di ${dateLabel}. Tono leggero, italiano. Massimo 100 parole, nessun voto numerico.`;

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      });

      const result = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

      return res.json({ result });
    } catch (error) {
      console.error('[Compatibility] Error:', error);
      return res.status(500).json({ error: 'Failed to analyze compatibility' });
    }
  });

  // POST /api/contact
  app.post("/api/contact", async (req, res) => {
    const { name, email, subject, message } = req.body;

    if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
      return res.status(400).json({ error: "Tutti i campi sono obbligatori" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Email non valida" });
    }

    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "Confronta Oroscopo <onboarding@resend.dev>",
        to: "fed.fabiani@gmail.com",
        subject: `[Contatto] ${subject}`,
        text: `Da: ${name} <${email}>\nOggetto: ${subject}\n\n${message}`,
      });

      return res.json({ success: true });
    } catch (error) {
      console.error("[Contact] Email send error:", error);
      return res.status(500).json({ error: "Errore durante l'invio del messaggio" });
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
