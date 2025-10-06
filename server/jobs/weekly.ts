import PQueue from 'p-queue';
import { weeklyScraperWorker } from '../workers/weekly-scraper';
import { openaiWorker } from '../workers/openai';
import { nlpQueue } from './index';
import { WeeklyScraperInput, OpenAIInput, WeeklyScraperOutput, OpenAIOutput } from '@shared/schema';
import prisma from '../services/database';

// Weekly job queue with concurrency limits
export const weeklyQueue = new PQueue({
  concurrency: 2, // Max 2 concurrent weekly scraping jobs
  interval: 3000, // 3 second interval between batches
  intervalCap: 2, // Max 2 jobs per interval
});

// Job status tracking
interface WeeklyJobStatus {
  id: string;
  type: 'weekly_scrape' | 'weekly_nlp' | 'weekly_upsert';
  status: 'pending' | 'running' | 'completed' | 'failed';
  sourceId: number;
  signSlugIt: string;
  weekStartDate: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

const weeklyJobStatusMap = new Map<string, WeeklyJobStatus>();

function generateWeeklyJobId(): string {
  return `weekly_job_${Date.now()}_${Math.random().toString(36).substring(2)}`;
}

export function getWeeklyJobStatus(jobId: string): WeeklyJobStatus | undefined {
  return weeklyJobStatusMap.get(jobId);
}

export function getAllWeeklyJobStatuses(): WeeklyJobStatus[] {
  return Array.from(weeklyJobStatusMap.values());
}

export async function enqueueWeeklyScrapeJob(input: WeeklyScraperInput): Promise<string> {
  const jobId = generateWeeklyJobId();
  
  const status: WeeklyJobStatus = {
    id: jobId,
    type: 'weekly_scrape',
    status: 'pending',
    sourceId: input.sourceId,
    signSlugIt: input.signSlugIt,
    weekStartDate: input.weekStartDate,
  };
  
  weeklyJobStatusMap.set(jobId, status);
  
  weeklyQueue.add(async () => {
    try {
      status.status = 'running';
      status.startedAt = new Date();
      
      console.log(`[WeeklyJobQueue] Starting weekly scrape job ${jobId}`);
      const result = await weeklyScraperWorker.process(input);
      
      status.status = 'completed';
      status.completedAt = new Date();
      
      // Enqueue NLP job for this result
      const nlpInput: OpenAIInput = {
        sourceId: result.sourceId,
        sourceName: input.sourceName,
        signSlugIt: result.signSlugIt,
        dateISO: result.weekStartDate,
        extracted_text: result.extracted_text,
      };
      
      await enqueueWeeklyNlpJob(nlpInput, result);
      console.log(`[WeeklyJobQueue] Weekly scrape job ${jobId} completed, NLP job enqueued`);
      
    } catch (error) {
      status.status = 'failed';
      status.completedAt = new Date();
      status.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[WeeklyJobQueue] Weekly scrape job ${jobId} failed:`, error);
    }
  });
  
  return jobId;
}

async function enqueueWeeklyNlpJob(input: OpenAIInput, scraperOutput: WeeklyScraperOutput): Promise<string> {
  const jobId = generateWeeklyJobId();
  
  const status: WeeklyJobStatus = {
    id: jobId,
    type: 'weekly_nlp',
    status: 'pending',
    sourceId: input.sourceId,
    signSlugIt: input.signSlugIt,
    weekStartDate: scraperOutput.weekStartDate,
  };
  
  weeklyJobStatusMap.set(jobId, status);
  
  // Reuse the existing NLP queue from daily jobs
  await nlpQueue.add(async () => {
    try {
      status.status = 'running';
      status.startedAt = new Date();
      
      console.log(`[WeeklyJobQueue] Starting weekly NLP job ${jobId}`);
      const nlpResult = await openaiWorker.process(input);
      
      // Enqueue database upsert
      await enqueueWeeklyUpsertJob(scraperOutput, nlpResult);
      
      status.status = 'completed';
      status.completedAt = new Date();
      console.log(`[WeeklyJobQueue] Weekly NLP job ${jobId} completed, upsert job enqueued`);
      
    } catch (error) {
      status.status = 'failed';
      status.completedAt = new Date();
      status.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[WeeklyJobQueue] Weekly NLP job ${jobId} failed:`, error);
    }
  });
  
  return jobId;
}

async function enqueueWeeklyUpsertJob(scraperOutput: WeeklyScraperOutput, nlpOutput: OpenAIOutput): Promise<string> {
  const jobId = generateWeeklyJobId();
  
  const status: WeeklyJobStatus = {
    id: jobId,
    type: 'weekly_upsert',
    status: 'pending',
    sourceId: scraperOutput.sourceId,
    signSlugIt: scraperOutput.signSlugIt,
    weekStartDate: scraperOutput.weekStartDate,
  };
  
  weeklyJobStatusMap.set(jobId, status);
  
  // Use a simple setTimeout to avoid creating another queue for DB operations
  setTimeout(async () => {
    try {
      status.status = 'running';
      status.startedAt = new Date();
      
      console.log(`[WeeklyJobQueue] Starting weekly upsert job ${jobId}`);
      
      // Find zodiac sign ID by Italian name
      const zodiacSign = await prisma.zodiacSign.findFirst({
        where: { name_italian: scraperOutput.signSlugIt }
      });
      
      if (!zodiacSign) {
        throw new Error(`Zodiac sign not found: ${scraperOutput.signSlugIt}`);
      }
      
      console.log(`[WeeklyJobQueue] Upserting weekly data for ${zodiacSign.name_italian} (ID: ${zodiacSign.id}) from source ${scraperOutput.sourceId}`);
      
      // Upsert weekly horoscope data
      const upsertResult = await prisma.weeklyHoroscopeData.upsert({
        where: {
          source_id_zodiac_sign_id_week_start_date: {
            source_id: scraperOutput.sourceId,
            zodiac_sign_id: zodiacSign.id,
            week_start_date: new Date(scraperOutput.weekStartDate),
          }
        },
        update: {
          original_text: scraperOutput.extracted_text,
          summary: nlpOutput.summary,
          relazioni_rating: nlpOutput.ratings.relazioni,
          lavoro_rating: nlpOutput.ratings.lavoro,
          salute_rating: nlpOutput.ratings.benessere,
          tone_analysis: nlpOutput.tone,
          original_url: scraperOutput.original_url,
          scraped_at: scraperOutput.scraped_at,
          updated_at: new Date(),
        },
        create: {
          source_id: scraperOutput.sourceId,
          zodiac_sign_id: zodiacSign.id,
          week_start_date: new Date(scraperOutput.weekStartDate),
          original_text: scraperOutput.extracted_text,
          summary: nlpOutput.summary,
          relazioni_rating: nlpOutput.ratings.relazioni,
          lavoro_rating: nlpOutput.ratings.lavoro,
          salute_rating: nlpOutput.ratings.benessere,
          tone_analysis: nlpOutput.tone,
          original_url: scraperOutput.original_url,
          scraped_at: scraperOutput.scraped_at,
        },
      });
      
      console.log(`[WeeklyJobQueue] Successfully upserted weekly horoscope data with ID: ${upsertResult.id}`);
      
      status.status = 'completed';
      status.completedAt = new Date();
      console.log(`[WeeklyJobQueue] Weekly upsert job ${jobId} completed`);
      
    } catch (error) {
      status.status = 'failed';
      status.completedAt = new Date();
      status.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[WeeklyJobQueue] Weekly upsert job ${jobId} failed:`, error);
    }
  }, 100); // Small delay to avoid blocking
  
  return jobId;
}

// Calculate ISO week start (Monday) and end (Sunday) for current week
function getISOWeekDates(): { weekStart: string; weekEnd: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate days to subtract to get to Monday (ISO week start)
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysToMonday);
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6); // Sunday is 6 days after Monday
  weekEnd.setHours(23, 59, 59, 999);
  
  return {
    weekStart: weekStart.toISOString().split('T')[0],
    weekEnd: weekEnd.toISOString().split('T')[0],
  };
}

// Main function to scrape weekly horoscopes for all active sources and signs
export async function scrapeWeeklyHoroscopes(): Promise<{ total: number; enqueued: number; failed: number; errors: string[] }> {
  console.log('[WeeklyJobQueue] Starting weekly horoscope scraping for all active sources...');
  
  try {
    // Fetch all active weekly sources
    const weeklySources = await prisma.weeklySource.findMany({
      where: { is_active: true }
    });
    
    console.log(`[WeeklyJobQueue] Found ${weeklySources.length} active weekly sources`);
    
    if (weeklySources.length === 0) {
      return { total: 0, enqueued: 0, failed: 0, errors: [] };
    }
    
    // Get current ISO week dates
    const { weekStart, weekEnd } = getISOWeekDates();
    console.log(`[WeeklyJobQueue] Scraping for week: ${weekStart} to ${weekEnd}`);
    
    // Italian zodiac signs
    const zodiacSigns = [
      'Ariete', 'Toro', 'Gemelli', 'Cancro',
      'Leone', 'Vergine', 'Bilancia', 'Scorpione',
      'Sagittario', 'Capricorno', 'Acquario', 'Pesci'
    ];
    
    let totalJobs = 0;
    let enqueuedJobs = 0;
    let failedJobs = 0;
    const errors: string[] = [];
    
    // Iterate through each source and each sign
    for (const source of weeklySources) {
      for (const sign of zodiacSigns) {
        totalJobs++;
        
        try {
          const input: WeeklyScraperInput = {
            sourceId: source.id,
            sourceName: source.name,
            domain: source.domain,
            baseUrl: source.base_url,
            urlPattern: source.url_pattern,
            signSlugIt: sign,
            weekStartDate: weekStart,
            weekEndDate: weekEnd,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          };
          
          await enqueueWeeklyScrapeJob(input);
          enqueuedJobs++;
          
          console.log(`[WeeklyJobQueue] Enqueued job for ${source.name} - ${sign}`);
        } catch (error) {
          failedJobs++;
          const errorMsg = `Failed to enqueue ${source.name} - ${sign}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(`[WeeklyJobQueue] ${errorMsg}`);
        }
      }
    }
    
    console.log(`[WeeklyJobQueue] Weekly scraping jobs summary: Total=${totalJobs}, Enqueued=${enqueuedJobs}, Failed=${failedJobs}`);
    
    return { total: totalJobs, enqueued: enqueuedJobs, failed: failedJobs, errors };
  } catch (error) {
    console.error('[WeeklyJobQueue] Fatal error during weekly scraping:', error);
    throw error;
  }
}

// Cleanup old weekly job statuses (older than 1 hour)
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [jobId, status] of Array.from(weeklyJobStatusMap.entries())) {
    if (status.completedAt && status.completedAt.getTime() < oneHourAgo) {
      weeklyJobStatusMap.delete(jobId);
    }
  }
}, 10 * 60 * 1000); // Run every 10 minutes
