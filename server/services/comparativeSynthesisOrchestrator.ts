import { prisma } from './database';
import { enqueueComparativeSynthesisJob } from '../jobs';
import { OpenAIInput, OpenAIOutput, openaiOutputSchema } from '@shared/schema';

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

    // Campo 1-3 sono già stati calcolati stamattina dal path di scraping
    // individuale e sono già in DB (righe filtrate da summary != ''): li
    // riusiamo direttamente, nessuna chiamata Claude di ri-estrazione.
    const inputs: OpenAIInput[] = signRows.map(row => ({
      sourceId: row.source_id,
      sourceName: row.source.name,
      signSlugIt: row.zodiac_sign.name_italian,
      dateISO: targetDate,
      extracted_text: row.original_text, // non usato da generateAndSaveComparativeSynthesis, mantenuto per compatibilità di tipo
    }));

    const results: OpenAIOutput[] = signRows.map(row =>
      openaiOutputSchema.parse({
        superquote: row.superquote ?? '',
        summary: row.summary,
        ratings: {
          relazioni: Math.max(0, Math.min(5, row.relazioni_rating)),
          lavoro: Math.max(0, Math.min(5, row.lavoro_rating)),
          benessere: Math.max(0, Math.min(5, row.salute_rating)),
        },
        tone: (['positive', 'neutral', 'negative'] as const).includes(row.tone_analysis as any)
          ? row.tone_analysis
          : 'neutral',
      })
    );

    await enqueueComparativeSynthesisJob(inputs, results, 'daily');
    processedSigns++;
    totalPairs += signRows.length;
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

    const inputs: OpenAIInput[] = signRows.map(row => ({
      sourceId: row.source_id,
      sourceName: row.weekly_source.name,
      signSlugIt: row.zodiac_sign.name_italian,
      dateISO: weekStartISO, // sempre il lunedì canonico: generateAndSaveComparativeSynthesis
                              // usa inputs[0].dateISO come week_start_date canonico del batch
      extracted_text: row.original_text, // non usato in questo path
    }));

    const results: OpenAIOutput[] = signRows.map(row =>
      openaiOutputSchema.parse({
        superquote: row.superquote ?? '',
        summary: row.summary,
        ratings: {
          relazioni: Math.max(0, Math.min(5, row.relazioni_rating)),
          lavoro: Math.max(0, Math.min(5, row.lavoro_rating)),
          benessere: Math.max(0, Math.min(5, row.salute_rating)),
        },
        tone: (['positive', 'neutral', 'negative'] as const).includes(row.tone_analysis as any)
          ? row.tone_analysis
          : 'neutral',
      })
    );

    await enqueueComparativeSynthesisJob(inputs, results, 'weekly');
    processedSigns++;
    totalPairs += signRows.length;
  }

  return { totalSigns: allSigns.length, processedSigns, skippedSigns, totalPairs };
}
