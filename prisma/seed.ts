import { PrismaClient } from '@prisma/client';
import { HOROSCOPE_SOURCES } from '../shared/constants';

const prisma = new PrismaClient();

const WEEKLY_SOURCES = [
  {
    name: 'Paolo Fox - Corriere',
    domain: 'corriere.it',
    logo_url: 'https://cdn.brandfetch.io/idXZ1tQX9C/w/400/h/400/theme/dark/icon.jpeg',
    base_url: 'https://www.corriere.it/oroscopo/settimana',
    url_pattern: '/{sign}/',
    scrape_strategy: 'pattern',
    slug: null,
    is_active: true,
  },
  {
    name: 'Cosmopolitan',
    domain: 'cosmopolitan.com',
    logo_url: 'https://www.cosmopolitan.com/it/apple-touch-icon.png',
    base_url: 'https://www.cosmopolitan.com/it',
    url_pattern: '/oroscopo/oroscopo-settimana/',
    scrape_strategy: 'pattern',
    slug: null,
    is_active: true,
  },
  {
    name: 'Webboh',
    domain: 'webboh.it',
    logo_url: 'https://www.webboh.it/apple-touch-icon.png',
    base_url: 'https://www.webboh.it',
    url_pattern: '/oroscopo-settimana-{start_day}-{end_day}-{month}/',
    scrape_strategy: 'pattern',
    slug: null,
    is_active: true,
  },
  {
    name: 'Sky TG24',
    domain: 'tg24.sky.it',
    logo_url: null,
    base_url: 'https://tg24.sky.it',
    url_pattern: '/lifestyle/oroscopo/{sign}/settimana',
    scrape_strategy: 'pattern',
    slug: null,
    is_active: true,
  },
  {
    name: 'Marie Claire',
    domain: 'marieclaire.it',
    logo_url: 'https://www.marieclaire.it/apple-touch-icon.png',
    base_url: 'https://www.marieclaire.it',
    url_pattern: 'coolmix/{random_number}/oroscopo-settimana-di-marie-claire-dal-{start_day}-al-{end_day}-{month}/',
    scrape_strategy: 'archive',
    slug: null,
    is_active: true,
  },
  {
    name: 'IO Donna',
    domain: 'iodonna.it',
    logo_url: 'https://www.iodonna.it/favicon.ico',
    base_url: 'https://www.iodonna.it',
    url_pattern: '/oroscopo/settimana/{sign}/',
    scrape_strategy: 'pattern',
    slug: 'iodonna',
    is_active: true,
  },
  {
    name: 'Virgilio',
    domain: 'virgilio.it',
    logo_url: 'https://www.virgilio.it/favicon.ico',
    base_url: 'https://www.virgilio.it',
    url_pattern: '/oroscopo/settimanale/{sign}/',
    scrape_strategy: 'pattern',
    slug: null,
    is_active: true,
  },
  {
    name: 'Starbene',
    domain: 'starbene.it',
    logo_url: 'https://www.starbene.it/favicon.ico',
    base_url: 'https://www.starbene.it',
    url_pattern: '/oroscopo/{sign}/{sign}-dal-{start_day}-al-{end_day}-{month}-{year}/',
    scrape_strategy: 'pattern',
    slug: null,
    is_active: true,
  },
  {
    name: 'D Repubblica',
    domain: 'd.repubblica.it',
    logo_url: null,
    base_url: 'https://d.repubblica.it',
    url_pattern: '/oroscopo/',
    scrape_strategy: 'archive',
    slug: 'd-repubblica',
    is_active: true,
  },
  {
    name: 'alFemminile',
    domain: 'alfemminile.com',
    logo_url: 'https://www.alfemminile.com/favicon.ico',
    base_url: 'https://www.alfemminile.com',
    url_pattern: '/astrologia/oroscopo/',
    scrape_strategy: 'archive',
    slug: null,
    is_active: true,
  },
  {
    name: 'Simon and the Stars',
    domain: 'simonandthestars.it',
    logo_url: 'https://www.simonandthestars.it/favicon.ico',
    base_url: 'https://www.simonandthestars.it',
    url_pattern: '/{sign}-oroscopo-{start_day}-{end_day}-{month}-{year}/',
    scrape_strategy: 'pattern',
    slug: null,
    is_active: true,
  },
  {
    name: "Harper's Bazaar",
    domain: 'harpersbazaar.com',
    logo_url: 'https://www.harpersbazaar.com/favicon.ico',
    base_url: 'https://www.harpersbazaar.com/it',
    url_pattern: '/cultura/oroscopo/',
    scrape_strategy: 'archive',
    slug: null,
    is_active: true,
  },
  {
    name: 'ELLE',
    domain: 'elle.com',
    logo_url: 'https://www.elle.com/favicon.ico',
    base_url: 'https://www.elle.com/it',
    url_pattern: '/oroscopo/',
    scrape_strategy: 'archive',
    slug: 'elle',
    is_active: true,
    is_biweekly: true,
  },
];

async function main() {
  console.log('Seeding database...');

  // One-off cleanup: remove SuperGuida TV / Branko weekly source.
  const superguidaSource = await prisma.weeklySource.findFirst({ where: { domain: 'superguidatv.it' } });
  if (superguidaSource) {
    await prisma.weeklyHoroscopeData.deleteMany({ where: { source_id: superguidaSource.id } });
    await prisma.weeklyScraperSourceStatus.deleteMany({ where: { source_id: superguidaSource.id } });
    await prisma.weeklySource.delete({ where: { id: superguidaSource.id } });
    console.log(`Removed SuperGuida TV weekly source (ID ${superguidaSource.id})`);
  }

  // One-off cleanup: remove duplicate ELLE weekly source (ID 15).
  // ID 27 (domain elle.com) is the canonical record; ID 15 was created when
  // the domain was previously different and was never cleaned up.
  const elleOld = await prisma.weeklySource.findUnique({ where: { id: 15 } });
  if (elleOld) {
    await prisma.weeklyHoroscopeData.deleteMany({ where: { source_id: 15 } });
    await prisma.weeklyScraperSourceStatus.deleteMany({ where: { source_id: 15 } });
    await prisma.weeklySource.delete({ where: { id: 15 } });
    console.log(`Removed duplicate ELLE weekly source (ID 15, domain="${elleOld.domain}")`);
  }

  // One-off cleanup: remove duplicate ELLE horoscope rows created when
  // is_biweekly was false — the same article was stored with different
  // week_start_date values for consecutive Mondays.
  const elleSource = await prisma.weeklySource.findFirst({ where: { domain: 'elle.com' } });
  if (elleSource) {
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
    if (idsToDelete.length > 0) {
      await prisma.weeklyHoroscopeData.deleteMany({ where: { id: { in: idsToDelete } } });
      console.log(`Removed ${idsToDelete.length} duplicate ELLE horoscope rows`);
    }
  }

  // Seed zodiac signs
  const zodiacSigns = [
    { name_italian: 'Ariete', name_english: 'aries', date_range: '21 Mar - 19 Apr', symbol: '♈' },
    { name_italian: 'Toro', name_english: 'taurus', date_range: '20 Apr - 20 Mag', symbol: '♉' },
    { name_italian: 'Gemelli', name_english: 'gemini', date_range: '21 Mag - 20 Giu', symbol: '♊' },
    { name_italian: 'Cancro', name_english: 'cancer', date_range: '21 Giu - 22 Lug', symbol: '♋' },
    { name_italian: 'Leone', name_english: 'leo', date_range: '23 Lug - 22 Ago', symbol: '♌' },
    { name_italian: 'Vergine', name_english: 'virgo', date_range: '23 Ago - 22 Set', symbol: '♍' },
    { name_italian: 'Bilancia', name_english: 'libra', date_range: '23 Set - 22 Ott', symbol: '♎' },
    { name_italian: 'Scorpione', name_english: 'scorpio', date_range: '23 Ott - 21 Nov', symbol: '♏' },
    { name_italian: 'Sagittario', name_english: 'sagittarius', date_range: '22 Nov - 21 Dic', symbol: '♐' },
    { name_italian: 'Capricorno', name_english: 'capricorn', date_range: '22 Dic - 19 Gen', symbol: '♑' },
    { name_italian: 'Acquario', name_english: 'aquarius', date_range: '20 Gen - 18 Feb', symbol: '♒' },
    { name_italian: 'Pesci', name_english: 'pisces', date_range: '19 Feb - 20 Mar', symbol: '♓' },
  ];

  for (const sign of zodiacSigns) {
    await prisma.zodiacSign.upsert({
      where: { name_english: sign.name_english },
      update: {},
      create: sign,
    });
  }

  console.log('Zodiac signs seeded');

  // Seed sources
  for (const source of HOROSCOPE_SOURCES) {
    await prisma.source.upsert({
      where: { domain: source.domain },
      update: {},
      create: {
        name: source.name,
        domain: source.domain,
        base_url: source.baseUrl,
        url_pattern: source.urlPattern,
        reliability_score: 3.5, // Default reliability score
        is_active: true,
      },
    });
  }

  console.log('Sources seeded');

  // Seed weekly sources
  for (const source of WEEKLY_SOURCES) {
    await prisma.weeklySource.upsert({
      where: { domain: source.domain },
      update: {
        // Keep slug, url_pattern, strategy, is_active and is_biweekly in sync on re-seed
        slug: source.slug,
        url_pattern: source.url_pattern,
        scrape_strategy: source.scrape_strategy,
        is_active: source.is_active,
        is_biweekly: (source as any).is_biweekly ?? false,
      },
      create: {
        name: source.name,
        domain: source.domain,
        logo_url: source.logo_url,
        base_url: source.base_url,
        url_pattern: source.url_pattern,
        scrape_strategy: source.scrape_strategy,
        slug: source.slug,
        reliability_score: 3.5,
        is_active: source.is_active,
        is_biweekly: (source as any).is_biweekly ?? false,
      },
    });
  }

  console.log('Weekly sources seeded');

  // Create demo user
  await prisma.user.upsert({
    where: { email: 'demo@oroscopo.it' },
    update: {},
    create: {
      email: 'demo@oroscopo.it',
    },
  });

  console.log('Demo user created');
  console.log('Seeding completed!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
