import { prisma } from './database';
import { enqueueAggregatedNlpJob, enqueueAggregatedWeeklyNlpJob } from '../jobs';
import { OpenAIInput, ScraperOutput, WeeklyScraperOutput } from '@shared/schema';

// Soglia minima di fonti per generare una sintesi comparativa sensata.
// Con 0-1 fonte non c'è nulla da confrontare; con 2 il consenso/approfondimento
// è già un vero confronto (solo ha_divergenza resterà sempre false, perché
// MIN_VALID_SOURCES_FOR_SPREAD in claude.ts richiede >=3 fonti valide).
const MIN_SOURCES_FOR_SYNTHESIS = 2;

export interface SynthesisCycleStats {
  totalSigns: number;
  processedSigns: number;
  skippedSigns: number;
  totalPairs: number;
}

// ============================================================================
// DAILY
// ============================================================================
export async function runDailyComparativeSynthesisCycle(
  targetDate: string // 'YYYY-MM-DD', da getItalyToday()
): Promise<SynthesisCycleStats> {
  const targetDateObj = new Date(targetDate + 'T00:00:00.000Z');

  const rows = await prisma.horoscopeData.findMany({
    where: { date: targetDateObj, summary: { not: '' } },
    include: { source: true, zodiac_sign: true },
  });

  const byZodiacSign = new Map<number, typeof rows>();
  for (const row of rows) {
    const list = byZodiacSign.get(row.zodiac_sign_id) ?? [];
    list.push(row);
    byZodiacSign.set(row.zodiac_sign_id, list);
  }

  const allSigns = await prisma.zodiacSign.findMany({ select: { id: true } });

  let processedSigns = 0;
  let skippedSigns = 0;
  let totalPairs = 0;

  for (const sign of allSigns) {
    const signRows = byZodiacSign.get(sign.id) ?? [];
    if (signRows.length < MIN_SOURCES_FOR_SYNTHESIS) {
      skippedSigns++;
      continue;
    }

    const pairs: Array<{ nlpInput: OpenAIInput; scraperOutput: ScraperOutput }> = signRows.map(row => ({
      nlpInput: {
        sourceId: row.source_id,
        sourceName: row.source.name,
        signSlugIt: row.zodiac_sign.name_italian,
        dateISO: targetDate,
        extracted_text: row.original_text,
      },
      scraperOutput: {
        sourceId: row.source_id,
        signSlugIt: row.zodiac_sign.name_italian,
        dateISO: targetDate,
        original_url: row.original_url,
        scraped_at: row.scraped_at,
        extracted_text: row.original_text,
      },
    }));

    await enqueueAggregatedNlpJob(pairs);
    processedSigns++;
    totalPairs += pairs.length;
  }

  return { totalSigns: allSigns.length, processedSigns, skippedSigns, totalPairs };
}

// ============================================================================
// WEEKLY
// ============================================================================
export async function runWeeklyComparativeSynthesisCycle(
  weekStart: Date // getCurrentWeekStart(), lunedì 00:00 Rome
): Promise<SynthesisCycleStats> {
  const weekStartISO = weekStart.toISOString().split('T')[0];
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

  // Stesso pattern di fetchWeeklyHoroscopes (server/routes.ts): le fonti normali
  // sono chiavate su week_start_date esatto, le fonti is_biweekly su un range
  // valid_from/valid_to che può non coincidere col lunedì corrente.
  const [regular, biweekly] = await Promise.all([
    prisma.weeklyHoroscopeData.findMany({
      where: {
        week_start_date: weekStart,
        summary: { not: '' },
        weekly_source: { is_biweekly: false },
      },
      include: { weekly_source: true, zodiac_sign: true },
    }),
    prisma.weeklyHoroscopeData.findMany({
      where: {
        valid_from: { lte: weekEnd },
        valid_to: { gte: weekStart },
        summary: { not: '' },
        weekly_source: { is_biweekly: true },
      },
      include: { weekly_source: true, zodiac_sign: true },
    }),
  ]);

  const rows = [...regular, ...biweekly];

  const byZodiacSign = new Map<number, typeof rows>();
  for (const row of rows) {
    const list = byZodiacSign.get(row.zodiac_sign_id) ?? [];
    list.push(row);
    byZodiacSign.set(row.zodiac_sign_id, list);
  }

  const allSigns = await prisma.zodiacSign.findMany({ select: { id: true } });

  let processedSigns = 0;
  let skippedSigns = 0;
  let totalPairs = 0;

  for (const sign of allSigns) {
    const signRows = byZodiacSign.get(sign.id) ?? [];
    if (signRows.length < MIN_SOURCES_FOR_SYNTHESIS) {
      skippedSigns++;
      continue;
    }

    const pairs: Array<{ nlpInput: OpenAIInput; scraperOutput: WeeklyScraperOutput }> = signRows.map(row => ({
      nlpInput: {
        sourceId: row.source_id,
        sourceName: row.weekly_source.name,
        signSlugIt: row.zodiac_sign.name_italian,
        dateISO: weekStartISO, // sempre il lunedì canonico: processMultiSourceHoroscopeWithRetry
                                // usa inputs[0].dateISO come week_start_date canonico del batch
        extracted_text: row.original_text,
      },
      scraperOutput: {
        sourceId: row.source_id,
        signSlugIt: row.zodiac_sign.name_italian,
        weekStartDate: weekStartISO,
        original_url: row.original_url,
        scraped_at: row.scraped_at,
        extracted_text: row.original_text,
        // Propagati dalla riga DB: enqueueWeeklyUpsertJob li usa per calcolare
        // la vera chiave di upsert delle fonti biweekly (valid_from, non il lunedì).
        validFrom: row.valid_from ? row.valid_from.toISOString().split('T')[0] : undefined,
        validTo: row.valid_to ? row.valid_to.toISOString().split('T')[0] : undefined,
      },
    }));

    await enqueueAggregatedWeeklyNlpJob(pairs);
    processedSigns++;
    totalPairs += pairs.length;
  }

  return { totalSigns: allSigns.length, processedSigns, skippedSigns, totalPairs };
}
