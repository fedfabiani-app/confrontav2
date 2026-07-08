import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const rows = await prisma.weeklyHoroscopeData.findMany({
  where: { source_id: 4, week_start_date: new Date('2026-07-05') },
  orderBy: { zodiac_sign_id: 'asc' },
  include: { zodiac_sign: true },
});
for (const r of rows) {
  console.log(r.zodiac_sign.name_italian, '| summary len:', r.summary?.length || 0, '| original_text len:', r.original_text?.length || 0, '| url:', r.original_url);
}
console.log('total rows:', rows.length);
await prisma.$disconnect();
