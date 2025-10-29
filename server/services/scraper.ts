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
 */
function buildGazzettaUrls(input: ScraperInput): string[] {
  console.log(`🔥 Building Gazzetta.it URLs for ${input.signSlugIt}`);

  const targetDate = new Date(input.dateISO);
  const day = targetDate.getDate();
  const month = targetDate.getMonth();
  const year = targetDate.getFullYear();
  const weekday = ITALIAN_WEEKDAYS[targetDate.getDay()];
  const monthName = ITALIAN_MONTHS[month];

  const gazzettaSignSlug = ZODIAC_SIGN_MAP[input.signSlugIt] || input.signSlugIt.toLowerCase();

  // Calculate previous date (typical publishing date)
  const prevDate = new Date(targetDate);
  prevDate.setDate(prevDate.getDate() - 1);
  const publishingDateFormatted = formatDateDDMMYYYY(prevDate);

  // Also try current date (sometimes they publish same day)
  const currentDateFormatted = formatDateDDMMYYYY(targetDate);

  // Format horoscope date part (weekday-DD-monthname-YYYY)
  const horoscopeDatePart = `${weekday}-${day}-${monthName}-${year}`;
  const baseSlug = `oroscopo-${horoscopeDatePart}`;

  // All possible slug variations (ordered by likelihood)
  const slugVariations = [
    `${baseSlug}-previsioni-per-tutti-i-12-segni`,
    `${baseSlug}-previsioni-per-12-segni`,
    `${baseSlug}-previsioni-per-tutti-i-segni`,
    `${baseSlug}-le-previsioni-per-i-12-segni`,
  ];

  const urls: string[] = [];

  // Try with yesterday as publishing date first (most common)
  for (const slug of slugVariations) {
    urls.push(`${input.baseUrl}/storie/${publishingDateFormatted}/${slug}/${gazzettaSignSlug}.shtml`);
  }

  // Then try with today as publishing date
  for (const slug of slugVariations) {
    urls.push(`${input.baseUrl}/storie/${currentDateFormatted}/${slug}/${gazzettaSignSlug}.shtml`);
  }

  console.log(`Gazzetta.it - Target date: ${input.dateISO}`);
  console.log(`Gazzetta.it - Publishing date (yesterday): ${publishingDateFormatted}`);
  console.log(`Gazzetta.it - Publishing date (today): ${currentDateFormatted}`);
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
    // Build URL(s) from pattern
    const urlResult = buildHoroscopeUrl(input);
    const urls = Array.isArray(urlResult) ? urlResult : [urlResult];

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

    // Clean HTML but preserve structure
    let cleanHtml = cleanRawHtml(html);

    // Extract all <p class="txt-r-s1"> elements
    let extractedParagraphs: string[] = [];
    const pTagRegex = /<p[^>]*class="txt-r-s1"[^>]*>([\s\S]*?)<\/p>/gi;
    let match;

    while ((match = pTagRegex.exec(cleanHtml)) !== null) {
      let paraContent = cleanExtractedText(match[1]);

      if (paraContent.length > 10) {
        extractedParagraphs.push(paraContent);
      }
    }

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



async function scrapeRepubblicaHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    // Special handling for Repubblica.it - first find the actual article URL
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

    const result = await scrapeHoroscopeText(url, input);

    if (result.success) {
      result.actualUrl = url;
    }

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

    $('script, style, nav, header, footer, iframe, noscript').remove();

    const zodiacName = input.signSlugIt.toLowerCase();
    const domain = 'gazzetta.it';

    let bestContent = '';
    let highestScore = 0;

    // Look for the main article content that contains all sections
    const articlePatterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/gi,
      /<div[^>]*class="[^"]*story[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      /<main[^>]*>([\s\S]*?)<\/main>/gi
    ];

    for (const pattern of articlePatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        let content = match[1];

        // Extract text content while preserving section structure
        let processedContent = content
          // Convert section headers to clear markers
          .replace(/(?:<[^>]*>)*\s*La tua giornata\s*[:\s]*(?:<[^>]*>)*/gi, '\n\nLA TUA GIORNATA:\n')
          .replace(/(?:<[^>]*>)*\s*Amore\s*[:\s]*(?:<[^>]*>)*/gi, '\n\nAMORE:\n')
          .replace(/(?:<[^>]*>)*\s*Amicizia\s*[:\s]*(?:<[^>]*>)*/gi, '\n\nAMICIZIA:\n')
          .replace(/(?:<[^>]*>)*\s*Lavoro\s*[:\s]*(?:<[^>]*>)*/gi, '\n\nLAVORO:\n')
          .replace(/(?:<[^>]*>)*\s*Valutazione\s+generale\s*[:\s]*(?:<[^>]*>)*/gi, '\n\nVALUTAZIONE GENERALE:\n')
          // Clean HTML tags and entities
          .replace(/<br[^>]*>/gi, '\n')
          .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
          .replace(/<p[^>]*>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#8217;/g, "'")
          .replace(/&#8220;/g, '"')
          .replace(/&#8221;/g, '"')
          .replace(/&#8211;/g, '-')
          .replace(/&#8212;/g, '—')
          .replace(/&hellip;/g, '...')
          .replace(/\s+/g, ' ')
          .replace(/\n[ \t]+/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        // Check if this content contains the key sections
        const hasMainSections = /LA TUA GIORNATA[\s\S]*AMORE[\s\S]*AMICIZIA[\s\S]*LAVORO/i.test(processedContent);
        const containsZodiacSign = processedContent.toLowerCase().includes(input.signSlugIt.toLowerCase());

        if (hasMainSections && containsZodiacSign && processedContent.length > 200) {
          const currentScore = scoreHoroscopeContent(processedContent, zodiacName, domain);
          console.log(`Gazzetta.it - Found structured content with score ${currentScore} (length: ${processedContent.length})`);

          if (currentScore > highestScore) {
            highestScore = currentScore;
            bestContent = processedContent;
          }
        }
      }
    }

    // If no structured content found, try extracting all paragraphs in order
    if (!bestContent || highestScore < 50) {
      console.log('Gazzetta.it - Trying paragraph extraction fallback');

      const paragraphPattern = /<p[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/p>/gi;
      const paragraphs = [];
      let match;

      while ((match = paragraphPattern.exec(html)) !== null) {
        const pContent = match[1]
          .replace(/<[^>]*>/g, ' ')
          .replace(/&[^;]+;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (pContent.length > 20) {
          paragraphs.push(pContent);
        }
      }

      if (paragraphs.length > 0) {
        const combinedContent = paragraphs.join('\n\n');
        const combinedScore = scoreHoroscopeContent(combinedContent, zodiacName, domain);

        if (combinedScore > highestScore) {
          bestContent = combinedContent;
          highestScore = combinedScore;
        }
      }
    }

    if (!bestContent || highestScore < 20) {
      return {
        success: false,
        error: `No substantial horoscope content found for ${input.signSlugIt} on Gazzetta.it`
      };
    }

    console.log(`Gazzetta.it - Final extraction score: ${highestScore}, length: ${bestContent.length}`);

    return {
      success: true,
      text: bestContent.substring(0, 3500),
      url,
      actualUrl: url
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Gazzetta.it scraping error'
    };
  }
}

// LA FUNZIONE SKY TG24
async function scrapeSkyTG24HoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log('Sky TG24 - Starting specialized extraction for:', input.signSlugIt);

    const html = await fetchHtml(url, input.userAgent);

    // Clean HTML but preserve structure
    let cleanHtml = cleanRawHtml(html);

    const zodiacNameLower = input.signSlugIt.toLowerCase();
    let combinedSectionTexts: string[] = [];

    // Regex to find all c-article-section divs
    const sectionDivRegex = /<div[^>]*class="[^"]*\bc-article-section\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let match;

    while ((match = sectionDivRegex.exec(cleanHtml)) !== null) {
      let sectionHtml = match[1];
      let sectionText = '';
      let sectionMarker = '';

      // Check for H2 headers to identify specific sections
      if (/<h2[^>]*>\s*Amore\s*<\/h2>/i.test(sectionHtml)) {
        sectionMarker = '\n\n---AMORE_SECTION_START---\n';
        sectionText = sectionHtml.replace(/<h2[^>]*>\s*Amore\s*<\/h2>/i, '');
      } else if (/<h2[^>]*>\s*Lavoro\s*<\/h2>/i.test(sectionHtml)) {
        sectionMarker = '\n\n---LAVORO_SECTION_START---\n';
        sectionText = sectionHtml.replace(/<h2[^>]*>\s*Lavoro\s*<\/h2>/i, '');
      } else if (/<h2[^>]*>\s*Salute\s*<\/h2>/i.test(sectionHtml)) {
        sectionMarker = '\n\n---SALUTE_SECTION_START---\n';
        sectionText = sectionHtml.replace(/<h2[^>]*>\s*Salute\s*<\/h2>/i, '');
      } else {
        sectionMarker = '\n\n---GENERAL_SECTION_START---\n';
        sectionText = sectionHtml;
      }

      // Clean the section HTML to plain text
      let cleanedSectionText = cleanExtractedText(sectionText);

      if (cleanedSectionText.length > 0) {
        combinedSectionTexts.push(sectionMarker + cleanedSectionText);
      }
    }

    let extractedText = combinedSectionTexts.join('\n').trim();

    console.log(`Sky TG24 - Extracted ${combinedSectionTexts.length} sections, total length: ${extractedText.length}`);

    if (!extractedText || extractedText.length < 50) {
      return {
        success: false,
        error: `No substantial horoscope content found for ${input.signSlugIt} on Sky TG24`
      };
    }

    const score = scoreHoroscopeContent(extractedText, zodiacNameLower, 'skytg24.it');
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Sky TG24 scraping error'
    };
  }
}

/**
 * Scrapes horoscope content from Oggi.it
 * Uses H4 tags and GIORNALIERO comment to extract content
 */
async function scrapeOggiHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log('Oggi.it - Starting specialized extraction for:', input.signSlugIt);

    const html = await fetchHtml(url, input.userAgent);
    const zodiacName = input.signSlugIt.toLowerCase();

    // Clean HTML but preserve structure
    let cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Find all H4 tags (potential horoscope headers)
    const h4GenericRegex = /<h4[^>]*>(?:Oroscopo\s+di\s+)?[^<]*<\/h4>/gi;
    const h4Matches = Array.from(cleanHtml.matchAll(h4GenericRegex));

    for (const matchH4 of h4Matches) {
      if (matchH4.index === undefined) continue;

      console.log(`Oggi.it - Found h4 tag: ${matchH4[0]}`);

      // Find the <!-- GIORNALIERO --> comment after this H4
      const commentStartIndex = cleanHtml.indexOf('<!-- GIORNALIERO -->', matchH4.index);

      // Determine content scope
      let contentToSearch = '';
      if (commentStartIndex !== -1) {
        contentToSearch = cleanHtml.substring(matchH4.index + matchH4[0].length, commentStartIndex);
        console.log(`Oggi.it - Found <!-- GIORNALIERO --> comment, restricting scope`);
      } else {
        contentToSearch = cleanHtml.substring(matchH4.index + matchH4[0].length);
        console.log(`Oggi.it - <!-- GIORNALIERO --> comment not found, searching till end`);
      }

      // Extract paragraphs from this section
      const paragraphs = extractOggiParagraphs(contentToSearch);

      if (paragraphs.length === 0) {
        console.log(`Oggi.it - No paragraphs found in this h4 section`);
        continue;
      }

      // Validate content
      const combinedText = paragraphs.join(' ');
      const hasZodiacSign = combinedText.toLowerCase().includes(zodiacName);
      const hasHoroscopeContent = /\b(oroscopo|previsioni|stelle|fortuna|amore|lavoro|salute|giornata|energia|periodo)\b/i.test(combinedText);

      if (!hasZodiacSign && !hasHoroscopeContent) {
        console.log(`Oggi.it - Content validation failed: zodiac=${hasZodiacSign}, horoscope=${hasHoroscopeContent}`);
        continue;
      }

      if (combinedText.length < 50) {
        console.log(`Oggi.it - Content too short: ${combinedText.length} chars`);
        continue;
      }

      console.log(`Oggi.it - Successfully extracted and validated ${paragraphs.length} paragraphs`);

      // Organize into sections
      const sections = organizeOggiSections(paragraphs);
      const finalContent = buildOggiFinalContent(sections);

      return {
        success: true,
        text: finalContent.trim().substring(0, 3500),
        url,
        actualUrl: url
      };
    }

    // No valid content found
    return {
      success: false,
      error: `No valid horoscope content found for ${input.signSlugIt} on Oggi.it`
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Oggi.it scraping error'
    };
  }
}

/**
 * Extracts and cleans paragraphs from Oggi.it content
 */
function extractOggiParagraphs(content: string): string[] {
  const pTagRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs: string[] = [];
  let match;

  while ((match = pTagRegex.exec(content)) !== null) {
    if (!match[1]) continue;

    const cleaned = cleanExtractedText(match[1]);

    // Filter out navigation and short content
    const isNavigation = /^(menu|naviga|cookie|privacy|leggi anche|condividi|share|login|registrati|abbonati|tags?:|categor)/i.test(cleaned);
    const isSubstantial = cleaned.length > 20;

    if (!isNavigation && isSubstantial) {
      paragraphs.push(cleaned);
    }
  }

  return paragraphs;
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

    // Rimuovi elementi non necessari
    $('script, style, nav, header, footer, iframe, noscript').remove();

    const zodiacNameLower = input.signSlugIt.toLowerCase();
    let bestContent = '';
    let highestScore = 0;

    // Pattern 1: Cerca div con classe article-body o simili
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
        // Cerca il contenuto specifico per il segno zodiacale
        const paragraphs: string[] = [];

        content.find('p').each((_, elem) => {
          const text = $(elem).text().trim();
          if (text.length > 20) {
            paragraphs.push(text);
          }
        });

        if (paragraphs.length > 0) {
          const combinedText = paragraphs.join('\n\n');
          const score = scoreHoroscopeContent(combinedText, zodiacNameLower, 'fanpage.it');

          if (score > highestScore) {
            highestScore = score;
            bestContent = combinedText;
          }
        }
      }
    }

    // Pattern 2: Se non troviamo con i selettori, cerca heading con il nome del segno
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
            if (score > highestScore) {
              bestContent = sectionText;
              highestScore = score;
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
    let anchorHeading: cheerio.Element | null = null;
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

async function scrapeHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log(`Starting scrape for ${input.signSlugIt} at URL: ${url}`);

    // Special handling for Virgilio.it
    if (url.includes('virgilio.it')) {
      return await scrapeVirgilioHoroscopeText(url, input);
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

    // Special handling for Fanpage.it
    if (url.includes('fanpage.it')) {
      return await scrapeFanpageHoroscopeText(url, input);
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