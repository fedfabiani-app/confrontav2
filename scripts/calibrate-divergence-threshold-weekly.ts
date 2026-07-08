/**
 * CALIBRAZIONE SOGLIA DIVERGENZA (WEEKLY) — Campo 4 "Le stelle dicono"
 * =====================================================================
 *
 * ATTENZIONE — questo script è un CHECK DI SANITÀ, non una calibrazione
 * definitiva: nel DB reale ci sono solo ~4 settimane piene di dati weekly
 * (contro i 30 giorni usati per calibrare la soglia daily in
 * scripts/calibrate-divergence-threshold.ts). Troppo poco per fissare
 * statisticamente una soglia weekly-specifica — usalo solo per vedere in
 * che direzione punta la distribuzione reale rispetto allo 0.95 ereditato
 * dal daily (DIVERGENCE_STDDEV_THRESHOLD in server/services/claude.ts),
 * non per sostituirlo. Riesegui quando ci sarà più storico accumulato.
 *
 * Differenze rispetto allo script daily:
 *   - Sorgente dati: WeeklyHoroscopeData (weekly_horoscope_data) invece
 *     di HoroscopeData, raggruppata per week_start_date invece di date.
 *   - Relazione fonte: weekly_source (WeeklySource) invece di source.
 *   - Gestione ELLE (is_biweekly=true): il suo week_start_date reale è
 *     valid_from, spesso non un lunedì, e valid_from/valid_to possono
 *     sovrapporsi a più settimane "regolari" consecutive. Stesso pattern
 *     già in uso in server/routes.ts (fetchWeeklyHoroscopes): per ogni
 *     settimana regolare si prendono le fonti non-biweekly con
 *     week_start_date esatto, più le fonti biweekly il cui intervallo
 *     valid_from/valid_to si sovrappone a quella settimana, deduplicate
 *     per (zodiac_sign_id, source_id) — così ELLE non viene mai contata
 *     due volte su settimane adiacenti.
 *   - Nessuna finestra "ultimi N giorni": con così pochi dati si prendono
 *     tutte le settimane "regolari" (is_biweekly=false) presenti nel DB.
 *
 * USO (NON eseguire finché non richiesto esplicitamente):
 *   npx tsx scripts/calibrate-divergence-threshold-weekly.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── CONFIGURAZIONE ──────────────────────────────────────────────
const CANDIDATE_THRESHOLDS = [0.6, 0.7, 0.8, 0.9, 0.95, 1.0];
const DIMENSIONS = ['relazioni', 'lavoro', 'salute'] as const; // "salute" = nome DB di "Benessere"
const MIN_VALID_SOURCES = 3; // sotto questa soglia, spread forzato a BASSO (stessa regola del daily)

type Dimension = (typeof DIMENSIONS)[number];

interface RawRatingRow {
  zodiac_sign_id: number;
  week_start_date: string; // YYYY-MM-DD, sempre il lunedì "regolare" della settimana analizzata
  source_id: number;
  source_name: string;
  relazioni_rating: number;
  lavoro_rating: number;
  salute_rating: number;
}

interface WeekDimensionStats {
  zodiac_sign_id: number;
  week_start_date: string;
  dimension: Dimension;
  validSourceCount: number;
  mean: number;
  stddev: number;
  sourceRatings: { source_name: string; value: number }[];
}

// ── STEP 1: FETCH DATI GREZZI (con gestione overlap ELLE) ───────
async function getRegularWeekStarts(): Promise<Date[]> {
  const rows = await prisma.weeklyHoroscopeData.findMany({
    where: { weekly_source: { is_biweekly: false } },
    select: { week_start_date: true },
    distinct: ['week_start_date'],
    orderBy: { week_start_date: 'asc' },
  });
  return rows.map(r => r.week_start_date);
}

async function getRawRatingsForWeek(weekStart: Date): Promise<RawRatingRow[]> {
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const selectFields = {
    zodiac_sign_id: true,
    source_id: true,
    weekly_source: { select: { name: true } },
    relazioni_rating: true,
    lavoro_rating: true,
    salute_rating: true,
  } as const;

  const [regular, biweekly] = await Promise.all([
    prisma.weeklyHoroscopeData.findMany({
      where: {
        week_start_date: weekStart,
        weekly_source: { is_biweekly: false },
      },
      select: selectFields,
    }),
    prisma.weeklyHoroscopeData.findMany({
      where: {
        valid_from: { lte: weekEnd },
        valid_to: { gte: weekStart },
        weekly_source: { is_biweekly: true },
      },
      select: selectFields,
    }),
  ]);

  // Dedup per (zodiac_sign_id, source_id): una fonte biweekly il cui
  // intervallo copre più settimane regolari non va contata due volte.
  const seen = new Set<string>();
  const merged = [...regular, ...biweekly].filter(r => {
    const key = `${r.zodiac_sign_id}|${r.source_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return merged.map(r => ({
    zodiac_sign_id: r.zodiac_sign_id,
    week_start_date: weekStartStr,
    source_id: r.source_id,
    source_name: r.weekly_source.name,
    relazioni_rating: r.relazioni_rating,
    lavoro_rating: r.lavoro_rating,
    salute_rating: r.salute_rating,
  }));
}

// ── STEP 2: STATISTICHE (identiche al daily) ────────────────────
function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeStats(rows: RawRatingRow[]): WeekDimensionStats[] {
  const fieldByDimension: Record<Dimension, keyof RawRatingRow> = {
    relazioni: 'relazioni_rating',
    lavoro: 'lavoro_rating',
    salute: 'salute_rating',
  };

  const grouped = new Map<string, RawRatingRow[]>();

  for (const row of rows) {
    const key = `${row.zodiac_sign_id}|${row.week_start_date}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  const results: WeekDimensionStats[] = [];

  for (const [key, sourceRows] of grouped) {
    const [signIdStr, week_start_date] = key.split('|');
    const zodiac_sign_id = Number(signIdStr);

    for (const dimension of DIMENSIONS) {
      const field = fieldByDimension[dimension];

      // Esclude rating mancanti/0 (ambito non menzionato, non comparabile)
      const validRatings = sourceRows
        .map(r => ({ source_name: r.source_name, value: r[field] as number }))
        .filter(r => r.value != null && r.value > 0);

      if (validRatings.length === 0) continue;

      const values = validRatings.map(r => r.value);

      results.push({
        zodiac_sign_id,
        week_start_date,
        dimension,
        validSourceCount: validRatings.length,
        mean: Number(mean(values).toFixed(2)),
        stddev: Number(stddev(values).toFixed(3)),
        sourceRatings: validRatings,
      });
    }
  }

  return results;
}

// ── STEP 3: REPORT DI CALIBRAZIONE ──────────────────────────────
function printCalibrationReport(stats: WeekDimensionStats[], weeksAnalyzed: number) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('CALIBRAZIONE SOGLIA DIVERGENZA (WEEKLY) — CHECK DI SANITÀ');
  console.log('='.repeat(60));
  console.log(`⚠️  Solo ${weeksAnalyzed} settimane di dati reali — troppo poco per`);
  console.log('    fissare una soglia statisticamente affidabile. Usare solo come');
  console.log('    indicazione di direzione rispetto allo 0.95 ereditato dal daily.');
  console.log(`Combinazioni segno×settimana×dimensione totali: ${stats.length}`);

  const eligible = stats.filter(s => s.validSourceCount >= MIN_VALID_SOURCES);
  const excluded = stats.length - eligible.length;
  console.log(
    `Esclusi per fonti insufficienti (< ${MIN_VALID_SOURCES}): ${excluded}`
  );
  console.log(`Combinazioni eleggibili per il check: ${eligible.length}\n`);

  if (eligible.length === 0) {
    console.log('Nessuna combinazione eleggibile — impossibile produrre un report.');
    return;
  }

  console.log('── % classificate come ALTO per soglia candidata ──\n');
  console.log('Soglia | % ALTO (overall) | Relazioni | Lavoro | Salute (Benessere)');
  console.log('-'.repeat(70));

  for (const threshold of CANDIDATE_THRESHOLDS) {
    const overallHigh = eligible.filter(s => s.stddev >= threshold).length;
    const overallPct = ((overallHigh / eligible.length) * 100).toFixed(1);

    const perDimension = DIMENSIONS.map(dim => {
      const dimStats = eligible.filter(s => s.dimension === dim);
      const dimHigh = dimStats.filter(s => s.stddev >= threshold).length;
      return dimStats.length > 0
        ? ((dimHigh / dimStats.length) * 100).toFixed(1)
        : 'n/a';
    });

    const flag =
      Number(overallPct) >= 20 && Number(overallPct) <= 35 ? '  ← target range' : '';
    const isInherited = threshold === 0.95 ? '  [soglia daily ereditata]' : '';

    console.log(
      `${threshold.toFixed(2)}   | ${overallPct.padStart(15)}% | ` +
        `${perDimension[0].padStart(8)}% | ${perDimension[1].padStart(6)}% | ` +
        `${perDimension[2].padStart(17)}%${flag}${isInherited}`
    );
  }

  const allStddevs = eligible.map(s => s.stddev).sort((a, b) => a - b);
  const median = allStddevs[Math.floor(allStddevs.length / 2)];
  const p75 = allStddevs[Math.floor(allStddevs.length * 0.75)];
  const p90 = allStddevs[Math.floor(allStddevs.length * 0.9)];

  console.log('\n── Distribuzione stddev osservata ──');
  console.log(`Mediana: ${median?.toFixed(3)}`);
  console.log(`75° percentile: ${p75?.toFixed(3)}`);
  console.log(`90° percentile: ${p90?.toFixed(3)}`);

  const topDivergent = [...eligible]
    .sort((a, b) => b.stddev - a.stddev)
    .slice(0, 5);

  console.log('\n── Top 5 casi più divergenti (per verifica manuale) ──');
  for (const s of topDivergent) {
    const ratingsStr = s.sourceRatings
      .map(r => `${r.source_name}:${r.value}`)
      .join(', ');
    console.log(
      `sign_id=${s.zodiac_sign_id} | settimana ${s.week_start_date} | ${s.dimension} | stddev=${s.stddev} | ` +
        `media=${s.mean} | [${ratingsStr}]`
    );
  }

  const topConsensus = [...eligible]
    .sort((a, b) => a.stddev - b.stddev)
    .slice(0, 3);

  console.log('\n── Top 3 casi più concordi (per riferimento) ──');
  for (const s of topConsensus) {
    const ratingsStr = s.sourceRatings
      .map(r => `${r.source_name}:${r.value}`)
      .join(', ');
    console.log(
      `sign_id=${s.zodiac_sign_id} | settimana ${s.week_start_date} | ${s.dimension} | stddev=${s.stddev} | ` +
        `media=${s.mean} | [${ratingsStr}]`
    );
  }

  console.log(`\n${'='.repeat(60)}\n`);
}

// ── MAIN ─────────────────────────────────────────────────────────
async function main() {
  console.log('Recupero settimane regolari disponibili...');
  const weekStarts = await getRegularWeekStarts();
  console.log(`Trovate ${weekStarts.length} settimane: ${weekStarts.map(d => d.toISOString().slice(0, 10)).join(', ')}`);

  const allRawRatings: RawRatingRow[] = [];
  for (const weekStart of weekStarts) {
    const rows = await getRawRatingsForWeek(weekStart);
    allRawRatings.push(...rows);
  }

  console.log(`Trovate ${allRawRatings.length} righe fonte/segno/settimana (ELLE inclusa via overlap, deduplicata).`);

  const stats = computeStats(allRawRatings);
  printCalibrationReport(stats, weekStarts.length);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
