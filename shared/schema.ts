import { z } from "zod";

// Zodiac Signs Schema
export const zodiacSignSchema = z.object({
  id: z.number(),
  name_italian: z.string(),
  name_english: z.string(),
  date_range: z.string(),
  symbol: z.string(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const insertZodiacSignSchema = z.object({
  name_italian: z.string(),
  name_english: z.string(),
  date_range: z.string(),
  symbol: z.string(),
});

// Sources Schema
export const sourceSchema = z.object({
  id: z.number(),
  name: z.string(),
  domain: z.string(),
  logo_url: z.string().nullable(),
  base_url: z.string(),
  url_pattern: z.string(),
  reliability_score: z.number(),
  is_active: z.boolean(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const insertSourceSchema = z.object({
  name: z.string(),
  domain: z.string(),
  logo_url: z.string().optional(),
  base_url: z.string(),
  url_pattern: z.string(),
  reliability_score: z.number().min(0).max(5),
  is_active: z.boolean().default(true),
});

// Weekly Sources Schema
export const weeklySourceSchema = z.object({
  id: z.number(),
  name: z.string(),
  domain: z.string(),
  logo_url: z.string().nullable(),
  base_url: z.string(),
  url_pattern: z.string(),
  reliability_score: z.number(),
  is_active: z.boolean(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const insertWeeklySourceSchema = z.object({
  name: z.string(),
  domain: z.string(),
  logo_url: z.string().optional(),
  base_url: z.string(),
  url_pattern: z.string(),
  reliability_score: z.number().min(0).max(5),
  is_active: z.boolean().default(true),
});

// Users Schema
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  last_signed_in_at: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const insertUserSchema = z.object({
  email: z.string().email(),
});

// User Preferences Schema
export const userPreferencesSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  favorite_signs: z.array(z.string()),
  notifications_enabled: z.boolean(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const insertUserPreferencesSchema = z.object({
  user_id: z.number(),
  favorite_signs: z.array(z.string()).default([]),
  notifications_enabled: z.boolean().default(true),
});

// Horoscope Data Schema
export const horoscopeDataSchema = z.object({
  id: z.number(),
  source_id: z.number(),
  zodiac_sign_id: z.number(),
  date: z.string(), // DATE format YYYY-MM-DD
  original_text: z.string(),
  superquote: z.string().nullable(),
  summary: z.string(),
  relazioni_rating: z.number().min(0).max(5),
  lavoro_rating: z.number().min(0).max(5),
  salute_rating: z.number().min(0).max(5),
  tone_analysis: z.enum(['positive', 'neutral', 'negative']),
  original_url: z.string(),
  scraped_at: z.date(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const insertHoroscopeDataSchema = z.object({
  source_id: z.number(),
  zodiac_sign_id: z.number(),
  date: z.string(),
  original_text: z.string(),
  superquote: z.string().max(80).optional(),
  summary: z.string().max(580),
  relazioni_rating: z.number().min(0).max(5),
  lavoro_rating: z.number().min(0).max(5),
  salute_rating: z.number().min(0).max(5),
  tone_analysis: z.enum(['positive', 'neutral', 'negative']),
  original_url: z.string(),
  scraped_at: z.date(),
});

// Weekly Horoscope Data Schema
export const weeklyHoroscopeDataSchema = z.object({
  id: z.number(),
  source_id: z.number(),
  zodiac_sign_id: z.number(),
  week_start_date: z.string(), // DATE format YYYY-MM-DD (Monday)
  original_text: z.string(),
  superquote: z.string().nullable(),
  summary: z.string(),
  relazioni_rating: z.number().min(0).max(5),
  lavoro_rating: z.number().min(0).max(5),
  salute_rating: z.number().min(0).max(5),
  tone_analysis: z.enum(['positive', 'neutral', 'negative']),
  original_url: z.string(),
  scraped_at: z.date(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const insertWeeklyHoroscopeDataSchema = z.object({
  source_id: z.number(),
  zodiac_sign_id: z.number(),
  week_start_date: z.string(),
  original_text: z.string(),
  superquote: z.string().max(80).optional(),
  summary: z.string().max(580),
  relazioni_rating: z.number().min(0).max(5),
  lavoro_rating: z.number().min(0).max(5),
  salute_rating: z.number().min(0).max(5),
  tone_analysis: z.enum(['positive', 'neutral', 'negative']),
  original_url: z.string(),
  scraped_at: z.date(),
});

// API Response Types
export const horoscopeAggregateSchema = z.object({
  avgRelazioni: z.number().nullable(),
  avgLavoro: z.number().nullable(),
  avgBenessere: z.number().nullable(),
  overallAverage: z.number().nullable(),
  majorityTone: z.enum(['positive', 'neutral', 'negative']).optional(),
});

export const refreshStatusSchema = z.object({
  total: z.number(),
  completed: z.number(),
  failed: z.number(),
  errors: z.array(z.string()),
});

// Worker Input/Output Types
export const scraperInputSchema = z.object({
  sourceId: z.number(),
  sourceName: z.string(),
  domain: z.string(),
  baseUrl: z.string(),
  urlPattern: z.string(),
  signSlugIt: z.string(),
  dateISO: z.string(),
  weekdayItNoAccent: z.string(),
  gazzettaDatePath: z.string(),
  userAgent: z.string(),
});

export const scraperOutputSchema = z.object({
  sourceId: z.number(),
  signSlugIt: z.string(),
  dateISO: z.string(),
  original_url: z.string(),
  scraped_at: z.date(),
  extracted_text: z.string(),
});

// Weekly Scraper Input/Output Types
export const weeklyScraperInputSchema = z.object({
  sourceId: z.number(),
  sourceName: z.string(),
  domain: z.string(),
  baseUrl: z.string(),
  urlPattern: z.string(),
  scrapeStrategy: z.string().default('pattern'), // 'pattern' or 'archive'
  signSlugIt: z.string(),
  weekStartDate: z.string(), // ISO format (Monday)
  startDay: z.string(),
  endDay: z.string(),
  month: z.string(),
  year: z.string(),
  userAgent: z.string(),
});

export const weeklyScraperOutputSchema = z.object({
  sourceId: z.number(),
  signSlugIt: z.string(),
  weekStartDate: z.string(),
  original_url: z.string(),
  scraped_at: z.date(),
  extracted_text: z.string(),
});

export const openaiInputSchema = z.object({
  sourceId: z.number(),
  sourceName: z.string(),
  signSlugIt: z.string(),
  dateISO: z.string(),
  extracted_text: z.string(),
});

export const openaiOutputSchema = z.object({
  superquote: z.string(),
  summary: z.string(),
  ratings: z.object({
    relazioni: z.number().min(0).max(5),
    lavoro: z.number().min(0).max(5),
    benessere: z.number().min(0).max(5),
  }),
  tone: z.enum(['positive', 'neutral', 'negative']),
});

// Scraper Execution Schema
export const scraperExecutionSchema = z.object({
  id: z.number(),
  started_at: z.date(),
  completed_at: z.date().nullable(),
  status: z.enum(['running', 'completed', 'failed', 'cancelled']),
  target_date: z.string(), // DATE format YYYY-MM-DD
  total_jobs_enqueued: z.number(),
  successful_jobs: z.number(),
  failed_jobs: z.number(),
  retry_cycle_count: z.number(),
  trigger_type: z.enum(['scheduled', 'manual']),
  error_message: z.string().nullable(),
});

export const insertScraperExecutionSchema = z.object({
  target_date: z.string(),
  trigger_type: z.enum(['scheduled', 'manual']),
  status: z.enum(['running', 'completed', 'failed', 'cancelled']).default('running'),
});

// Scraper Source Status Schema
export const scraperSourceStatusSchema = z.object({
  id: z.number(),
  execution_id: z.number(),
  source_id: z.number(),
  zodiac_sign_id: z.number(),
  target_date: z.string(), // DATE format YYYY-MM-DD
  status: z.enum(['pending', 'processing', 'success', 'failed', 'skipped']),
  attempt_count: z.number(),
  last_attempted_at: z.date().nullable(),
  completed_at: z.date().nullable(),
  error_message: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const insertScraperSourceStatusSchema = z.object({
  execution_id: z.number(),
  source_id: z.number(),
  zodiac_sign_id: z.number(),
  target_date: z.string(),
  status: z.enum(['pending', 'processing', 'success', 'failed', 'skipped']).default('pending'),
  attempt_count: z.number().default(0),
  error_message: z.string().optional(),
});

// Scraper Config Schema
export const scraperConfigSchema = z.object({
  id: z.number(),
  enabled: z.boolean(),
  start_time: z.string(), // TIME format HH:MM:SS
  end_time: z.string(),
  interval_minutes: z.number(),
  max_retries_per_source: z.number(),
  auto_retry_delay_minutes: z.number(),
  skip_already_processed: z.boolean(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const updateScraperConfigSchema = z.object({
  enabled: z.boolean().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  interval_minutes: z.number().min(1).max(60).optional(),
  max_retries_per_source: z.number().min(0).max(10).optional(),
  auto_retry_delay_minutes: z.number().min(1).max(60).optional(),
  skip_already_processed: z.boolean().optional(),
});

// Type exports
export type ZodiacSign = z.infer<typeof zodiacSignSchema>;
export type InsertZodiacSign = z.infer<typeof insertZodiacSignSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type InsertSource = z.infer<typeof insertSourceSchema>;
export type WeeklySource = z.infer<typeof weeklySourceSchema>;
export type InsertWeeklySource = z.infer<typeof insertWeeklySourceSchema>;
export type User = z.infer<typeof userSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type HoroscopeData = z.infer<typeof horoscopeDataSchema>;
export type InsertHoroscopeData = z.infer<typeof insertHoroscopeDataSchema>;
export type WeeklyHoroscopeData = z.infer<typeof weeklyHoroscopeDataSchema>;
export type InsertWeeklyHoroscopeData = z.infer<typeof insertWeeklyHoroscopeDataSchema>;
export type HoroscopeAggregate = z.infer<typeof horoscopeAggregateSchema>;
export type RefreshStatus = z.infer<typeof refreshStatusSchema>;
export type ScraperInput = z.infer<typeof scraperInputSchema>;
export type ScraperOutput = z.infer<typeof scraperOutputSchema>;
export type WeeklyScraperInput = z.infer<typeof weeklyScraperInputSchema>;
export type WeeklyScraperOutput = z.infer<typeof weeklyScraperOutputSchema>;
export type OpenAIInput = z.infer<typeof openaiInputSchema>;
export type OpenAIOutput = z.infer<typeof openaiOutputSchema>;
export type ScraperExecution = z.infer<typeof scraperExecutionSchema>;
export type InsertScraperExecution = z.infer<typeof insertScraperExecutionSchema>;
export type ScraperSourceStatus = z.infer<typeof scraperSourceStatusSchema>;
export type InsertScraperSourceStatus = z.infer<typeof insertScraperSourceStatusSchema>;
export type ScraperConfig = z.infer<typeof scraperConfigSchema>;
export type UpdateScraperConfig = z.infer<typeof updateScraperConfigSchema>;
