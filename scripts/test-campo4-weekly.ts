/**
 * Test manuale end-to-end per il Campo 4 "Le stelle dicono" — lato WEEKLY.
 * Legge i testi già scrapati da weekly_horoscope_data per segno+settimana
 * (gestendo l'overlap di ELLE come fetchWeeklyHoroscopes in server/routes.ts),
 * li passa a processMultiSourceHoroscope(inputs, 'weekly') (la funzione reale
 * usata in produzione) e stampa Campi 1-3 per fonte + il Campo 4 salvato in
 * weekly_comparative_synthesis.
 *
 * USO:
 *   npx tsx scripts/test-campo4-weekly.ts --sign=toro --weekStartDate=2026-06-29
 *
 * ATTENZIONE: esegue chiamate reali all'API Anthropic (costo reale) e
 * scrive/aggiorna una riga reale in weekly_comparative_synthesis.
 */

import prisma from '../server/services/database';
import { processMultiSourceHoroscope } from '../server/services/claude';
import type { OpenAIInput } from '@shared/schema';

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function main() {
  const { sign, weekStartDate } = parseArgs();
  if (!sign || !weekStartDate) {
    console.error('Uso: npx tsx scripts/test-campo4-weekly.ts --sign=<segno_it> --weekStartDate=YYYY-MM-DD');
    process.exit(1);
  }

  const nameItalian = sign.charAt(0).toUpperCase() + sign.slice(1).toLowerCase();

  const zodiacSign = await prisma.zodiacSign.findFirst({ where: { name_italian: nameItalian } });
  if (!zodiacSign) {
    console.error(`Segno non trovato: "${nameItalian}"`);
    process.exit(1);
  }

  const weekStart = new Date(`${weekStartDate}T00:00:00.000Z`);
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

  // Stesso pattern di fetchWeeklyHoroscopes (server/routes.ts): fonti regolari
  // con week_start_date esatto + fonti biweekly (ELLE) il cui valid_from/valid_to
  // si sovrappone a questa settimana, deduplicate per source_id.
  const [regular, biweekly] = await Promise.all([
    prisma.weeklyHoroscopeData.findMany({
      where: { zodiac_sign_id: zodiacSign.id, week_start_date: weekStart, weekly_source: { is_biweekly: false } },
      include: { weekly_source: true },
    }),
    prisma.weeklyHoroscopeData.findMany({
      where: { zodiac_sign_id: zodiacSign.id, valid_from: { lte: weekEnd }, valid_to: { gte: weekStart }, weekly_source: { is_biweekly: true } },
      include: { weekly_source: true },
    }),
  ]);

  const seen = new Set<number>();
  const rows = [...regular, ...biweekly].filter(r => {
    if (seen.has(r.source_id)) return false;
    seen.add(r.source_id);
    return true;
  });

  if (rows.length === 0) {
    console.error(`Nessun dato in weekly_horoscope_data per ${nameItalian} - settimana ${weekStartDate}`);
    process.exit(1);
  }

  console.log(`Trovate ${rows.length} fonti per ${nameItalian} - settimana ${weekStartDate} (ELLE inclusa se in overlap). Chiamo processMultiSourceHoroscope...\n`);

  const inputs: OpenAIInput[] = rows.map(r => ({
    sourceId: r.source_id,
    sourceName: r.weekly_source.name,
    signSlugIt: nameItalian,
    dateISO: weekStartDate,
    extracted_text: r.original_text,
  }));

  const results = await processMultiSourceHoroscope(inputs, 'weekly');

  console.log('='.repeat(70));
  console.log('CAMPI 1-3 PER FONTE');
  console.log('='.repeat(70));
  results.forEach((r, i) => {
    console.log(`\n[${inputs[i].sourceName}]`);
    console.log(`  Superquote: "${r.superquote}"`);
    console.log(`  Summary: "${r.summary}"`);
    console.log(`  Ratings: relazioni=${r.ratings.relazioni} lavoro=${r.ratings.lavoro} benessere=${r.ratings.benessere}`);
    console.log(`  Tone: ${r.tone}`);
  });

  const synthesis = await prisma.weeklyComparativeSynthesis.findUnique({
    where: { zodiac_sign_id_week_start_date: { zodiac_sign_id: zodiacSign.id, week_start_date: weekStart } },
  });

  console.log(`\n${'='.repeat(70)}`);
  console.log('CAMPO 4 — LE STELLE DICONO (sintesi comparativa, weekly)');
  console.log('='.repeat(70));
  if (!synthesis) {
    console.log('Nessun record weekly_comparative_synthesis salvato (Campo 4 fallito o segnale insufficiente — vedi log sopra).');
  } else {
    console.log(`consenso (${synthesis.consenso.length} char): "${synthesis.consenso}"`);
    console.log(`approfondimento (${synthesis.approfondimento.length} char): "${synthesis.approfondimento}"`);
    console.log(`ha_divergenza: ${synthesis.ha_divergenza}`);
    console.log(`relazioni_spread: ${synthesis.relazioni_spread}`);
    console.log(`lavoro_spread: ${synthesis.lavoro_spread}`);
    console.log(`salute_spread: ${synthesis.salute_spread}`);
    console.log(`fonti_divergenti: [${synthesis.fonti_divergenti.join(', ')}]`);
  }

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
