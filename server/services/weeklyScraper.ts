import axios from 'axios';
import * as cheerio from 'cheerio';
import { WeeklyScraperInput, WeeklyScraperOutput, weeklyScraperOutputSchema } from '@shared/schema';

const domainLastRequest = new Map<string, number>();
const DOMAIN_DELAY_MS = 2000;

const archiveUrlCache = new Map<string, string>();

const ITALIAN_MONTHS: Record<string, number> = {
  'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4, 'maggio': 5, 'giugno': 6,
  'luglio': 7, 'agosto': 8, 'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12
};

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

async function findFanpageWeeklyArticleUrl(archiveUrl: string, weekStartDate: string): Promise<string | null> {
  try {
    console.log('Fanpage.it - Searching archive for weekly horoscope...');

    const response = await axios.get(archiveUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.fanpage.it/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9',
      },
      timeout: 15000
    });

    const html = response.data;
    const startDate = new Date(weekStartDate);

    // Calcola la data di fine (6 giorni dopo)
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const startDay = startDate.getDate();
    const endDay = endDate.getDate();
    const year = startDate.getFullYear();

    // Ottieni i nomi dei mesi
    const monthNames = Object.keys(ITALIAN_MONTHS);
    const startMonthName = monthNames[startDate.getMonth()];
    const endMonthName = monthNames[endDate.getMonth()];

    // Pattern: loroscopo-della-settimana-dal-{day}-al-{day}-{month}-{year}
    const patterns: (string | null)[] = [
      // Pattern 1: Exact match
      `loroscopo-della-settimana-dal-${startDay}-al-${endDay}-${startMonthName}-${year}`,
      // Pattern 2: Con apostrofo
      `l-oroscopo-della-settimana-dal-${startDay}-al-${endDay}-${startMonthName}-${year}`,
      // Pattern 3: Senza anno
      `loroscopo-della-settimana-dal-${startDay}-al-${endDay}-${startMonthName}`,
      // Pattern 4: Con mese della data di fine (se diverso)
      startMonthName !== endMonthName ? `loroscopo-della-settimana-dal-${startDay}-${startMonthName}-al-${endDay}-${endMonthName}-${year}` : null,
    ];

    console.log(`Fanpage.it - Looking for patterns:`, patterns.filter(Boolean));

    for (const pattern of patterns) {
      if (!pattern) continue;

      const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const urlPattern = new RegExp(`href=["']([^"']*${escapedPattern}[^"']*)["']`, 'gi');
      let match;

      while ((match = urlPattern.exec(html)) !== null) {
        let foundUrl = match[1];

        if (foundUrl.startsWith('/')) {
          foundUrl = 'https://www.fanpage.it' + foundUrl;
        }

        if (foundUrl.includes('attualita') && foundUrl.includes('oroscopo')) {
          console.log(`Fanpage.it - Found weekly article URL: ${foundUrl}`);
          return foundUrl;
        }
      }
    }

    // Fallback: cerca qualsiasi URL con "settimana" e le date
    const fallbackPattern = new RegExp(
      `href=["']([^"']*attualita[^"']*oroscopo[^"']*settimana[^"']*${startDay}[^"']*${endDay}[^"']*)["']`,
      'gi'
    );

    let match;
    while ((match = fallbackPattern.exec(html)) !== null) {
      let foundUrl = match[1];

      if (foundUrl.startsWith('/')) {
        foundUrl = 'https://www.fanpage.it' + foundUrl;
      }

      console.log(`Fanpage.it - Found weekly article URL (fallback): ${foundUrl}`);
      return foundUrl;
    }

    console.log('Fanpage.it - No weekly article found in archive page');
    return null;
  } catch (error) {
    console.error('Fanpage.it - Error searching archive:', error);
    return null;
  }
}

async function resolveWeeklyUrlFromArchive(input: WeeklyScraperInput): Promise<string> {
  const cacheKey = `${input.sourceId}-${input.weekStartDate}`;

  const cached = archiveUrlCache.get(cacheKey);
  if (cached) {
    console.log(`Using cached archive URL for ${input.sourceName}`);
    return cached;
  }

  // Determine the actual archive URL (listing page)
  let archiveUrl: string;

  if (input.domain.includes('fanpage.it')) {
    console.log('Fanpage.it - Using archive page to find weekly horoscope');
    archiveUrl = 'https://www.fanpage.it/stile-e-trend/story/oroscopo/';

    console.log(`Fetching Fanpage archive page: ${archiveUrl}`);
    await respectDomainRateLimit(input.domain);

    const articleUrl = await findFanpageWeeklyArticleUrl(archiveUrl, input.weekStartDate);

    if (articleUrl) {
      console.log(`✓ Found Fanpage weekly article: ${articleUrl}`);
      archiveUrlCache.set(cacheKey, articleUrl);
      return articleUrl;
    } else {
      throw new Error(`No matching weekly horoscope found in Fanpage archive for week starting ${input.weekStartDate}`);
    }
  }


  if (input.domain.includes('sorrisi.com')) {
    // For Sorrisi, the archive is just the base URL (no pattern with placeholders)
    archiveUrl = input.baseUrl.endsWith('/') ? input.baseUrl : input.baseUrl + '/';
    console.log(`Sorrisi.com - Using base URL as archive: ${archiveUrl}`);
  } else if (input.domain.includes('gazzetta.it')) {
    // For Gazzetta, the archive is also just the base URL
    archiveUrl = input.baseUrl.endsWith('/') ? input.baseUrl : input.baseUrl + '/';
    console.log(`Gazzetta.it - Using base URL as archive: ${archiveUrl}`);
  } else {
    // For other sources, use baseUrl + urlPattern (if it makes sense)
    archiveUrl = input.baseUrl + input.urlPattern;
  }

  console.log(`Fetching archive page: ${archiveUrl}`);

  await respectDomainRateLimit(input.domain);

  const html = await fetchHtml(archiveUrl, input.userAgent);
  const $ = cheerio.load(html);

  const targetDate = new Date(input.weekStartDate);
  const currentYear = targetDate.getFullYear();

  const candidates: { url: string; dateRange: WeekDateRange; score: number }[] = [];

  // Special handling for Repubblica
  if (input.domain.includes('repubblica.it')) {
    console.log('Repubblica archive - Extracting weekly URLs with enhanced pattern matching');

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

        console.log(`Found Repubblica URL (score: ${score}): ${absoluteUrl} => ${urlDate.toISOString().split('T')[0]}`);
      }
    });

    candidates.sort((a, b) => b.score - a.score);
  } 

  // Special handling for Sorrisi.com
  else if (input.domain.includes('sorrisi.com')) {
    console.log('Sorrisi.com archive - Extracting weekly URLs with Saturday-based weeks');
    console.log(`Archive URL: ${archiveUrl}`);

    const urlPattern = /\/lifestyle\/oroscopo\/oroscopo[-_]della[-_]settimana/i;

    $('a').each((_, elem) => {
      const href = $(elem).attr('href');
      const linkText = $(elem).text().trim();

      if (!href || !urlPattern.test(href)) {
        return;
      }

      let score = 0;

      const fullText = href + ' ' + linkText;

      console.log(`Sorrisi.com - Checking link: ${href}`);

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
        console.log(`Found Sorrisi.com URL (score: ${score}): ${absoluteUrl} => ${dateRange.startDate.toISOString().split('T')[0]}`);
      } else {
        console.log(`Sorrisi.com - Could not parse date from: ${fullText}`);
      }
    });

    candidates.sort((a, b) => b.score - a.score);
    console.log(`Sorrisi.com - Total candidates found: ${candidates.length}`);
  }
  // Special handling for Gazzetta.it
  else if (input.domain.includes('gazzetta.it')) {
    console.log('Gazzetta.it archive - Extracting weekly URLs');
    console.log(`Archive URL: ${archiveUrl}`);

    const urlPattern = /\/oroscopo\/storie\/.*?\/oroscopo-settimanale/i;

    $('a').each((_, elem) => {
      const href = $(elem).attr('href');
      const linkText = $(elem).text().trim();

      if (!href || !urlPattern.test(href)) {
        return;
      }

      let score = 0;

      const fullText = href + ' ' + linkText;

      console.log(`Gazzetta.it - Checking link: ${href}`);

      // Parse dates from URL slug
      // Example: oroscopo-settimanale-13-19-ottobre-2025
      const datePattern = /oroscopo-settimanale-(\d{1,2})-(\d{1,2})-(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)-(\d{4})/i;
      const match = href.match(datePattern);

      let dateRange: WeekDateRange | null = null;

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

          console.log(`Gazzetta.it - Parsed date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
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
        console.log(`Found Gazzetta.it URL (score: ${score}): ${absoluteUrl} => ${dateRange.startDate.toISOString().split('T')[0]}`);
      } else {
        console.log(`Gazzetta.it - Could not parse date from: ${fullText}`);
      }
    });

    candidates.sort((a, b) => b.score - a.score);
    console.log(`Gazzetta.it - Total candidates found: ${candidates.length}`);
  }
  // Special handling for Marie Claire
  else if (input.domain.includes('marieclaire.it')) {
    console.log('Marie Claire archive - Extracting weekly URLs');

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
        console.log(`Found Marie Claire URL (score: ${score}): ${absoluteUrl} => ${dateRange.startDate.toISOString().split('T')[0]}`);
      }
    });

    candidates.sort((a, b) => b.score - a.score);
  } 

    // Special handling for Elle.com/it
    else if (input.domain.includes('elle.com/it')) {
      console.log('Elle.com/it archive - Extracting weekly URLs (direct archive fallback)');
      console.log(`Archive URL: ${archiveUrl}`);

      // Updated pattern to match any letter+number prefix (not just 'a')
      const urlPattern = /\/oroscopo\/[a-z]\d+\/oroscopo-(ariete|toro|gemelli|cancro|leone|vergine|bilancia|scorpione|sagittario|capricorno|acquario|pesci)-\d+-/i;

      $('a').each((_, elem) => {
        const href = $(elem).attr('href');
        const linkText = $(elem).text().trim();

        if (!href || !urlPattern.test(href)) {
          return;
        }

        let score = 0;
        const fullText = href + ' ' + linkText;

        console.log(`Elle.com/it - Checking link: ${href}`);

        // Parse date from URL slug
        // Example: oroscopo-leone-16-22-ottobre-2025
        const datePattern = /oroscopo-(?:ariete|toro|gemelli|cancro|leone|vergine|bilancia|scorpione|sagittario|capricorno|acquario|pesci)-(\d{1,2})-(?:al-)?(\d{1,2})-(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)-(\d{4})/i;
        const match = href.match(datePattern);

        let dateRange: WeekDateRange | null = null;

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

            console.log(`Elle.com/it - Parsed date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
          }
        } else {
          // Fallback to generic parser
          dateRange = parseItalianWeekRange(fullText, currentYear);
          if (dateRange) {
            score += 15;
          }
        }

        if (dateRange) {
          // Check if URL contains the target sign
          const signSlug = input.signSlugIt.toLowerCase();
          if (href.toLowerCase().includes(`oroscopo-${signSlug}-`)) {
            score += 30; // High bonus for matching sign
            console.log(`Elle.com/it - Sign match bonus for ${signSlug}`);
          }

          // Bonus for "simon-and-the-stars" author
          if (/simon-and-the-stars/i.test(href)) {
            score += 5;
          }

          // Ensure absolute URL
          let absoluteUrl = href;
          if (href.startsWith('/')) {
            absoluteUrl = 'https://www.elle.com' + href;
          } else if (!href.startsWith('http')) {
            absoluteUrl = 'https://www.elle.com/' + href;
          }

          candidates.push({ url: absoluteUrl, dateRange, score });
          console.log(`Found Elle.com/it URL (score: ${score}): ${absoluteUrl}`);
        } else {
          console.log(`Elle.com/it - Could not parse date from: ${fullText}`);
        }
      });

      candidates.sort((a, b) => b.score - a.score);
      console.log(`Elle.com/it - Total candidates found: ${candidates.length}`);
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

  console.log(`Found ${candidates.length} candidate URLs in archive`);

  const targetDateStr = targetDate.toISOString().split('T')[0];

  // First try: exact date match
  for (const candidate of candidates) {
    const candidateDateStr = candidate.dateRange.startDate.toISOString().split('T')[0];
    console.log(`Candidate: ${candidate.url} => ${candidateDateStr} (target: ${targetDateStr}, score: ${candidate.score})`);

    if (candidateDateStr === targetDateStr) {
      console.log(`✓ Matched archive URL (exact match): ${candidate.url}`);
      archiveUrlCache.set(cacheKey, candidate.url);
      return candidate.url;
    }
  }

  // Second try: date within range
  for (const candidate of candidates) {
    const startDate = candidate.dateRange.startDate;
    const endDate = candidate.dateRange.endDate;

    if (targetDate >= startDate && targetDate <= endDate) {
      console.log(`✓ Matched archive URL (within range): ${candidate.url}`);
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
    console.log(`✓ Using closest match (${closestCandidate.daysDiff} days diff): ${closestCandidate.url}`);
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
    console.log(`[WeeklyScraper] Resolved URL: ${resolvedUrl}`);

    await respectDomainRateLimit(input.domain);

    const scrapeResult = await scrapeWeeklyHoroscopeText(resolvedUrl, input);

    if (!scrapeResult.success || !scrapeResult.text) {
      throw new Error(`Failed to scrape weekly horoscope: ${scrapeResult.error}`);
    }

    // Store the actual URL that was successfully scraped
    console.log(`[WeeklyScraper] Storing URL in database: ${resolvedUrl}`);

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
  console.log(`Fanpage.it - Extracting weekly URLs from archive`);

  const archiveUrl = 'https://www.fanpage.it/attualita/';
  console.log(`Fanpage.it - Archive URL: ${archiveUrl}`);

  await respectDomainRateLimit(input.domain);
  const html = await fetchHtml(archiveUrl, input.userAgent);
  const $ = cheerio.load(html);

  const targetDate = new Date(input.weekStartDate);
  const targetDateStr = targetDate.toISOString().split('T')[0];
  const candidates: Array<{ url: string; startDate: Date; score: number }> = [];

  $('a[href*="oroscopo-della-settimana"]').each((_, elem) => {
    const href = $(elem).attr('href');
    if (!href) return;

    console.log(`Fanpage.it - Checking link: ${href}`);

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

        console.log(`Fanpage.it - Parsed date: ${candidateDateStr} (target: ${targetDateStr})`);

        let absoluteUrl = href;
        if (href.startsWith('/')) {
          absoluteUrl = 'https://www.fanpage.it' + href;
        } else if (!href.startsWith('http')) {
          absoluteUrl = 'https://www.fanpage.it/' + href;
        }

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
          console.log(`Fanpage.it - Added candidate (${daysDiff} days diff, score: ${score}): ${absoluteUrl}`);
        }
      }
    }
  });

  console.log(`Fanpage.it - Total candidates found: ${candidates.length}`);

  if (candidates.length === 0) {
    throw new Error(`No Fanpage.it weekly horoscope URLs found in archive for week ${targetDateStr}`);
  }

  candidates.sort((a, b) => b.score - a.score);

  const bestMatch = candidates[0];
  console.log(`Fanpage.it - ✓ Selected best match: ${bestMatch.url}`);

  return bestMatch.url;
}

// ==================== END FANPAGE.IT FUNCTIONS ====================

// ==================== ELLE.COM/IT SPECIFIC FUNCTIONS ====================

/**
 * Extract sign-specific URLs from an Elle article that contains cross-links
 * Elle articles typically have a bullet list with links to all 12 signs
 */
async function extractElleSignLinksFromArticle(articleUrl: string, input: WeeklyScraperInput): Promise<string | null> {
  console.log(`Elle.com/it - Extracting sign links from article: ${articleUrl}`);

  try {
    await respectDomainRateLimit(input.domain);
    const html = await fetchHtml(articleUrl, input.userAgent);
    const $ = cheerio.load(html);

    // Remove noise
    $('script, style, nav, header, footer, iframe, noscript, .ad, .advertisement').remove();

    const zodiacSigns = ['ariete', 'toro', 'gemelli', 'cancro', 'leone', 'vergine',
                         'bilancia', 'scorpione', 'sagittario', 'capricorno', 'acquario', 'pesci'];

    const targetSign = input.signSlugIt.toLowerCase();
    const signLinks: Map<string, string> = new Map();

    console.log(`Elle.com/it - Looking for links to sign: ${targetSign}`);

    // Strategy 1: Find links in bullet lists (ul/ol) - MOST COMMON
    $('ul li a, ol li a').each((_, elem) => {
      const $link = $(elem);
      const href = $link.attr('href');
      const linkText = $link.text().trim().toLowerCase();

      if (href && href.includes('/oroscopo/')) {
        // Check if link text contains a zodiac sign name
        for (const sign of zodiacSigns) {
          if (linkText.includes(sign) || linkText === sign || href.includes(`oroscopo-${sign}-`)) {
            let absoluteUrl = href;
            if (href.startsWith('/')) {
              absoluteUrl = 'https://www.elle.com' + href;
            } else if (!href.startsWith('http')) {
              absoluteUrl = 'https://www.elle.com/' + href;
            }

            if (!signLinks.has(sign)) {
              signLinks.set(sign, absoluteUrl);
              console.log(`Elle.com/it - Found ${sign}: ${absoluteUrl}`);
            }
          }
        }
      }
    });

    // Strategy 2: Find links in paragraphs with sign names as link text
    if (signLinks.size < 12) {
      $('p a, div a, span a').each((_, elem) => {
        const $link = $(elem);
        const href = $link.attr('href');
        const linkText = $link.text().trim().toLowerCase();

        if (href && href.includes('/oroscopo/')) {
          for (const sign of zodiacSigns) {
            if (!signLinks.has(sign)) {
              // Check if link text is exactly the sign name or "Oroscopo {sign}"
              if (linkText === sign || 
                  linkText === `oroscopo ${sign}` || 
                  linkText === `>${sign}` ||
                  linkText === `${sign} >`) {

                let absoluteUrl = href;
                if (href.startsWith('/')) {
                  absoluteUrl = 'https://www.elle.com' + href;
                } else if (!href.startsWith('http')) {
                  absoluteUrl = 'https://www.elle.com/' + href;
                }

                signLinks.set(sign, absoluteUrl);
                console.log(`Elle.com/it - Found ${sign} (paragraph): ${absoluteUrl}`);
              }
            }
          }
        }
      });
    }

    // Strategy 3: Find ANY links with oroscopo-{sign}-{dates} pattern
    if (signLinks.size < 12) {
      $('a[href*="/oroscopo/"]').each((_, elem) => {
        const $link = $(elem);
        const href = $link.attr('href');

        if (href) {
          for (const sign of zodiacSigns) {
            if (!signLinks.has(sign)) {
              // Check if URL contains oroscopo-{sign}-{numbers}
              const signPattern = new RegExp(`oroscopo-${sign}-\\d+`, 'i');
              if (signPattern.test(href)) {
                let absoluteUrl = href;
                if (href.startsWith('/')) {
                  absoluteUrl = 'https://www.elle.com' + href;
                } else if (!href.startsWith('http')) {
                  absoluteUrl = 'https://www.elle.com/' + href;
                }

                signLinks.set(sign, absoluteUrl);
                console.log(`Elle.com/it - Found ${sign} (href pattern): ${absoluteUrl}`);
              }
            }
          }
        }
      });
    }

    console.log(`Elle.com/it - Total signs found: ${signLinks.size}/12`);

    // Return the URL for our target sign
    if (signLinks.has(targetSign)) {
      const targetUrl = signLinks.get(targetSign)!;
      console.log(`Elle.com/it - ✓ Found target sign ${targetSign}: ${targetUrl}`);
      return targetUrl;
    }

    console.log(`Elle.com/it - Target sign ${targetSign} not found in cross-links`);
    return null;
  } catch (error) {
    console.error(`Elle.com/it - Failed to extract sign links:`, error);
    return null;
  }
}

/**
 * Primary strategy: Find any article for the target week and extract all sign links
 */
async function findElleUrlViaCrossLinking(input: WeeklyScraperInput): Promise<string | null> {
  console.log(`Elle.com/it - Strategy: Cross-linking (finding master article with all sign links)`);

  try {
    // Step 1: Try to find ANY article for this week from archive
    const archiveUrl = 'https://www.elle.com/it/oroscopo';
    console.log(`Elle.com/it - Fetching archive: ${archiveUrl}`);

    await respectDomainRateLimit(input.domain);
    const html = await fetchHtml(archiveUrl, input.userAgent);
    const $ = cheerio.load(html);

    const targetDate = new Date(input.weekStartDate);
    const currentYear = targetDate.getFullYear();

    // Find any article matching the week dates
    const candidateArticles: Array<{ url: string; score: number }> = [];

    $('a[href*="/oroscopo/"]').each((_, elem) => {
      const href = $(elem).attr('href');
      const linkText = $(elem).text().trim();

      // Updated pattern to match any letter+number combination (not just 'a')
      if (href && href.match(/\/oroscopo\/[a-z]\d+\//i)) {
        const fullText = href + ' ' + linkText;
        const dateRange = parseItalianWeekRange(fullText, currentYear);

        if (dateRange) {
          const targetDateStr = targetDate.toISOString().split('T')[0];
          const candidateDateStr = dateRange.startDate.toISOString().split('T')[0];

          // Check if dates match (exact or within 3 days)
          const daysDiff = Math.abs(Math.floor((dateRange.startDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)));

          if (daysDiff <= 3) {
            let absoluteUrl = href;
            if (href.startsWith('/')) {
              absoluteUrl = 'https://www.elle.com' + href;
            } else if (!href.startsWith('http')) {
              absoluteUrl = 'https://www.elle.com/' + href;
            }

            // Score based on date accuracy and author
            let score = 100 - daysDiff * 10;
            if (href.includes('simon-and-the-stars')) {
              score += 20;
            }

            // Check if this URL already exists in candidates
            const exists = candidateArticles.some(c => c.url === absoluteUrl);
            if (!exists) {
              candidateArticles.push({ url: absoluteUrl, score });
              console.log(`Elle.com/it - Found candidate article (${daysDiff} days diff, score: ${score}): ${absoluteUrl}`);
            }
          }
        }
      }
    });

    // Sort by score (best match first)
    candidateArticles.sort((a, b) => b.score - a.score);
    console.log(`Elle.com/it - Found ${candidateArticles.length} candidate articles`);

    // Step 2: For each candidate, try to extract the sign links
    for (const candidate of candidateArticles) {
      console.log(`Elle.com/it - Trying to extract from: ${candidate.url} (score: ${candidate.score})`);
      const signUrl = await extractElleSignLinksFromArticle(candidate.url, input);
      if (signUrl) {
        return signUrl;
      }

      // Small delay between attempts
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Elle.com/it - Cross-linking strategy failed: no sign links found`);
    return null;
  } catch (error) {
    console.error(`Elle.com/it - Cross-linking strategy error:`, error);
    return null;
  }
}

/**
 * Fallback strategy: Try RSS feeds or sitemaps
 */
async function tryElleRSSorSitemap(input: WeeklyScraperInput): Promise<string | null> {
  const feedUrls = [
    'https://www.elle.com/it/oroscopo/rss',
    'https://www.elle.com/it/rss',
    'https://www.elle.com/it/feed',
    'https://www.elle.com/it/sitemap.xml',
    'https://www.elle.com/sitemap.xml',
  ];

  for (const feedUrl of feedUrls) {
    try {
      console.log(`Elle.com/it - Trying feed: ${feedUrl}`);
      await new Promise(resolve => setTimeout(resolve, 1500));

      const response = await axios.get(feedUrl, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        validateStatus: (status) => status < 500,
      });

      if (response.status !== 200) continue;

      const data = response.data;

      // Look for URLs in XML/RSS - updated pattern to match any letter prefix
      const urlMatches = data.match(/https?:\/\/www\.elle\.com\/it\/oroscopo\/[a-z]\d+\/[^<\s"']+/gi);

      if (urlMatches && urlMatches.length > 0) {
        console.log(`Elle.com/it - Found ${urlMatches.length} URLs in ${feedUrl}`);

        // Filter by date and sign
        for (const url of urlMatches) {
          const lowerUrl = url.toLowerCase();
          if (lowerUrl.includes(input.signSlugIt.toLowerCase()) && 
              (lowerUrl.includes(input.month) || lowerUrl.includes(input.startDay))) {
            console.log(`Elle.com/it - RSS match found: ${url}`);
            return url;
          }
        }
      }
    } catch (error) {
      // Try next feed
      continue;
    }
  }

  return null;
}

/**
 * Last resort: Google search
 */
async function findElleUrlViaSearch(input: WeeklyScraperInput): Promise<string | null> {
  const searchQuery = `site:elle.com/it oroscopo ${input.signSlugIt} ${input.startDay} ${input.endDay} ${input.month} ${input.year}`;
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

  console.log(`Elle.com/it - Google search: ${searchQuery}`);

  try {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);

    const urls: string[] = [];
    $('a').each((_, elem) => {
      const href = $(elem).attr('href');
      if (href && href.includes('elle.com/it/oroscopo')) {
        // Updated pattern to match any letter prefix
        const urlMatch = href.match(/(https?:\/\/www\.elle\.com\/it\/oroscopo\/[a-z]\d+\/[^&"'<>\s]+)/i);
        if (urlMatch) {
          const cleanUrl = urlMatch[1].split('&')[0]; // Remove Google tracking params
          if (!urls.includes(cleanUrl)) {
            urls.push(cleanUrl);
          }
        }
      }
    });

    if (urls.length > 0) {
      console.log(`Elle.com/it - Found ${urls.length} URLs via Google`);

      // Filter for matching sign
      const signUrls = urls.filter(url => 
        url.toLowerCase().includes(`oroscopo-${input.signSlugIt.toLowerCase()}-`)
      );

      if (signUrls.length > 0) {
        console.log(`Elle.com/it - Found ${signUrls.length} URLs matching sign ${input.signSlugIt}`);
        return signUrls[0];
      }

      // If no exact sign match, return first result (might contain cross-links)
      return urls[0];
    }
  } catch (error) {
    console.error('Elle.com/it - Google search failed:', error);
  }

  return null;
}

/**
 * Master function: Try all strategies in order
 */
async function resolveElleUrlWithFallback(input: WeeklyScraperInput): Promise<string> {
  console.log(`Elle.com/it - Starting fallback chain for ${input.signSlugIt} week ${input.weekStartDate}`);

  // STRATEGY 1: Cross-linking (PRIMARY - most reliable for Elle)
  console.log(`Elle.com/it - [1/4] Trying cross-linking strategy...`);
  try {
    const url = await findElleUrlViaCrossLinking(input);
    if (url) {
      console.log(`Elle.com/it - ✓ SUCCESS via cross-linking: ${url}`);
      return url;
    }
  } catch (error) {
    console.warn(`Elle.com/it - Cross-linking failed:`, error instanceof Error ? error.message : 'Unknown error');
  }

  // Small delay between strategies
  await new Promise(resolve => setTimeout(resolve, 1000));

  // STRATEGY 2: RSS/Sitemap
  console.log(`Elle.com/it - [2/4] Trying RSS/Sitemap strategy...`);
  try {
    const url = await tryElleRSSorSitemap(input);
    if (url) {
      console.log(`Elle.com/it - ✓ SUCCESS via RSS/Sitemap: ${url}`);
      return url;
    }
  } catch (error) {
    console.warn(`Elle.com/it - RSS/Sitemap failed:`, error instanceof Error ? error.message : 'Unknown error');
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  // STRATEGY 3: Standard archive resolution
  console.log(`Elle.com/it - [3/4] Trying standard archive strategy...`);
  try {
    const url = await resolveWeeklyUrlFromArchive(input);
    console.log(`Elle.com/it - ✓ SUCCESS via archive: ${url}`);
    return url;
  } catch (error) {
    console.warn(`Elle.com/it - Archive strategy failed:`, error instanceof Error ? error.message : 'Unknown error');
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  // STRATEGY 4: Google search (last resort)
  console.log(`Elle.com/it - [4/4] Trying Google search strategy...`);
  try {
    const url = await findElleUrlViaSearch(input);
    if (url) {
      console.log(`Elle.com/it - ✓ SUCCESS via Google search: ${url}`);

      // If Google returned a URL but not for our sign, try extracting cross-links from it
      if (!url.toLowerCase().includes(`oroscopo-${input.signSlugIt.toLowerCase()}-`)) {
        console.log(`Elle.com/it - Google returned different sign, trying to extract cross-links...`);
        const crossLinkedUrl = await extractElleSignLinksFromArticle(url, input);
        if (crossLinkedUrl) {
          console.log(`Elle.com/it - ✓ Extracted correct sign via cross-link: ${crossLinkedUrl}`);
          return crossLinkedUrl;
        }
      }

      return url;
    }
  } catch (error) {
    console.warn(`Elle.com/it - Google search failed:`, error instanceof Error ? error.message : 'Unknown error');
  }

  throw new Error(`All Elle.com/it strategies failed for ${input.signSlugIt} week ${input.weekStartDate}. Archive appears incomplete.`);
}

// ==================== END ELLE.COM/IT FUNCTIONS ====================

    async function buildWeeklyHoroscopeUrl(input: WeeklyScraperInput): Promise<string> {
      // FANPAGE.IT SPECIFIC: Use archive resolution (URLs have dynamic suffixes)
      const isFanpage = input.domain.toLowerCase().includes('fanpage') || 
                        input.baseUrl.toLowerCase().includes('fanpage') ||
                        input.sourceName.toLowerCase().includes('fanpage');

      if (isFanpage) {
        console.log(`Detected Fanpage.it (domain: ${input.domain}, source: ${input.sourceName}) - using archive resolution`);
        try {
          const url = await resolveFanpageUrlFromArchive(input);
          console.log(`Fanpage.it - Archive resolution successful: ${url}`);
          return url;
        } catch (error) {
          console.error(`Fanpage.it - Archive resolution failed:`, error);
          throw new Error(`Cannot resolve Fanpage.it URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // ELLE.COM/IT SPECIFIC: Use fallback chain strategy
      if (input.domain.includes('elle.com/it') || input.baseUrl.includes('elle.com/it')) {
        console.log(`Detected Elle.com/it - using fallback chain strategy`);
        try {
          const url = await resolveElleUrlWithFallback(input);
          console.log(`Elle.com/it - Fallback chain resolved: ${url}`);
          return url;
        } catch (error) {
          console.error(`Elle.com/it - All fallback strategies failed:`, error);
          throw new Error(`Cannot resolve Elle.com/it URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // SORRISI.COM SPECIFIC: Try archive strategy first, with proper fallback
      if (input.domain.includes('sorrisi.com') || input.baseUrl.includes('sorrisi.com')) {
        console.log(`Detected Sorrisi.com - trying archive strategy first`);
        try {
          const archiveUrl = await resolveWeeklyUrlFromArchive(input);
          console.log(`Sorrisi.com - Archive resolution successful: ${archiveUrl}`);
          return archiveUrl;
        } catch (error) {
          console.warn(`Sorrisi.com - Archive resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.log(`Sorrisi.com - Attempting URL pattern construction...`);

          // Fallback to pattern-based construction
          const startDay = input.startDay;
          const endDay = input.endDay;
          const month = input.month;

          // Handle "dall" vs "dal" - use "dall" for days with vowel sounds (1=uno, 8=otto, 11=undici)
          const dayNum = parseInt(startDay);
          const usesDall = dayNum === 1 || dayNum === 8 || dayNum === 11;
          const prefix = usesDall ? 'dall' : 'dal';

          const url = `https://www.sorrisi.com/lifestyle/oroscopo/oroscopo-della-settimana-${prefix}${startDay}-al-${endDay}-${month}/`;
          console.log(`Sorrisi.com - Constructed fallback URL: ${url}`);
          return url;
        }
      }

      /**
       * Fanpage-specific archive resolution
       * Fanpage adds dynamic SEO suffixes to URLs (e.g., "-scorpione-e-pesci-intuitivi")
       * We need to find the base URL pattern in the archive
       */
      async function resolveFanpageUrlFromArchive(input: WeeklyScraperInput): Promise<string> {
        console.log(`Fanpage.it - Extracting weekly URLs from archive`);

        const archiveUrl = 'https://www.fanpage.it/attualita/';
        console.log(`Fanpage.it - Archive URL: ${archiveUrl}`);

        await respectDomainRateLimit(input.domain);
        const html = await fetchHtml(archiveUrl, input.userAgent);
        const $ = cheerio.load(html);

        const targetDate = new Date(input.weekStartDate);
        const targetDateStr = targetDate.toISOString().split('T')[0];
        const candidates: Array<{ url: string; startDate: Date; score: number }> = [];

        // Find all links containing "oroscopo-della-settimana"
        $('a[href*="oroscopo-della-settimana"]').each((_, elem) => {
          const href = $(elem).attr('href');
          if (!href) return;

          console.log(`Fanpage.it - Checking link: ${href}`);

          // Extract date from URL pattern: dal-DD-al-DD-MONTH-YYYY
          // Example: /attualita/loroscopo-della-settimana-dal-20-al-26-ottobre-2025-scorpione-e-pesci.../
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

              console.log(`Fanpage.it - Parsed date: ${candidateDateStr} (target: ${targetDateStr})`);

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
                score = 100; // Exact match
              } else if (daysDiff <= 3) {
                score = 90 - (daysDiff * 10); // Close match
              } else if (daysDiff <= 7) {
                score = 50 - (daysDiff * 5); // Within a week
              } else {
                score = 0; // Too far
              }

              if (score > 0) {
                candidates.push({ url: absoluteUrl, startDate, score });
                console.log(`Fanpage.it - Added candidate (${daysDiff} days diff, score: ${score}): ${absoluteUrl}`);
              }
            } else {
              console.log(`Fanpage.it - Could not parse month: ${monthName}`);
            }
          } else {
            console.log(`Fanpage.it - Date pattern not found in URL`);
          }
        });

        console.log(`Fanpage.it - Total candidates found: ${candidates.length}`);

        if (candidates.length === 0) {
          throw new Error(`No Fanpage.it weekly horoscope URLs found in archive for week ${targetDateStr}`);
        }

        // Sort by score (best match first)
        candidates.sort((a, b) => b.score - a.score);

        // Log top candidates
        console.log(`Fanpage.it - Top 3 candidates:`);
        candidates.slice(0, 3).forEach((c, i) => {
          console.log(`  ${i + 1}. ${c.url} (score: ${c.score}, date: ${c.startDate.toISOString().split('T')[0]})`);
        });

        // Return best match
        const bestMatch = candidates[0];
        console.log(`Fanpage.it - ✓ Selected best match: ${bestMatch.url}`);

        return bestMatch.url;
      }

      // GAZZETTA.IT SPECIFIC: Use archive strategy and append sign
      if (input.domain.includes('gazzetta.it') || input.baseUrl.includes('gazzetta.it')) {
        console.log(`Detected Gazzetta.it - using archive strategy`);
        try {
          const baseArticleUrl = await resolveWeeklyUrlFromArchive(input);
          console.log(`Gazzetta.it - Archive resolution: ${baseArticleUrl}`);

          // Map sign to URL slug
          const signMap: Record<string, string> = {
            'Ariete': 'ariete', 'Toro': 'toro', 'Gemelli': 'gemelli', 'Cancro': 'cancro',
            'Leone': 'leone', 'Vergine': 'vergine', 'Bilancia': 'bilancia', 'Scorpione': 'scorpione',
            'Sagittario': 'sagittario', 'Capricorno': 'capricorno', 'Acquario': 'acquario', 'Pesci': 'pesci'
          };

          const signSlug = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();

          // Check if URL already has a sign in it
          const signInUrlMatch = baseArticleUrl.match(/\/(ariete|toro|gemelli|cancro|leone|vergine|bilancia|scorpione|sagittario|capricorno|acquario|pesci)\.shtml$/i);

          if (signInUrlMatch) {
            // Replace the existing sign with our target sign
            const finalUrl = baseArticleUrl.replace(/\/(ariete|toro|gemelli|cancro|leone|vergine|bilancia|scorpione|sagittario|capricorno|acquario|pesci)\.shtml$/i, `/${signSlug}.shtml`);
            console.log(`Gazzetta.it - Replaced sign in URL: ${finalUrl}`);
            return finalUrl;
          } 

          // Check if URL ends with .shtml but has no sign
          if (baseArticleUrl.endsWith('.shtml')) {
            // Insert sign before .shtml
            const finalUrl = baseArticleUrl.replace(/\.shtml$/, `/${signSlug}.shtml`);
            console.log(`Gazzetta.it - Inserted sign before .shtml: ${finalUrl}`);
            return finalUrl;
          }

          // Check if URL ends with a directory (e.g., "tutti-i-segni/")
          if (baseArticleUrl.endsWith('/')) {
            // Append sign.shtml
            const finalUrl = `${baseArticleUrl}${signSlug}.shtml`;
            console.log(`Gazzetta.it - Appended to directory: ${finalUrl}`);
            return finalUrl;
          }

          // Default case: append /sign.shtml
          const finalUrl = `${baseArticleUrl}/${signSlug}.shtml`;
          console.log(`Gazzetta.it - Default append: ${finalUrl}`);
          return finalUrl;

        } catch (error) {
          console.error(`Gazzetta.it - Archive resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          throw new Error(`Cannot construct Gazzetta.it URL: archive resolution failed`);
        }
      }


      
      // Archive strategy - resolve from archive page    
      if (input.scrapeStrategy === 'archive') {
        console.log(`Using archive strategy for ${input.sourceName}`);
        return await resolveWeeklyUrlFromArchive(input);
      }

      

      // MARIE CLAIRE SPECIFIC: Check if this is Marie Claire and resolve dynamically
      if (input.domain.includes('marieclaire.it') || input.baseUrl.includes('marieclaire.it')) {
        console.log(`Detected Marie Claire - checking if URL needs resolution`);

        // If baseUrl already contains a full article URL pattern, use it
        if (input.baseUrl.match(/\/a\d+\/oroscopo-settimana/)) {
          console.log(`Using pre-resolved Marie Claire URL: ${input.baseUrl}`);
          return input.baseUrl;
        }

        // Otherwise, resolve it from the archive page
        console.log(`Resolving Marie Claire URL from archive...`);
        return await resolveWeeklyUrlFromArchive(input);
      }

      // Pattern strategy - build URL from pattern
      const signMap: Record<string, string> = {
        'Ariete': 'ariete', 'Toro': 'toro', 'Gemelli': 'gemelli', 'Cancro': 'cancro',
        'Leone': 'leone', 'Vergine': 'vergine', 'Bilancia': 'bilancia', 'Scorpione': 'scorpione',
        'Sagittario': 'sagittario', 'Capricorno': 'capricorno', 'Acquario': 'acquario', 'Pesci': 'pesci'
      };

      let url = input.baseUrl + input.urlPattern;
      const signSlug = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();

      // Replace all placeholders
      url = url.replace(/{week_start_day}/g, input.startDay);
      url = url.replace(/{week_end_day}/g, input.endDay);
      url = url.replace(/{week_end_month}/g, input.month);
      url = url.replace(/{month_name}/g, input.month);
      url = url.replace(/{start_day}/g, input.startDay);
      url = url.replace(/{end_day}/g, input.endDay);
      url = url.replace(/{yyyy}/g, input.year);
      url = url.replace(/{year}/g, input.year);
      url = url.replace(/{sign}/g, signSlug);
      url = url.replace(/{month}/g, input.month);
      url = url.replace(/{mm}/g, input.month);
      url = url.replace(/{dd}/g, input.startDay);

      // Validate URL - ensure no placeholders remain
      if (url.includes('{') || url.includes('}')) {
        throw new Error(`URL contains unreplaced placeholders: ${url}`);
      }

      // Validate URL format
      try {
        new URL(url);
      } catch (error) {
        throw new Error(`Invalid URL constructed: ${url}`);
      }

      console.log(`Built weekly URL for ${input.sourceName}: ${url}`);
      return url;
    }

async function respectDomainRateLimit(domain: string): Promise<void> {
  const lastRequest = domainLastRequest.get(domain) || 0;
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequest;

  if (timeSinceLastRequest < DOMAIN_DELAY_MS) {
    const delay = DOMAIN_DELAY_MS - timeSinceLastRequest;
    console.log(`Rate limiting ${domain}, waiting ${delay}ms`);
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

    // 👇 STEP 1: ADD ELLE.COM/IT PAYWALL BYPASS HERE 👇
    // Special handling for Elle.com/it - PAYWALL BYPASS
    if (url.includes('elle.com/it')) {
      console.log('Elle.com/it - Using anti-paywall headers');

      // Clear cache and cookies - appear as a fresh visitor
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';

      // Referer suggests coming from Google (organic traffic often bypasses paywalls)
      headers['Referer'] = 'https://www.google.com/';

      // Add browser-like headers
      headers['Sec-Fetch-Dest'] = 'document';
      headers['Sec-Fetch-Mode'] = 'navigate';
      headers['Sec-Fetch-Site'] = 'cross-site';
      headers['Sec-Fetch-User'] = '?1';

      // Chromium-like headers
      headers['Sec-Ch-Ua'] = '"Google Chrome";v="120", "Chromium";v="120", "Not_A Brand";v="99"';
      headers['Sec-Ch-Ua-Mobile'] = '?0';
      headers['Sec-Ch-Ua-Platform'] = '"Windows"';

      // Random delay (500-1500ms) to appear human
      const randomDelay = Math.floor(Math.random() * 1000) + 500;
      console.log(`Elle.com/it - Adding ${randomDelay}ms anti-paywall delay`);
      await new Promise(resolve => setTimeout(resolve, randomDelay));
    }
    // 👆 END ELLE.COM/IT BLOCK 👆

    // Special headers for Fanpage.it
    else if (url.includes('fanpage.it')) {
      console.log('Fanpage.it - Using enhanced headers for weekly scraping');
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
      console.log(`Fanpage.it - Adding ${randomDelay}ms delay`);
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

    // 👇 ADDITIONAL ELLE.COM/IT CONFIG 👇
    // For Elle.com/it, disable cookie persistence
    if (url.includes('elle.com/it')) {
      axiosConfig.withCredentials = false; // Don't send credentials
      console.log('Elle.com/it - Cookie persistence disabled');
    }
    // 👆 END ADDITIONAL CONFIG 👆

    const response = await axios.get(url, axiosConfig);

    // If we get 403 on Fanpage, try with different user agent
    if (response.status === 403 && url.includes('fanpage.it')) {
      console.log('Fanpage.it - Got 403, trying with Safari user agent...');
      headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

      await new Promise(resolve => setTimeout(resolve, 3000));

      const retryResponse = await axios.get(url, {
        headers,
        timeout: 15000,
        maxRedirects: 5,
      });

      return retryResponse.data;
    }

    // 👇 ELLE.COM/IT PAYWALL DETECTION 👇
    // Check for Elle.com/it paywall indicators
    if (url.includes('elle.com/it')) {
      const responseText = response.data.toString().toLowerCase();

      // Check for paywall keywords
      const paywallIndicators = [
        'paywall',
        'subscribe',
        'abbonati',
        'contenuto riservato',
        'accesso limitato',
        'hai raggiunto il limite',
        'premium content',
        'premium-content'
      ];

      const hasPaywall = paywallIndicators.some(indicator => responseText.includes(indicator));

      if (hasPaywall) {
        console.warn(`Elle.com/it - ⚠️ Paywall detected in response`);
      }

      // Check if we got minimal content (paywall blocked most of it)
      if (responseText.length < 1000) {
        console.warn(`Elle.com/it - ⚠️ Suspiciously short response (${responseText.length} chars) - possible paywall`);
      } else {
        console.log(`Elle.com/it - ✓ Got ${responseText.length} chars - looks good`);
      }
    }
    // 👆 END PAYWALL DETECTION 👆

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

    // ELLE.COM/IT SPECIFIC: Multi-strategy fallback chain
    // Special handling for Elle.com/it - CONTENT EXTRACTION
      if (url.includes('elle.com/it') || url.includes('elle.com')) {
        console.log(`🔍 ELLE DEBUG: URL="${url}"`);
        console.log(`🔍 ELLE DEBUG: url.includes('elle.com/it')=${url.includes('elle.com/it')}`);
        console.log(`🔍 ELLE DEBUG: url.includes('elle.com')=${url.includes('elle.com')}`);
        console.log(`Elle.com/it - Extracting content for ${input.signSlugIt} from URL: ${url}`);

      let extractedContent = '';

      // Strategy 1: Target main article body with specific selectors
      const selectors = [
        '.article-body-content p',
        '.article-body p',
        'article .body-content p',
        '[class*="ArticleBody"] p',
        '[class*="article-body"] p',
        '.content-container p',
        'article p',
      ];

      for (const selector of selectors) {
        const paragraphs = $(selector);

        if (paragraphs.length > 0) {
          console.log(`Elle.com/it - Found ${paragraphs.length} paragraphs with selector: ${selector}`);

          paragraphs.each((_, p) => {
            const text = $(p).text().trim();
            const textLower = text.toLowerCase();

            // Filter out noise
            const isNoise = textLower.startsWith('leggi anche') ||
                           textLower.startsWith('leggi tutto') ||
                           textLower.startsWith('advertisement') ||
                           textLower.startsWith('pubblicità') ||
                           textLower.startsWith('scopri') ||
                           textLower.startsWith('condividi') ||
                           textLower.includes('cookie') ||
                           textLower.includes('privacy policy') ||
                           textLower.match(/^photo.*getty/i) ||
                           textLower.match(/^image.*credit/i) ||
                           text.length < 20;

            if (!isNoise) {
              extractedContent += text + '\n\n';
            }
          });

          if (extractedContent.trim().length > 100) {
            console.log(`Elle.com/it - Successfully extracted ${extractedContent.length} chars using ${selector}`);
            break;
          } else {
            extractedContent = '';
          }
        }
      }

      // Strategy 2: Broader search with keyword filtering
      if (extractedContent.trim().length < 100) {
        console.log(`Elle.com/it - Trying broader extraction with keyword filtering...`);

        const allParagraphs = $('p');
        console.log(`Elle.com/it - Found ${allParagraphs.length} total paragraphs on page`);

        let horoscopeCount = 0;

        allParagraphs.each((_, p) => {
          const text = $(p).text().trim();
          const textLower = text.toLowerCase();

          if (text.length < 20) return;

          const isNoise = textLower.startsWith('leggi anche') ||
                         textLower.startsWith('leggi tutto') ||
                         textLower.startsWith('advertisement') ||
                         textLower.startsWith('pubblicità') ||
                         textLower.startsWith('scopri') ||
                         textLower.startsWith('condividi') ||
                         textLower.startsWith('continua a leggere') ||
                         textLower.includes('iscriviti') ||
                         textLower.includes('newsletter') ||
                         textLower.includes('cookie') ||
                         textLower.includes('privacy') ||
                         textLower.match(/^photo/i) ||
                         textLower.match(/^getty/i);

          if (isNoise) return;

          // Check for horoscope-related content
          const hasHoroscopeContent = 
            /oroscopo|stelle|fortuna|previsioni|settimana|amore|lavoro|salute|energia|emozioni|relazioni|carriera|pianeti|luna|sole/i.test(text);

          if (hasHoroscopeContent) {
            extractedContent += text + '\n\n';
            horoscopeCount++;
          }
        });

        console.log(`Elle.com/it - Extracted ${horoscopeCount} horoscope-related paragraphs`);
      }

      // Strategy 3: Extract from main/article container
      if (extractedContent.trim().length < 100) {
        console.log(`Elle.com/it - Trying container extraction...`);

        const containers = ['article', 'main', '[role="main"]', '.main-content'];

        for (const container of containers) {
          const $container = $(container).first();
          if ($container.length > 0) {
            const containerText = $container.text();

            if (containerText.length > 200) {
              const cleaned = containerText
                .replace(/\s+/g, ' ')
                .replace(/leggi anche.{0,100}/gi, '')
                .replace(/pubblicità.{0,50}/gi, '')
                .replace(/advertisement.{0,50}/gi, '')
                .trim();

              if (cleaned.length > 100) {
                extractedContent = cleaned;
                console.log(`Elle.com/it - Extracted ${cleaned.length} chars from ${container}`);
                break;
              }
            }
          }
        }
      }

      if (extractedContent.trim().length > 50) {
        console.log(`Elle.com/it - ✓ Successfully extracted ${extractedContent.length} chars`);
        return {
          success: true,
          text: extractedContent.trim().substring(0, 3500),
          url: url
        };
      }

      console.log(`Elle.com/it - ❌ Failed: only ${extractedContent.length} chars extracted`);
      console.log(`Elle.com/it - DEBUG: <article>: ${$('article').length}, <main>: ${$('main').length}, <p>: ${$('p').length}`);

      return {
        success: false,
        error: `Elle.com/it: Insufficient content (${extractedContent.length} chars). Possible paywall.`
      };
    }

    // Special handling for Marie Claire - single page with all signs
    if (url.includes('marieclaire.it')) {
      console.log(`Marie Claire - Extracting content for ${input.signSlugIt} from URL: ${url}`);
      console.log(`Marie Claire - Page structure analysis:`);

      const signMap: Record<string, string> = {
        'Ariete': 'ariete', 'Toro': 'toro', 'Gemelli': 'gemelli', 'Cancro': 'cancro',
        'Leone': 'leone', 'Vergine': 'vergine', 'Bilancia': 'bilancia', 'Scorpione': 'scorpione',
        'Sagittario': 'sagittario', 'Capricorno': 'capricorno', 'Acquario': 'acquario', 'Pesci': 'pesci'
      };

      const signId = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();
      const zodiacSigns = ['ariete', 'toro', 'gemelli', 'cancro', 'leone', 'vergine',
                           'bilancia', 'scorpione', 'sagittario', 'capricorno', 'acquario', 'pesci'];

      // Log all H2 elements for debugging
      console.log(`Marie Claire - Found ${$('h2').length} H2 elements on page`);
      $('h2').each((i, h2) => {
        const $h2 = $(h2);
        const id = $h2.attr('id');
        const classes = $h2.attr('class');
        const text = $h2.text().trim();
        console.log(`  H2[${i}]: id="${id || 'none'}" class="${classes || 'none'}" text="${text}"`);
      });

      let signHeading = $();
      let extractedContent = '';

      // Strategy 1: Find h2 with id attribute matching sign (e.g., <h2 id="toro">)
      signHeading = $(`h2#${signId}`).first();
      if (signHeading.length > 0) {
        console.log(`Marie Claire - Strategy 1 SUCCESS: Found heading with id="${signId}"`);
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
            console.log(`Marie Claire - Strategy 2 SUCCESS: Found H2 with exact match "${$h2.text().trim()}"`);
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
            console.log(`Marie Claire - Strategy 3 SUCCESS: Found heading "${headingText}"`);
            return false;
          }
        });
      }

      // If we found a heading, extract content
      if (signHeading.length > 0) {
        let currentElement = signHeading.next();
        let paragraphCount = 0;

        while (currentElement.length > 0) {
          const tagName = currentElement.prop('tagName');

          // Stop at next zodiac sign heading
          if (tagName === 'H2' || tagName === 'H3') {
            const headingText = currentElement.text().trim().toLowerCase();
            if (zodiacSigns.some(sign => headingText === sign || headingText.includes(sign))) {
              console.log(`Marie Claire - Stopping at next sign: ${headingText}`);
              break;
            }
          }

          // Extract paragraph content
          if (currentElement.is('p')) {
            const text = currentElement.text().trim();
            const textLower = text.toLowerCase();

            // Enhanced filtering
            const isNoise = textLower.startsWith('leggi anche') ||
                           textLower.startsWith('advertisement') ||
                           textLower.startsWith('pubblicità') ||
                           textLower.startsWith('scopri') ||
                           textLower.startsWith('continua') ||
                           textLower.startsWith('condividi') ||
                           textLower.includes('pubblicità - continua') ||
                           textLower.match(/^la tip karmica/i) ||
                           textLower.match(/^\[.*\]$/) ||
                           text.length < 20;

            if (!isNoise) {
              extractedContent += text + '\n\n';
              paragraphCount++;
            }
          }

          currentElement = currentElement.next();
        }

        if (extractedContent.trim().length > 50) {
          console.log(`Marie Claire - ✓ Extracted ${paragraphCount} paragraphs, ${extractedContent.length} chars`);
          console.log(`Marie Claire - ✓ Returning URL: ${url}`);
          return {
            success: true,
            text: extractedContent.trim().substring(0, 3500),
            url: url
          };
        }
      }

      // Advanced fallback: DOM traversal with context awareness
      console.log(`Marie Claire - Trying advanced DOM analysis...`);

      const allText = $('body').text();
      const signRegex = new RegExp(`\\b${input.signSlugIt}\\b`, 'gi');
      const matches = Array.from(allText.matchAll(signRegex));

      console.log(`Marie Claire - Found ${matches.length} occurrences of "${input.signSlugIt}" in body`);

      if (matches.length > 0) {
        // Find the main content area
        const contentSelectors = ['article', 'main', '[class*="article"]', '[class*="content"]', '.body'];

        for (const selector of contentSelectors) {
          const $content = $(selector).first();
          if ($content.length === 0) continue;

          console.log(`Marie Claire - Analyzing ${selector} container...`);

          // Find all elements containing the sign name
          const $allElements = $content.find('*').filter((_, el) => {
            const text = $(el).text();
            return signRegex.test(text);
          });

          console.log(`Marie Claire - Found ${$allElements.length} elements containing sign name in ${selector}`);

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

                  console.log(`Marie Claire - Found sign in ${tagName}: "${elText}"`);

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
                console.log(`Marie Claire - Fallback extraction successful: ${content.length} chars from ${pCount} paragraphs`);
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

      console.log(`Marie Claire - All extraction strategies failed for ${input.signSlugIt}`);
      return {
        success: false,
        error: `Could not extract content for ${input.signSlugIt} from Marie Claire page`
      };
    }

    // Special handling for Repubblica - single page with all signs
    if (url.includes('repubblica.it')) {
      console.log(`Repubblica - Extracting content for ${input.signSlugIt} from URL: ${url}`);

      const zodiacSigns = ['ariete', 'toro', 'gemelli', 'cancro', 'leone', 'vergine',
                           'bilancia', 'scorpione', 'sagittario', 'capricorno', 'acquario', 'pesci'];

      // Find the H2 heading that exactly matches the sign name
      let signHeading = $();
      $('h2').each((_, h2) => {
        const h2Text = $(h2).text().trim();
        // Exact match (case-insensitive)
        if (h2Text.toLowerCase() === input.signSlugIt.toLowerCase()) {
          signHeading = $(h2);
          console.log(`Repubblica - Found exact H2 match for ${input.signSlugIt}: "${h2Text}"`);
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
              console.log(`Repubblica - Stopping at next sign: ${nextH2Text}`);
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
          console.log(`Repubblica - Successfully extracted ${extractedContent.length} chars for ${input.signSlugIt}`);
          return {
            success: true,
            text: extractedContent.trim().substring(0, 3500),
            url: url
          };
        } else {
          console.log(`Repubblica - Extracted content too short (${extractedContent.length} chars) for ${input.signSlugIt}`);
        }
      } else {
        console.log(`Repubblica - Could not find H2 heading for ${input.signSlugIt}`);
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
          console.log(`Repubblica - Extracted ${snippet.length} chars from body text search`);
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
    }

    // Special handling for Repubblica - single page with all signs
    if (url.includes('repubblica.it')) {
      // ... codice esistente Repubblica ...

      return {
        success: false,
        error: `Could not extract content for ${input.signSlugIt} from Repubblica weekly page`
      };
    } // <-- CHIUSURA REPUBBLICA

    // CODICE PER FANPAGE
    // Special handling for Fanpage.it - single page with all signs
    if (url.includes('fanpage.it')) {
      console.log(`Fanpage.it - Extracting weekly content for ${input.signSlugIt} from URL: ${url}`);

      const zodiacSigns = ['ariete', 'toro', 'gemelli', 'cancro', 'leone', 'vergine',
                           'bilancia', 'scorpione', 'sagittario', 'capricorno', 'acquario', 'pesci'];

      // Log structure
      console.log(`Fanpage.it - Found ${$('h2').length} H2 elements`);
      console.log(`Fanpage.it - Found ${$('h3').length} H3 elements`);
      console.log(`Fanpage.it - Found ${$('h4').length} H4 elements`);
      console.log(`Fanpage.it - Found ${$('strong').length} STRONG elements`);

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
          console.log(`Fanpage.it - Found H3 match: "${$h3.text().trim()}"`);
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
            console.log(`Fanpage.it - Found H4 match: "${$h4.text().trim()}"`);
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
            console.log(`Fanpage.it - Found STRONG/B match: "${$elem.text().trim()}"`);
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
              console.log(`Fanpage.it - Stopping at next sign: ${headingText}`);
              break;
            }
          }

          // Check for strong/bold tags that might be next sign
          const strongText = currentElement.find('strong, b').first().text().trim().toLowerCase();
          if (strongText.length < 50 && zodiacSigns.some(sign => strongText.includes(sign) && !strongText.includes(input.signSlugIt.toLowerCase()))) {
            console.log(`Fanpage.it - Stopping at next sign in STRONG: ${strongText}`);
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
                             text.length < 20;

              if (!isNoise) {
                extractedContent += text + '\n\n';
                paragraphCount++;
              }
            });
          }
        }

        if (extractedContent.trim().length > 50) {
          console.log(`Fanpage.it - ✓ Extracted ${paragraphCount} paragraphs, ${extractedContent.length} chars`);
          return {
            success: true,
            text: extractedContent.trim().substring(0, 3500),
            url: url
          };
        }
      }

      // Fallback: Search body text for sign name
      console.log(`Fanpage.it - Trying body text search fallback...`);

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
            console.log(`Fanpage.it - Fallback extracted ${content.length} chars`);
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
      console.log(`Weekly scrape attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      if (attempt < maxRetries) {
        const delay = attempt * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Failed to scrape weekly horoscope');
}