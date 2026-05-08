import PQueue from 'p-queue';
import { scraperWorker } from '../workers/scraper';
import { weeklyScraperWorker } from '../workers/weeklyScraper';
import { openaiWorker } from '../workers/claude';
import { ScraperInput, OpenAIInput, ScraperOutput, OpenAIOutput, WeeklyScraperInput, WeeklyScraperOutput } from '@shared/schema';
import prisma from '../services/database';

// Job queues with different concurrency and rate limits
export const scrapeQueue = new PQueue({
  concurrency: 3, // Max 3 concurrent scraping jobs
  interval: 2000, // 2 second interval between batches
  intervalCap: 3, // Max 3 jobs per interval
});

export const nlpQueue = new PQueue({
  concurrency: 1, // Process one OpenAI call at a time to avoid rate limits
  interval: 3000, // 3 second interval between calls
  intervalCap: 1, // Max 1 job per interval
});

// Job status tracking
interface JobStatus {
  id: string;
  type: 'scrape' | 'nlp' | 'upsert' | 'weekly-scrape' | 'weekly-nlp' | 'weekly-upsert';
  status: 'pending' | 'running' | 'completed' | 'failed';
  sourceId: number;
  signSlugIt: string;
  dateISO: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

const jobStatusMap = new Map<string, JobStatus>();

export function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2)}`;
}

export function getJobStatus(jobId: string): JobStatus | undefined {
  return jobStatusMap.get(jobId);
}

export function getAllJobStatuses(): JobStatus[] {
  return Array.from(jobStatusMap.values());
}

export async function enqueueScrapeJob(input: ScraperInput): Promise<string> {
  const jobId = generateJobId();
  
  const status: JobStatus = {
    id: jobId,
    type: 'scrape',
    status: 'pending',
    sourceId: input.sourceId,
    signSlugIt: input.signSlugIt,
    dateISO: input.dateISO,
  };
  
  jobStatusMap.set(jobId, status);
  
  scrapeQueue.add(async () => {
    try {
      status.status = 'running';
      status.startedAt = new Date();
      
      console.log(`[JobQueue] Starting scrape job ${jobId}`);
      const result = await scraperWorker.process(input);
      
      status.status = 'completed';
      status.completedAt = new Date();
      
      // Enqueue NLP job for this result
      const nlpInput: OpenAIInput = {
        sourceId: result.sourceId,
        sourceName: input.sourceName,
        signSlugIt: result.signSlugIt,
        dateISO: result.dateISO,
        extracted_text: result.extracted_text,
      };
      
      await enqueueNlpJob(nlpInput, result);
      console.log(`[JobQueue] Scrape job ${jobId} completed, NLP job enqueued`);
      
    } catch (error) {
      status.status = 'failed';
      status.completedAt = new Date();
      status.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JobQueue] Scrape job ${jobId} failed:`, error);
    }
  });
  
  return jobId;
}

export async function enqueueNlpJob(input: OpenAIInput, scraperOutput: ScraperOutput): Promise<string> {
  const jobId = generateJobId();
  
  const status: JobStatus = {
    id: jobId,
    type: 'nlp',
    status: 'pending',
    sourceId: input.sourceId,
    signSlugIt: input.signSlugIt,
    dateISO: input.dateISO,
  };
  
  jobStatusMap.set(jobId, status);
  
  nlpQueue.add(async () => {
    try {
      status.status = 'running';
      status.startedAt = new Date();
      
      console.log(`[JobQueue] Starting NLP job ${jobId}`);
      const nlpResult = await openaiWorker.process(input);
      
      // Enqueue database upsert
      await enqueueUpsertJob(scraperOutput, nlpResult);
      
      status.status = 'completed';
      status.completedAt = new Date();
      console.log(`[JobQueue] NLP job ${jobId} completed, upsert job enqueued`);
      
    } catch (error) {
      status.status = 'failed';
      status.completedAt = new Date();
      status.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JobQueue] NLP job ${jobId} failed:`, error);
    }
  });
  
  return jobId;
}

export async function enqueueUpsertJob(scraperOutput: ScraperOutput, nlpOutput: OpenAIOutput): Promise<string> {
  const jobId = generateJobId();
  
  const status: JobStatus = {
    id: jobId,
    type: 'upsert',
    status: 'pending',
    sourceId: scraperOutput.sourceId,
    signSlugIt: scraperOutput.signSlugIt,
    dateISO: scraperOutput.dateISO,
  };
  
  jobStatusMap.set(jobId, status);
  
  // Use a simple setTimeout to avoid creating another queue for DB operations
  setTimeout(async () => {
    try {
      status.status = 'running';
      status.startedAt = new Date();
      
      console.log(`[JobQueue] Starting upsert job ${jobId}`);
      
      // Find zodiac sign ID by Italian name (signSlugIt contains Italian name)
      const zodiacSign = await prisma.zodiacSign.findFirst({
        where: { name_italian: scraperOutput.signSlugIt }
      });
      
      if (!zodiacSign) {
        throw new Error(`Zodiac sign not found: ${scraperOutput.signSlugIt}`);
      }
      
      console.log(`[JobQueue] Upserting data for ${zodiacSign.name_italian} (ID: ${zodiacSign.id}) from source ${scraperOutput.sourceId}`);
      
      // Upsert horoscope data
      const upsertResult = await prisma.horoscopeData.upsert({
        where: {
          source_id_zodiac_sign_id_date: {
            source_id: scraperOutput.sourceId,
            zodiac_sign_id: zodiacSign.id,
            date: new Date(scraperOutput.dateISO),
          }
        },
        update: {
          original_text: scraperOutput.extracted_text,
          superquote: nlpOutput.superquote,
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
          date: new Date(scraperOutput.dateISO),
          original_text: scraperOutput.extracted_text,
          superquote: nlpOutput.superquote,
          summary: nlpOutput.summary,
          relazioni_rating: nlpOutput.ratings.relazioni,
          lavoro_rating: nlpOutput.ratings.lavoro,
          salute_rating: nlpOutput.ratings.benessere,
          tone_analysis: nlpOutput.tone,
          original_url: scraperOutput.original_url,
          scraped_at: scraperOutput.scraped_at,
        },
      });
      
      console.log(`[JobQueue] Successfully upserted horoscope data with ID: ${upsertResult.id}`);
      
      status.status = 'completed';
      status.completedAt = new Date();
      console.log(`[JobQueue] Upsert job ${jobId} completed`);
      
    } catch (error) {
      status.status = 'failed';
      status.completedAt = new Date();
      status.error = error instanceof Error ? error.message : 'Unknown error';
      const errorCode = (error as any)?.code;
      const errorMeta = (error as any)?.meta;
      console.error(`[JobQueue] Upsert job ${jobId} failed [${errorCode ?? 'no-code'}]:`, error instanceof Error ? error.message : error);
      if (errorMeta) console.error(`[JobQueue] Prisma meta:`, JSON.stringify(errorMeta));
    }
  }, 100); // Small delay to avoid blocking

  return jobId;
}

// Weekly horoscope job functions
export async function enqueueWeeklyScrapeJob(input: WeeklyScraperInput): Promise<string> {
  const jobId = generateJobId();
  
  const status: JobStatus = {
    id: jobId,
    type: 'weekly-scrape',
    status: 'pending',
    sourceId: input.sourceId,
    signSlugIt: input.signSlugIt,
    dateISO: input.weekStartDate,
  };
  
  jobStatusMap.set(jobId, status);
  
  scrapeQueue.add(async () => {
    try {
      status.status = 'running';
      status.startedAt = new Date();
      
      console.log(`[JobQueue] Starting weekly scrape job ${jobId}`);
      const result = await weeklyScraperWorker.process(input);
      
      status.status = 'completed';
      status.completedAt = new Date();
      
      const nlpInput: OpenAIInput = {
        sourceId: result.sourceId,
        sourceName: input.sourceName,
        signSlugIt: result.signSlugIt,
        dateISO: result.weekStartDate,
        extracted_text: result.extracted_text,
      };
      
      await enqueueWeeklyNlpJob(nlpInput, result);
      console.log(`[JobQueue] Weekly scrape job ${jobId} completed, NLP job enqueued`);
      
    } catch (error) {
      status.status = 'failed';
      status.completedAt = new Date();
      status.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JobQueue] Weekly scrape job ${jobId} failed:`, error);
    }
  });
  
  return jobId;
}

export async function enqueueWeeklyNlpJob(input: OpenAIInput, scraperOutput: WeeklyScraperOutput): Promise<string> {
  const jobId = generateJobId();
  
  const status: JobStatus = {
    id: jobId,
    type: 'weekly-nlp',
    status: 'pending',
    sourceId: input.sourceId,
    signSlugIt: input.signSlugIt,
    dateISO: input.dateISO,
  };
  
  jobStatusMap.set(jobId, status);
  
  nlpQueue.add(async () => {
    try {
      status.status = 'running';
      status.startedAt = new Date();
      
      console.log(`[JobQueue] Starting weekly NLP job ${jobId}`);
      const nlpResult = await openaiWorker.process(input);
      
      await enqueueWeeklyUpsertJob(scraperOutput, nlpResult);
      
      status.status = 'completed';
      status.completedAt = new Date();
      console.log(`[JobQueue] Weekly NLP job ${jobId} completed, upsert job enqueued`);
      
    } catch (error) {
      status.status = 'failed';
      status.completedAt = new Date();
      status.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JobQueue] Weekly NLP job ${jobId} failed:`, error);
    }
  });
  
  return jobId;
}

export async function enqueueWeeklyUpsertJob(scraperOutput: WeeklyScraperOutput, nlpOutput: OpenAIOutput): Promise<string> {
  const jobId = generateJobId();
  
  const status: JobStatus = {
    id: jobId,
    type: 'weekly-upsert',
    status: 'pending',
    sourceId: scraperOutput.sourceId,
    signSlugIt: scraperOutput.signSlugIt,
    dateISO: scraperOutput.weekStartDate,
  };
  
  jobStatusMap.set(jobId, status);
  
  setTimeout(async () => {
    try {
      status.status = 'running';
      status.startedAt = new Date();
      
      console.log(`[JobQueue] Starting weekly upsert job ${jobId}`);
      
      const zodiacSign = await prisma.zodiacSign.findFirst({
        where: { name_italian: scraperOutput.signSlugIt }
      });
      
      if (!zodiacSign) {
        throw new Error(`Zodiac sign not found: ${scraperOutput.signSlugIt}`);
      }
      
      console.log(`[JobQueue] Upserting weekly data for ${zodiacSign.name_italian} (ID: ${zodiacSign.id}) from source ${scraperOutput.sourceId}`);
      
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
          superquote: nlpOutput.superquote,
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
          superquote: nlpOutput.superquote,
          summary: nlpOutput.summary,
          relazioni_rating: nlpOutput.ratings.relazioni,
          lavoro_rating: nlpOutput.ratings.lavoro,
          salute_rating: nlpOutput.ratings.benessere,
          tone_analysis: nlpOutput.tone,
          original_url: scraperOutput.original_url,
          scraped_at: scraperOutput.scraped_at,
        },
      });
      
      console.log(`[JobQueue] Successfully upserted weekly horoscope data with ID: ${upsertResult.id}`);
      
      status.status = 'completed';
      status.completedAt = new Date();
      console.log(`[JobQueue] Weekly upsert job ${jobId} completed`);
      
    } catch (error) {
      status.status = 'failed';
      status.completedAt = new Date();
      status.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JobQueue] Weekly upsert job ${jobId} failed:`, error);
    }
  }, 100);
  
  return jobId;
}

// Cleanup old job statuses (older than 1 hour)
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [jobId, status] of Array.from(jobStatusMap.entries())) {
    if (status.completedAt && status.completedAt.getTime() < oneHourAgo) {
      jobStatusMap.delete(jobId);
    }
  }
}, 10 * 60 * 1000); // Run every 10 minutes
