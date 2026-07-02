/**
 * Test manuale end-to-end per il Campo 4 "Le stelle dicono".
 * Legge i testi già scrapati da horoscope_data per segno+data, li passa a
 * processMultiSourceHoroscope() (la funzione reale usata in produzione) e
 * stampa Campi 1-3 per fonte + il Campo 4 salvato in comparative_synthesis.
 *
 * USO:
 *   npx tsx scripts/test-campo4.ts --sign=bilancia --date=2026-07-02
 *
 * ATTENZIONE: esegue chiamate reali all'API Anthropic (costo reale) e
 * scrive/aggiorna una riga reale in comparative_synthesis.
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
  const { sign, date } = parseArgs();
  if (!sign || !date) {
    console.error('Uso: npx tsx scripts/test-campo4.ts --sign=<segno_it> --date=YYYY-MM-DD');
    process.exit(1);
  }

  const nameItalian = sign.charAt(0).toUpperCase() + sign.slice(1).toLowerCase();

  const zodiacSign = await prisma.zodiacSign.findFirst({ where: { name_italian: nameItalian } });
  if (!zodiacSign) {
    console.error(`Segno non trovato: "${nameItalian}"`);
    process.exit(1);
  }

  const targetDate = new Date(`${date}T00:00:00.000Z`);

  const rows = await prisma.horoscopeData.findMany({
    where: { zodiac_sign_id: zodiacSign.id, date: targetDate },
    include: { source: true },
    orderBy: { source_id: 'asc' },
  });

  if (rows.length === 0) {
    console.error(`Nessun dato in horoscope_data per ${nameItalian} - ${date}`);
    process.exit(1);
  }

  console.log(`Trovate ${rows.length} fonti per ${nameItalian} - ${date}. Chiamo processMultiSourceHoroscope...\n`);

  const inputs: OpenAIInput[] = rows.map(r => ({
    sourceId: r.source_id,
    sourceName: r.source.name,
    signSlugIt: nameItalian,
    dateISO: date,
    extracted_text: r.original_text,
  }));

  const results = await processMultiSourceHoroscope(inputs);

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

  const synthesis = await prisma.comparativeSynthesis.findUnique({
    where: { zodiac_sign_id_date: { zodiac_sign_id: zodiacSign.id, date: targetDate } },
  });

  console.log(`\n${'='.repeat(70)}`);
  console.log('CAMPO 4 — LE STELLE DICONO (sintesi comparativa)');
  console.log('='.repeat(70));
  if (!synthesis) {
    console.log('Nessun record comparative_synthesis salvato (Campo 4 fallito o segnale insufficiente — vedi log sopra).');
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
