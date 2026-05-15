import axios from 'axios';
import * as cheerio from 'cheerio';
import { WeeklyScraperInput, WeeklyScraperOutput, weeklyScraperOutputSchema } from '@shared/schema';

// ==================== CONSTANTS ====================

const ZODIAC_SIGNS = [
  'ariete', 'toro', 'gemelli', 'cancro', 'leone', 'vergine',
  'bilancia', 'scorpione', 'sagittario', 'capricorno', 'acquario', 'pesci'
] as const;

const SIGN_MAP: Record<string, string> = {
  'Ariete': 'ariete',
  'Toro': 'toro',
  'Gemelli': 'gemelli',
  'Cancro': 'cancro',
  'Leone': 'leone',
  'Vergine': 'vergine',
  'Bilancia': 'bilancia',
  'Scorpione': 'scorpione',
  'Sagittario': 'sagittario',
  'Capricorno': 'capricorno',
  'Acquario': 'acquario',
  'Pesci': 'pesci'
} as const;

const ITALIAN_MONTHS: Record<string, number> = {
  'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4, 'maggio': 5, 'giugno': 6,
  'luglio': 7, 'agosto': 8, 'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12
} as const;

const domainLastRequest = new Map<string, number>();
const DOMAIN_DELAY_MS = 2000;

const archiveUrlCache = new Map<string, string>();

// ==================== END CONSTANTS ====================

interface ScrapeResult {
  success: boolean;
  text?: string;
  url?: string;
  error?: string;
}

interface WeekDateRange {
  startDate: Date;
  endDate: Date;
}

function parseItalianWeekRange(text: string, currentYear: number): WeekDateRange | null {
  const lowerText = text.toLowerCase();

  // Enhanced patterns to handle various Italian date formats including:
  // - "dal 11 al 17 ottobre" (with spaces)
  // - "dal-11-al-17-ottobre" (with hyphens)
  // - "dall-11-al-17-ottobre" (dall with hyphen)
  // - "dal11-al-17-ottobre" (dal + number, no separator)
  // - "dall11-al-17-ottobre" (dall + number, no separator)
  // - "dall11al17ottobre" (completely concatenated)
  const patterns = [
    // Pattern 1: Most flexible - handles dal/dall with any combination of separators
    // Matches: dal11, dall11, dal-11, dall-11, dal 11, dall 11
    /dall?(?:[-\s])?(\d{1,2})(?:[-\s])*al(?:[-\s])*(\d{1,2})(?:[-\s])*(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:(?:[-\s])*\d{4})?/i,

    // Pattern 2: Two months format "dal/dall + day + month + al + day + month"
    /dall?(?:[-\s])?(\d{1,2})(?:[-\s])*(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:[-\s])*al(?:[-\s])*(\d{1,2})(?:[-\s])*(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:(?:[-\s])*\d{4})?/i,

    // Pattern 3: Simple "number - number - month" format
    /(\d{1,2})[-\s]+(\d{1,2})[-\s]+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:[-\s]*\d{4})?/i,
  ];

  for (const pattern of patterns) {
    const match = lowerText.match(pattern);
    if (match) {
      if (match.length === 4) {
        const startDay = parseInt(match[1]);
        const endDay = parseInt(match[2]);
        const monthName = match[3].toLowerCase();
        const month = ITALIAN_MONTHS[monthName];

        if (month) {
          const startDate = new Date(currentYear, month - 1, startDay);
          const endDate = new Date(currentYear, month - 1, endDay);

          if (endDate < startDate) {
            endDate.setMonth(endDate.getMonth() + 1);
          }

          return { startDate, endDate };
        }
      } else if (match.length === 5) {
        const startDay = parseInt(match[1]);
        const startMonthName = match[2].toLowerCase();
        const endDay = parseInt(match[3]);
        const endMonthName = match[4].toLowerCase();

        const startMonth = ITALIAN_MONTHS[startMonthName];
        const endMonth = ITALIAN_MONTHS[endMonthName];

        if (startMonth && endMonth) {
          const startDate = new Date(currentYear, startMonth - 1, startDay);
          const endDate = new Date(currentYear, endMonth - 1, endDay);

          if (endDate < startDate) {
            endDate.setFullYear(endDate.getFullYear() + 1);
          }

          return { startDate, endDate };
        }
      }
    }
  }

  return null;
}

async function resolveWeeklyUrlFromArchive(input: WeeklyScraperInput): Promise<string> {
  const cacheKey = `${input.sourceId}-${input.weekStartDate}`;

  const cached = archiveUrlCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Determine the actual archive URL (listing page)
  let archiveUrl: string;

    if (input.domain.includes('sorrisi.com')) {
    // For Sorrisi, the archive is just the base URL (no pattern with placeholders)
    archiveUrl = input.baseUrl.endsWith('/') ? input.baseUrl : input.baseUrl + '/';
  } else if (input.domain.includes('gazzetta.it')) {
    // For Gazzetta, the archive is also just the base URL
    archiveUrl = input.baseUrl.endsWith('/') ? input.baseUrl : input.baseUrl + '/';
  } else {
    // For other sources, use baseUrl + urlPattern (if it makes sense)
    archiveUrl = input.baseUrl + input.urlPattern;
  }


  await respectDomainRateLimit(input.domain);

  const html = await fetchHtml(archiveUrl, input.userAgent);
  const $ = cheerio.load(html);

  const targetDate = new Date(input.weekStartDate);
  const currentYear = targetDate.getFullYear();

  const candidates: { url: string; dateRange: WeekDateRange; score: number }[] = [];

  // Special handling for Repubblica
  if (input.domain.includes('repubblica.it')) {

    const urlPattern = /oroscopo[-_](?:della[-_])?settimana/i;

    $('a').each((_, elem) => {
      const href = $(elem).attr('href');
      const linkText = $(elem).text().trim();

      if (!href || !urlPattern.test(href)) {
        return;
      }

      let score = 0;

      const urlDateMatch = href.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);

      if (urlDateMatch) {
        const urlYear = parseInt(urlDateMatch[1]);
        const urlMonth = parseInt(urlDateMatch[2]);
        const urlDay = parseInt(urlDateMatch[3]);
        const urlDate = new Date(urlYear, urlMonth - 1, urlDay);

        const dayOfWeek = urlDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (isWeekend) {
          score += 10;
        }

        const dateRange = {
          startDate: urlDate,
          endDate: new Date(urlDate.getTime() + 6 * 24 * 60 * 60 * 1000)
        };

        const dateRangeFromText = parseItalianWeekRange(linkText + ' ' + href, currentYear);
        if (dateRangeFromText) {
          dateRange.startDate = dateRangeFromText.startDate;
          dateRange.endDate = dateRangeFromText.endDate;
          score += 20;
        }

        if (/previsioni/i.test(href)) {
          score += 5;
        }

        if (/(marco[-_]pesatori|branko|paolo[-_]fox)/i.test(href)) {
          score += 3;
        }

        const absoluteUrl = href.startsWith('http') ? href : 'https://d.repubblica.it' + href;
        candidates.push({ url: absoluteUrl, dateRange, score });

      }
    });

    candidates.sort((a, b) => b.score - a.score);
  } 

  // Special handling for Sorrisi.com
  else if (input.domain.includes('sorrisi.com')) {

    const urlPattern = /\/lifestyle\/oroscopo\/oroscopo[-_]della[-_]settimana/i;

    $('a').each((_, elem) => {
      const href = $(elem).attr('href');
      const linkText = $(elem).text().trim();

      if (!href || !urlPattern.test(href)) {
        return;
      }

      let score = 0;

      const fullText = href + ' ' + linkText;


      const dateRange = parseItalianWeekRange(fullText, currentYear);

      if (dateRange) {
        score += 20;

        if (/\d{4}/.test(href)) {
          score += 5;
        }

        let absoluteUrl = href;
        if (href.startsWith('/')) {
          absoluteUrl = 'https://www.sorrisi.com' + href;
        } else if (!href.startsWith('http')) {
          absoluteUrl = 'https://www.sorrisi.com/' + href;
        } else if (href.startsWith('http://')) {
          absoluteUrl = href.replace('http://', 'https://');
        }

        candidates.push({ url: absoluteUrl, dateRange, score });
      } else {
      }
    });

    candidates.sort((a, b) => b.score - a.score);
  }
  // Special handling for Gazzetta.it
  else if (input.domain.includes('gazzetta.it')) {

    const urlPattern = /\/oroscopo\/storie\/.*?\/oroscopo-settimanale/i;

    $('a').each((_, elem) => {
      const href = $(elem).attr('href');
      const linkText = $(elem).text().trim();

      if (!href || !urlPattern.test(href)) {
        return;
      }

      let score = 0;

      const fullText = href + ' ' + linkText;


      // Parse dates from URL slug with multiple slug variations
      // Possible patterns:
      // - oroscopo-settimanale-DD-DD-month-YYYY-le-previsioni-per-i-12-segni
      // - oroscopo-settimanale-DD-DD-month-YYYY-previsioni-per-tutti-i-12-segni
      // - oroscopo-settimanale-DD-DD-month-YYYY-previsioni-per-12-i-segni
      // - oroscopo-settimanale-DD-DD-month-YYYY-previsioni-per-tutti-i-segni
      // - oroscopo-settimanale-DD-DD-month-YYYY-previsioni-per-12-i-segni-zodiaco
      const slugVariations = [
        /oroscopo-settimanale-(\d{1,2})-(\d{1,2})-(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)-(\d{4})-le-previsioni-per-i-12-segni/i,
        /oroscopo-settimanale-(\d{1,2})-(\d{1,2})-(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)-(\d{4})-previsioni-per-tutti-i-12-segni/i,
        /oroscopo-settimanale-(\d{1,2})-(\d{1,2})-(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)-(\d{4})-previsioni-per-12-i-segni/i,
        /oroscopo-settimanale-(\d{1,2})-(\d{1,2})-(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)-(\d{4})-previsioni-per-tutti-i-segni/i,
        /oroscopo-settimanale-(\d{1,2})-(\d{1,2})-(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)-(\d{4})-previsioni-per-12-i-segni-zodiaco/i,
        /oroscopo-settimanale-(\d{1,2})-(\d{1,2})-(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)-(\d{4})/i
      ];

      let dateRange: WeekDateRange | null = null;
      let match: RegExpMatchArray | null = null;

      // Try each slug variation pattern
      for (const pattern of slugVariations) {
        match = href.match(pattern);
        if (match) {
          break;
        }
      }

      if (match) {
        const startDay = parseInt(match[1]);
        const endDay = parseInt(match[2]);
        const monthName = match[3].toLowerCase();
        const year = parseInt(match[4]);
        const month = ITALIAN_MONTHS[monthName];

        if (month) {
          const startDate = new Date(year, month - 1, startDay);
          const endDate = new Date(year, month - 1, endDay);

          if (endDate < startDate) {
            endDate.setMonth(endDate.getMonth() + 1);
          }

          dateRange = { startDate, endDate };
          score += 20;

        }
      } else {
        // Fallback to generic parser
        dateRange = parseItalianWeekRange(fullText, currentYear);
        if (dateRange) {
          score += 15;
        }
      }

      if (dateRange) {
        // Check if this is the "tutti i segni" URL (contains all signs)
        if (/tutti.*segni/i.test(href) || /tutti.*i.*segni/i.test(linkText)) {
          score += 10;
        }

        // Bonus for .shtml extension
        if (/\.shtml$/i.test(href)) {
          score += 5;
        }

        // Ensure absolute URL
        let absoluteUrl = href;
        if (href.startsWith('/')) {
          absoluteUrl = 'https://www.gazzetta.it' + href;
        } else if (!href.startsWith('http')) {
          absoluteUrl = 'https://www.gazzetta.it/' + href;
        } else if (href.startsWith('http://')) {
          absoluteUrl = href.replace('http://', 'https://');
        }

        candidates.push({ url: absoluteUrl, dateRange, score });
      } else {
      }
    });

    candidates.sort((a, b) => b.score - a.score);
  }
  // Special handling for Marie Claire
  else if (input.domain.includes('marieclaire.it')) {

    const urlPattern = /\/lifestyle\/coolmix\/a\d+\/oroscopo[-_]settimana/i;

    $('a').each((_, elem) => {
      const href = $(elem).attr('href');
      const linkText = $(elem).text().trim();

      if (!href || !urlPattern.test(href)) {
        return;
      }

      let score = 0;

      const fullText = href + ' ' + linkText;

      const marieClairePattern = /dall?(?:[-_\s])?(\d{1,2})(?:[-_\s])*al(?:[-_\s])*(\d{1,2})(?:[-_\s])*(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:(?:[-_\s])*(\d{4}))?/i;
      const match = fullText.toLowerCase().match(marieClairePattern);

      let dateRange: WeekDateRange | null = null;

      if (match) {
        const startDay = parseInt(match[1]);
        const endDay = parseInt(match[2]);
        const monthName = match[3].toLowerCase();
        const year = match[4] ? parseInt(match[4]) : currentYear;
        const month = ITALIAN_MONTHS[monthName];

        if (month) {
          const startDate = new Date(year, month - 1, startDay);
          const endDate = new Date(year, month - 1, endDay);

          if (endDate < startDate) {
            endDate.setMonth(endDate.getMonth() + 1);
          }

          dateRange = { startDate, endDate };
          score += 20;
        }
      } else {
        dateRange = parseItalianWeekRange(fullText, currentYear);
        if (dateRange) {
          score += 15;
        }
      }

      if (dateRange) {
        const articleMatch = href.match(/\/a(\d+)\//);
        if (articleMatch) {
          const articleId = parseInt(articleMatch[1]);
          score += Math.min(articleId / 1000000, 50);
        }

        let absoluteUrl = href;
        if (href.startsWith('/')) {
          absoluteUrl = 'https://www.marieclaire.it' + href;
        } else if (!href.startsWith('http')) {
          absoluteUrl = 'https://www.marieclaire.it/' + href;
        } else if (href.startsWith('http://')) {
          absoluteUrl = href.replace('http://', 'https://');
        }

        candidates.push({ url: absoluteUrl, dateRange, score });
      }
    });

    candidates.sort((a, b) => b.score - a.score);
  } 

    // Special handling for Cosmopolitan
    else if (input.domain.includes('cosmopolitan.com')) {

      const urlPattern = /\/oroscopo\/oroscopo-settimana\/a\d+\/oroscopo-settimana/i;

      $('a').each((_, elem) => {
        const href = $(elem).attr('href');
        const linkText = $(elem).text().trim();

        if (!href || !urlPattern.test(href)) {
          return;
        }

        let score = 0;
        const fullText = href + ' ' + linkText;


        // Pattern 1: Single month format
        // oroscopo-settimana-20-26-ottobre-2025
        const singleMonthPattern = /oroscopo-settimana-(\d{1,2})-(\d{1,2})-(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)-(\d{4})/i;

        // Pattern 2: Cross-month format  
        // oroscopo-settimana-27-ottobre-2-novembre-2025
        const crossMonthPattern = /oroscopo-settimana-(\d{1,2})-(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)-(\d{1,2})-(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)-(\d{4})/i;

        let dateRange: WeekDateRange | null = null;
        let match: RegExpMatchArray | null = null;

        // Try cross-month pattern first (more specific)
        match = href.match(crossMonthPattern);
        if (match) {
          const startDay = parseInt(match[1]);
          const startMonthName = match[2].toLowerCase();
          const endDay = parseInt(match[3]);
          const endMonthName = match[4].toLowerCase();
          const year = parseInt(match[5]);

          const startMonth = ITALIAN_MONTHS[startMonthName];
          const endMonth = ITALIAN_MONTHS[endMonthName];

          if (startMonth && endMonth) {
            const startDate = new Date(year, startMonth - 1, startDay);
            const endDate = new Date(year, endMonth - 1, endDay);

            dateRange = { startDate, endDate };
            score += 25;

          }
        } 
        // Try single month pattern
        else {
          match = href.match(singleMonthPattern);
          if (match) {
            const startDay = parseInt(match[1]);
            const endDay = parseInt(match[2]);
            const monthName = match[3].toLowerCase();
            const year = parseInt(match[4]);
            const month = ITALIAN_MONTHS[monthName];

            if (month) {
              const startDate = new Date(year, month - 1, startDay);
              let endDate = new Date(year, month - 1, endDay);

              // Handle case where end day < start day (crosses into next month)
              if (endDate < startDate) {
                endDate.setMonth(endDate.getMonth() + 1);
              }

              dateRange = { startDate, endDate };
              score += 20;

            }
          }
        }

        if (dateRange) {
          // Bonus for article ID (higher = more recent)
          const articleMatch = href.match(/\/a(\d+)\//);
          if (articleMatch) {
            const articleId = parseInt(articleMatch[1]);
            score += Math.min(articleId / 1000000, 50);
          }

          let absoluteUrl = href;
          if (href.startsWith('/')) {
            absoluteUrl = 'https://www.cosmopolitan.com/it' + href;
          } else if (!href.startsWith('http')) {
            absoluteUrl = 'https://www.cosmopolitan.com/it/' + href;
          } else if (href.startsWith('http://')) {
            absoluteUrl = href.replace('http://', 'https://');
          }

          candidates.push({ url: absoluteUrl, dateRange, score });
        } else {
        }
      });

      candidates.sort((a, b) => b.score - a.score);
    }
    
    // Generic archive handling
  else {
    $('a').each((_, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem).text();

      if (href && (href.includes('oroscopo') || href.includes('branko') || href.includes('settimana'))) {
        const fullText = href + ' ' + text;
        const dateRange = parseItalianWeekRange(fullText, currentYear);

        if (dateRange) {
          const absoluteUrl = href.startsWith('http') ? href : input.baseUrl + href;
          candidates.push({ url: absoluteUrl, dateRange, score: 0 });
        }
      }
    });
  }


  const targetDateStr = targetDate.toISOString().split('T')[0];

  // First try: exact date match
  for (const candidate of candidates) {
    const candidateDateStr = candidate.dateRange.startDate.toISOString().split('T')[0];

    if (candidateDateStr === targetDateStr) {
      archiveUrlCache.set(cacheKey, candidate.url);
      return candidate.url;
    }
  }

  // Second try: date within range
  for (const candidate of candidates) {
    const startDate = candidate.dateRange.startDate;
    const endDate = candidate.dateRange.endDate;

    if (targetDate >= startDate && targetDate <= endDate) {
      archiveUrlCache.set(cacheKey, candidate.url);
      return candidate.url;
    }
  }

  // Third try: closest date (within 3 days)
  const closestCandidate = candidates
    .map(c => ({
      ...c,
      daysDiff: Math.abs(Math.floor((c.dateRange.startDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)))
    }))
    .filter(c => c.daysDiff <= 3)
    .sort((a, b) => a.daysDiff - b.daysDiff || b.score - a.score)[0];

  if (closestCandidate) {
    archiveUrlCache.set(cacheKey, closestCandidate.url);
    return closestCandidate.url;
  }

  throw new Error(`No matching weekly horoscope found in archive for week starting ${input.weekStartDate}. Found ${candidates.length} candidates but none matched ${targetDateStr}`);
}

const COMPREHENSIVE_HOROSCOPE_KEYWORDS = [
  'oroscopo', 'previsioni', 'stelle', 'fortuna', 'destino', 'zodiaco', 'segno', 'astrale',
  'amore', 'lavoro', 'salute', 'benessere', 'relazioni', 'carriera',
  'settimana', 'settimanale', 'periodo', 'futuro',
  'energia', 'emozioni', 'sentimenti', 'passione',
  'luna', 'sole', 'pianeti', 'mercurio', 'venere', 'marte', 'giove', 'saturno'
];

export async function scrapeWeeklyHoroscope(input: WeeklyScraperInput): Promise<WeeklyScraperOutput> {
  try {
    const resolvedUrl = await buildWeeklyHoroscopeUrl(input);

    await respectDomainRateLimit(input.domain);

    const scrapeResult = await scrapeWeeklyHoroscopeText(resolvedUrl, input);

    if (!scrapeResult.success || !scrapeResult.text) {
      throw new Error(`Failed to scrape weekly horoscope: ${scrapeResult.error}`);
    }

    // Store the actual URL that was successfully scraped

    const result: WeeklyScraperOutput = {
      sourceId: input.sourceId,
      signSlugIt: input.signSlugIt,
      weekStartDate: input.weekStartDate,
      original_url: resolvedUrl,
      scraped_at: new Date(),
      extracted_text: scrapeResult.text,
    };

    return weeklyScraperOutputSchema.parse(result);
  } catch (error) {
    console.error(`Weekly scraping error for ${input.sourceName} - ${input.signSlugIt}:`, error);
    throw new Error(`Failed to scrape ${input.sourceName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}


// ==================== FANPAGE.IT SPECIFIC FUNCTIONS ====================

/**
 * Fanpage-specific archive resolution
 * Fanpage adds dynamic SEO suffixes to URLs
 */
async function resolveFanpageUrlFromArchive(input: WeeklyScraperInput): Promise<string> {

  // CORRECT archive URL
  const archiveUrl = 'https://www.fanpage.it/stile-e-trend/story/oroscopo/';

  await respectDomainRateLimit(input.domain);

  // Enhanced headers for Fanpage
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'no-cache',
    'Referer': 'https://www.fanpage.it/',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"'
  };

  // Random delay to appear human-like
  const randomDelay = Math.floor(Math.random() * 2000) + 1500;
  await new Promise(resolve => setTimeout(resolve, randomDelay));

  let html: string;
  try {
    const response = await axios.get(archiveUrl, {
      headers,
      timeout: 25000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500
    });


    if (response.status === 403) {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const safariResponse = await axios.get(archiveUrl, {
        headers: {
          ...headers,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
        },
        timeout: 25000,
        maxRedirects: 5
      });


      if (safariResponse.status >= 400) {
        throw new Error(`HTTP ${safariResponse.status}: Still blocked after retry`);
      }

      html = safariResponse.data;
    } else if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } else {
      html = response.data;
    }
  } catch (error) {
    console.error('Fanpage.it - Error fetching archive:', error);
    throw new Error(`Cannot fetch Fanpage archive: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  const $ = cheerio.load(html);
  const targetDate = new Date(input.weekStartDate);
  const targetDateStr = targetDate.toISOString().split('T')[0];
  const candidates: Array<{ url: string; startDate: Date; score: number }> = [];


  // Find all links containing "oroscopo-della-settimana"
  $('a').each((_, elem) => {
    const href = $(elem).attr('href');
    if (!href || !href.includes('oroscopo-della-settimana')) return;


    // Parse date from URL: /attualita/loroscopo-della-settimana-dal-15-al-21-settembre-2025/
    const dateMatch = href.match(/dal-(\d{1,2})-al-(\d{1,2})-(\w+)-(\d{4})/i);

    if (dateMatch) {
      const [_, startDay, endDay, monthName, year] = dateMatch;

      const monthMap: Record<string, number> = {
        'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4,
        'maggio': 5, 'giugno': 6, 'luglio': 7, 'agosto': 8,
        'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12
      };

      const monthNum = monthMap[monthName.toLowerCase()];

      if (monthNum) {
        const startDate = new Date(parseInt(year), monthNum - 1, parseInt(startDay));
        const candidateDateStr = startDate.toISOString().split('T')[0];


        let absoluteUrl = href;
        if (href.startsWith('/')) {
          absoluteUrl = 'https://www.fanpage.it' + href;
        } else if (!href.startsWith('http')) {
          absoluteUrl = 'https://www.fanpage.it/' + href;
        }

        // Calculate score based on date proximity
        const daysDiff = Math.abs(Math.floor((startDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)));

        let score = 100;
        if (daysDiff === 0) {
          score = 100;
        } else if (daysDiff <= 3) {
          score = 90 - (daysDiff * 10);
        } else if (daysDiff <= 7) {
          score = 50 - (daysDiff * 5);
        } else {
          score = 0;
        }

        if (score > 0) {
          candidates.push({ url: absoluteUrl, startDate, score });
        }
      }
    }
  });


  if (candidates.length === 0) {
    throw new Error(`No Fanpage.it weekly horoscope URLs found in archive for week ${targetDateStr}`);
  }

  // Sort by score (highest first)
  candidates.sort((a, b) => b.score - a.score);

  const bestMatch = candidates[0];

  return bestMatch.url;
}

// ==================== END FANPAGE.IT FUNCTIONS ====================

      async function buildWeeklyHoroscopeUrl(input: WeeklyScraperInput): Promise<string> {
        // FANPAGE.IT SPECIFIC: Use archive resolution (URLs have dynamic suffixes)
        const isFanpage = input.domain.toLowerCase().includes('fanpage') || 
                          input.baseUrl.toLowerCase().includes('fanpage') ||
                          input.sourceName.toLowerCase().includes('fanpage');

        if (isFanpage) {
          try {
            const url = await resolveFanpageUrlFromArchive(input);
            return url;
          } catch (error) {
            console.error(`Fanpage.it - Archive resolution failed:`, error);
            throw new Error(`Cannot resolve Fanpage.it URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // ELLE.COM/IT SPECIFIC: Use archive + cross-reference strategy
        const isElle = input.domain.toLowerCase().includes('elle.com') || 
                       input.baseUrl.toLowerCase().includes('elle.com') ||
                       input.sourceName.toLowerCase().includes('elle');

        if (isElle) {
          try {
            const url = await resolveElleUrlFromArchive(input);
            return url;
          } catch (error) {
            console.error(`Elle.com/it - Archive resolution failed:`, error);
            throw new Error(`Cannot resolve Elle.com/it URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }


      // ==================== ELLE.COM/IT SPECIFIC FUNCTIONS ====================

      /**
       * Elle.com/it specific archive resolution
       * Strategy: Find ANY weekly horoscope URL, then extract all sign URLs from its content
       */
      async function resolveElleUrlFromArchive(input: WeeklyScraperInput): Promise<string> {

        const archiveUrl = 'https://www.elle.com/it/oroscopo/';

        await respectDomainRateLimit(input.domain);

        // Enhanced headers for Elle (paywall bypass)
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': 'https://www.elle.com/it/',
          'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          // Clear cookies to bypass paywall
          'Cookie': ''
        };

        // Random delay
        const randomDelay = Math.floor(Math.random() * 2000) + 1500;
        await new Promise(resolve => setTimeout(resolve, randomDelay));

        let html: string;
        try {
          const response = await axios.get(archiveUrl, {
            headers,
            timeout: 25000,
            maxRedirects: 5,
            validateStatus: (status) => status < 500
          });


          if (response.status === 403 || response.status === 429) {
            await new Promise(resolve => setTimeout(resolve, 3000));

            const safariResponse = await axios.get(archiveUrl, {
              headers: {
                ...headers,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
              },
              timeout: 25000,
              maxRedirects: 5
            });


            if (safariResponse.status >= 400) {
              throw new Error(`HTTP ${safariResponse.status}: Still blocked after retry`);
            }

            html = safariResponse.data;
          } else if (response.status >= 400) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          } else {
            html = response.data;
          }
        } catch (error) {
          console.error('Elle.com/it - Error fetching archive:', error);
          throw new Error(`Cannot fetch Elle archive: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        const $ = cheerio.load(html);
        const targetDate = new Date(input.weekStartDate);

        // Adjust to Thursday-based week (Elle weeks start on Thursday)
        const dayOfWeek = targetDate.getDay();
        const daysToThursday = (dayOfWeek >= 4) ? (dayOfWeek - 4) : (dayOfWeek + 3);
        const thursdayDate = new Date(targetDate);
        thursdayDate.setDate(thursdayDate.getDate() - daysToThursday);

        const targetDateStr = thursdayDate.toISOString().split('T')[0];

        const candidates: Array<{ url: string; startDate: Date; score: number }> = [];


        // Find all horoscope links with weekly pattern
        $('a').each((_, elem) => {
          const href = $(elem).attr('href');
          if (!href) return;

          // Match pattern: /oroscopo/a{ID}/oroscopo-{sign}-{dates}-simon-and-the-stars/
          if (!href.includes('/oroscopo/a') || !href.includes('simon-and-the-stars')) return;


          // Parse date from URL: oroscopo-{sign}-16-22-ottobre-2025-simon
          // Or: oroscopo-{sign}-16-al-22-ottobre-2025-simon
          const dateMatch = href.match(/oroscopo-\w+-(\d{1,2})(?:-al)?-(\d{1,2})-(\w+)-(\d{4})/i);

          if (dateMatch) {
            const [_, startDay, endDay, monthName, year] = dateMatch;

            const monthMap: Record<string, number> = {
              'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4,
              'maggio': 5, 'giugno': 6, 'luglio': 7, 'agosto': 8,
              'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12
            };

            const monthNum = monthMap[monthName.toLowerCase()];

            if (monthNum) {
              const startDate = new Date(parseInt(year), monthNum - 1, parseInt(startDay));
              const candidateDateStr = startDate.toISOString().split('T')[0];


              let absoluteUrl = href;
              if (href.startsWith('/')) {
                absoluteUrl = 'https://www.elle.com/it' + href;
              } else if (!href.startsWith('http')) {
                absoluteUrl = 'https://www.elle.com/it/' + href;
              }

              // Calculate score based on date proximity
              const daysDiff = Math.abs(Math.floor((startDate.getTime() - thursdayDate.getTime()) / (1000 * 60 * 60 * 24)));

              let score = 100;
              if (daysDiff === 0) {
                score = 100;
              } else if (daysDiff <= 3) {
                score = 90 - (daysDiff * 10);
              } else if (daysDiff <= 7) {
                score = 50 - (daysDiff * 5);
              } else {
                score = 0;
              }

              if (score > 0) {
                candidates.push({ url: absoluteUrl, startDate, score });
              }
            }
          }
        });


        if (candidates.length === 0) {
          throw new Error(`No Elle.com/it weekly horoscope URLs found in archive for week ${targetDateStr}`);
        }

        // Sort by score (highest first)
        candidates.sort((a, b) => b.score - a.score);

        const bestMatch = candidates[0];

        // Now extract all sign URLs from this page

        await new Promise(resolve => setTimeout(resolve, 2000)); // Delay before second request

        const signUrl = await extractElleSignUrlFromPage(bestMatch.url, input.signSlugIt, headers);

        if (signUrl) {
          return signUrl;
        }

        // If extraction failed, try to construct URL from the pattern
        return bestMatch.url;
      }

      /**
       * Extract target sign URL from an Elle page (which contains links to all signs)
       */
      async function extractElleSignUrlFromPage(
        pageUrl: string, 
        targetSign: string, 
        headers: Record<string, string>
      ): Promise<string | null> {
        try {

          const response = await axios.get(pageUrl, {
            headers: {
              ...headers,
              'Referer': 'https://www.elle.com/it/oroscopo/',
              // Rotate user agent to avoid paywall
              'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
            },
            timeout: 25000,
            maxRedirects: 5
          });

          if (response.status >= 400) {
            console.warn(`Elle.com/it - Got ${response.status} when fetching page for sign extraction`);
            return null;
          }

          const $ = cheerio.load(response.data);

                 const targetSignSlug = SIGN_MAP[targetSign] || targetSign.toLowerCase();


          // Find links in article body that point to other signs
          let foundUrl: string | null = null;

          $('article a, .article-body a, .body-content a, main a, a').each((_, elem) => {
            const href = $(elem).attr('href');
            const linkText = $(elem).text().trim().toLowerCase();

            if (!href) return;

            // Check if URL contains the target sign and is a weekly horoscope URL
            if (href.includes('/oroscopo/a') && 
                href.includes('simon-and-the-stars') &&
                (href.includes(`oroscopo-${targetSignSlug}`) || linkText === targetSign.toLowerCase())) {

              let absoluteUrl = href;
              if (href.startsWith('/')) {
                absoluteUrl = 'https://www.elle.com/it' + href;
              } else if (!href.startsWith('http')) {
                absoluteUrl = 'https://www.elle.com/it/' + href;
              }

              foundUrl = absoluteUrl;
              return false; // Break loop
            }
          });

          return foundUrl;

        } catch (error) {
          console.error('Elle.com/it - Error extracting sign URL from page:', error);
          return null;
        }
      }

      // ==================== END ELLE.COM/IT FUNCTIONS ====================

      // COSMOPOLITAN.COM SPECIFIC: Use archive resolution (article URLs are not pattern-constructable)
      if (input.domain.includes('cosmopolitan.com') || input.baseUrl.includes('cosmopolitan.com')) {
        try {
          const url = await resolveWeeklyUrlFromArchive(input);
          return url;
        } catch (error) {
          console.error(`Cosmopolitan.com - Archive resolution failed:`, error);
          throw new Error(`Cannot resolve Cosmopolitan.com URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // SORRISI.COM SPECIFIC: Try archive strategy first, with proper fallback
      if (input.domain.includes('sorrisi.com') || input.baseUrl.includes('sorrisi.com')) {
        try {
          const archiveUrl = await resolveWeeklyUrlFromArchive(input);
          return archiveUrl;
        } catch (error) {
          console.warn(`Sorrisi.com - Archive resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

          // Fallback to pattern-based construction
          const startDay = input.startDay;
          const endDay = input.endDay;
          const month = input.month;

          // Handle "dall" vs "dal" - use "dall" for days with vowel sounds (1=uno, 8=otto, 11=undici)
          const dayNum = parseInt(startDay);
          const usesDall = dayNum === 1 || dayNum === 8 || dayNum === 11;
          const prefix = usesDall ? 'dall' : 'dal';

          const url = `https://www.sorrisi.com/lifestyle/oroscopo/oroscopo-della-settimana-${prefix}${startDay}-al-${endDay}-${month}/`;
          return url;
        }
      }

      // GAZZETTA.IT SPECIFIC: Use archive strategy and append sign
      if (input.domain.includes('gazzetta.it') || input.baseUrl.includes('gazzetta.it')) {
        try {
          const baseArticleUrl = await resolveWeeklyUrlFromArchive(input);

                  const signSlug = SIGN_MAP[input.signSlugIt] || input.signSlugIt.toLowerCase();

          // Check if URL already has a sign in it
          const signInUrlMatch = baseArticleUrl.match(/\/(ariete|toro|gemelli|cancro|leone|vergine|bilancia|scorpione|sagittario|capricorno|acquario|pesci)\.shtml$/i);

          if (signInUrlMatch) {
            // Replace the existing sign with our target sign
            const finalUrl = baseArticleUrl.replace(/\/(ariete|toro|gemelli|cancro|leone|vergine|bilancia|scorpione|sagittario|capricorno|acquario|pesci)\.shtml$/i, `/${signSlug}.shtml`);
            return finalUrl;
          } 

          // Check if URL ends with .shtml but has no sign
          if (baseArticleUrl.endsWith('.shtml')) {
            // Insert sign before .shtml
            const finalUrl = baseArticleUrl.replace(/\.shtml$/, `/${signSlug}.shtml`);
            return finalUrl;
          }

          // Check if URL ends with a directory (e.g., "tutti-i-segni/")
          if (baseArticleUrl.endsWith('/')) {
            // Append sign.shtml
            const finalUrl = `${baseArticleUrl}${signSlug}.shtml`;
            return finalUrl;
          }

          // Default case: append /sign.shtml
          const finalUrl = `${baseArticleUrl}/${signSlug}.shtml`;
          return finalUrl;

        } catch (error) {
          console.error(`Gazzetta.it - Archive resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          throw new Error(`Cannot construct Gazzetta.it URL: archive resolution failed`);
        }
      }



      // Archive strategy - resolve from archive page    
      if (input.scrapeStrategy === 'archive') {
        return await resolveWeeklyUrlFromArchive(input);
      }

      let url = input.baseUrl + input.urlPattern;
      const signSlug = SIGN_MAP[input.signSlugIt] || input.signSlugIt.toLowerCase();

      // Determine start/end month names from the week range (handles cross-month weeks)
      const weekStart = new Date(input.weekStartDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const MONTH_INDEX_TO_NAME: Record<number, string> = {
        0: 'gennaio', 1: 'febbraio', 2: 'marzo', 3: 'aprile', 4: 'maggio', 5: 'giugno',
        6: 'luglio', 7: 'agosto', 8: 'settembre', 9: 'ottobre', 10: 'novembre', 11: 'dicembre'
      };

      const startMonthName = MONTH_INDEX_TO_NAME[weekStart.getMonth()];
      const endMonthName = MONTH_INDEX_TO_NAME[weekEnd.getMonth()];
      const crossMonth = weekStart.getMonth() !== weekEnd.getMonth();

      // If pattern is compact and week crosses months, expand it to include both month names
      // e.g. "/previsioni-settimana-{start_day}-{end_day}-{month}/" ->
      //      "/previsioni-settimana-{start_day}-{start_month}-{end_day}-{end_month}/"
      // Also handle forms with "-al-" like "dal-{start_day}-al-{end_day}-{month}"
      // This avoids generating "27-02-novembre" instead of "27-ottobre-2-novembre".
      let pattern = input.urlPattern;
      if (crossMonth) {
        // Common explicit patterns
        pattern = pattern.replace(/\{start_day\}[-_\s]*al[-_\s]*\{end_day\}[-_\s]*-\{month\}/g,
                                  '{start_day}-{start_month}-al-{end_day}-{end_month}');
        pattern = pattern.replace(/\{start_day\}[-_\s]*-\s*\{end_day\}[-_\s]*-\{month\}/g,
                                  '{start_day}-{start_month}-{end_day}-{end_month}');
        pattern = pattern.replace(/\{start_day\}[-_\s]*\{end_day\}[-_\s]*-\{month\}/g,
                                  '{start_day}-{start_month}-{end_day}-{end_month}');

        // Generic fallback: if pattern contains the compact tokens but hasn't been expanded,
        // insert {start_month} before the separator between start and end.
        if (pattern.includes('{start_day}') && pattern.includes('{end_day}') && pattern.includes('{month}')
            && !pattern.includes('{start_month}') && !pattern.includes('{end_month}')) {
          pattern = pattern.replace(/\{start_day\}([-\s_]*?(?:al)?[-_\s]*)\{end_day\}([-\s_]*)\{month\}/,
                                    '{start_day}-{start_month}$1{end_day}-{end_month}');
        }
      }

      url = input.baseUrl + pattern;

      // For placeholders that represent the "end" month of the week, prefer endMonth when the week crosses months.
      // Otherwise keep the start month.
      const monthForEnd = crossMonth ? endMonthName : startMonthName;
      const monthForStart = startMonthName;

      // Prepare day formats: unpadded (e.g. "2") and zero-padded (e.g. "02")
      const startDayNumber = String(parseInt(input.startDay, 10));
      const endDayNumber = String(parseInt(input.endDay, 10));
      const startDayPadded = startDayNumber.padStart(2, '0');
      const endDayPadded = endDayNumber.padStart(2, '0');

      // Replace all placeholders - do longer/more specific placeholders first to avoid collisions
      url = url.replace(/{start_month}/g, startMonthName);
      url = url.replace(/{end_month}/g, endMonthName);
      url = url.replace(/{week_end_month}/g, monthForEnd);
      url = url.replace(/{month_name}/g, crossMonth ? `${startMonthName}-${endMonthName}` : startMonthName);

      // Use unpadded day numbers by default (many sites use "2" not "02")
      url = url.replace(/{week_start_day}/g, startDayNumber);
      url = url.replace(/{week_end_day}/g, endDayNumber);
      // {start_day} / {end_day} -> unpadded by default for compatibility with sites like alFemminile
      url = url.replace(/{start_day}/g, startDayNumber);
      url = url.replace(/{end_day}/g, endDayNumber);
      url = url.replace(/{yyyy}/g, input.year);
      url = url.replace(/{year}/g, input.year);
      url = url.replace(/{sign}/g, signSlug);

      // {start_month}/{end_month}/{month}/{mm} fallbacks
      url = url.replace(/{month}/g, crossMonth ? `${startMonthName}-${endMonthName}` : startMonthName);
      // {mm} uses input.month directly: it's already formatted correctly (numeric "05" for
      // Repubblica, Italian name "maggio" for others) by formatWeekUrlParams.
      url = url.replace(/{mm}/g, input.month);

      // Common day placeholders:
      // - {start_day}/{end_day} -> unpadded (2 not 02)
      // - {dd} -> zero-padded start day (legacy)
      // - {dd_end} / {dd_start} -> explicit padded variants (supported if present)
      url = url.replace(/{dd_start}/g, startDayPadded);
      url = url.replace(/{dd_end}/g, endDayPadded);
      url = url.replace(/{dd}/g, startDayPadded);
      url = url.replace(/{d_start}/g, startDayNumber);
      url = url.replace(/{d_end}/g, endDayNumber);

      // Validate URL - ensure no placeholders remain
      if (url.includes('{') || url.includes('}')) {
        throw new Error(`URL contains unreplaced placeholders: ${url}`);
      }

      // Italian elision: "dal 1/8/11" → "dall 1/8/11" (vowel-starting numbers)
      const startDayInt = parseInt(startDayNumber, 10);
      if (startDayInt === 1 || startDayInt === 8 || startDayInt === 11) {
        url = url.replace(/-dal-(\d+)/g, '-dall-$1');
        // Simon and the Stars uses compact form: dall11 (no hyphen after dall)
        if (input.domain.includes('simonandthestars')) {
          url = url.replace(/-dall-(\d+)/g, '-dall$1');
        }
      }
      const endDayInt = parseInt(endDayNumber, 10);
      if (endDayInt === 1 || endDayInt === 8 || endDayInt === 11) {
        url = url.replace(/-al-(\d+)/g, '-all-$1');
        if (input.domain.includes('simonandthestars')) {
          url = url.replace(/-all-(\d+)/g, '-all$1');
        }
      }

      // Validate URL format
      try {
        new URL(url);
      } catch (error) {
        throw new Error(`Invalid URL constructed: ${url}`);
      }

      return url;
    }

async function respectDomainRateLimit(domain: string): Promise<void> {
  const lastRequest = domainLastRequest.get(domain) || 0;
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequest;

  if (timeSinceLastRequest < DOMAIN_DELAY_MS) {
    const delay = DOMAIN_DELAY_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  domainLastRequest.set(domain, Date.now());
}

const USER_AGENTS = [
  // Chrome on Windows (most common)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',

  // Chrome on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

  // Firefox on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',

  // Firefox on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0',

  // Safari on Mac (important for paywall bypass)
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',

  // Edge on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',

  // Edge on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',

  // Chrome on Linux (less common but adds variety)
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

async function fetchHtml(url: string, userAgent: string): Promise<string> {
  try {
    // Validate URL format first
    const urlObj = new URL(url);

    // Pre-flight DNS check with timeout
    try {
      const dns = await import('dns');
      const { promisify } = await import('util');
      const resolve4 = promisify(dns.resolve4);

      await Promise.race([
        resolve4(urlObj.hostname),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DNS timeout')), 2000))
      ]);
    } catch (dnsError) {
      throw new Error(`DNS resolution failed for ${urlObj.hostname}: ${dnsError instanceof Error ? dnsError.message : 'Unknown DNS error'}`);
    }

    // Rotate user agents for reliability
    const selectedUserAgent = userAgent || USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    // Initialize headers
    const headers: Record<string, string> = {
      'User-Agent': selectedUserAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    };

    // Special headers for Fanpage.it
    if (url.includes('fanpage.it')) {
      headers['Referer'] = 'https://www.fanpage.it/stile-e-trend/story/oroscopo/';
      headers['Origin'] = 'https://www.fanpage.it';
      headers['Sec-Fetch-Dest'] = 'document';
      headers['Sec-Fetch-Mode'] = 'navigate';
      headers['Sec-Fetch-Site'] = 'same-origin';
      headers['Sec-Fetch-User'] = '?1';
      headers['Sec-Ch-Ua'] = '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"';
      headers['Sec-Ch-Ua-Mobile'] = '?0';
      headers['Sec-Ch-Ua-Platform'] = '"Windows"';

      // Random delay (1-3 seconds) to appear human-like
      const randomDelay = Math.floor(Math.random() * 2000) + 1000;
      await new Promise(resolve => setTimeout(resolve, randomDelay));
    } 
    // Default random delay for other sources
    else {
      const delay = 1000 + Math.random() * 2000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Prepare axios config
    const axiosConfig: any = {
      headers,
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: (status: number) => status < 500,
    };

    const response = await axios.get(url, axiosConfig);

    // If we get 403 on Fanpage, try with different user agent
    if (response.status === 403 && url.includes('fanpage.it')) {
      headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

      await new Promise(resolve => setTimeout(resolve, 3000));

      const retryResponse = await axios.get(url, {
        headers,
        timeout: 15000,
        maxRedirects: 5,
      });

      return retryResponse.data;
    }

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorCode = error.code || 'UNKNOWN';
      const status = error.response?.status || 'unknown';
      throw new Error(`[${errorCode}] HTTP ${status}: ${error.message} - URL: ${url}`);
    }
    throw error;
  }
}

function scoreHoroscopeContent(content: string, zodiacName: string): number {
  let score = 0;
  const contentLower = content.toLowerCase();

  const horoscopeMatches = (content.match(new RegExp(`\\b(${COMPREHENSIVE_HOROSCOPE_KEYWORDS.join('|')})\\b`, 'gi')) || []).length;
  score += horoscopeMatches * 8;

  if (contentLower.includes(zodiacName.toLowerCase())) {
    score += 25;
  }

  if (content.length > 100) score += 10;
  if (content.length > 200) score += 15;
  if (content.length > 400) score += 20;

  return Math.max(score, 0);
}


async function scrapeWeeklyHoroscopeText(url: string, input: WeeklyScraperInput): Promise<ScrapeResult> {
  try {
    const html = await fetchHtml(url, input.userAgent);
    const $ = cheerio.load(html);

    $('script, style, nav, header, footer, iframe, noscript').remove();

    // Special handling for Cosmopolitan - single article with all signs
    if (url.includes('cosmopolitan.com') && url.includes('/oroscopo-settimana/a')) {

      const signId = SIGN_MAP[input.signSlugIt] || input.signSlugIt.toLowerCase();
      const zodiacSigns = ['ariete', 'toro', 'gemelli', 'cancro', 'leone', 'vergine',
                           'bilancia', 'scorpione', 'sagittario', 'capricorno', 'acquario', 'pesci'];

      let signHeading = $();

      // Strategy 1: h2/h3 with exact sign name text (most common for Cosmo articles)
      $('h2, h3').each((_, el) => {
        const text = $(el).text().trim().toLowerCase();
        if (text === signId) {
          signHeading = $(el);
          return false;
        }
      });

      // Strategy 2: h2/h3 containing sign name as id or class attribute
      if (signHeading.length === 0) {
        $('h2, h3').each((_, el) => {
          const id = $(el).attr('id') || '';
          const cls = $(el).attr('class') || '';
          if (id.toLowerCase() === signId || cls.toLowerCase().includes(signId)) {
            signHeading = $(el);
            return false;
          }
        });
      }

      if (signHeading.length > 0) {
        let extractedContent = '';
        let pCount = 0;

        const addParagraph = (el: any) => {
          const text = $(el).text().trim();
          const lower = text.toLowerCase();
          if (text.length < 20) return;
          if (/^(leggi anche|pubblicità|advertisement|condividi|scopri|continua)/i.test(lower)) return;
          extractedContent += text + '\n\n';
          pCount++;
        };

        let current = signHeading.next();
        while (current.length > 0) {
          const tag = (current.prop('tagName') as string || '').toUpperCase();
          if (['H2', 'H3'].includes(tag)) {
            const headingText = current.text().trim().toLowerCase();
            if (zodiacSigns.some(s => headingText === s)) break;
          }
          if (tag === 'P') addParagraph(current[0]);
          else if (['DIV', 'SECTION', 'ARTICLE'].includes(tag)) {
            current.find('p').each((_, p) => addParagraph(p));
          }
          current = current.next();
        }

        if (extractedContent.trim().length > 50) {
          return { success: true, text: extractedContent.trim().substring(0, 3500), url };
        }
      }

      // Fallback: body text search between sign sections
      const bodyText = ($('body').length > 0 ? $('body') : $('html')).text();
      const signIdx = bodyText.toLowerCase().indexOf(signId);
      if (signIdx !== -1) {
        let nextIdx = bodyText.length;
        for (const s of zodiacSigns) {
          if (s === signId) continue;
          const i = bodyText.toLowerCase().indexOf(s, signIdx + signId.length);
          if (i !== -1 && i < nextIdx) nextIdx = i;
        }
        const snippet = bodyText.substring(signIdx, nextIdx).trim();
        if (snippet.length > 100) {
          return { success: true, text: snippet.substring(0, 3500), url };
        }
      }

      return { success: false, error: `Could not extract content for ${input.signSlugIt} from Cosmopolitan page` };
    }

    // Special handling for alFemminile - single article with all signs separated by <h2><b>SIGN: oroscopo settimanale</b></h2>
    if (url.includes('alfemminile.com')) {

      const signId = (SIGN_MAP[input.signSlugIt] || input.signSlugIt).toLowerCase();
      const zodiacSigns = ['ariete', 'toro', 'gemelli', 'cancro', 'leone', 'vergine',
                           'bilancia', 'scorpione', 'sagittario', 'capricorno', 'acquario', 'pesci'];

      // Find <h2> whose text starts with SIGNNAME: (case-insensitive)
      let signHeading = $();
      $('h2').each((_, el) => {
        const text = $(el).text().trim().toLowerCase();
        // Matches "ariete: oroscopo settimanale" or "ariete:" at start
        if (text.startsWith(signId + ':')) {
          signHeading = $(el);
          return false;
        }
      });

      if (signHeading.length > 0) {
        let extractedContent = '';

        let current = signHeading.next();
        while (current.length > 0) {
          const tag = (current.prop('tagName') as string || '').toUpperCase();
          // Stop at the next sign's <h2>
          if (tag === 'H2') {
            const headingText = current.text().trim().toLowerCase();
            if (zodiacSigns.some(s => headingText.startsWith(s + ':'))) break;
          }
          // Skip <ul> (star ratings block)
          if (tag === 'P') {
            const text = current.text().trim();
            if (text.length >= 20) extractedContent += text + '\n\n';
          } else if (['DIV', 'SECTION', 'ARTICLE'].includes(tag)) {
            current.find('p').each((_, p) => {
              const text = $(p).text().trim();
              if (text.length >= 20) extractedContent += text + '\n\n';
            });
          }
          current = current.next();
        }

        if (extractedContent.trim().length > 50) {
          return { success: true, text: extractedContent.trim().substring(0, 3500), url };
        }
      }

      return { success: false, error: `Could not extract content for ${input.signSlugIt} from alFemminile page` };
    }

    // Special handling for Marie Claire - single page with all signs
    if (url.includes('marieclaire.it')) {

           const signId = SIGN_MAP[input.signSlugIt] || input.signSlugIt.toLowerCase();
      const zodiacSigns = ['ariete', 'toro', 'gemelli', 'cancro', 'leone', 'vergine',
                           'bilancia', 'scorpione', 'sagittario', 'capricorno', 'acquario', 'pesci'];

      // Log all H2 elements for debugging
      $('h2').each((i, h2) => {
        const $h2 = $(h2);
        const id = $h2.attr('id');
        const classes = $h2.attr('class');
        const text = $h2.text().trim();
      });

      // Strategy 0: Extract from Next.js __NEXT_DATA__ JSON using raw HTML
      // (scripts are stripped at line 1478, so we must use the raw html string here)
      const nextDataRawMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
      if (nextDataRawMatch) {
        try {
          const nextData = JSON.parse(nextDataRawMatch[1]);
          const pageProps = nextData?.props?.pageProps;
          if (pageProps) {
          }
          const candidateBodies = [
            pageProps?.bodyDom,
            pageProps?.introductoryTextDom,
            pageProps?.article?.body,
            pageProps?.data?.body,
            pageProps?.post?.body,
            pageProps?.content,
          ].filter((v): v is string => typeof v === 'string' && v.length > 100);

          for (const bodyHtml of candidateBodies) {
            const $inner = cheerio.load(bodyHtml);
            let innerContent = '';
            let innerPCount = 0;
            let foundHeading = false;

            $inner('h2').each((_, h2) => {
              if (foundHeading) return;
              const text = $inner(h2).text().trim().toLowerCase();
              if (text !== input.signSlugIt.toLowerCase()) return;

              foundHeading = true;

              let current = $inner(h2).next();
              while (current.length > 0) {
                const tag = (current.prop('tagName') as string || '').toUpperCase();
                if (tag === 'H2') break;
                if (tag === 'P') {
                  const t = current.text().trim();
                  if (t.length > 20) { innerContent += t + '\n\n'; innerPCount++; }
                } else if (['DIV', 'SECTION', 'ARTICLE'].includes(tag)) {
                  current.find('p').each((_, p) => {
                    const t = $inner(p).text().trim();
                    if (t.length > 20) { innerContent += t + '\n\n'; innerPCount++; }
                  });
                }
                current = current.next();
              }
            });

            if (innerContent.trim().length > 50) {
              return { success: true, text: innerContent.trim().substring(0, 3500), url };
            }
          }

          if (candidateBodies.length === 0) {
          } else {
          }
        } catch (e) {
        }
      } else {
        // Diagnostic: log raw HTML around the sign heading
        const signLower = input.signSlugIt.toLowerCase();
        const rawIdx = html.toLowerCase().indexOf(`>${signLower}<`);
        if (rawIdx >= 0) {
        }
      }

      let signHeading = $();
      let extractedContent = '';

      // Strategy 1: Find h2 with id attribute matching sign (e.g., <h2 id="toro">)
      signHeading = $(`h2#${signId}`).first();
      if (signHeading.length > 0) {
      }

      // Strategy 2: Find h2 with exact sign name in text or strong tag
      if (signHeading.length === 0) {
        $('h2').each((_, h2) => {
          const $h2 = $(h2);
          const h2Text = $h2.text().trim().toLowerCase();
          const strongText = $h2.find('strong').text().trim().toLowerCase();
          const targetSign = input.signSlugIt.toLowerCase();

          if (h2Text === targetSign || strongText === targetSign) {
            signHeading = $h2;
            return false; // Break loop
          }
        });
      }

      // Strategy 3: Pattern matching with variations (handle capitalization, etc.)
      if (signHeading.length === 0) {
        const patterns = [
          new RegExp(`^${input.signSlugIt}$`, 'i'),
          new RegExp(`^\\s*${input.signSlugIt}\\s*$`, 'i'),
          new RegExp(`^\\*\\*${input.signSlugIt}\\*\\*$`, 'i')
        ];

        $('h2, h3').each((_, heading) => {
          const $heading = $(heading);
          const headingText = $heading.text().trim();

          if (patterns.some(p => p.test(headingText))) {
            signHeading = $heading;
            return false;
          }
        });
      }

      // If we found a heading, extract content
      if (signHeading.length > 0) {
        let paragraphCount = 0;

        const extractParagraph = (p: any) => {
          const text = $(p).text().trim();
          const textLower = text.toLowerCase();
          const isNoise = textLower.startsWith('leggi anche') ||
                         textLower.startsWith('advertisement') ||
                         textLower.startsWith('pubblicità') ||
                         textLower.startsWith('scopri') ||
                         textLower.startsWith('continua') ||
                         textLower.startsWith('condividi') ||
                         textLower.includes('pubblicità - continua') ||
                         /^la tip karmica/i.test(textLower) ||
                         /^\[.*\]$/.test(textLower) ||
                         text.length < 20;
          if (!isNoise) {
            extractedContent += text + '\n\n';
            paragraphCount++;
          }
        };

        // Walk siblings of the sign H2; also descend into div/section wrappers
        // (handles both flat: H2,P,P,H2 and wrapped: H2,<div><P></div>,H2 structures)
        let currentElement = signHeading.next();
        while (currentElement.length > 0) {
          const tagName = (currentElement.prop('tagName') as string || '').toUpperCase();

          if (tagName === 'H2' || tagName === 'H3') {
            const headingText = currentElement.text().trim().toLowerCase();
            if (zodiacSigns.some(sign => headingText === sign || headingText.includes(sign))) {
              break;
            }
          }

          if (tagName === 'P') {
            extractParagraph(currentElement[0]);
          } else if (['DIV', 'SECTION', 'ARTICLE'].includes(tagName)) {
            // Descend into wrapper elements to find nested <p>
            currentElement.find('p').each((_, p) => extractParagraph(p));
          }

          currentElement = currentElement.next();
        }

        if (extractedContent.trim().length > 50) {
          return {
            success: true,
            text: extractedContent.trim().substring(0, 3500),
            url: url
          };
        }

        // Parent-level traversal: H2 may be wrapped in a container div
        // Try siblings of the H2's parent element
        let $pSibling = signHeading.parent().next();
        while ($pSibling.length > 0) {
          const pTag = ($pSibling.prop('tagName') as string || '').toUpperCase();
          // Stop if we hit another zodiac sign (either as H2 or nested H2)
          if (['H2', 'H3'].includes(pTag) && zodiacSigns.some(s => $pSibling.text().trim().toLowerCase() === s)) break;
          const nestedH2Text = $pSibling.find('h2').first().text().trim().toLowerCase();
          if (nestedH2Text && zodiacSigns.some(s => nestedH2Text === s)) break;
          if (pTag === 'P') extractParagraph($pSibling[0]);
          else $pSibling.find('p').each((_, p) => extractParagraph(p));
          $pSibling = $pSibling.next();
        }

        if (extractedContent.trim().length > 50) {
          return {
            success: true,
            text: extractedContent.trim().substring(0, 3500),
            url: url
          };
        }
      }

      // Advanced fallback: DOM traversal with context awareness

      // Use $.root() text as fallback in case <body> is absent in SSR/Next.js HTML
      const allText = ($('body').length > 0 ? $('body') : $('html')).text();
      const signRegex = new RegExp(`\\b${input.signSlugIt}\\b`, 'gi');
      const matches = Array.from(allText.matchAll(signRegex));


      if (matches.length > 0) {
        // Find the main content area
        const contentSelectors = ['article', 'main', '[class*="article"]', '[class*="content"]', '.body'];

        for (const selector of contentSelectors) {
          const $content = $(selector).first();
          if ($content.length === 0) continue;


          // Find all elements containing the sign name
          const $allElements = $content.find('*').filter((_, el) => {
            const text = $(el).text();
            return signRegex.test(text);
          });


              // Try to find a heading-like element
              for (let i = 0; i < $allElements.length; i++) {
                const $el = $($allElements[i]);
                const tagName = $el.prop('tagName') as string | undefined;
                const elText = $el.text().trim();

                // Skip if tagName is undefined
                if (!tagName) continue;

                // Is this a heading with just the sign name?
                if (['H2', 'H3', 'H4', 'STRONG', 'B'].includes(tagName) &&
                    elText.toLowerCase() === input.signSlugIt.toLowerCase()) {


                  // Extract following paragraphs
                  let $next = $el.parent().next();
                  let content = '';
                  let pCount = 0;

              while ($next.length > 0 && pCount < 10) {
                if ($next.is('p')) {
                  const pText = $next.text().trim();
                  if (pText.length > 20 && !pText.toLowerCase().startsWith('leggi anche')) {
                    content += pText + '\n\n';
                    pCount++;
                  }
                }

                // Stop at next sign
                const nextText = $next.text().toLowerCase();
                if (zodiacSigns.some(sign => nextText === sign)) {
                  break;
                }

                $next = $next.next();
              }

              if (content.trim().length > 50) {
                return {
                  success: true,
                  text: content.trim().substring(0, 3500),
                  url: url
                };
              }
            }
          }
        }
      }

      return {
        success: false,
        error: `Could not extract content for ${input.signSlugIt} from Marie Claire page`
      };
    }

    // Special handling for Repubblica - single page with all signs
    if (url.includes('repubblica.it')) {

      const zodiacSigns = ['ariete', 'toro', 'gemelli', 'cancro', 'leone', 'vergine',
                           'bilancia', 'scorpione', 'sagittario', 'capricorno', 'acquario', 'pesci'];

      // Find the H2 heading that exactly matches the sign name
      let signHeading = $();
      $('h2').each((_, h2) => {
        const h2Text = $(h2).text().trim();
        // Exact match (case-insensitive)
        if (h2Text.toLowerCase() === input.signSlugIt.toLowerCase()) {
          signHeading = $(h2);
          return false; // Break the loop

        }
      });

      if (signHeading.length > 0) {
        let extractedContent = '';
        let currentElement = signHeading.next();

        // Extract all content until the next zodiac sign H2 or end of content
        while (currentElement.length > 0) {
          const tagName = currentElement.prop('tagName');

          // Stop if we hit another H2 with a zodiac sign name
          if (tagName === 'H2') {
            const nextH2Text = currentElement.text().trim().toLowerCase();
            if (zodiacSigns.some(sign => nextH2Text === sign)) {
              break;
            }
          }

          // Extract text from paragraphs
          if (currentElement.is('p')) {
            const text = currentElement.text().trim();
            // Filter out navigation/metadata text
            if (text.length > 0 &&
                !text.match(/^(pubblicato|condividi|leggi anche|share|ti potrebbe piacere|iscriviti)/i) &&
                !text.match(/^(musica:|[\d]{2}\/[\d]{2}\/[\d]{4})/i)) {
              extractedContent += text + '\n\n';
            }
          }

          currentElement = currentElement.next();
        }

        if (extractedContent.trim().length > 50) {
          return {
            success: true,
            text: extractedContent.trim().substring(0, 3500),
            url: url
          };
        } else {
        }
      } else {
      }

      // Fallback: Search entire page for the sign name and extract surrounding content
      const bodyText = $('body').text();
      const signIndex = bodyText.toLowerCase().indexOf(input.signSlugIt.toLowerCase());

      if (signIndex !== -1) {
        // Find the next zodiac sign after this one
        let nextSignIndex = bodyText.length;
        for (const sign of zodiacSigns) {
          if (sign.toLowerCase() === input.signSlugIt.toLowerCase()) continue;
          const nextIndex = bodyText.toLowerCase().indexOf(sign.toLowerCase(), signIndex + input.signSlugIt.length);
          if (nextIndex !== -1 && nextIndex < nextSignIndex) {
            nextSignIndex = nextIndex;
          }
        }

        const snippet = bodyText.substring(signIndex, nextSignIndex).trim();
        if (snippet.length > 100) {
          return {
            success: true,
            text: snippet.substring(0, 3500),
            url: url
          };
        }
      }

      return {
        success: false,
        error: `Could not extract content for ${input.signSlugIt} from Repubblica weekly page`
      };
    } // <-- CHIUSURA REPUBBLICA

    // CODICE PER FANPAGE
    // Special handling for Fanpage.it - single page with all signs
    if (url.includes('fanpage.it')) {

      const zodiacSigns = ['ariete', 'toro', 'gemelli', 'cancro', 'leone', 'vergine',
                           'bilancia', 'scorpione', 'sagittario', 'capricorno', 'acquario', 'pesci'];

      // Log structure

      let signHeading = $();
      let extractedContent = '';

      // Strategy 1: Try H3 headings (most likely for Fanpage)
      $('h3').each((_, h3) => {
        const $h3 = $(h3);
        const h3Text = $h3.text().trim().toLowerCase();

        // Check for exact match or "Oroscopo [sign]" pattern
        if (h3Text === input.signSlugIt.toLowerCase() || 
            h3Text === `oroscopo ${input.signSlugIt.toLowerCase()}` ||
            h3Text.includes(input.signSlugIt.toLowerCase())) {
          signHeading = $h3;
          return false; // Break loop
        }
      });

      // Strategy 2: Try H4 headings
      if (signHeading.length === 0) {
        $('h4').each((_, h4) => {
          const $h4 = $(h4);
          const h4Text = $h4.text().trim().toLowerCase();

          if (h4Text === input.signSlugIt.toLowerCase() || 
              h4Text === `oroscopo ${input.signSlugIt.toLowerCase()}` ||
              h4Text.includes(input.signSlugIt.toLowerCase())) {
            signHeading = $h4;
            return false;
          }
        });
      }

      // Strategy 3: Try STRONG tags
      if (signHeading.length === 0) {
        $('strong, b').each((_, elem) => {
          const $elem = $(elem);
          const text = $elem.text().trim().toLowerCase();

          // Must be a short text (likely a heading) and match sign name
          if (text.length < 50 && 
              (text === input.signSlugIt.toLowerCase() || 
               text === `oroscopo ${input.signSlugIt.toLowerCase()}` ||
               text.includes(input.signSlugIt.toLowerCase()))) {
            signHeading = $elem;
            return false;
          }
        });
      }

      // If we found a heading, extract content
      if (signHeading.length > 0) {
        let currentElement = signHeading.parent();
        let paragraphCount = 0;
        let searchDepth = 0;
        const maxDepth = 20;

        // Start from the parent and look for siblings
        while (currentElement.length > 0 && searchDepth < maxDepth) {
          searchDepth++;
          currentElement = currentElement.next();

          if (currentElement.length === 0) break;

          const tagName = currentElement.prop('tagName');

          // Stop at next zodiac sign heading
          if (tagName === 'H2' || tagName === 'H3' || tagName === 'H4') {
            const headingText = currentElement.text().trim().toLowerCase();
            if (zodiacSigns.some(sign => headingText.includes(sign) && !headingText.includes(input.signSlugIt.toLowerCase()))) {
              break;
            }
          }

          // Check for strong/bold tags that might be next sign
          const strongText = currentElement.find('strong, b').first().text().trim().toLowerCase();
          if (strongText.length < 50 && zodiacSigns.some(sign => strongText.includes(sign) && !strongText.includes(input.signSlugIt.toLowerCase()))) {
            break;
          }

          // Extract paragraph content
          if (currentElement.is('p') || currentElement.find('p').length > 0) {
            const paragraphs = currentElement.is('p') ? currentElement : currentElement.find('p');

            paragraphs.each((_, p) => {
              const text = $(p).text().trim();
              const textLower = text.toLowerCase();

              // Filter out noise
              const isNoise = textLower.startsWith('leggi anche') ||
                             textLower.startsWith('advertisement') ||
                             textLower.startsWith('pubblicità') ||
                             textLower.startsWith('scopri') ||
                             textLower.startsWith('condividi') ||
                             textLower.includes('cookie') ||
                             textLower.match(/^\[.*\]$/) ||
                             text.length < 20;

              if (!isNoise) {
                extractedContent += text + '\n\n';
                paragraphCount++;
              }
            });
          }
        }

        if (extractedContent.trim().length > 50) {
          return {
            success: true,
            text: extractedContent.trim().substring(0, 3500),
            url: url
          };
        }
      }

      // Fallback: Search body text for sign name

      const bodyText = $('body').text();
      const signPatterns = [
        new RegExp(`\\b${input.signSlugIt}\\b[\\s\\S]{100,1500}`, 'gi'),
        new RegExp(`Oroscopo\\s+${input.signSlugIt}[\\s\\S]{100,1500}`, 'gi'),
      ];

      for (const pattern of signPatterns) {
        const matches = bodyText.match(pattern);
        if (matches && matches[0]) {
          let content = matches[0];

          // Try to find where the next sign starts
          for (const otherSign of zodiacSigns) {
            if (otherSign.toLowerCase() === input.signSlugIt.toLowerCase()) continue;

            const nextSignIndex = content.toLowerCase().lastIndexOf(otherSign);
            if (nextSignIndex > 100) {
              content = content.substring(0, nextSignIndex);
            }
          }

          // Clean up
          content = content
            .replace(/\s+/g, ' ')
            .replace(/leggi anche.{0,100}/gi, '')
            .replace(/pubblicità.{0,50}/gi, '')
            .trim();

          if (content.length > 100) {
            return {
              success: true,
              text: content.substring(0, 3500),
              url: url
            };
          }
        }
      }

      return {
        success: false,
        error: `Could not extract weekly content for ${input.signSlugIt} from Fanpage.it page`
      };
    }
    // FINE CODICE FANPAGE

    // Special handling for OnlyOroscopo - single page with weekly content
    if (url.includes('onlyoroscopo.it') || url.includes('onlyoroscopo.com')) {

      let extractedText = '';

      // STRATEGIA PRIMARIA: Widget con data-id specifico e drop-cap
      // Questo è l'identificatore più affidabile per il testo dell'oroscopo
      const primaryWidget = $('[data-id="3087e79c"].elementor-drop-cap-yes');

      if (primaryWidget.length > 0) {

        const widgetContainer = primaryWidget.find('.elementor-widget-container').first();

        if (widgetContainer.length > 0) {
          let text = widgetContainer.text().trim();

          // Normalizza spazi
          text = text.replace(/\s+/g, ' ').trim();

          // Rimuovi tutto dopo marcatori di fine contenuto
          const stopPhrases = [
            'Parola del giorno',
            'Parola della settimana', 
            'parola del giorno',
            'parola della settimana',
            'Affinità Settimanali',
            'Affinità Giornaliere'
          ];

          for (const phrase of stopPhrases) {
            const stopIndex = text.toLowerCase().indexOf(phrase.toLowerCase());
            if (stopIndex !== -1) {
              text = text.substring(0, stopIndex).trim();
              break;
            }
          }

          if (text.length >= 150) {
            extractedText = text;
          }
        }
      }

      // STRATEGIA SECONDARIA: Solo data-id (senza drop-cap check)
      if (!extractedText || extractedText.length < 150) {

        const secondaryWidget = $('[data-id="3087e79c"]');
        if (secondaryWidget.length > 0) {
          const container = secondaryWidget.find('.elementor-widget-container').first();
          if (container.length > 0) {
            let text = container.text().trim().replace(/\s+/g, ' ');

            // Rimuovi marcatori
            const stopPhrases = ['Parola del giorno', 'Parola della settimana', 'Affinità'];
            for (const phrase of stopPhrases) {
              const stopIndex = text.toLowerCase().indexOf(phrase.toLowerCase());
              if (stopIndex !== -1) {
                text = text.substring(0, stopIndex).trim();
                break;
              }
            }

            if (text.length >= 150) {
              extractedText = text;
            }
          }
        }
      }

      // STRATEGIA TERZIARIA: Widget drop-cap in sezioni pulite
      if (!extractedText || extractedText.length < 150) {

        $('section.elementor-section').each((_, section) => {
          const $section = $(section);

          // Salta sezioni con elementi di navigazione
          const hasRatings = $section.find('.elementor-star-rating').length > 0;
          const hasButtons = $section.find('.elementor-button').length > 0;
          const hasPosts = $section.find('.elementor-posts').length > 0;
          const hasAffinityHeading = $section.find('.elementor-heading-title').text().toLowerCase().includes('affinità');

          if (hasRatings || hasButtons || hasPosts || hasAffinityHeading) {
            return true; // continue
          }

          // Cerca text-editor con drop-cap in questa sezione pulita
          const textEditor = $section.find('.elementor-widget-text-editor.elementor-drop-cap-yes');

          if (textEditor.length > 0) {
            const container = textEditor.find('.elementor-widget-container').first();
            let text = container.text().trim().replace(/\s+/g, ' ');

            // Rimuovi marcatori
            const stopPhrases = ['Parola del giorno', 'Parola della settimana', 'Affinità'];
            for (const phrase of stopPhrases) {
              const stopIndex = text.toLowerCase().indexOf(phrase.toLowerCase());
              if (stopIndex !== -1) {
                text = text.substring(0, stopIndex).trim();
                break;
              }
            }

            // Verifica che non contenga testi di navigazione
            const navigationPattern = /GIORNALIERO|SETTIMANALE|MENSILE|ANNUALE|Cambia Segno|Curiosità/i;

            if (!navigationPattern.test(text) && text.length >= 150) {
              extractedText = text;
              return false; // break
            }
          }
        });
      }

      // STRATEGIA QUATERNARIA: Widget text-editor generici con validazione
      if (!extractedText || extractedText.length < 150) {

        $('.elementor-widget-text-editor').each((index, elem) => {
          const $elem = $(elem);

          // Salta widget in sezioni problematiche
          const $parentSection = $elem.closest('section');

          if ($parentSection.find('.elementor-star-rating').length > 0 ||
              $parentSection.find('.elementor-button').length > 0 ||
              $parentSection.find('.elementor-posts').length > 0) {
            return true; // continue
          }

          const container = $elem.find('.elementor-widget-container').first();
          let text = container.text().trim().replace(/\s+/g, ' ');

          // Skip testi brevi
          if (text.length < 150) return true;

          // Skip testi con parole chiave di navigazione
          const skipPatterns = [
            /Cambia Segno/i,
            /Curiosità sull'/i,
            /Leggi Tutto/i,
            /Tutto sul mio segno/i,
            /^(SETTIMANALE|MENSILE|ANNUALE|GIORNALIERO)$/i,
            /Affinità (Settimanali|Giornaliere)/i
          ];

          const shouldSkip = skipPatterns.some(pattern => pattern.test(text));
          if (shouldSkip) return true;

          // Rimuovi contenuto dopo marcatori
          const stopPhrases = ['Parola del giorno', 'Parola della settimana', 'Affinità'];
          for (const phrase of stopPhrases) {
            const stopIndex = text.toLowerCase().indexOf(phrase.toLowerCase());
            if (stopIndex !== -1) {
              text = text.substring(0, stopIndex).trim();
              break;
            }
          }

          // Verifica che contenga parole chiave tipiche dell'oroscopo SETTIMANALE
          const weeklyKeywords = [
            'settimana', 'settimanale', 'giorni', 'periodo',
            'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica',
            'luna', 'energie', 'momento', 'relazioni', 'sentimenti',
            'transiti', 'aspetti', 'pianeti', 'favorisce', 'promette',
            'emozioni', 'profond', 'intens', 'armonia', 'equilibrio'
          ];

          const hasMultipleKeywords = weeklyKeywords.filter(keyword =>
            text.toLowerCase().includes(keyword)
          ).length >= 3;

          if (text.length >= 200 && hasMultipleKeywords) {
            extractedText = text;
            return false; // break
          }
        });
      }

      // Validazione finale
      if (!extractedText || extractedText.length < 150) {

        $('.elementor-widget-text-editor').each((i, elem) => {
          const text = $(elem).find('.elementor-widget-container').text().trim();
          const dataId = $(elem).attr('data-id');
          const hasDropCap = $(elem).hasClass('elementor-drop-cap-yes');

        });

        return {
          success: false,
          error: `No substantial weekly content found for ${input.signSlugIt} on OnlyOroscopo`
        };
      }

      // Calcola score per validazione qualità
      const score = scoreHoroscopeContent(extractedText, input.signSlugIt);

      // Pulizia finale del testo
      extractedText = extractedText
        .replace(/\u00a0/g, ' ')     // non-breaking space
        .replace(/\u200b/g, '')       // zero-width space
        .replace(/\u2028/g, ' ')      // line separator
        .replace(/\u2029/g, ' ')      // paragraph separator
        .replace(/\s{2,}/g, ' ')      // spazi multipli
        .trim();

      // Verifica finale: il testo deve contenere almeno 2 frasi complete
      const sentenceCount = (extractedText.match(/[.!?]+/g) || []).length;
      if (sentenceCount < 2) {
      }

      // Verifica che contenga riferimenti settimanali
      const hasWeeklyReferences = /settimana|settimanale|giorni|periodo|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica/i.test(extractedText);

      if (!hasWeeklyReferences) {
      }

      return {
        success: true,
        text: extractedText.substring(0, 3500),
        url: url
      };
    }

        // Generic extraction for other sources
    let bestContent = '';
    let highestScore = 0;

    const selectors = [
      'article p',
      '.article-content p',
      '.content p',
      'main p',
      '.horoscope-content p',
      '.text p',
      'p'
    ];

    for (const selector of selectors) {
      const paragraphs = $(selector);
      const combinedText = paragraphs
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(text => text.length > 20)
        .join('\n\n');

      if (combinedText.length > 50) {
        const score = scoreHoroscopeContent(combinedText, input.signSlugIt);

        if (score > highestScore) {
          highestScore = score;
          bestContent = combinedText;
        }
      }
    }

    if (!bestContent || highestScore < 20) {
      const bodyText = $('body').text()
        .replace(/\s+/g, ' ')
        .trim();

      if (bodyText.length > 100) {
        const score = scoreHoroscopeContent(bodyText, input.signSlugIt);
        if (score > highestScore) {
          bestContent = bodyText.substring(0, 3500);
        }
      }
    }

    if (!bestContent || bestContent.length < 50) {
      return {
        success: false,
        error: `No sufficient weekly horoscope content found for ${input.signSlugIt}`
      };
    }

    return {
      success: true,
      text: bestContent.substring(0, 3500),
      url: url
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown weekly scraping error'
    };
  }
}

export async function scrapeWeeklyWithRetry(input: WeeklyScraperInput, maxRetries: number = 3): Promise<WeeklyScraperOutput> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await scrapeWeeklyHoroscope(input);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      if (attempt < maxRetries) {
        const delay = attempt * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Failed to scrape weekly horoscope');
}
