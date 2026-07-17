/**
 * One-off cleanup: remove duplicate ELLE horoscope rows created when
 * is_biweekly was false — the same article was stored with different
 * week_start_date values for consecutive Mondays.
 * Presumed creation date: 2026-06-26.
 *
 * Run manually once against the target environment: npx tsx prisma/one-off-fixes/remove-elle-duplicate-rows.ts
 * Safe to re-run: no-op once no duplicates remain.
 *
 * Eseguire manualmente una tantum, non richiamare da seed.ts né dallo start command.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const elleSource = await prisma.weeklySource.findFirst({ where: { domain: 'elle.com' } });

  if (!elleSource) {
    console.log('ELLE weekly source not found — nothing to do.');
    return;
  }

  const elleRows = await prisma.weeklyHoroscopeData.findMany({
    where: { source_id: elleSource.id, valid_from: { not: null } },
    orderBy: [{ zodiac_sign_id: 'asc' }, { valid_from: 'asc' }, { id: 'asc' }],
  });

  const seen = new Set<string>();
  const idsToDelete: number[] = [];
  for (const row of elleRows) {
    const key = `${row.zodiac_sign_id}-${row.valid_from?.toISOString()}`;
    if (seen.has(key)) {
      idsToDelete.push(row.id);
    } else {
      seen.add(key);
    }
  }

  if (idsToDelete.length === 0) {
    console.log('No duplicate ELLE horoscope rows found — nothing to do.');
    return;
  }

  const deleted = await prisma.weeklyHoroscopeData.deleteMany({ where: { id: { in: idsToDelete } } });
  console.log(`Deleted ${deleted.count} duplicate ELLE horoscope rows (source ID ${elleSource.id}). Done.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
