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

async function resolveWeeklyUrlFromArchive(input: WeeklyScraperInput): Promise<string> {
  const cacheKey = `${input.sourceId}-${input.weekStartDate}`;

  const cached = archiveUrlCache.get(cacheKey);
  if (cached) {
    console.log(`Using cached archive URL for ${input.sourceName}`);
    return cached;
  }

  const archiveUrl = input.baseUrl + input.urlPattern;
  console.log(`Fetching archive page: ${archiveUrl}`);

  await respectDomainRateLimit(input.domain);

  const html = await fetchHtml(archiveUrl, input.userAgent);
  const $ = cheerio.load(html);

  const targetDate = new Date(input.weekStartDate);
  const currentYear = targetDate.getFullYear();

  const candidates: { url: string; dateRange: WeekDateRange; score: number }[] = [];

  // Special handling for Repubblica - extract URLs and dates from archive page
  if (input.domain.includes('repubblica.it')) {
    console.log('Repubblica archive - Extracting weekly URLs with enhanced pattern matching');

    // Pattern to match Repubblica weekly URLs with variations
    const urlPattern = /oroscopo[-_](?:della[-_])?settimana/i;

    $('a').each((_, elem) => {
      const href = $(elem).attr('href');
      const linkText = $(elem).text().trim();

      if (!href || !urlPattern.test(href)) {
        return;
      }

      let score = 0;

      // Extract date from URL path: /YYYY/MM/DD/news/...
      const urlDateMatch = href.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);

      if (urlDateMatch) {
        const urlYear = parseInt(urlDateMatch[1]);
        const urlMonth = parseInt(urlDateMatch[2]);
        const urlDay = parseInt(urlDateMatch[3]);
        const urlDate = new Date(urlYear, urlMonth - 1, urlDay);

        // Check if this is a weekend date (likely publication day)
        const dayOfWeek = urlDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday

        if (isWeekend) {
          score += 10;
        }

        // Repubblica publishes weekly horoscopes, week starts on publication day
        const dateRange = {
          startDate: urlDate,
          endDate: new Date(urlDate.getTime() + 6 * 24 * 60 * 60 * 1000)
        };

        // Try to extract date range from link text or URL slug
        const dateRangeFromText = parseItalianWeekRange(linkText + ' ' + href, currentYear);
        if (dateRangeFromText) {
          dateRange.startDate = dateRangeFromText.startDate;
          dateRange.endDate = dateRangeFromText.endDate;
          score += 20;
        }

        // Bonus for containing "previsioni" in URL
        if (/previsioni/i.test(href)) {
          score += 5;
        }

        // Bonus for containing author name patterns
        if (/(marco[-_]pesatori|branko|paolo[-_]fox)/i.test(href)) {
          score += 3;
        }

        const absoluteUrl = href.startsWith('http') ? href : 'https://d.repubblica.it' + href;
        candidates.push({ url: absoluteUrl, dateRange, score });

        console.log(`Found Repubblica URL (score: ${score}): ${absoluteUrl} => ${urlDate.toISOString().split('T')[0]}`);
      }
    });

    // Sort by score (highest first)
    candidates.sort((a, b) => b.score - a.score);
  } else if (input.domain.includes('sorrisi.com')) {
    console.log('Sorrisi.com archive - Extracting weekly URLs with Saturday-based weeks');
    console.log(`Archive URL: ${archiveUrl}`);

    // Sorrisi.com specific pattern: /lifestyle/oroscopo/oroscopo-della-settimana-...
    const urlPattern = /\/lifestyle\/oroscopo\/oroscopo[-_]della[-_]settimana/i;

    $('a').each((_, elem) => {
      const href = $(elem).attr('href');
      const linkText = $(elem).text().trim();

      if (!href || !urlPattern.test(href)) {
        return;
      }

      let score = 0;

      // Extract date range from URL or link text
      const fullText = href + ' ' + linkText;

      console.log(`Sorrisi.com - Checking link: ${href}`);

      // Use the flexible Italian date parser
      const dateRange = parseItalianWeekRange(fullText, currentYear);

      if (dateRange) {
        score += 20;

        // Bonus for containing year in URL
        if (/\d{4}/.test(href)) {
          score += 5;
        }

        // Ensure full absolute URL with https protocol
        let absoluteUrl = href;
        if (href.startsWith('/')) {
          absoluteUrl = 'https://www.sorrisi.com' + href;
        } else if (!href.startsWith('http')) {
          absoluteUrl = 'https://www.sorrisi.com/' + href;
        } else if (href.startsWith('http://')) {
          absoluteUrl = href.replace('http://', 'https://');
        } else {
          absoluteUrl = href;
        }

        candidates.push({ url: absoluteUrl, dateRange, score });
        console.log(`Found Sorrisi.com URL (score: ${score}): ${absoluteUrl} => ${dateRange.startDate.toISOString().split('T')[0]}`);
      } else {
        console.log(`Sorrisi.com - Could not parse date from: ${fullText}`);
      }
    });

    // Sort by score (highest first)
    candidates.sort((a, b) => b.score - a.score);
    console.log(`Sorrisi.com - Total candidates found: ${candidates.length}`);
  } else if (input.domain.includes('marieclaire.it')) {
    console.log('Marie Claire archive - Extracting weekly URLs');

    // Marie Claire specific pattern: /lifestyle/coolmix/a{random}/oroscopo-settimana
    const urlPattern = /\/lifestyle\/coolmix\/a\d+\/oroscopo[-_]settimana/i;
  } else if (input.domain.includes('sorrisi.com')) {
    console.log('Sorrisi.com archive - Extracting weekly URLs with Saturday-based weeks');

    // Sorrisi.com specific pattern: /lifestyle/oroscopo/oroscopo-della-settimana-...
    const urlPattern = /\/lifestyle\/oroscopo\/oroscopo[-_]della[-_]settimana/i;

    $('a').each((_, elem) => {
      const href = $(elem).attr('href');
      const linkText = $(elem).text().trim();

      if (!href || !urlPattern.test(href)) {
        return;
      }

      let score = 0;

      // Extract date range from URL or link text
      const fullText = href + ' ' + linkText;

      // Use the flexible Italian date parser
      const dateRange = parseItalianWeekRange(fullText, currentYear);

      if (dateRange) {
        score += 20;

        // Bonus for containing year in URL
        if (/\d{4}/.test(href)) {
          score += 5;
        }

        // Ensure full absolute URL with https protocol
        let absoluteUrl = href;
        if (href.startsWith('/')) {
          absoluteUrl = 'https://www.sorrisi.com' + href;
        } else if (!href.startsWith('http')) {
          absoluteUrl = 'https://www.sorrisi.com/' + href;
        } else if (href.startsWith('http://')) {
          absoluteUrl = href.replace('http://', 'https://');
        } else {
          absoluteUrl = href;
        }

        candidates.push({ url: absoluteUrl, dateRange, score });
        console.log(`Found Sorrisi.com URL (score: ${score}): ${absoluteUrl} => ${dateRange.startDate.toISOString().split('T')[0]}`);
      }
    });
  } else if (input.domain.includes('marieclaire.it')) {
    console.log('Marie Claire archive - Extracting weekly URLs');

    // Marie Claire specific pattern: /lifestyle/coolmix/a{random}/oroscopo-settimana
    const urlPattern = /\/lifestyle\/coolmix\/a\d+\/oroscopo[-_]settimana/i;

    $('a').each((_, elem) => {
      const href = $(elem).attr('href');
      const linkText = $(elem).text().trim();

      if (!href || !urlPattern.test(href)) {
        return;
      }

      let score = 0;

      // Extract date range from URL or link text - Marie Claire uses Italian dates
      const fullText = href + ' ' + linkText;

      // Enhanced Italian date range pattern for Marie Claire
      // Examples: "dal-13-al-19-ottobre", "dal13-al-19-ottobre-2025", "dall11-al-17-ottobre", "dal11", "dall11"
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
        // Fallback to generic Italian date parser
        dateRange = parseItalianWeekRange(fullText, currentYear);
        if (dateRange) {
          score += 15;
        }
      }

      if (dateRange) {
        // Bonus for recent articles (higher article ID = more recent)
        const articleMatch = href.match(/\/a(\d+)\//);
        if (articleMatch) {
          const articleId = parseInt(articleMatch[1]);
          score += Math.min(articleId / 1000000, 50);
        }

        // Ensure full absolute URL with https protocol
        let absoluteUrl = href;
        if (href.startsWith('/')) {
          // Relative URL starting with /
          absoluteUrl = 'https://www.marieclaire.it' + href;
        } else if (!href.startsWith('http')) {
          // Relative URL without leading /
          absoluteUrl = 'https://www.marieclaire.it/' + href;
        } else if (href.startsWith('http://')) {
          // Force HTTPS
          absoluteUrl = href.replace('http://', 'https://');
        } else {
          // Already absolute with https
          absoluteUrl = href;
        }

        candidates.push({ url: absoluteUrl, dateRange, score });
        console.log(`Found Marie Claire URL (score: ${score}): ${absoluteUrl} => ${dateRange.startDate.toISOString().split('T')[0]}`);
      }
    });
  } else {
    // Generic archive handling for other sources
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
      return candidate.url; // This is the actual article URL, not the archive page
    }
  }

  // Second try: date within range (for weekly horoscopes that cover a week)
  for (const candidate of candidates) {
    const startDate = candidate.dateRange.startDate;
    const endDate = candidate.dateRange.endDate;

    if (targetDate >= startDate && targetDate <= endDate) {
      console.log(`✓ Matched archive URL (within range): ${candidate.url}`);
      archiveUrlCache.set(cacheKey, candidate.url);
      return candidate.url; // This is the actual article URL, not the archive page
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

async function buildWeeklyHoroscopeUrl(input: WeeklyScraperInput): Promise<string> {
  // SORRISI.COM SPECIFIC: Always use archive strategy
  if (input.domain.includes('sorrisi.com') || input.baseUrl.includes('sorrisi.com')) {
    console.log(`Detected Sorrisi.com - forcing archive strategy`);
    return await resolveWeeklyUrlFromArchive(input);
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
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
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

    // Add random delay between 1-3 seconds
    const delay = 1000 + Math.random() * 2000;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Rotate user agents for reliability
    const selectedUserAgent = userAgent || USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    const response = await axios.get(url, {
      headers: {
        'User-Agent': selectedUserAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
      },
      timeout: 15000,
      maxRedirects: 5,
    });

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