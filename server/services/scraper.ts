import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScraperInput, ScraperOutput, scraperOutputSchema } from '@shared/schema';
import { ITALIAN_WEEKDAYS, ITALIAN_MONTHS } from '@shared/constants';

// Rate limiting and domain backoff
const domainLastRequest = new Map<string, number>();
const DOMAIN_DELAY_MS = 2000; // 2 seconds between requests to same domain

interface ScrapeResult {
  success: boolean;
  text?: string;
  url?: string;
  error?: string;
  actualUrl?: string;
  relazioni_rating?: number;
  lavoro_rating?: number;
  salute_rating?: number;
}

// Enhanced keyword lists for content validation
const COMPREHENSIVE_HOROSCOPE_KEYWORDS = [
  'oroscopo', 'previsioni', 'stelle', 'fortuna', 'destino', 'zodiaco', 'segno', 'astrale', 'cosmico', 'celeste',
  'amore', 'lavoro', 'salute', 'benessere', 'relazioni', 'carriera', 'famiglia', 'amicizia', 'denaro', 'finanze',
  'giornata', 'periodo', 'momento', 'oggi', 'domani', 'settimana', 'mese', 'anno', 'futuro', 'presente',
  'energia', 'vitalità', 'forza', 'potenza', 'magnetismo', 'carisma', 'fascino', 'charme', 'appeal',
  'emozioni', 'sentimenti', 'passione', 'ardore', 'fuoco', 'calore', 'intensità', 'profondità',
  'luna', 'sole', 'pianeti', 'mercurio', 'venere', 'marte', 'giove', 'saturno', 'urano', 'nettuno', 'plutone',
  'influenze', 'aspetti', 'configurazione', 'posizione', 'movimento', 'transiti'
];

const COMPREHENSIVE_PREDICTIVE_LANGUAGE = [
  'sarà', 'sarai', 'sarete', 'diventerà', 'diventerai', 'potrai', 'potrete', 'riuscirai', 'riuscirete',
  'dovresti', 'dovreste', 'dovrai', 'dovrete', 'conviene', 'converrebbe', 'meglio', 'preferibile',
  'aspettati', 'aspettatevi', 'attendi', 'attendete', 'prevedi', 'prevedete', 'prepara', 'preparate',
  'previsto', 'prevedono', 'prevede', 'annuncia', 'promette', 'indica', 'suggerisce', 'consiglia',
  'favorisce', 'facilita', 'aiuta', 'sostiene', 'porta', 'conduce'
];

const ENHANCED_NAVIGATION_TERMS = [
  'menu', 'naviga', 'navigazione', 'accedi', 'login', 'registrati', 'iscriviti', 'abbonati',
  'cookie', 'privacy', 'consenso', 'termini', 'condizioni', 'pubblicità', 'ads', 'banner',
  'leggi anche', 'articoli correlati', 'potrebbe interessarti', 'altri contenuti',
  'clicca qui', 'click', 'tap', 'tocca', 'premi', 'seleziona', 'scegli', 'vai a',
  'home', 'homepage', 'sezioni', 'categorie', 'archivio', 'cerca', 'ricerca', 'search',
  'condividi', 'share', 'facebook', 'twitter', 'instagram', 'whatsapp', 'social',
  'newsletter', 'iscrizione', 'notifiche', 'aggiornamenti',
  'altri oroscopi', 'tutti i segni', 'scegli il tuo segno', 'altri segni zodiacali'
];

/**
 * Mapping of Italian zodiac sign names to URL-friendly slugs
 */
export const ZODIAC_SIGN_MAP: Record<string, string> = {
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


// ============================================================================
// HELPER FUNCTIONS FOR URL BUILDING
// ============================================================================

/**
 * Formats a date as DD-MM-YYYY
 */
function formatDateDDMMYYYY(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Builds URLs specifically for Gazzetta.it with all variations
 * New URL structure (2026+): /oroscopo/storie/{pubDate}/oroscopo-di-{weekday}-{D}-{month}-{year}-le-previsioni-per-i-12-segni/{sign}.shtml
 */
function buildGazzettaUrls(input: ScraperInput): string[] {
  console.log(`🔥 Building Gazzetta.it URLs for ${input.signSlugIt}`);

  const targetDate = new Date(input.dateISO);
  const day = targetDate.getDate();
  const month = targetDate.getMonth();
  const year = targetDate.getFullYear();
  const weekday = ITALIAN_WEEKDAYS[targetDate.getDay()];
  const monthName = ITALIAN_MONTHS[month];
  const signSlug = ZODIAC_SIGN_MAP[input.signSlugIt] || input.signSlugIt.toLowerCase();

  const horoscopeDatePart = `${weekday}-${day}-${monthName}-${year}`;

  // Slug variations: new format (oroscopo-di-) first, old format as fallback
  const newSlugs = [
    `oroscopo-di-${horoscopeDatePart}-le-previsioni-per-i-12-segni`,
    `oroscopo-di-${horoscopeDatePart}-previsioni-per-tutti-i-12-segni`,
    `oroscopo-di-${horoscopeDatePart}-previsioni-per-12-segni`,
  ];
  const oldSlugs = [
    `oroscopo-${horoscopeDatePart}-previsioni-per-tutti-i-12-segni`,
    `oroscopo-${horoscopeDatePart}-le-previsioni-per-i-12-segni`,
    `oroscopo-${horoscopeDatePart}-previsioni-per-12-segni`,
  ];

  const urls: string[] = [];

  // Try publishing dates D-1, D-2, D-3 with new path + new slugs (most likely)
  for (let offset = 1; offset <= 3; offset++) {
    const pubDate = new Date(targetDate);
    pubDate.setDate(pubDate.getDate() - offset);
    const pubDateStr = formatDateDDMMYYYY(pubDate);
    for (const slug of newSlugs) {
      urls.push(`${input.baseUrl}/oroscopo/storie/${pubDateStr}/${slug}/${signSlug}.shtml`);
    }
  }

  // Fallback: old path + old slugs with D-1
  const prevDate = new Date(targetDate);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = formatDateDDMMYYYY(prevDate);
  for (const slug of oldSlugs) {
    urls.push(`${input.baseUrl}/storie/${prevDateStr}/${slug}/${signSlug}.shtml`);
  }

  console.log(`Gazzetta.it - Target date: ${input.dateISO}`);
  console.log(`Gazzetta.it - Horoscope date part: ${horoscopeDatePart}`);
  console.log(`Gazzetta.it - Generated ${urls.length} URLs`);

  return urls;
}

/**
 * Builds URL for IO Donna with date-specific format
 */
function buildIoDonnaUrl(input: ScraperInput): string {
  const signSlug = ZODIAC_SIGN_MAP[input.signSlugIt] || input.signSlugIt.toLowerCase();
  const targetDate = new Date(input.dateISO);
  const day = targetDate.getDate().toString().padStart(2, '0');
  const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');
  const year = targetDate.getFullYear();

  return `${input.baseUrl}/oroscopo/giorno/${signSlug}-${day}-${month}-${year}/`;
}

/**
 * Builds URLs for Fanpage.it with both direct and archive URLs
 */
function buildFanpageUrls(input: ScraperInput): string[] {
  const targetDate = new Date(input.dateISO);
  const day = targetDate.getDate();
  const month = ITALIAN_MONTHS[targetDate.getMonth()];
  const weekday = ITALIAN_WEEKDAYS[targetDate.getDay()];
  const year = targetDate.getFullYear();

  let directUrl = input.baseUrl + input.urlPattern;
  directUrl = directUrl.replace('{weekday}', weekday);
  directUrl = directUrl.replace('{day}', day.toString());
  directUrl = directUrl.replace('{month}', month);
  directUrl = directUrl.replace('{year}', year.toString());

  const archiveUrl = 'https://www.fanpage.it/stile-e-trend/story/oroscopo/';

  console.log(`Fanpage.it - Direct URL: ${directUrl}`);
  console.log(`Fanpage.it - Archive fallback: ${archiveUrl}`);

  return [directUrl, archiveUrl];
}

export async function scrapeHoroscope(input: ScraperInput): Promise<ScraperOutput> {
  try {
    // Build URL(s) from pattern (Sky TG24 uses async discovery)
    let urls: string[];
    if (input.domain.includes('tg24.sky.it') || input.domain.includes('skytg24.it')) {
      urls = await buildSkyTG24Urls(input);
    } else {
      const urlResult = buildHoroscopeUrl(input);
      urls = Array.isArray(urlResult) ? urlResult : [urlResult];
    }

    // Try multiple URLs if available (e.g., for Gazzetta.it)
    let scrapeResult: ScrapeResult | null = null;
    let usedUrl = '';

    for (const url of urls) {
      console.log(`Attempting to scrape URL: ${url}`);

      // Respect domain rate limiting
      await respectDomainRateLimit(input.domain);

      let currentResult: ScrapeResult;

      // Special handling for Fanpage archive page
      if (url.includes('fanpage.it') && url.includes('/stile-e-trend/story/oroscopo/')) {
        console.log('Fanpage.it - This is the archive page, searching for article URL...');
        const articleUrl = await findFanpageArticleUrl(url, input.dateISO);

        if (articleUrl) {
          console.log(`Fanpage.it - Found article URL from archive: ${articleUrl}`);
          // Respect rate limiting before scraping the found article
          await respectDomainRateLimit(input.domain);
          currentResult = await scrapeHoroscopeText(articleUrl, input);

          if (currentResult.success && currentResult.text) {
            console.log(`Successfully scraped from archive-found URL: ${articleUrl}`);
            scrapeResult = currentResult;
            scrapeResult.actualUrl = articleUrl; // Use the found URL
            usedUrl = articleUrl;
            break;
          }
        } else {
          console.log('Fanpage.it - Could not find article in archive, trying next URL...');
          continue; // Salta questo URL e prova il prossimo
        }
      }

      if (input.domain.includes('repubblica.it')) {
        currentResult = await scrapeRepubblicaHoroscopeText(url, input);
      } else {
        currentResult = await scrapeHoroscopeText(url, input);
      }

      if (currentResult.success && currentResult.text) {
        console.log(`Successfully scraped from URL: ${url}`);
        scrapeResult = currentResult;
        usedUrl = url;
        break;
      } else {
        console.log(`Failed to scrape from URL: ${url} - ${currentResult.error}`);
      }
    }

    if (!scrapeResult || !scrapeResult.success || !scrapeResult.text) {
      throw new Error(`Failed to scrape from all ${urls.length} URL(s)`);
    }

    // Use actualUrl from scrapeResult if available, otherwise use the URL that was built
    const finalUrl = scrapeResult.actualUrl || scrapeResult.url || usedUrl;
    console.log(`✓ Successfully scraped ${input.sourceName} (${scrapeResult.text.length} chars) from ${finalUrl}`);

    const result: ScraperOutput = {
      sourceId: input.sourceId,
      signSlugIt: input.signSlugIt,
      dateISO: input.dateISO,
      original_url: finalUrl,
      scraped_at: new Date(),
      extracted_text: scrapeResult.text,
    };

    return scraperOutputSchema.parse(result);
  } catch (error) {
    console.error(`Scraping error for ${input.sourceName} - ${input.signSlugIt}:`, error);
    throw new Error(`Failed to scrape ${input.sourceName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Cache: ISO date → discovered URL (or null if not found)
const skyTG24UrlCache = new Map<string, string | null>();

async function discoverSkyTG24DailyUrl(date: string, userAgent: string): Promise<string | null> {
  try {
    const indexHtml = await fetchHtml('https://tg24.sky.it/lifestyle/oroscopo', userAgent);
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const datePrefix = `/lifestyle/${yyyy}/${mm}/${dd}/`;
    const linkRegex = new RegExp(
      `href="(${datePrefix.replace(/\//g, '\\/')}oroscopo[^"]*)"`,
      'gi'
    );
    const matches = [...indexHtml.matchAll(linkRegex)];
    if (matches.length === 0) {
      console.log(`Sky TG24 - No daily link found on index page for ${date}`);
      return null;
    }
    const dailyMatch = matches.find(m =>
      !m[1].includes('settimana') && !m[1].includes('anno') && !m[1].includes('mese')
    ) ?? matches[0];
    const url = `https://tg24.sky.it${dailyMatch[1]}`;
    console.log(`Sky TG24 - Discovered daily URL: ${url}`);
    return url;
  } catch (err) {
    console.log(`Sky TG24 - Discovery failed: ${err}`);
    return null;
  }
}

async function getSkyTG24DailyUrl(date: string, userAgent: string): Promise<string | null> {
  if (skyTG24UrlCache.has(date)) return skyTG24UrlCache.get(date)!;
  const url = await discoverSkyTG24DailyUrl(date, userAgent);
  skyTG24UrlCache.set(date, url);
  return url;
}

async function buildSkyTG24Urls(input: ScraperInput): Promise<string[]> {
  // New per-sign static URL format: /lifestyle/oroscopo/{sign_lowercase}/oggi
  const signSlug = input.signSlugIt.toLowerCase(); // e.g. "ariete", "toro"
  const url = `https://tg24.sky.it/lifestyle/oroscopo/${signSlug}/oggi`;
  console.log(`Sky TG24 - URL for ${input.signSlugIt}: ${url}`);
  return [url];
}

function buildHoroscopeUrl(input: ScraperInput): string | string[] {
  // ========== SPECIAL HANDLING: Repubblica.it ==========
  if (input.domain.includes('repubblica.it')) {
    return input.baseUrl + input.urlPattern;
  }

  // ========== SPECIAL HANDLING: Gazzetta.it ==========
  if (input.domain && input.domain.includes('gazzetta.it')) {
    return buildGazzettaUrls(input);
  }

  // ========== SPECIAL HANDLING: IO Donna ==========
  if (input.domain.includes('iodonna.it')) {
    return buildIoDonnaUrl(input);
  }

  // ========== SPECIAL HANDLING: Fanpage.it ==========
  if (input.domain.includes('fanpage.it')) {
    return buildFanpageUrls(input);
  }

  // ========== SPECIAL HANDLING: Quotidiano.net ==========
  if (input.domain.includes('quotidiano.net')) {
    // Return the base archive URL - we'll find the actual URL later
    return input.baseUrl; // This should be: https://www.quotidiano.net/oroscopo
  }

  // ========== SPECIAL HANDLING: Alfemminile.com ==========
  if (input.domain.includes('alfemminile.com') && input.urlPattern.includes('{weekday}')) {
    const targetDate = new Date(input.dateISO);
    const day = targetDate.getDate();
    const month = targetDate.getMonth();
    const year = targetDate.getFullYear();
    const weekday = ITALIAN_WEEKDAYS[targetDate.getDay()];
    const monthName = ITALIAN_MONTHS[month];

    let url = input.baseUrl + input.urlPattern;
    url = url.replace('{weekday}', weekday);
    url = url.replace('{day}', day.toString());
    url = url.replace('{month}', monthName);
    url = url.replace('{year}', year.toString());

    return url;
  }

  // ========== STANDARD URL BUILDING ==========
  let url = input.baseUrl + input.urlPattern;
  const targetDate = new Date(input.dateISO);

  // Get sign slug (Oggi.it uses capitalized names, others use lowercase)
  let signSlug = ZODIAC_SIGN_MAP[input.signSlugIt] || input.signSlugIt.toLowerCase();
  if (input.domain.includes('oggi.it')) {
    signSlug = input.signSlugIt;
  }

  // Replace all placeholders
  url = url.replace('{sign}', signSlug);
  url = url.replace('{dd}', targetDate.getDate().toString().padStart(2, '0'));
  url = url.replace('{day}', targetDate.getDate().toString());
  url = url.replace('{mm}', (targetDate.getMonth() + 1).toString().padStart(2, '0'));
  url = url.replace('{month}', ITALIAN_MONTHS[targetDate.getMonth()]);
  url = url.replace('{yyyy}', targetDate.getFullYear().toString());
  url = url.replace('{year}', targetDate.getFullYear().toString());
  url = url.replace('{weekday}', ITALIAN_WEEKDAYS[targetDate.getDay()]);

  return url;
}

// ============================================================================
// HTTP REQUEST UTILITIES
// ============================================================================

/**
 * Builds HTTP headers for a request, with special handling for specific domains
 */
function buildHeaders(url: string, userAgent: string): Record<string, string> {
  const baseHeaders: Record<string, string> = {
    'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  };

  // Enhanced headers for Fanpage.it to avoid 403 errors
  if (url.includes('fanpage.it')) {
    console.log('Fanpage.it - Using enhanced headers');
    return {
      ...baseHeaders,
      'Referer': 'https://www.fanpage.it/stile-e-trend/story/oroscopo/',
      'Origin': 'https://www.fanpage.it',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
    };
  }

  return baseHeaders;
}

/**
 * Adds a random delay for Fanpage.it to appear more human-like
 */
async function addHumanLikeDelay(url: string): Promise<void> {
  if (url.includes('fanpage.it')) {
    const randomDelay = Math.floor(Math.random() * 2000) + 1000; // 1-3 seconds
    console.log(`Fanpage.it - Adding ${randomDelay}ms human-like delay`);
    await new Promise(resolve => setTimeout(resolve, randomDelay));
  }
}

/**
 * Retries a request with an alternative user agent (Safari on macOS)
 */
async function retryWithAlternativeUserAgent(url: string): Promise<string> {
  console.log('Fanpage.it - Got 403, retrying with Safari user agent...');

  const safariUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  const headers = buildHeaders(url, safariUA);

  // Wait 3 seconds before retry
  await new Promise(resolve => setTimeout(resolve, 3000));

  const response = await axios.get(url, {
    headers,
    timeout: 15000,
    maxRedirects: 5,
  });

  return response.data;
}

async function retryFanpageWithEnhancedRetries(url: string): Promise<string> {
  const safariUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  const firefoxUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0';
  const edgeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/120.0.0.0';

  const userAgents = [safariUA, firefoxUA, edgeUA];
  const referers = [
    'https://www.fanpage.it/stile-e-trend/story/oroscopo/',
    'https://www.fanpage.it/',
    'https://www.google.com/'
  ];
  const encodings = ['gzip, deflate, br', 'gzip, deflate'];

  // Try combinations with small delays; log each attempt
  for (const ua of userAgents) {
    for (const enc of encodings) {
      for (const ref of referers) {
        console.log(`Fanpage.it - retrying with UA="${ua.split(' ')[0]}", Accept-Encoding="${enc}", Referer="${ref}"`);
        // Build headers from buildHeaders but override Accept-Encoding/Referer/User-Agent
        const base = buildHeaders(url, ua);
        const headers = {
          ...base,
          'Accept-Encoding': enc,
          'Referer': ref,
          'User-Agent': ua
        };

        // brief backoff between tries
        await new Promise(res => setTimeout(res, 2000));

        try {
          const response = await axios.get(url, {
            headers,
            timeout: 15000,
            maxRedirects: 5,
            validateStatus: (s) => s < 500
          });

          if (response.status === 200) {
            console.log('Fanpage.it - Retry successful with alternate headers/UA');
            return response.data;
          }

          // if not 403 but some other 4xx, surface that
          if (response.status !== 403 && response.status >= 400) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        } catch (err) {
          // continue trying other combos on 403 or network errors; bubble up non-axios unexpected errors
          if (axios.isAxiosError(err)) {
            console.log(`Fanpage.it - retry attempt failed: ${err.message}`);
            // continue trying
            continue;
          } else {
            throw err;
          }
        }
      }
    }
  }

  throw new Error('Fanpage.it - All enhanced retries exhausted (403)');
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

/**
 * Fetches HTML content from a URL with proper error handling and retry logic
 */
async function fetchHtml(url: string, userAgent: string): Promise<string> {
  try {
    // Add human-like delay for Fanpage.it
    await addHumanLikeDelay(url);

    const headers = buildHeaders(url, userAgent);

    const response = await axios.get(url, {
      headers,
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Accept 4xx to handle them gracefully
    });

    // Special handling for 403 on Fanpage.it — enhanced multi-UA/headers retry
    if (response.status === 403 && url.includes('fanpage.it')) {
      return await retryFanpageWithEnhancedRetries(url);
    }

    // Handle other 4xx errors
    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`HTTP ${error.response?.status || 'unknown'}: ${error.message}`);
    }
    throw error;
  }
}

// Content quality scoring system

// ============================================================================
// HTML CLEANING UTILITIES
// ============================================================================

/**
 * Removes structural HTML elements (scripts, styles, navigation, etc.)
 */
function cleanHtmlStructure(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Decodes common HTML entities to their character equivalents
 */
function decodeHtmlEntities(text: string): string {
  return text
    // Common entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // Quotes and apostrophes
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    // Dashes
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '—')
    .replace(/&hellip;/g, '...')
    // Italian accented characters
    .replace(/&agrave;/g, 'à')
    .replace(/&egrave;/g, 'è')
    .replace(/&eacute;/g, 'é')
    .replace(/&igrave;/g, 'ì')
    .replace(/&ograve;/g, 'ò')
    .replace(/&ugrave;/g, 'ù')
    // Unicode special characters
    .replace(/\u00a0/g, ' ')      // non-breaking space
    .replace(/\u200b/g, '')        // zero-width space
    .replace(/\u2028/g, ' ')       // line separator
    .replace(/\u2029/g, ' ');      // paragraph separator
}

/**
 * Normalizes whitespace (spaces, tabs, newlines)
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')       // Multiple spaces/tabs to single space
    .replace(/\n[ \t]+/g, '\n')    // Remove leading spaces on new lines
    .replace(/\n{3,}/g, '\n\n')    // Max 2 consecutive newlines
    .replace(/\s{2,}/g, ' ')       // Multiple spaces to single space (catch-all)
    .trim();
}

/**
 * Removes HTML tags while preserving text structure
 */
function stripHtmlTags(html: string, preserveBreaks: boolean = true): string {
  let text = html;

  if (preserveBreaks) {
    // Convert break tags to newlines before removing tags
    text = text
      .replace(/<br[^>]*>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n');
  }

  // Remove all remaining HTML tags
  return text.replace(/<[^>]*>/g, ' ');
}

/**
 * Complete pipeline for cleaning extracted text content
 * Combines all cleaning operations in the correct order
 */
function cleanExtractedText(text: string): string {
  return normalizeWhitespace(
    decodeHtmlEntities(
      stripHtmlTags(text, true)
    )
  );
}

/**
 * Complete pipeline for cleaning raw HTML before processing
 * Use this for initial HTML cleanup before parsing
 */
function cleanRawHtml(html: string): string {
  return cleanHtmlStructure(html);
}

function scoreHoroscopeContent(content: string, zodiacName: string, domain: string): number {
  let score = 0;
  const contentLower = content.toLowerCase();

  // Core horoscope keywords
  const horoscopeMatches = (content.match(new RegExp(`\\b(${COMPREHENSIVE_HOROSCOPE_KEYWORDS.join('|')})\\b`, 'gi')) || []).length;
  score += horoscopeMatches * 8;

  // Predictive language
  const predictiveMatches = (content.match(new RegExp(`\\b(${COMPREHENSIVE_PREDICTIVE_LANGUAGE.join('|')})\\b`, 'gi')) || []).length;
  score += predictiveMatches * 6;

  // Zodiac sign mention
  if (contentLower.includes(zodiacName.toLowerCase())) {
    score += 25;
  }

  // Content length scoring
  if (content.length > 50) score += 5;
  if (content.length > 100) score += 10;
  if (content.length > 200) score += 15;
  if (content.length > 400) score += 20;

  // Navigation penalty
  const navigationMatches = (content.match(new RegExp(`\\b(${ENHANCED_NAVIGATION_TERMS.join('|')})\\b`, 'gi')) || []).length;
  const totalWords = content.split(/\s+/).length;
  const navigationRatio = navigationMatches / Math.max(totalWords, 1);

  if (navigationRatio > 0.5) score -= 100;
  else if (navigationRatio > 0.3) score -= 60;
  else if (navigationRatio > 0.15) score -= 30;

  return Math.max(score, 0);
}

// Enhanced scraping functions
async function scrapeVirgilioHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log('Virgilio.it - Starting enhanced scraping for:', input.signSlugIt);

    const response = await fetchHtml(url, input.userAgent);
    const html = response;

    let cleanHtml = cleanRawHtml(html);

    // Estrae TUTTI i paragrafi con classe txt-r-s1
    let extractedParagraphs: string[] = [];
    const pTagRegex = /<p[^>]*class="[^"]*txt-r-s1[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
    let match;

    let paragraphOrder = 0;

    while ((match = pTagRegex.exec(cleanHtml)) !== null) {
      let paraContent = cleanExtractedText(match[1]);

      // Scarta solo se è veramente vuoto
      if (paraContent.length > 10) {
        // Il primo paragrafo è quello iniziale "In questo giorno"
        if (paragraphOrder === 0) {
          console.log('✓ Paragrafo iniziale trovato');
        }
        
        extractedParagraphs.push(paraContent);
        paragraphOrder++;
      }
    }

    console.log(`📝 Totale paragrafi estratti: ${extractedParagraphs.length}`);

    let finalExtractedText = extractedParagraphs.join('\n\n');

    if (!finalExtractedText || finalExtractedText.length < 50) {
      return {
        success: false,
        error: `No sufficient horoscope content found using p.txt-r-s1 for ${input.signSlugIt} on Virgilio.it`
      };
    }

    return {
      success: true,
      text: finalExtractedText.substring(0, 3500),
      url,
      actualUrl: url
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Virgilio.it scraping error'
    };
  }
}

async function scrapeOnlyOroscopoHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log('OnlyOroscopo - Starting scraping for:', input.signSlugIt);

    const html = await fetchHtml(url, input.userAgent);
    const $ = cheerio.load(html);

    let extractedText = '';

    // ========== STRATEGIA PRINCIPALE: data-id="3087e79c" ==========
    // Questo ID è costante su tutte le pagine di tutti i segni
    console.log('OnlyOroscopo - Looking for primary widget [data-id="3087e79c"]...');

    const primaryWidget = $('[data-id="3087e79c"]');

    if (primaryWidget.length > 0) {
      console.log(`OnlyOroscopo - ✓ Found widget with data-id="3087e79c"`);

      const container = primaryWidget.find('.elementor-widget-container').first();

      if (container.length > 0) {
        // Estrai tutto il testo
        let text = container.text().trim().replace(/\s+/g, ' ');

        // Rimuovi tutto dopo "Parola del giorno" (case-insensitive)
        const stopPhrases = ['parola del giorno:', 'parola del giorno'];
        let finalText = text;

        for (const phrase of stopPhrases) {
          const stopIndex = finalText.toLowerCase().indexOf(phrase);
          if (stopIndex !== -1) {
            finalText = finalText.substring(0, stopIndex).trim();
            console.log(`OnlyOroscopo - Trimmed at "${phrase}" (position ${stopIndex})`);
            break;
          }
        }

        if (finalText.length >= 100) {
          extractedText = finalText;
          console.log(`OnlyOroscopo - ✓ SUCCESS: Extracted ${extractedText.length} chars`);
        } else {
          console.log(`OnlyOroscopo - ✗ Text too short: ${finalText.length} chars`);
        }
      } else {
        console.log('OnlyOroscopo - ✗ No .elementor-widget-container found');
      }
    } else {
      console.log('OnlyOroscopo - ✗ Widget [data-id="3087e79c"] not found');
    }

    // ========== STRATEGIA FALLBACK 1: Section data-id="5cdf0ff8" ==========
    if (!extractedText || extractedText.length < 100) {
      console.log('OnlyOroscopo - Trying fallback: section [data-id="5cdf0ff8"]...');

      const targetSection = $('section[data-id="5cdf0ff8"]');

      if (targetSection.length > 0) {
        const textWidget = targetSection.find('.elementor-widget-text-editor').first();

        if (textWidget.length > 0) {
          const container = textWidget.find('.elementor-widget-container').first();
          let text = container.text().trim().replace(/\s+/g, ' ');

          // Remove "Parola del giorno"
          const stopIndex = text.toLowerCase().indexOf('parola del giorno');
          if (stopIndex !== -1) {
            text = text.substring(0, stopIndex).trim();
          }

          if (text.length >= 100) {
            extractedText = text;
            console.log(`OnlyOroscopo - ✓ Fallback 1 SUCCESS: ${extractedText.length} chars`);
          }
        }
      }
    }

    // ========== STRATEGIA FALLBACK 2: Qualsiasi drop-cap in sezioni pulite ==========
    if (!extractedText || extractedText.length < 100) {
      console.log('OnlyOroscopo - Trying fallback: drop-cap in clean sections...');

      let bestText = '';
      let bestScore = 0;

      $('section.elementor-section').each((_, section) => {
        const $section = $(section);

        // Skip sections with navigation elements
        if ($section.find('.elementor-star-rating, .elementor-button, .elementor-posts').length > 0) {
          return true; // continue
        }

        const textWidget = $section.find('.elementor-widget-text-editor.elementor-drop-cap-yes');

        if (textWidget.length > 0) {
          const container = textWidget.find('.elementor-widget-container').first();
          let text = container.text().trim().replace(/\s+/g, ' ');

          // Remove "Parola del giorno"
          const stopIndex = text.toLowerCase().indexOf('parola del giorno');
          if (stopIndex !== -1) {
            text = text.substring(0, stopIndex).trim();
          }

          // Skip navigation texts
          const navPattern = /GIORNALIERO|SETTIMANALE|MENSILE|ANNUALE|Cambia Segno|Curiosità|Affinità/i;
          if (navPattern.test(text)) {
            return true; // continue
          }

          // Score based on astrological keywords
          const keywords = ['luna', 'sole', 'mercurio', 'energia', 'giornata', 'relazioni', 'amore', 'lavoro', 'scorpione', 'fortuna'];
          const score = keywords.filter(k => text.toLowerCase().includes(k)).length;

          if (text.length >= 150 && score > bestScore) {
            bestScore = score;
            bestText = text;
          }
        }
      });

      if (bestText && bestScore >= 3) {
        extractedText = bestText;
        console.log(`OnlyOroscopo - ✓ Fallback 2 SUCCESS: ${extractedText.length} chars, score: ${bestScore}`);
      }
    }

    // ========== VALIDAZIONE FINALE ==========
    if (!extractedText || extractedText.length < 100) {
      console.log('OnlyOroscopo - ✗ FAILED: No valid content after all strategies');

      // Debug: Show all widgets found
      console.log('OnlyOroscopo - Debug: All text-editor widgets:');
      $('.elementor-widget-text-editor').each((i, elem) => {
        const dataId = $(elem).attr('data-id') || 'none';
        const hasDropCap = $(elem).hasClass('elementor-drop-cap-yes');
        const text = $(elem).find('.elementor-widget-container').text().trim();
        console.log(`  [${i}] data-id="${dataId}", drop-cap=${hasDropCap}, length=${text.length}`);
        if (text.length > 0 && text.length < 200) {
          console.log(`      preview: "${text.substring(0, 100)}"`);
        }
      });

      return {
        success: false,
        error: `No horoscope content found for ${input.signSlugIt} on OnlyOroscopo`
      };
    }

    // Pulizia finale
    extractedText = normalizeWhitespace(decodeHtmlEntities(extractedText));

    // Quality check
    const finalScore = scoreHoroscopeContent(extractedText, input.signSlugIt.toLowerCase(), 'onlyoroscopo.it');
    console.log(`OnlyOroscopo - ✅ FINAL: ${extractedText.length} chars, quality: ${finalScore}`);

    // Sanity check: deve contenere almeno 2 frasi
    const sentenceCount = (extractedText.match(/[.!?]+/g) || []).length;
    if (sentenceCount < 2) {
      console.log(`OnlyOroscopo - ⚠️ Warning: Only ${sentenceCount} sentence(s) detected`);
    }

    return {
      success: true,
      text: extractedText.substring(0, 3500),
      url,
      actualUrl: url
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown OnlyOroscopo scraping error'
    };
  }
}

async function scrapeRepubblicaHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    // Step 1: resolve the index page → actual article URL when needed
    if (url.includes('repubblica.it/oroscopo/') && !url.includes('/news/')) {
      const articleUrl = await findRepubblicaArticleUrl(url, input.dateISO);

      if (!articleUrl) {
        return {
          success: false,
          error: 'Could not find today\'s horoscope article on Repubblica.it index page'
        };
      }

      url = articleUrl;
    }

    // Step 2: fetch and parse with cheerio
    // d.repubblica.it marks each sign's section with:
    //   <h2 class="segno-ariete">ARIETE</h2>
    //   <p>…horoscope text…</p>
    // The class slug is the lowercased Italian sign name.
    const html = await fetchHtml(url, input.userAgent);
    const $ = cheerio.load(html);

    const signSlug = input.signSlugIt.toLowerCase(); // e.g. "ariete"
    const heading = $(`h2.segno-${signSlug}`);

    if (heading.length > 0) {
      // Collect all consecutive <p> tags that follow the heading until the next h2
      const paragraphs: string[] = [];
      let node = heading.next();
      while (node.length > 0 && !node.is('h2')) {
        if (node.is('p')) {
          const text = node.text().trim();
          if (text) paragraphs.push(text);
        }
        node = node.next();
      }

      const text = paragraphs.join(' ').trim();

      if (text.length > 30) {
        console.log(`Repubblica.it - Extracted ${text.length} chars for ${input.signSlugIt}`);
        return { success: true, text, actualUrl: url };
      }

      console.warn(`Repubblica.it - Heading found for ${input.signSlugIt} but no text after it`);
    } else {
      console.warn(`Repubblica.it - h2.segno-${signSlug} not found, falling back to generic scraper`);
    }

    // Step 3: fallback to generic scraper
    const result = await scrapeHoroscopeText(url, input);
    if (result.success) result.actualUrl = url;
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Repubblica scraping error'
    };
  }
}

async function findRepubblicaArticleUrl(indexUrl: string, targetDate: string): Promise<string | null> {
  try {
    const response = await axios.get(indexUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = response.data;
    const dateObj = new Date(targetDate);
    const day = dateObj.getDate();
    const month = dateObj.getMonth() + 1;
    const year = dateObj.getFullYear();

    const datePatterns = [
      `${year}/${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}`,
      `${year}/${month}/${day}`
    ];

    for (const pattern of datePatterns) {
      const urlPattern = new RegExp(`<a[^>]*href=["']([^"']*oroscopo[^"']*${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"']*)`, 'gi');
      let match;
      while ((match = urlPattern.exec(html)) !== null) {
        let foundUrl = match[1];

        if (foundUrl.startsWith('/')) {
          foundUrl = 'https://www.repubblica.it' + foundUrl;
        }

        if (foundUrl.startsWith('https://') && foundUrl.includes('oroscopo') && foundUrl.includes(pattern)) {
          return foundUrl;
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

async function scrapeAlfemminileHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log('Alfemminile.com - Starting specialized extraction for:', input.signSlugIt);

    const html = await fetchHtml(url, input.userAgent);

    // Clean HTML but preserve structure
    let cleanHtml = cleanRawHtml(html);

    // Map sign names to match the heading patterns
    const signMap: Record<string, string[]> = {
      'Ariete': ['ariete', "dell'ariete", "dell'Ariete"],
      'Toro': ['toro', 'del toro', 'del Toro'],
      'Gemelli': ['gemelli', 'dei gemelli', 'dei Gemelli'],
      'Cancro': ['cancro', 'del cancro', 'del Cancro'],
      'Leone': ['leone', 'del leone', 'del Leone'],
      'Vergine': ['vergine', 'della vergine', 'della Vergine'],
      'Bilancia': ['bilancia', 'della bilancia', 'della Bilancia'],
      'Scorpione': ['scorpione', 'dello scorpione', 'dello Scorpione'],
      'Sagittario': ['sagittario', 'del sagittario', 'del Sagittario'],
      'Capricorno': ['capricorno', 'del capricorno', 'del Capricorno'],
      'Acquario': ['acquario', "dell'acquario", "dell'Acquario"],
      'Pesci': ['pesci', 'dei pesci', 'dei Pesci']
    };

    const signVariants = signMap[input.signSlugIt] || [input.signSlugIt.toLowerCase()];
    let extractedContent = '';

    // Look for heading patterns for the specific sign
    for (const variant of signVariants) {
      // Pattern 1: <h2 class="sign">Oroscopo del/della/dello/dell'/dei sign</h2>
      const headingPattern1 = new RegExp(`<h2[^>]*class="[^"]*${variant.split(' ')[0]}[^"]*"[^>]*>\\s*Oroscopo\\s+(?:del|della|dello|dell'|dei)\\s+${variant}[^<]*</h2>`, 'gi');

      // Pattern 2: <h2>Oroscopo del/della/dello/dell'/dei sign</h2> (without class)
      const headingPattern2 = new RegExp(`<h2[^>]*>\\s*Oroscopo\\s+(?:del|della|dello|dell'|dei)\\s+${variant}[^<]*</h2>`, 'gi');

      // Pattern 3: Any heading with the sign name
      const headingPattern3 = new RegExp(`<h[2-4][^>]*>\\s*[^<]*${variant}[^<]*</h[2-4]>`, 'gi');

      const patterns = [headingPattern1, headingPattern2, headingPattern3];

      for (const pattern of patterns) {
        const headingMatch = cleanHtml.match(pattern);

        if (headingMatch) {
          console.log(`Alfemminile.com - Found heading for ${input.signSlugIt}: ${headingMatch[0]}`);

          // Find the position of this heading
          const headingIndex = cleanHtml.indexOf(headingMatch[0]);

          if (headingIndex !== -1) {
            // Extract content from after this heading until the next heading or end
            let contentAfterHeading = cleanHtml.substring(headingIndex + headingMatch[0].length);

            // Find the end of this section (next h2/h3/h4 or significant break)
            const nextHeadingMatch = contentAfterHeading.match(/<h[2-4][^>]*>/i);
            const nextSectionEnd = contentAfterHeading.match(/<section[^>]*>|<article[^>]*>|<div[^>]*class="[^"]*(?:horoscope|oroscopo|sign)[^"]*"/i);

            let endIndex = contentAfterHeading.length;
            if (nextHeadingMatch && nextHeadingMatch.index !== undefined) {
              endIndex = Math.min(endIndex, nextHeadingMatch.index);
            }
            if (nextSectionEnd && nextSectionEnd.index !== undefined) {
              endIndex = Math.min(endIndex, nextSectionEnd.index);
            }

            let sectionContent = contentAfterHeading.substring(0, endIndex);

            // Clean and extract text from this section
            // Clean and extract text from this section
            let cleanedContent = cleanExtractedText(sectionContent);

            if (cleanedContent.length > 50) {
              const score = scoreHoroscopeContent(cleanedContent, input.signSlugIt.toLowerCase(), 'alfemminile.com');
              console.log(`Alfemminile.com - Found content for ${input.signSlugIt} with score ${score} (length: ${cleanedContent.length})`);

              if (score > 20) {
                extractedContent = cleanedContent;
                break;
              }
            }
          }
        }

        if (extractedContent) break;
      }

      if (extractedContent) break;
    }

    if (!extractedContent || extractedContent.length < 50) {
      return {
        success: false,
        error: `No substantial horoscope content found for ${input.signSlugIt} on Alfemminile.com`
      };
    }

    console.log(`Alfemminile.com - Successfully extracted content for ${input.signSlugIt}, length: ${extractedContent.length}`);

    return {
      success: true,
      text: extractedContent.substring(0, 3500),
      url,
      actualUrl: url
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Alfemminile.com scraping error'
    };
  }
}

async function scrapeGazzettaHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log('Gazzetta.it - Starting specialized extraction for:', input.signSlugIt);
    console.log('Gazzetta.it - URL being scraped:', url);

    const html = await fetchHtml(url, input.userAgent);
    const $ = cheerio.load(html);

    const zodiacName = input.signSlugIt.toLowerCase();
    const signCapitalized = zodiacName.charAt(0).toUpperCase() + zodiacName.slice(1);

    // ── Strategy 1: JSON-LD articleBody ──────────────────────────────────────
    // Gazzetta embeds the full 12-sign article in a JSON-LD <script>.
    // The articleBody is a single string concatenating all 12 signs, each block
    // starting with "Nato sotto il segno ...".  Split on that delimiter and find
    // the chunk whose first ~100 chars contain our sign name.
    let bestContent = '';

    $('script[type="application/ld+json"]').each((_, el) => {
      if (bestContent) return; // already found
      try {
        const json = JSON.parse($(el).html() || '');
        const articleBody: string = json.articleBody || '';
        if (!articleBody) return;

        // Split on every "Nato sotto il segno" occurrence
        const sections = articleBody.split(/Nato sotto il segno/i);
        for (const section of sections) {
          // The sign name appears within the first ~80 chars of each chunk
          if (new RegExp(signCapitalized, 'i').test(section.substring(0, 80))) {
            let raw = ('Nato sotto il segno' + section).replace(/\s+/g, ' ').trim();
            // Strip the "Nato sotto il segno X: PersonName" intro — start from
            // "La tua giornata" which is the first real horoscope paragraph.
            const laTuaIdx = raw.search(/La tua giornata/i);
            if (laTuaIdx > 0) raw = raw.substring(laTuaIdx);
            bestContent = raw;
            console.log(`Gazzetta.it - Extracted from JSON-LD articleBody, length: ${bestContent.length}`);
            break;
          }
        }
      } catch {
        // JSON parse failed, continue to next strategy
      }
    });

    if (bestContent) {
      return {
        success: true,
        text: bestContent.substring(0, 3500),
        url,
        actualUrl: url,
      };
    }

    // ── Strategy 2: p.paragraph cheerio extraction ───────────────────────────
    // Each Gazzetta sign page has its horoscope text inside <p class="paragraph">
    // elements within the card module.  After stripping chrome (nav/header/footer)
    // these paragraphs contain only the relevant sign's content.
    console.log('Gazzetta.it - JSON-LD strategy failed, trying p.paragraph extraction');

    $('script, style, nav, header, footer, iframe, noscript').remove();

    const paragraphs: string[] = [];
    $('p.paragraph').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      // Skip the "Nato sotto il segno X: PersonName" intro paragraph
      if (text.length > 10 && !/^Nato sotto il segno/i.test(text)) paragraphs.push(text);
    });

    if (paragraphs.length >= 3) {
      bestContent = paragraphs.join('\n\n');
      console.log(`Gazzetta.it - Extracted ${paragraphs.length} paragraphs via cheerio, length: ${bestContent.length}`);
      return {
        success: true,
        text: bestContent.substring(0, 3500),
        url,
        actualUrl: url,
      };
    }

    return {
      success: false,
      error: `No substantial horoscope content found for ${input.signSlugIt} on Gazzetta.it`,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Gazzetta.it scraping error',
    };
  }
}

// LA FUNZIONE SKY TG24
// New URL format (2025+): per-sign static pages — /lifestyle/oroscopo/{sign}/oggi
// Each page contains content for a single sign; no need to filter by sign name.
async function scrapeSkyTG24HoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log('Sky TG24 - Starting extraction for:', input.signSlugIt, '| URL:', url);

    const html = await fetchHtml(url, input.userAgent);
    const $ = cheerio.load(html);

    let extractedText = '';

    // Strategy 1: JSON-LD articleBody
    $('script[type="application/ld+json"]').each((_, el) => {
      if (extractedText) return;
      try {
        const raw = JSON.parse($(el).html() || '{}');
        const data = Array.isArray(raw) ? raw[0] : raw;
        const body: string = data?.articleBody || '';
        if (body.length > 100) {
          extractedText = body;
          console.log(`Sky TG24 - Strategy 1 (JSON-LD): ${extractedText.length} chars`);
        }
      } catch { /* ignore malformed JSON-LD */ }
    });

    // Strategy 2: Sky TG24 article body selectors
    if (!extractedText) {
      const skySelectors = [
        '.c-article-text p',
        '.c-article__body p',
        '.article-body p',
        '.c-extended-card__body p',
        'article p',
        'main p',
      ];
      for (const sel of skySelectors) {
        const paras = $(sel).map((_, el) => {
          const $p = $(el);
          const t = $p.text().trim();
          const isOnlyLink = $p.find('a').length > 0 && t === $p.find('a').text().trim();
          return isOnlyLink ? '' : t;
        }).get().filter(t => t.length > 30 &&
          !/^(leggi anche|pubblicità|condividi|cookie|scopri|newsletter|abbonati)/i.test(t));
        if (paras.length > 0) {
          extractedText = paras.join('\n\n');
          console.log(`Sky TG24 - Strategy 2 (${sel}): ${extractedText.length} chars`);
          break;
        }
      }
    }

    // Strategy 3: legacy multi-sign page — find the card for this sign
    if (!extractedText) {
      const zodiacNameLower = input.signSlugIt.toLowerCase();
      const signCard = $('.c-extended-card').filter((_, el) =>
        $(el).children('h2').first().text().trim().toLowerCase() === zodiacNameLower
      ).first();
      if (signCard.length > 0) {
        const paragraphs: string[] = [];
        signCard.find('.c-extended-card__body p').each((_, p) => {
          const $p = $(p);
          const t = $p.text().trim();
          const isOnlyLink = $p.find('a').length > 0 && t === $p.find('a').text().trim();
          if (t.length > 20 && !isOnlyLink) paragraphs.push(t);
        });
        if (paragraphs.length > 0) {
          extractedText = paragraphs.join(' ');
          console.log(`Sky TG24 - Strategy 3 (c-extended-card legacy): ${extractedText.length} chars`);
        }
      }
    }

    console.log(`Sky TG24 - Total extracted: ${extractedText.length} chars`);

    if (!extractedText || extractedText.length < 50) {
      return {
        success: false,
        error: `No substantial horoscope content found for ${input.signSlugIt} on Sky TG24`
      };
    }

    const score = scoreHoroscopeContent(extractedText, input.signSlugIt.toLowerCase(), 'skytg24.it');
    console.log(`Sky TG24 - Content score: ${score}`);

    if (score < 15 && extractedText.length < 100) {
      return {
        success: false,
        error: `Extracted content quality too low (score: ${score}) for ${input.signSlugIt} on Sky TG24`
      };
    }

    return {
      success: true,
      text: extractedText.substring(0, 3500),
      url,
      actualUrl: url
    };

  } catch (error) {
    console.error(`Sky TG24 - Fetch/parse error for ${input.signSlugIt}:`, error instanceof Error ? error.message : error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Sky TG24 scraping error'
    };
  }
}

/**
 * Scrapes horoscope content from Oggi.it
 * Uses cheerio for robust heading/paragraph extraction
 */
async function scrapeOggiHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log('Oggi.it - Starting specialized extraction for:', input.signSlugIt);

    const html = await fetchHtml(url, input.userAgent);
    const $ = cheerio.load(html);

    const zodiacNameLower = input.signSlugIt.toLowerCase();
    let extractedText = '';

    // Strategy 1: trova heading che contiene il nome del segno, estrai paragrafi seguenti
    const headingLevels = ['h4', 'h3', 'h2', 'h1'];
    for (const level of headingLevels) {
      const heading = $(level).filter((_, el) => {
        const text = $(el).text().trim().toLowerCase();
        return text.includes(zodiacNameLower) || text.includes('oroscopo di oggi');
      }).first();

      if (heading.length > 0) {
        console.log(`Oggi.it - Found ${level} heading: "${heading.text().trim()}"`);
        const paragraphs: string[] = [];
        heading.nextAll('p, div.text, div.content').each((_, el) => {
          const text = $(el).text().trim().replace(/\s+/g, ' ');
          if (text.length > 30) paragraphs.push(text);
        });
        if (paragraphs.length > 0) {
          extractedText = paragraphs.join(' ');
          console.log(`Oggi.it - Strategy 1 (${level} sibling paragraphs): ${extractedText.length} chars`);
          break;
        }
      }
    }

    // Strategy 2: estrai il contenuto dall'article o dal main content
    if (!extractedText || extractedText.length < 50) {
      const contentSelectors = [
        'article', '.article-body', '.entry-content',
        '.post-content', 'main', '.content', '.article__body',
      ];
      for (const sel of contentSelectors) {
        const container = $(sel).first();
        if (container.length > 0) {
          const texts = container.find('p')
            .map((_, p) => $(p).text().trim().replace(/\s+/g, ' ')).get()
            .filter(t => t.length > 30);
          if (texts.length > 0) {
            extractedText = texts.join(' ');
            console.log(`Oggi.it - Strategy 2 (${sel}): ${extractedText.length} chars`);
            break;
          }
        }
      }
    }

    console.log(`Oggi.it - Total extracted: ${extractedText.length} chars`);

    if (!extractedText || extractedText.length < 50) {
      return {
        success: false,
        error: `No valid horoscope content found for ${input.signSlugIt} on Oggi.it`
      };
    }

    const paragraphs = extractedText.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);
    const sections = organizeOggiSections(paragraphs);
    const finalContent = buildOggiFinalContent(sections);

    return {
      success: true,
      text: finalContent.trim().substring(0, 3500),
      url,
      actualUrl: url
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Oggi.it scraping error'
    };
  }
}

/**
 * Organizes paragraphs into sections (GENERALE, AMORE, LAVORO, BENESSERE)
 */
function organizeOggiSections(paragraphs: string[]): Record<string, string[]> {
  const sections: Record<string, string[]> = {
    'GENERALE': [],
    'AMORE': [],
    'LAVORO': [],
    'BENESSERE': []
  };

  let currentSection = 'GENERALE';

  for (const paragraph of paragraphs) {
    // Check if this is a section header (short text with keywords)
    if (paragraph.length < 50) {
      if (/amore|eros/i.test(paragraph)) {
        currentSection = 'AMORE';
        continue;
      } else if (/lavoro|denaro/i.test(paragraph)) {
        currentSection = 'LAVORO';
        continue;
      } else if (/benessere|salute/i.test(paragraph)) {
        currentSection = 'BENESSERE';
        continue;
      }
    }

    sections[currentSection].push(paragraph);
  }

  return sections;
}

/**
 * Builds final content from organized sections with markers
 */
function buildOggiFinalContent(sections: Record<string, string[]>): string {
  let content = '';

  if (sections['GENERALE'].length > 0) {
    content += sections['GENERALE'].join(' ') + '\n\n';
  }

  if (sections['AMORE'].length > 0) {
    content += `---AMORE_SECTION_START---\n${sections['AMORE'].join(' ')}\n\n`;
  }

  if (sections['LAVORO'].length > 0) {
    content += `---LAVORO_SECTION_START---\n${sections['LAVORO'].join(' ')}\n\n`;
  }

  if (sections['BENESSERE'].length > 0) {
    content += `---SALUTE_SECTION_START---\n${sections['BENESSERE'].join(' ')}\n\n`;
  }

  // Fallback: if no sections, return all paragraphs
  if (!content.trim() && sections['GENERALE'].length > 0) {
    content = sections['GENERALE'].join('\n\n');
  }

  return content;
}

async function scrapeFanpageHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log('Fanpage.it - Starting specialized extraction for:', input.signSlugIt);

    const html = await fetchHtml(url, input.userAgent);
    const $ = cheerio.load(html);

    const zodiacNameLower = input.signSlugIt.toLowerCase();
    let bestContent = '';
    let highestScore = 0;

    // Strategy 0: JSON-LD articleBody — all signs are embedded as \r\nSignName\r\n delimited sections
    const allItalianSigns = ['Ariete','Toro','Gemelli','Cancro','Leone','Vergine',
      'Bilancia','Scorpione','Sagittario','Capricorno','Acquario','Pesci'];
    $('script[type="application/ld+json"]').each((_, el) => {
      if (bestContent) return;
      try {
        const rawData = JSON.parse($(el).html() || '{}');
        const data = Array.isArray(rawData) ? rawData[0] : rawData;
        const body: string = data?.articleBody || '';
        if (!body) return;
        // Split on \r\nSignName\r\n delimiters (capture group keeps sign names in parts array)
        const signPattern = new RegExp(`\\r?\\n(${allItalianSigns.join('|')})\\r?\\n`);
        const parts = body.split(signPattern);
        // parts layout: [intro, signName0, text0, signName1, text1, ...]
        for (let i = 1; i + 1 < parts.length; i += 2) {
          if (normalizeForMatching(parts[i]) === normalizeForMatching(input.signSlugIt)) {
            bestContent = parts[i + 1].replace(/\r\n/g, '\n').trim();
            highestScore = 100;
            break;
          }
        }
      } catch { /* malformed JSON-LD, skip */ }
    });

    if (!bestContent) {
      // Rimuovi elementi non necessari
      $('script, style, nav, header, footer, iframe, noscript').remove();

      // Strategy 1: Cerca div con classe article-body o simili
      const contentSelectors = [
        '.article-body',
        '.entry-content',
        '.post-content',
        '[class*="article"][class*="content"]',
        'article .content',
        'main article'
      ];

      for (const selector of contentSelectors) {
        const content = $(selector);
        if (content.length > 0) {
          const paragraphs: string[] = [];
          content.find('p').each((_, elem) => {
            const text = $(elem).text().trim();
            if (text.length > 20) paragraphs.push(text);
          });
          if (paragraphs.length > 0) {
            const combinedText = paragraphs.join('\n\n');
            const score = scoreHoroscopeContent(combinedText, zodiacNameLower, 'fanpage.it');
            if (score > highestScore) { highestScore = score; bestContent = combinedText; }
          }
        }
      }

      // Strategy 2: cerca heading con il nome del segno
      if (!bestContent || highestScore < 30) {
        const headingPattern = new RegExp(`<h[2-4][^>]*>[^<]*${input.signSlugIt}[^<]*</h[2-4]>`, 'gi');
        const htmlString = $.html();
        const headingMatch = htmlString.match(headingPattern);
        if (headingMatch) {
          const headingIndex = htmlString.indexOf(headingMatch[0]);
          if (headingIndex !== -1) {
            let contentAfter = htmlString.substring(headingIndex + headingMatch[0].length);
            const nextHeading = contentAfter.match(/<h[2-4][^>]*>/i);
            if (nextHeading && nextHeading.index !== undefined) {
              contentAfter = contentAfter.substring(0, nextHeading.index);
            }
            const $section = cheerio.load(contentAfter);
            const sectionText = $section('p').map((_, elem) => $section(elem).text().trim()).get().join('\n\n');
            if (sectionText.length > 50) {
              const score = scoreHoroscopeContent(sectionText, zodiacNameLower, 'fanpage.it');
              if (score > highestScore) { bestContent = sectionText; highestScore = score; }
            }
          }
        }
      }
    }

    if (!bestContent || highestScore < 20) {
      return {
        success: false,
        error: `No substantial horoscope content found for ${input.signSlugIt} on Fanpage.it`
      };
    }

    console.log(`Fanpage.it - Successfully extracted content, score: ${highestScore}, length: ${bestContent.length}`);

    return {
      success: true,
      text: bestContent.substring(0, 3500),
      url,
      actualUrl: url
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Fanpage.it scraping error'
    };
  }
}

// Helper: normalize strings for robust matching (remove accents, punctuation, collapse spaces)
function normalizeForMatching(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')      // remove diacritics
    .replace(/[^a-z0-9\s]/g, ' ')         // remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

async function scrapeQuotidianoHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log('Quotidiano.net - Starting specialized extraction for:', input.signSlugIt);

    const html = await fetchHtml(url, input.userAgent);
    const $ = cheerio.load(html);

    // Remove noisy elements
    $('script, style, nav, header, footer, iframe, noscript, .ads, .cookie-banner').remove();

    const zodiacNameLower = input.signSlugIt.toLowerCase();
    const signNorm = normalizeForMatching(input.signSlugIt);
    let extractedText = '';

    const GENERIC_HEADING_RE = /\b(per tutti i|tutti i segni|12 segni|per 12 segni|previsioni per tutti|oroscopo per tutti)\b/i;
    const GENERIC_PARAGRAPH_RE = /\b(tutti i segni|per tutti i segni|previsioni per tutti i segni|oroscopo per tutti)\b/i;

    // Strategy A: Find H2/H3/H4 heading that contains the sign (skip headings that are generic intros)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let anchorHeading: any = null;
    $('h2, h3, h4').each((_, h) => {
      const hText = $(h).text() || '';
      const hNorm = normalizeForMatching(hText);

      if (hNorm.includes(signNorm)) {
        // Skip if heading appears generic
        if (GENERIC_HEADING_RE.test(hText)) return;
        anchorHeading = h;
        return false; // break
      }
    });

    if (anchorHeading) {
      console.log(`Quotidiano.net - Found heading anchor: "${$(anchorHeading).text().trim()}"`);
      const paragraphs: string[] = [];

      // Collect siblings after heading until next heading of same level or H2/H3/H4
      $(anchorHeading).nextAll().each((_, sib) => {
        const tag = ((sib as any).tagName || '').toLowerCase();

        if (/^h[2-4]$/.test(tag)) {
          return false; // stop iteration
        }

        const $sib = $(sib);

        if (tag === 'p') {
          const txt = cleanExtractedText($sib.text());
          if (txt.length > 20 && !GENERIC_PARAGRAPH_RE.test(txt)) paragraphs.push(txt);
        } else {
          // collect <p> descendants
          $sib.find('p').each((_, p) => {
            const txt = cleanExtractedText($(p).text());
            if (txt.length > 20 && !GENERIC_PARAGRAPH_RE.test(txt)) paragraphs.push(txt);
          });
        }
      });

      if (paragraphs.length > 0) {
        extractedText = paragraphs.join('\n\n');
      }
    }

    // Strategy B: If no heading found, look for a .webp image whose filename or alt contains the sign
    if (!extractedText) {
      const img = $('img').filter((_, el) => {
        const src = ($(el).attr('src') || '').toLowerCase();
        const alt = ($(el).attr('alt') || '').toLowerCase();
        return (src.endsWith('.webp') || src.includes('.webp')) && (normalizeForMatching(src).includes(signNorm) || normalizeForMatching(alt).includes(signNorm));
      }).first();

      if (img && img.length > 0) {
        console.log('Quotidiano.net - Found .webp image anchor for sign');
        // prefer nearest ancestor article/section/div
        let anchor = img.closest('article, section, .article, .entry, .post').first();
        if (!anchor || anchor.length === 0) anchor = img.parent();

        const paragraphs: string[] = [];
        let seenImage = false;

        anchor.contents().toArray().forEach(node => {
          if (!seenImage) {
            if (node === img[0]) {
              seenImage = true;
            }
            return;
          }

          const nodeTag = ((node as any).tagName || '').toLowerCase();
          const $node = $(node);

          if (nodeTag === 'h2' || nodeTag === 'h3' || nodeTag === 'h4') {
            return;
          }

          if (nodeTag === 'p') {
            const txt = cleanExtractedText($node.text());
            if (txt.length > 20 && !GENERIC_PARAGRAPH_RE.test(txt)) paragraphs.push(txt);
          } else {
            $node.find('p').each((_, p) => {
              const txt = cleanExtractedText($(p).text());
              if (txt.length > 20 && !GENERIC_PARAGRAPH_RE.test(txt)) paragraphs.push(txt);
            });
          }
        });

        if (paragraphs.length > 0) {
          extractedText = paragraphs.join('\n\n');
        }
      }
    }

    // Strategy C: Fallback — collect main article paragraphs but strip initial generic intro
    if (!extractedText) {
      const contentSelectors = [
        '.article-body',
        '.entry-content',
        '.post-content',
        'article .content',
        '.story-content',
        '[class*="article"][class*="content"]'
      ];

      for (const selector of contentSelectors) {
        const content = $(selector);
        if (content.length === 0) continue;

        const paragraphs: string[] = [];
        content.find('p').each((_, p) => {
          const txt = cleanExtractedText($(p).text());
          if (txt.length > 20) paragraphs.push(txt);
        });

        if (paragraphs.length === 0) continue;

        // Remove generic intro paragraphs that mention "tutti i segni" or are very short and generic
        while (paragraphs.length > 0 && (GENERIC_PARAGRAPH_RE.test(paragraphs[0]) || paragraphs[0].length < 60 && /tutti/i.test(paragraphs[0]))) {
          console.log('Quotidiano.net - Dropping generic intro paragraph');
          paragraphs.shift();
        }

        // If still more than one paragraph, try to find the first paragraph that mentions the sign and start from there
        const idx = paragraphs.findIndex(p => normalizeForMatching(p).includes(signNorm));
        let finalParas = paragraphs;
        if (idx >= 0) {
          finalParas = paragraphs.slice(idx);
        }

        const combined = finalParas.join('\n\n');

        if (combined.length > 50 && scoreHoroscopeContent(combined, zodiacNameLower, 'quotidiano.net') > 20) {
          extractedText = combined;
          break;
        }
      }
    }

    if (!extractedText || extractedText.length < 50) {
      return {
        success: false,
        error: `No substantial horoscope content found for ${input.signSlugIt} on Quotidiano.net`
      };
    }

    const finalScore = scoreHoroscopeContent(extractedText, zodiacNameLower, 'quotidiano.net');
    console.log(`Quotidiano.net - Successfully extracted content, score: ${finalScore}, length: ${extractedText.length}`);

    return {
      success: true,
      text: extractedText.substring(0, 3500),
      url,
      actualUrl: url
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Quotidiano.net scraping error'
    };
  }
}

async function findFanpageArticleUrl(archiveUrl: string, targetDate: string): Promise<string | null> {
  try {
    console.log('Fanpage.it - Searching archive page for today\'s horoscope (using fetchHtml)...');

    // Use fetchHtml so we benefit from Fanpage special headers, delays and retry logic
    const html = await fetchHtml(archiveUrl, '');

    const dateObj = new Date(targetDate);
    const day = dateObj.getDate();
    const month = ITALIAN_MONTHS[dateObj.getMonth()];
    const weekday = ITALIAN_WEEKDAYS[dateObj.getDay()];
    const year = dateObj.getFullYear();

    // Pattern: oroscopo-di-weekday-day-month-year (primary)
    const datePattern = `oroscopo-di-${weekday}-${day}-${month}-${year}`;
    console.log(`Fanpage.it - Looking for pattern: ${datePattern}`);

    // Helper to safely build regex from dynamic string
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const candidates = new Set<string>();
    const urlPattern = new RegExp(`href=["']([^"']*${esc(datePattern)}[^"']*)["']`, 'gi');
    let m: RegExpExecArray | null;

    while ((m = urlPattern.exec(html)) !== null) {
      let foundUrl = m[1];
      if (foundUrl.startsWith('/')) foundUrl = 'https://www.fanpage.it' + foundUrl;
      candidates.add(foundUrl);
    }

    // Alternative looser pattern (weekday + day + month + year near "oroscopo")
    const altPattern = new RegExp(`href=["']([^"']*oroscopo[^"']*${esc(weekday)}[^"']*${esc(String(day))}[^"']*${esc(month)}[^"']*${esc(String(year))}[^"']*)["']`, 'gi');
    while ((m = altPattern.exec(html)) !== null) {
      let foundUrl = m[1];
      if (foundUrl.startsWith('/')) foundUrl = 'https://www.fanpage.it' + foundUrl;
      candidates.add(foundUrl);
    }

    // Prioritize article URLs containing 'attualita' or obvious oroscopo slugs
    for (const candidate of Array.from(candidates)) {
      if (/\/attualita\/|\/story\/|oroscopo/i.test(candidate)) {
        console.log(`Fanpage.it - Found article URL: ${candidate}`);
        return candidate;
      }
    }

    // Fallback: return first candidate if any
    const first = Array.from(candidates)[0];
    if (first) {
      console.log(`Fanpage.it - Found article URL (fallback): ${first}`);
      return first;
    }

    console.log('Fanpage.it - No article found in archive page');
    return null;
  } catch (error) {
    console.error('Fanpage.it - Error searching archive:', error);
    return null;
  }
}

/**
 * Finds the actual article URL from quotidiano.net's horoscope archive page
 */
async function findQuotidianoArticleUrl(archiveUrl: string, targetDate: string): Promise<string | null> {
  try {
    console.log('Quotidiano.net - Searching archive page for today\'s horoscope...');

    const response = await axios.get(archiveUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9',
      },
      timeout: 15000
    });

    const html = response.data;
    const dateObj = new Date(targetDate);
    const day = dateObj.getDate();
    const weekday = ITALIAN_WEEKDAYS[dateObj.getDay()];

    // Pattern: oroscopo-di-oggi-weekday-day-RANDOMHASH
    const datePattern = `oroscopo-di-oggi-${weekday}-${day}`;
    console.log(`Quotidiano.net - Looking for pattern: ${datePattern}`);

    // Search for links containing this pattern
    const urlPattern = new RegExp(`href=["']([^"']*${datePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"']*)["']`, 'gi');
    let match;

    while ((match = urlPattern.exec(html)) !== null) {
      let foundUrl = match[1];

      // Make relative URLs absolute
      if (foundUrl.startsWith('/')) {
        foundUrl = 'https://www.quotidiano.net' + foundUrl;
      }

      // Verify it's a horoscope URL
      if (foundUrl.includes('/oroscopo/')) {
        console.log(`Quotidiano.net - Found article URL: ${foundUrl}`);
        return foundUrl;
      }
    }

    console.log('Quotidiano.net - No article found in archive page');
    return null;
  } catch (error) {
    console.error('Quotidiano.net - Error searching archive:', error);
    return null;
  }
}
async function scrapeVogueHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log('Vogue.it - Starting specialized extraction for:', input.signSlugIt);

    const html = await fetchHtml(url, input.userAgent);
    const $ = cheerio.load(html);

    const zodiacNameLower = input.signSlugIt.toLowerCase();
    let extractedText = '';

    // Strategy 1: JSON-LD articleBody — most reliable, unaffected by CSS class changes
    $('script[type="application/ld+json"]').each((_, el) => {
      if (extractedText) return;
      try {
        const rawData = JSON.parse($(el).html() || '{}');
        const data = Array.isArray(rawData) ? rawData[0] : rawData;
        const body: string = data?.articleBody || '';
        if (!body) return;
        // articleBody starts with "Oroscopo di oggi del [Sign]\n" — skip the heading line
        const newlineIdx = body.indexOf('\n');
        const textAfterHeading = newlineIdx !== -1 ? body.slice(newlineIdx + 1).trim() : body.trim();
        if (textAfterHeading.length > 50) {
          extractedText = textAfterHeading;
          console.log(`Vogue.it - JSON-LD articleBody extracted: ${extractedText.length} chars`);
        }
      } catch { /* malformed JSON-LD, skip */ }
    });

    // Strategy 2: Trova H2 che contiene "Oroscopo di oggi dell'[Segno]"
    // e prendi i <p> dopo quell'H2 dentro lo stesso container (body__inner-container)
    if (!extractedText || extractedText.length < 50) {
      let targetH2: any = null;

      $('h2').each((_, h2) => {
        const text = $(h2).text().trim().toLowerCase();
        if (text.includes('oroscopo di oggi') && text.includes(zodiacNameLower)) {
          targetH2 = h2;
          return false; // break
        }
      });

      if (targetH2) {
        console.log(`Vogue.it - Found target H2: "${$(targetH2).text().trim()}"`);

        const paragraphs: string[] = [];

        // Try direct siblings first
        $(targetH2).nextAll().each((_, elem) => {
          const tag = ((elem as any).tagName || '').toLowerCase();
          if (tag === 'h2' || tag === 'h3') return false; // break
          if (tag === 'p') {
            const text = $(elem).text().trim().replace(/\s+/g, ' ');
            if (text.length > 30) paragraphs.push(text);
          }
        });

        // If nothing found as siblings, look within the parent container
        if (paragraphs.length === 0) {
          const parent = $(targetH2).parent();
          parent.find('p').each((_, p) => {
            const text = $(p).text().trim().replace(/\s+/g, ' ');
            if (text.length > 30) paragraphs.push(text);
          });
        }

        if (paragraphs.length > 0) {
          extractedText = paragraphs.join('\n\n');
          console.log(`Vogue.it - H2 strategy extracted ${paragraphs.length} paragraphs, ${extractedText.length} chars`);
        }
      }
    }

    // Strategy 3: .body__inner-container — find the p immediately after the sign heading
    if (!extractedText || extractedText.length < 50) {
      console.log('Vogue.it - Trying body__inner-container strategy');
      const container = $('[class*="body__inner-container"]').first();
      if (container.length > 0) {
        const paragraphs: string[] = [];
        container.find('p').each((_, p) => {
          const text = $(p).text().trim().replace(/\s+/g, ' ');
          if (text.length > 30) paragraphs.push(text);
        });
        if (paragraphs.length > 0) {
          extractedText = paragraphs.join('\n\n');
          console.log(`Vogue.it - body__inner-container extracted ${paragraphs.length} paragraphs`);
        }
      }
    }

    if (!extractedText || extractedText.length < 50) {
      return {
        success: false,
        error: `No horoscope content found for ${input.signSlugIt} on Vogue.it`
      };
    }

    const finalScore = scoreHoroscopeContent(extractedText, zodiacNameLower, 'vogue.it');
    console.log(`Vogue.it - Final score: ${finalScore}, length: ${extractedText.length}`);

    return {
      success: true,
      text: extractedText.substring(0, 3500),
      url,
      actualUrl: url
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Vogue.it scraping error'
    };
  }
}

function isPaywallText(text: string): boolean {
  return /altro dispositivo|piano di abbonamento|continuare a leggere|rimarrà collegato|questo account|utilizzandoli in momenti diversi/i.test(text);
}

// ============================================================================
// RADIO SUBASIO — Handler dedicato (tutti i segni su una pagina, divisi da H3)
// ============================================================================
async function scrapeRadioSubasioHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log('Radio Subasio - Starting extraction for:', input.signSlugIt);
    const html = await fetchHtml(url, input.userAgent);
    const $ = cheerio.load(html);

    const signNameLower = input.signSlugIt.toLowerCase();
    // Capitalize first letter to match H3 content (e.g. "ariete" → "Ariete")
    const signName = signNameLower.charAt(0).toUpperCase() + signNameLower.slice(1);

    let extractedText = '';

    // Strategy 1: find the H3, collect following sibling P elements until the next H3
    $('h3').each((_, h3El) => {
      const h3Text = $(h3El).text().trim().toLowerCase();
      if (!h3Text.includes(signNameLower)) return; // skip non-matching signs

      const parts: string[] = [];

      // Direct following siblings
      let sibling = $(h3El).next();
      while (sibling.length && !sibling.is('h3')) {
        const t = sibling.text().trim();
        if (t.length > 20) parts.push(t);
        sibling = sibling.next();
      }

      // Elementor puts each widget in its own container — if no direct siblings,
      // walk the parent chain upward then collect the next container's text
      if (parts.length === 0) {
        let container = $(h3El).parent();
        while (container.length && !container.next().length) {
          container = container.parent();
        }
        let nextContainer = container.next();
        while (nextContainer.length && !nextContainer.find('h3').length) {
          nextContainer.find('p').each((_, p) => {
            const t = $(p).text().trim();
            if (t.length > 20) parts.push(t);
          });
          if (parts.length > 0) break;
          nextContainer = nextContainer.next();
        }
      }

      extractedText = parts.join(' ');
      return false; // break .each()
    });

    // Strategy 2: regex slice between this H3 and the next one (handles any nesting)
    if (!extractedText || extractedText.length < 50) {
      const sectionRegex = new RegExp(
        `<h3[^>]*>\\s*${signName}\\s*</h3>([\\s\\S]*?)(?=<h3[^>]*>|$)`,
        'i'
      );
      const sectionMatch = html.match(sectionRegex);
      if (sectionMatch) {
        const sec$ = cheerio.load(sectionMatch[1]);
        const parts: string[] = [];
        sec$('p').each((_, p) => {
          const t = sec$(p).text().trim();
          if (t.length > 20) parts.push(t);
        });
        if (parts.length === 0) {
          // No <p> tags — take raw text of the section
          const raw = sec$('body').text().replace(/\s+/g, ' ').trim();
          if (raw.length > 50) extractedText = raw;
        } else {
          extractedText = parts.join(' ');
        }
      }
    }

    if (!extractedText || extractedText.length < 50) {
      return { success: false, error: `No horoscope content found for ${input.signSlugIt} on Radio Subasio` };
    }

    console.log(`Radio Subasio - Extracted ${extractedText.length} chars for ${input.signSlugIt}`);
    return { success: true, text: extractedText, actualUrl: url };

  } catch (error) {
    console.error(`Radio Subasio - Error for ${input.signSlugIt}:`, error instanceof Error ? error.message : error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown Radio Subasio scraping error' };
  }
}

async function scrapeHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log(`Starting scrape for ${input.signSlugIt} at URL: ${url}`);

    // Special handling for Vogue.it
    if (url.includes('vogue.it')) {
      return await scrapeVogueHoroscopeText(url, input);
    }

    // Special handling for Virgilio.it
    if (url.includes('virgilio.it')) {
      return await scrapeVirgilioHoroscopeText(url, input);
    }

    // Special handling for Grazia.it
    if (url.includes('grazia.it')) {
      return await scrapeGraziaHoroscopeText(url, input);
    }

    // Special handling for OnlyOroscopo
    if (url.includes('onlyoroscopo.it')) {
      return await scrapeOnlyOroscopoHoroscopeText(url, input);
    }

    // Special handling for Quotidiano.net
    if (url.includes('quotidiano.net/oroscopo') && !url.match(/oroscopo-di-oggi-\w+-\d+-[a-f0-9]+$/i)) {
      console.log('Quotidiano.net - This is the archive page, searching for article URL...');
      const articleUrl = await findQuotidianoArticleUrl(url, input.dateISO);

      if (articleUrl) {
        console.log(`Quotidiano.net - Found article URL from archive: ${articleUrl}`);
        // Respect rate limiting before scraping the found article
        await respectDomainRateLimit(input.domain);

        const result = await scrapeQuotidianoHoroscopeText(articleUrl, input);

        if (result.success && result.text) {
          console.log(`Successfully scraped from archive-found URL: ${articleUrl}`);
          return {
            ...result,
            actualUrl: articleUrl
          };
        }
      } else {
        return {
          success: false,
          error: 'Could not find today\'s horoscope article on Quotidiano.net archive'
        };
      }
    }

    // Special handling for Oggi.it
    if (url.includes('oggi.it')) {
      return await scrapeOggiHoroscopeText(url, input);
    }

    // Special handling for Gazzetta.it
    if (url.includes('gazzetta.it')) {
      return await scrapeGazzettaHoroscopeText(url, input);
    }

    // Special handling for alfemminile.com
    if (url.includes('alfemminile.com')) {
      return await scrapeAlfemminileHoroscopeText(url, input);
    }

    // Special handling for Sky TG24
    if (url.includes('skytg24.it') || url.includes('tg24.sky.it')) {
      return await scrapeSkyTG24HoroscopeText(url, input);
    }

    // Special handling for Radio Subasio (all 12 signs on a single page, split by H3)
    if (url.includes('radiosubasio.it')) {
      return await scrapeRadioSubasioHoroscopeText(url, input);
    }

    // Special handling for Fanpage.it
    if (url.includes('fanpage.it')) {
      return await scrapeFanpageHoroscopeText(url, input);
    }

    // Special handling for Il Gazzettino
    if (url.includes('ilgazzettino.it')) {
      return await scrapeIlGazzettinoHoroscopeText(url, input);
    }

// ============================================================================
// IL GAZZETTINO — Handler dedicato
// ============================================================================
async function scrapeIlGazzettinoHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log('Il Gazzettino - Starting dedicated scraping for:', input.signSlugIt);

    const html = await fetchHtml(url, input.userAgent);
    const $ = cheerio.load(html);

    // The horoscope text lives in <div id="oroscopo"> → <article> → <p class="testo">
    // The page also has a poll sidebar with <p class="titolo"> that must NOT be picked up.
    let extractedText = '';

    // Strategy 1: precise selector — <p class="testo"> inside #oroscopo
    const preciseParagraphs: string[] = [];
    $('#oroscopo p.testo').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) preciseParagraphs.push(text);
    });

    if (preciseParagraphs.length > 0) {
      extractedText = preciseParagraphs.join('\n\n');
      console.log(`Il Gazzettino - ✓ Strategy 1 (#oroscopo p.testo): ${extractedText.length} chars`);
    }

    // Strategy 2: any <p> inside #oroscopo (excluding titolo/caption classes)
    if (!extractedText || extractedText.length < 50) {
      console.log('Il Gazzettino - Trying Strategy 2: #oroscopo p (excluding .titolo)...');
      const fallbackParagraphs: string[] = [];
      $('#oroscopo p').each((_, el) => {
        const classes = ($(el).attr('class') || '').split(/\s+/);
        // Skip poll/title/caption paragraphs
        if (classes.some(c => ['titolo', 'title', 'caption', 'didascalia'].includes(c))) return;
        const text = $(el).text().trim();
        if (text.length > 30) fallbackParagraphs.push(text);
      });
      if (fallbackParagraphs.length > 0) {
        extractedText = fallbackParagraphs.join('\n\n');
        console.log(`Il Gazzettino - ✓ Strategy 2 (#oroscopo p): ${extractedText.length} chars`);
      }
    }

    if (!extractedText || extractedText.length < 30) {
      return {
        success: false,
        error: `Il Gazzettino - no horoscope text found for ${input.signSlugIt}`,
      };
    }

    return {
      success: true,
      text: extractedText.substring(0, 3500),
      url,
      actualUrl: url,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Il Gazzettino scraping error',
    };
  }
}

// ============================================================================
// GRAZIA.IT — Handler dedicato
// ============================================================================
async function scrapeGraziaHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log('Grazia.it - Starting dedicated scraping for:', input.signSlugIt);

    const html = await fetchHtml(url, input.userAgent);
    const $ = cheerio.load(html);

    // ── Rimuovi SUBITO elementi rumorosi prima di qualsiasi estrazione ──────
    // Cookie policy, GDPR banner, overlay di consenso
    $('[id*="cookie"], [class*="cookie"]').remove();
    $('[id*="gdpr"], [class*="gdpr"]').remove();
    $('[id*="privacy"], [class*="privacy"]').remove();
    $('[id*="consent"], [class*="consent"]').remove();
    $('[id*="didomi"], [class*="didomi"]').remove();
    $('[id*="onetrust"], [class*="onetrust"]').remove();
    $('[id*="cmp"], [class*="cmp"]').remove();
    // Elementi strutturali non pertinenti
    $('header, footer, nav, aside').remove();
    $('[class*="header"], [class*="footer"], [class*="sidebar"]').remove();
    $('[class*="related"], [class*="correlati"], [class*="suggest"]').remove();
    $('[class*="newsletter"], [class*="subscribe"], [class*="social"]').remove();
    $('[class*="ad-"], [class*="-ad"], [id*="adv"], [class*="adv"]').remove();

    let extractedText = '';

    // ── STRATEGIA 1: selettori semantici specifici di Grazia ────────────────
    // Grazia usa WordPress/Condé Nast con classi tipo .entry-content, .article__body
    const primarySelectors = [
      '.article__body p',
      '.entry-content p',
      '.post-content p',
      '[class*="article-body"] p',
      '[class*="articleBody"] p',
      '[class*="article__content"] p',
      '.horoscope-content p',
      '[class*="horoscope"] p',
      '[class*="oroscopo"] p',
    ];

    for (const selector of primarySelectors) {
      const paragraphs: string[] = [];

      $(selector).each((_, el) => {
        const text = $(el).text().trim();
        // Salta paragrafi troppo corti o che contengono ancora riferimenti a policy
        if (text.length < 30) return;
        if (/cookie|privacy|consenso|gdpr|trattamento dei dati|acconsento/i.test(text)) return;
        paragraphs.push(text);
      });

      if (paragraphs.length >= 2) {
        extractedText = paragraphs.join('\n\n');
        console.log(`Grazia.it - ✓ Strategy 1 (${selector}): ${extractedText.length} chars`);
        break;
      }
    }

    // ── STRATEGIA 2: JSON-LD (articleBody) ──────────────────────────────────
    // Molti siti Condé Nast espongono il testo nell'articolo strutturato Schema.org
    if (!extractedText || extractedText.length < 100) {
      console.log('Grazia.it - Trying Strategy 2: JSON-LD...');

      $('script[type="application/ld+json"]').each((_, el) => {
        if (extractedText.length >= 100) return; // già trovato
        try {
          const json = JSON.parse($(el).html() || '{}');
          const candidates = Array.isArray(json) ? json : [json];
          for (const obj of candidates) {
            const body = obj.articleBody || obj.description || '';
            if (body.length >= 100) {
              extractedText = body;
              console.log(`Grazia.it - ✓ Strategy 2 JSON-LD: ${extractedText.length} chars`);
              break;
            }
          }
        } catch { /* malformed JSON, skip */ }
      });
    }

    // ── STRATEGIA 3: Scoring su tutti i <p> rimasti dopo cleanup ────────────
    if (!extractedText || extractedText.length < 100) {
      console.log('Grazia.it - Trying Strategy 3: scored paragraph sweep...');

      const zodiacName = input.signSlugIt.toLowerCase();
      let bestScore = 0;
      const candidates: string[] = [];

      $('p').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length < 40) return;
        if (/cookie|privacy|consenso|gdpr|trattamento|acconsento|policy/i.test(text)) return;

        const score = scoreHoroscopeContent(text, zodiacName, 'grazia.it');
        if (score > bestScore) {
          bestScore = score;
          candidates.unshift(text); // metti il migliore in cima
        } else if (score > 10) {
          candidates.push(text);
        }
      });

      if (candidates.length > 0 && bestScore >= 15) {
        // Prendi al massimo i primi 6 paragrafi più rilevanti
        extractedText = candidates.slice(0, 6).join('\n\n');
        console.log(`Grazia.it - ✓ Strategy 3: ${extractedText.length} chars, best score: ${bestScore}`);
      }
    }

    // ── Validazione finale ──────────────────────────────────────────────────
    if (!extractedText || extractedText.length < 80) {
      console.log('Grazia.it - ✗ FAILED: No valid content after all strategies');
      return {
        success: false,
        error: `No horoscope content found for ${input.signSlugIt} on Grazia.it`
      };
    }

    extractedText = normalizeWhitespace(decodeHtmlEntities(extractedText));

    const finalScore = scoreHoroscopeContent(extractedText, input.signSlugIt.toLowerCase(), 'grazia.it');
    console.log(`Grazia.it - ✅ FINAL: ${extractedText.length} chars, quality score: ${finalScore}`);

    return {
      success: true,
      text: extractedText.substring(0, 3500),
      url,
      actualUrl: url,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Grazia.it scraping error',
    };
  }
}
    const html = await fetchHtml(url, input.userAgent);

    // Enhanced HTML cleaning
    let cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const zodiacName = input.signSlugIt.toLowerCase();
    const domain = url.match(/\/\/(?:www\.)?([^\/]+)/)?.[1] || '';
    let extractedText = '';

    // Source-specific extraction strategies


    // Generic extraction as fallback
    const $ = cheerio.load(cleanHtml);
    const selectors = [
      '.content p', '.article-content p', '.entry-content p',
      '.text p', '.oroscopo p', '.article p', 'main p',
      '.post-content p', '.story p', '.description p',
      '[class*="horoscope"] p', '[class*="oroscopo"] p',
      '.body p', '.inner p', '.main-content p'
    ];

    let bestText = '';
    let bestScore = 0;

    for (const selector of selectors) {
      const elements = $(selector);
      elements.each((_, element) => {
        const text = $(element).text().trim();
        if (text && text.length > 30) {
          const score = scoreHoroscopeContent(text, zodiacName, domain);
          if (score > bestScore) {
            bestScore = score;
            bestText = text;
          }
        }
      });
    }

    // If no good content found with selectors, try extracting all paragraphs
    if (!bestText || bestScore < 20) {
      const allParagraphs = $('p');
      allParagraphs.each((_, element) => {
        const text = $(element).text().trim();
        if (text && text.length > 30) {
          const score = scoreHoroscopeContent(text, zodiacName, domain);
          if (score > bestScore) {
            bestScore = score;
            bestText = text;
          }
        }
      });
    }

    extractedText = bestText;

    // Final attempt: extract any text that mentions the zodiac sign
    if (!extractedText || extractedText.length < 20) {
      const $ = cheerio.load(cleanHtml);
      const allText = $('body').text();
      const zodiacRegex = new RegExp(`\\b${zodiacName}\\b[\\s\\S]{50,500}`, 'i');
      const match = allText.match(zodiacRegex);

      if (match && match[0]) {
        extractedText = match[0].trim();
      }
    }

    if (!extractedText || extractedText.length < 20) {
      return {
        success: false,
        error: `No substantial horoscope content found for ${input.signSlugIt} on ${domain}`
      };
    }

    const finalScore = scoreHoroscopeContent(extractedText, zodiacName, domain);

    // Lower the threshold for acceptance to capture more content
    if (finalScore < 10 && extractedText.length < 50) {
      return {
        success: false,
        error: `Extracted content quality too low (score: ${finalScore}) for ${input.signSlugIt} on ${domain}`
      };
    }

    if (isPaywallText(extractedText)) {
      return {
        success: false,
        error: 'Paywall or access restriction detected'
      };
    }

    return {
      success: true,
      text: extractedText.substring(0, 3500),
      url,
      actualUrl: url
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown scraping error'
    };
  }
}

// All old extraction functions removed - using new source-specific scraping functions instead

export async function scrapeWithRetry(
  input: ScraperInput,
  maxRetries: number = 3
): Promise<ScraperOutput> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await scrapeHoroscope(input);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Scraping attempt ${attempt} failed for ${input.sourceName}, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}