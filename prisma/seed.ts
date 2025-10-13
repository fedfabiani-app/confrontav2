import { PrismaClient } from '@prisma/client';
import { HOROSCOPE_SOURCES } from '../shared/constants';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

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
