/**
 * One-off cleanup: remove SuperGuida TV / Branko weekly source entirely.
 * Presumed creation date: 2026-06-04.
 *
 * Run manually once against the target environment: npx tsx prisma/one-off-fixes/remove-superguidatv-source.ts
 * Safe to re-run: exits early if the source no longer exists.
 *
 * Eseguire manualmente una tantum, non richiamare da seed.ts né dallo start command.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const source = await prisma.weeklySource.findFirst({ where: { domain: 'superguidatv.it' } });

  if (!source) {
    console.log('SuperGuida TV weekly source not found — nothing to do.');
    return;
  }

  console.log(`Found source: ID ${source.id} | name="${source.name}" | domain="${source.domain}"`);

  const [deletedData, deletedStatuses] = await Promise.all([
    prisma.weeklyHoroscopeData.deleteMany({ where: { source_id: source.id } }),
    prisma.weeklyScraperSourceStatus.deleteMany({ where: { source_id: source.id } }),
  ]);

  console.log(`Deleted ${deletedData.count} WeeklyHoroscopeData rows`);
  console.log(`Deleted ${deletedStatuses.count} WeeklyScraperSourceStatus rows`);

  await prisma.weeklySource.delete({ where: { id: source.id } });
  console.log(`Deleted SuperGuida TV weekly source (ID ${source.id}). Done.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
