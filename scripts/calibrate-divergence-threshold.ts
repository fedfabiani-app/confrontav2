/**
 * CALIBRAZIONE SOGLIA DIVERGENZA — Campo 4 "Le stelle dicono"
 * ============================================================
 *
 * Adattato secondo ricognizione contro lo schema reale:
 *   - Modello Prisma: HoroscopeData (@@map("horoscope_data"))
 *   - source_id è raggiungibile via relazione Prisma `source` verso
 *     il modello Source, campo `name` leggibile.
 *   - ELLE non confluisce in horoscope_data (è esclusivamente in
 *     WeeklySource/weekly_horoscope_data, is_biweekly): nessuna
 *     esclusione necessaria qui.
 *   - Rating 0 esiste in pratica (verificato su dati reali) ed è
 *     escluso dal calcolo di media/stddev come "ambito non menzionato".
 *
 * USO:
 *   npx tsx scripts/calibrate-divergence-threshold.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── CONFIGURAZIONE ──────────────────────────────────────────────
const DAYS_BACK = 30;
const CANDIDATE_THRESHOLDS = [0.6, 0.7, 0.8, 0.9, 1.0];
const DIMENSIONS = ['relazioni', 'lavoro', 'salute'] as const; // "salute" = nome DB di "Benessere"
const MIN_VALID_SOURCES = 3; // sotto questa soglia, spread forzato a BASSO

type Dimension = (typeof DIMENSIONS)[number];

interface RawRatingRow {
  zodiac_sign_id: number;
  date: string; // YYYY-MM-DD
  source_id: number;
  source_name: string;
  relazioni_rating: number;
  lavoro_rating: number;
  salute_rating: number;
}

interface DayDimensionStats {
  zodiac_sign_id: number;
  date: string;
  dimension: Dimension;
  validSourceCount: number;
  mean: number;
  stddev: number;
  sourceRatings: { source_name: string; value: number }[];
}

// ── STEP 1: FETCH DATI GREZZI ───────────────────────────────────
async function getRawRatings(): Promise<RawRatingRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - DAYS_BACK);

  const rows = await prisma.horoscopeData.findMany({
    where: {
      date: { gte: since },
    },
    select: {
      zodiac_sign_id: true,
      date: true,
      source_id: true,
      source: { select: { name: true } },
      relazioni_rating: true,
      lavoro_rating: true,
      salute_rating: true,
    },
  });

  return rows.map(r => ({
    zodiac_sign_id: r.zodiac_sign_id,
    date: r.date.toISOString().slice(0, 10),
    source_id: r.source_id,
    source_name: r.source.name,
    relazioni_rating: r.relazioni_rating,
    lavoro_rating: r.lavoro_rating,
    salute_rating: r.salute_rating,
  }));
}

// ── STEP 2: STATISTICHE ─────────────────────────────────────────
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

function computeStats(rows: RawRatingRow[]): DayDimensionStats[] {
  const fieldByDimension: Record<Dimension, keyof RawRatingRow> = {
    relazioni: 'relazioni_rating',
    lavoro: 'lavoro_rating',
    salute: 'salute_rating',
  };

  const grouped = new Map<string, RawRatingRow[]>();

  for (const row of rows) {
    const key = `${row.zodiac_sign_id}|${row.date}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  const results: DayDimensionStats[] = [];

  for (const [key, sourceRows] of grouped) {
    const [signIdStr, date] = key.split('|');
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
        date,
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
function printCalibrationReport(stats: DayDimensionStats[]) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('CALIBRAZIONE SOGLIA DIVERGENZA — REPORT');
  console.log('='.repeat(60));
  console.log(`Periodo analizzato: ultimi ${DAYS_BACK} giorni`);
  console.log(`Combinazioni segno×giorno×dimensione totali: ${stats.length}`);

  const eligible = stats.filter(s => s.validSourceCount >= MIN_VALID_SOURCES);
  const excluded = stats.length - eligible.length;
  console.log(
    `Esclusi per fonti insufficienti (< ${MIN_VALID_SOURCES}): ${excluded}`
  );
  console.log(`Combinazioni eleggibili per la calibrazione: ${eligible.length}\n`);

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

    console.log(
      `${threshold.toFixed(1)}    | ${overallPct.padStart(15)}% | ` +
        `${perDimension[0].padStart(8)}% | ${perDimension[1].padStart(6)}% | ` +
        `${perDimension[2].padStart(17)}%${flag}`
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
      `sign_id=${s.zodiac_sign_id} | ${s.date} | ${s.dimension} | stddev=${s.stddev} | ` +
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
      `sign_id=${s.zodiac_sign_id} | ${s.date} | ${s.dimension} | stddev=${s.stddev} | ` +
        `media=${s.mean} | [${ratingsStr}]`
    );
  }

  console.log(`\n${'='.repeat(60)}\n`);
}

// ── MAIN ─────────────────────────────────────────────────────────
async function main() {
  console.log('Recupero dati storici...');
  const rawRatings = await getRawRatings();

  console.log(`Trovate ${rawRatings.length} righe fonte/segno/giorno.`);

  const stats = computeStats(rawRatings);
  printCalibrationReport(stats);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
