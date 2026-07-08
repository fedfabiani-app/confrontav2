/**
 * CALIBRAZIONE SOGLIA DIVERGENZA — Campo 4 "Le stelle dicono"
 * ============================================================
 *
 * Basato sullo schema REALE confermato di horoscope_data:
 *   id                 Int (PK)
 *   source_id          Int (FK)
 *   zodiac_sign_id     Int (FK)
 *   date               DateTime (Date)
 *   original_text      String
 *   superquote         String? (max 180 char)
 *   summary            String
 *   relazioni_rating   Int (SmallInt)
 *   lavoro_rating      Int (SmallInt)
 *   salute_rating      Int (SmallInt)   ← nel DB è "salute", in UI è "Benessere"
 *   tone_analysis       String
 *   original_url       String
 *   scraped_at / created_at / updated_at
 *
 * ATTENZIONE PER CLAUDE CODE:
 *   1. Il nome del modello Prisma corrispondente a horoscope_data va
 *      confermato leggendo schema.prisma (probabilmente "HoroscopeData"
 *      o simile) — qui sotto uso prisma.horoscopeData come ipotesi da
 *      verificare/correggere.
 *   2. Verificare come sono collegate le FK: se source.name è raggiungibile
 *      via relazione Prisma (source_id → Source) o se serve un join manuale.
 *   3. IMPORTANTE: questo script riguarda SOLO il lato giornaliero
 *      (sources + horoscope_data). NON toccare weekly_sources /
 *      weekly_horoscope_data — fase successiva separata, con probabile
 *      soglia di calibrazione diversa.
 *   4. Verificare se ELLE (cadenza biweekly) confluisce in horoscope_data
 *      con date discontinue, o se ha una tabella/logica a parte — se
 *      confluisce qui, va escluso dal calcolo per non sporcare i confronti
 *      stddev tra fonti sullo stesso giorno.
 *   5. Rating = 0 non risulta contemplato nello schema reale (SmallInt,
 *      probabilmente sempre valorizzato 1-5 secondo la rubrica del prompt
 *      Haiku) — se in pratica capitano 0 o null, escluderli dal calcolo
 *      come "ambito non menzionato, non comparabile".
 *
 * OBIETTIVO:
 * Calcolare, sugli ultimi 30 giorni di dati storici reali, la deviazione
 * standard tra fonti per ciascuna dimensione (Relazioni/Lavoro/Salute)
 * per ogni combinazione segno×giorno, e verificare che percentuale di
 * casi risulterebbe classificata come "divergenza alta" a diverse soglie
 * candidate (0.6 / 0.7 / 0.8 / 0.9 / 1.0).
 *
 * TARGET: una soglia che classifichi come "divergenza alta" circa il
 * 20-35% delle combinazioni segno×giorno. Sotto quel range, il campo
 * "approfondimento" con divergenza sarebbe troppo raro per valere lo
 * sforzo editoriale; sopra, perderebbe di significato (troppo comune).
 *
 * USO:
 *   npx ts-node scripts/calibrate-divergence-threshold.ts
 * (adattare a come il progetto esegue script standalone — controllare
 * package.json per script "ts-node"/"tsx" già configurati)
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
// ⚠️ ADATTARE: verificare nome modello Prisma e relazione verso Source.
async function getRawRatings(): Promise<RawRatingRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - DAYS_BACK);

  // ESEMPIO — da adattare al nome esatto del modello Prisma:
  // const rows = await prisma.horoscopeData.findMany({
  //   where: {
  //     date: { gte: since },
  //   },
  //   select: {
  //     zodiac_sign_id: true,
  //     date: true,
  //     source_id: true,
  //     source: { select: { name: true } }, // verificare nome relazione
  //     relazioni_rating: true,
  //     lavoro_rating: true,
  //     salute_rating: true,
  //   },
  // });
  // return rows.map(r => ({
  //   zodiac_sign_id: r.zodiac_sign_id,
  //   date: r.date.toISOString().slice(0, 10),
  //   source_id: r.source_id,
  //   source_name: r.source.name,
  //   relazioni_rating: r.relazioni_rating,
  //   lavoro_rating: r.lavoro_rating,
  //   salute_rating: r.salute_rating,
  // }));

  throw new Error(
    'getRawRatings() non implementata — confermare nome modello Prisma e relazione verso Source prima di eseguire.'
  );
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
