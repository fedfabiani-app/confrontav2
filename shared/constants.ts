// Zodiac sign mappings
export const ZODIAC_SIGNS_IT_EN = {
  Ariete: 'aries',
  Toro: 'taurus',
  Gemelli: 'gemini',
  Cancro: 'cancer',
  Leone: 'leo',
  Vergine: 'virgo',
  Bilancia: 'libra',
  Scorpione: 'scorpio',
  Sagittario: 'sagittarius',
  Capricorno: 'capricorn',
  Acquario: 'aquarius',
  Pesci: 'pisces',
} as const;

export const ZODIAC_SIGNS_EN_IT = Object.fromEntries(
  Object.entries(ZODIAC_SIGNS_IT_EN).map(([it, en]) => [en, it])
) as Record<string, string>;

// Italian weekdays without accents
export const ITALIAN_WEEKDAYS = [
  'domenica',
  'lunedi',
  'martedi',
  'mercoledi',
  'giovedi',
  'venerdi',
  'sabato',
] as const;

// Month names for URL patterns
export const ITALIAN_MONTHS = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
] as const;

// Source domains
export const HOROSCOPE_SOURCES = [
  {
    name: 'La Repubblica',
    domain: 'repubblica.it',
    baseUrl: 'https://www.repubblica.it',
    urlPattern: '/oroscopo/',
  },
  {
    name: 'IO Donna',
    domain: 'iodonna.it',
    baseUrl: 'https://www.iodonna.it',
    urlPattern: '/oroscopo/giorno/{sign}-{dd}-{mm}-{yyyy}/',
  },
  {
    name: 'alfemminile',
    domain: 'alfemminile.com',
    baseUrl: 'https://www.alfemminile.com',
    urlPattern: '/astrologia/oroscopo/oroscopo-di-oggi-{weekday}-{day}-{month}-{year}/',
  },
  {
    name: 'Gazzetta dello Sport',
    domain: 'gazzetta.it',
    baseUrl: 'https://www.gazzetta.it',
    urlPattern: '/oroscopo/storie/{date}/{weekday}-{day}-{month}-{year}-previsioni-per-tutti-i-segni/{sign}.shtml',
  },
  {
    name: 'Oggi',
    domain: 'oggi.it',
    baseUrl: 'https://www.oggi.it',
    urlPattern: '/oroscopo/oroscopo-di-oggi/{sign}-oggi.shtml',
  },
  {
    name: 'Virgilio',
    domain: 'virgilio.it',
    baseUrl: 'https://www.virgilio.it',
    urlPattern: '/oroscopo/oggi/{sign}/',
  },
  {
    name: 'OnlyOroscopo',
    domain: 'onlyoroscopo.it',
    baseUrl: 'https://www.onlyoroscopo.it',
    urlPattern: '/oroscopo-{sign}/',
  },
  {
    name: 'Sky TG24',
    domain: 'tg24.sky.it',
    baseUrl: 'https://tg24.sky.it',
    urlPattern: '/lifestyle/oroscopo/{sign}/oggi/',
  },
  {
    name: 'Corriere della Sera',
    domain: 'corriere.it',
    baseUrl: 'https://www.corriere.it',
    urlPattern: '/oroscopo/oggi/{sign}/',
  },
  {
    name: 'Amica',
    domain: 'amica.it',
    baseUrl: 'https://www.amica.it',
    urlPattern: '/oroscopo/oggi/{sign}/',
  },
  {
    name: 'Quotidiano.net',
    domain: 'quotidiano.net',
    baseUrl: 'https://www.quotidiano.net',
    urlPattern: '/oroscopo',
  },
  {
    name: 'Style Corriere',
    domain: 'style.corriere.it',
    baseUrl: 'https://style.corriere.it',
    urlPattern: '/oroscopo/oggi/{sign}/',
  },
  {
    name: 'Vogue Italia',
    domain: 'vogue.it',
    baseUrl: 'https://www.vogue.it',
    urlPattern: '/oroscopo/article/oroscopo-oggi-{sign}/',
  },
  {
    name: 'Grazia',
    domain: 'oroscopo.grazia.it',
    baseUrl: 'https://oroscopo.grazia.it',
    urlPattern: '/oroscopo-del-giorno/{sign}/',
  },
  {
    name: 'Oroscopo.it',
    domain: 'oroscopo.it',
    baseUrl: 'https://www.oroscopo.it',
    urlPattern: '/{sign}/',
  },
] as const;

// Tone mappings for UI
export const TONE_LABELS_IT = {
  positive: 'Positivo',
  neutral: 'Neutrale',
  negative: 'Negativo',
} as const;

export const CATEGORY_LABELS_IT = {
  relazioni: 'Relazioni',
  lavoro: 'Lavoro',
  benessere: 'Benessere',
} as const;
