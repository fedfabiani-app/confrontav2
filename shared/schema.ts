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

// Horoscope Data Schema
export const horoscopeDataSchema = z.object({
  id: z.number(),
  source_id: z.number(),
  zodiac_sign_id: z.number(),
  date: z.string(), // DATE format YYYY-MM-DD
  original_text: z.string(),
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

export const openaiInputSchema = z.object({
  sourceId: z.number(),
  sourceName: z.string(),
  signSlugIt: z.string(),
  dateISO: z.string(),
  extracted_text: z.string(),
});

export const openaiOutputSchema = z.object({
  summary: z.string(),
  ratings: z.object({
    relazioni: z.number().min(0).max(5),
    lavoro: z.number().min(0).max(5),
    benessere: z.number().min(0).max(5),
  }),
  tone: z.enum(['positive', 'neutral', 'negative']),
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

// Weekly Horoscope Data Schema
export const weeklyHoroscopeDataSchema = z.object({
  id: z.number(),
  source_id: z.number(),
  zodiac_sign_id: z.number(),
  week_start_date: z.string(), // DATE format YYYY-MM-DD
  original_text: z.string(),
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
  summary: z.string().max(580),
  relazioni_rating: z.number().min(0).max(5),
  lavoro_rating: z.number().min(0).max(5),
  salute_rating: z.number().min(0).max(5),
  tone_analysis: z.enum(['positive', 'neutral', 'negative']),
  original_url: z.string(),
  scraped_at: z.date(),
});

// Weekly Scraper Input Schema
export const weeklyScraperInputSchema = z.object({
  sourceId: z.number(),
  sourceName: z.string(),
  domain: z.string(),
  baseUrl: z.string(),
  urlPattern: z.string(),
  signSlugIt: z.string(),
  weekStartDate: z.string(), // ISO date for Monday of the week
  weekEndDate: z.string(), // ISO date for Sunday of the week
  userAgent: z.string(),
});

// Type exports
export type ZodiacSign = z.infer<typeof zodiacSignSchema>;
export type InsertZodiacSign = z.infer<typeof insertZodiacSignSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type InsertSource = z.infer<typeof insertSourceSchema>;
export type User = z.infer<typeof userSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type HoroscopeData = z.infer<typeof horoscopeDataSchema>;
export type InsertHoroscopeData = z.infer<typeof insertHoroscopeDataSchema>;
export type HoroscopeAggregate = z.infer<typeof horoscopeAggregateSchema>;
export type RefreshStatus = z.infer<typeof refreshStatusSchema>;
export type ScraperInput = z.infer<typeof scraperInputSchema>;
export type ScraperOutput = z.infer<typeof scraperOutputSchema>;
export type OpenAIInput = z.infer<typeof openaiInputSchema>;
export type OpenAIOutput = z.infer<typeof openaiOutputSchema>;

export type WeeklySource = z.infer<typeof weeklySourceSchema>;
export type InsertWeeklySource = z.infer<typeof insertWeeklySourceSchema>;
export type WeeklyHoroscopeData = z.infer<typeof weeklyHoroscopeDataSchema>;
export type InsertWeeklyHoroscopeData = z.infer<typeof insertWeeklyHoroscopeDataSchema>;
export type WeeklyScraperInput = z.infer<typeof weeklyScraperInputSchema>;
