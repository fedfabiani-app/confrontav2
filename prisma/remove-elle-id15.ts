/**
 * One-off cleanup: remove duplicate ELLE weekly source (ID 15).
 * Run once with: npx tsx prisma/remove-elle-id15.ts
 * Safe to re-run: exits early if ID 15 no longer exists.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const source = await prisma.weeklySource.findUnique({ where: { id: 15 } });

  if (!source) {
    console.log('WeeklySource ID 15 not found — nothing to do.');
    return;
  }

  console.log(`Found duplicate: ID ${source.id} | name="${source.name}" | domain="${source.domain}"`);

  const [deletedData, deletedStatuses] = await Promise.all([
    prisma.weeklyHoroscopeData.deleteMany({ where: { source_id: 15 } }),
    prisma.weeklyScraperSourceStatus.deleteMany({ where: { source_id: 15 } }),
  ]);

  console.log(`Deleted ${deletedData.count} WeeklyHoroscopeData rows`);
  console.log(`Deleted ${deletedStatuses.count} WeeklyScraperSourceStatus rows`);

  await prisma.weeklySource.delete({ where: { id: 15 } });
  console.log('Deleted WeeklySource ID 15. Done.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
