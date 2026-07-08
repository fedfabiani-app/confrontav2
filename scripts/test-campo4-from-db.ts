/**
 * Test manuale end-to-end per il Campo 4 "Le stelle dicono" — path di produzione
 * reale (post-fix duplicazione): legge Campo 1-3 GIÀ CALCOLATI da horoscope_data
 * (nessuna ri-estrazione Claude) e chiama generateAndSaveComparativeSynthesis()
 * direttamente, esattamente come fa runDailyComparativeSynthesisCycle in produzione.
 *
 * USO:
 *   npx tsx scripts/test-campo4-from-db.ts --sign=bilancia --date=2026-07-02
 *
 * ATTENZIONE: esegue UNA chiamata reale all'API Anthropic (extract_comparative_synthesis,
 * costo reale ma minimo) e scrive/aggiorna una riga reale in comparative_synthesis.
 * Non tocca i campi Campo 1-3 in horoscope_data (a differenza di test-campo4.ts).
 */

import prisma from '../server/services/database';
import { generateAndSaveComparativeSynthesis } from '../server/services/claude';
import { openaiOutputSchema, type OpenAIInput, type OpenAIOutput } from '@shared/schema';

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
    console.error('Uso: npx tsx scripts/test-campo4-from-db.ts --sign=<segno_it> --date=YYYY-MM-DD');
    process.exit(1);
  }

  const nameItalian = sign.charAt(0).toUpperCase() + sign.slice(1).toLowerCase();

  const zodiacSign = await prisma.zodiacSign.findFirst({ where: { name_italian: nameItalian } });
  if (!zodiacSign) {
    console.error(`Segno non trovato: "${nameItalian}"`);
    process.exit(1);
  }

  const targetDate = new Date(`${date}T00:00:00.000Z`);

  const beforeSourceUpdatedAt = await prisma.horoscopeData.findMany({
    where: { zodiac_sign_id: zodiacSign.id, date: targetDate },
    select: { source_id: true, updated_at: true },
    orderBy: { source_id: 'asc' },
  });

  const rows = await prisma.horoscopeData.findMany({
    where: { zodiac_sign_id: zodiacSign.id, date: targetDate, summary: { not: '' } },
    include: { source: true },
    orderBy: { source_id: 'asc' },
  });

  if (rows.length === 0) {
    console.error(`Nessun dato in horoscope_data per ${nameItalian} - ${date}`);
    process.exit(1);
  }

  console.log(`Trovate ${rows.length} fonti già processate per ${nameItalian} - ${date}. Costruisco inputs/results dal DB (nessuna ri-estrazione)...\n`);

  const inputs: OpenAIInput[] = rows.map(r => ({
    sourceId: r.source_id,
    sourceName: r.source.name,
    signSlugIt: nameItalian,
    dateISO: date,
    extracted_text: r.original_text, // non usato da generateAndSaveComparativeSynthesis
  }));

  const results: OpenAIOutput[] = rows.map(r =>
    openaiOutputSchema.parse({
      superquote: r.superquote ?? '',
      summary: r.summary,
      ratings: {
        relazioni: Math.max(0, Math.min(5, r.relazioni_rating)),
        lavoro: Math.max(0, Math.min(5, r.lavoro_rating)),
        benessere: Math.max(0, Math.min(5, r.salute_rating)),
      },
      tone: (['positive', 'neutral', 'negative'] as const).includes(r.tone_analysis as any)
        ? r.tone_analysis
        : 'neutral',
    })
  );

  console.log('CAMPI 1-3 LETTI DAL DB (invariati)');
  results.forEach((r, i) => {
    console.log(`  [${inputs[i].sourceName}] rel=${r.ratings.relazioni} lav=${r.ratings.lavoro} ben=${r.ratings.benessere} tone=${r.tone}`);
  });

  await generateAndSaveComparativeSynthesis(inputs, results, 'daily');

  const afterSourceUpdatedAt = await prisma.horoscopeData.findMany({
    where: { zodiac_sign_id: zodiacSign.id, date: targetDate },
    select: { source_id: true, updated_at: true },
    orderBy: { source_id: 'asc' },
  });

  const anyOverwritten = afterSourceUpdatedAt.some((after, i) =>
    after.updated_at.getTime() !== beforeSourceUpdatedAt[i].updated_at.getTime()
  );
  console.log(`\nhoroscope_data.updated_at invariato per tutte le fonti: ${!anyOverwritten ? 'SI (atteso)' : 'NO — Campo 1-3 e stato sovrascritto!'}`);

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
