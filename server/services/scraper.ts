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
  // Define signMap for URL building
  const signMap: Record<string, string> = {
    'Ariete': 'ariete', 'Toro': 'toro', 'Gemelli': 'gemelli', 'Cancro': 'cancro',
    'Leone': 'leone', 'Vergine': 'vergine', 'Bilancia': 'bilancia', 'Scorpione': 'scorpione',
    'Sagittario': 'sagittario', 'Capricorno': 'capricorno', 'Acquario': 'acquario', 'Pesci': 'pesci'
  };

  // Handle Repubblica.it special case - use index page first
  if (input.domain.includes('repubblica.it')) {
    return input.baseUrl + input.urlPattern;
  }

  // Handle Gazzetta.it special case BEFORE generic URL building
  if (input.domain && input.domain.includes('gazzetta.it')) {
    console.log(`🔥 GAZZETTA DETECTED! domain=${input.domain}`);

    const targetDate = new Date(input.dateISO);
    const day = targetDate.getDate();
    const month = targetDate.getMonth();
    const year = targetDate.getFullYear();
    const weekday = ITALIAN_WEEKDAYS[targetDate.getDay()];
    const monthName = ITALIAN_MONTHS[month];

    const gazzettaSignSlug = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();

    // Calculate previous date (publishing date)
    const prevDate = new Date(targetDate);
    prevDate.setDate(prevDate.getDate() - 1);

    // Format publishing date as DD-MM-YYYY
    const publishingDay = prevDate.getDate().toString().padStart(2, '0');
    const publishingMonth = (prevDate.getMonth() + 1).toString().padStart(2, '0');
    const publishingYear = prevDate.getFullYear();
    const publishingDateFormatted = `${publishingDay}-${publishingMonth}-${publishingYear}`;

    // Also try current date as publishing date (sometimes they publish same day)
    const currentDay = targetDate.getDate().toString().padStart(2, '0');
    const currentMonth = (targetDate.getMonth() + 1).toString().padStart(2, '0');
    const currentYear = targetDate.getFullYear();
    const currentDateFormatted = `${currentDay}-${currentMonth}-${currentYear}`;

    // Format horoscope date part (weekday-DD-monthname-YYYY)
    const horoscopeDatePart = `${weekday}-${day}-${monthName}-${year}`;

    // Create base slug with horoscope date
    const baseSlug = `oroscopo-${horoscopeDatePart}`;

    // Based on your example, the main pattern seems to be:
    // previsioni-per-tutti-i-12-segni
    const primarySlug = `${baseSlug}-previsioni-per-tutti-i-12-segni`;

    // But let's also try a few other common variations
    const slugVariations = [
      primarySlug, // Main pattern from your example
      `${baseSlug}-previsioni-per-12-segni`,
      `${baseSlug}-previsioni-per-tutti-i-segni`,
      `${baseSlug}-le-previsioni-per-i-12-segni`,  
    ];

    // Generate URLs with publishing date variations and slug variations
    const urls: string[] = [];

    // First, try with yesterday as publishing date (most common)
    for (const slug of slugVariations) {
      urls.push(`${input.baseUrl}/storie/${publishingDateFormatted}/${slug}/${gazzettaSignSlug}.shtml`);
    }

    // Then try with today as publishing date (less common)
    for (const slug of slugVariations) {
      urls.push(`${input.baseUrl}/storie/${currentDateFormatted}/${slug}/${gazzettaSignSlug}.shtml`);
    }

    console.log(`Gazzetta.it - Target date: ${input.dateISO}`);
    console.log(`Gazzetta.it - Publishing date (yesterday): ${publishingDateFormatted}`);
    console.log(`Gazzetta.it - Horoscope date part: ${horoscopeDatePart}`);
    console.log(`Gazzetta.it - Generated ${urls.length} URLs:`, urls);

    return urls;
  }

  // Handle IO Donna special case - try date-specific URL first
  if (input.domain.includes('iodonna.it')) {
    const signSlug = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();
    const targetDate = new Date(input.dateISO);
    const day = targetDate.getDate().toString().padStart(2, '0');
    const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');
    const year = targetDate.getFullYear();
    return `${input.baseUrl}/oroscopo/giorno/${signSlug}-${day}-${month}-${year}/`;
  }

  let url = input.baseUrl + input.urlPattern;
  const targetDate = new Date(input.dateISO);

  // Handle date-specific URLs for sources that need them
  if ((input.domain.includes('alfemminile.com') || input.domain.includes('fanpage.it') || input.domain.includes('gazzetta.it')) && url.includes('{weekday}')) {
    const day = targetDate.getDate();
    const month = targetDate.getMonth();
    const year = targetDate.getFullYear();
    const weekday = ITALIAN_WEEKDAYS[targetDate.getDay()];
    const monthName = ITALIAN_MONTHS[month];

    url = url.replace('{weekday}', weekday);
    url = url.replace('{day}', day.toString());
    url = url.replace('{month}', monthName);
    url = url.replace('{year}', year.toString());

    // Special handling for Fanpage.it - return both direct URL and archive URL
    if (input.domain.includes('fanpage.it')) {
      const directUrl = url;
      const archiveUrl = 'https://www.fanpage.it/stile-e-trend/story/oroscopo/';
      console.log(`Fanpage.it - Generated direct URL: ${directUrl}`);
      console.log(`Fanpage.it - Archive URL: ${archiveUrl}`);
      return [directUrl, archiveUrl]; // Prova prima diretto, poi archivio
    }

    // Enhanced handling for Gazzetta.it - they use multiple URL patterns
    if (input.domain.includes('gazzetta.it')) {
      const prevDate = new Date(targetDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateFormatted = prevDate.toISOString().split('T')[0].split('-').reverse().join('-');
      const currentDateFormatted = targetDate.toISOString().split('T')[0].split('-').reverse().join('-');

      const gazzettaSignSlug = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();
      const baseSlug = `oroscopo-${weekday}-${day}-${monthName}-${year}`;

      // Possible slug variations
      // All possible slug variations (ordered by likelihood)
      const slugVariations = [
                `${baseSlug}-previsioni-per-tutti-i-12-segni`,
        `${baseSlug}-previsioni-per-12-i-segni`,
        `${baseSlug}-previsioni-per-tutti-i-segni`,
        `${baseSlug}-previsioni-per-12-i-segni-zodiaco`,
        `${baseSlug}-le-previsioni-per-i-12-segni`,
      ];

      // Generate URLs with both date variations (yesterday and today) for each slug
      const urls: string[] = [];
      
      // Try yesterday's date first (most common)
      for (const slug of slugVariations) {
        urls.push(`${input.baseUrl}/storie/${prevDateFormatted}/${slug}/${gazzettaSignSlug}.shtml`);
      }
      
      // Then try today's date
      for (const slug of slugVariations) {
        urls.push(`${input.baseUrl}/storie/${currentDateFormatted}/${slug}/${gazzettaSignSlug}.shtml`);
      }

      return urls;
    }
  }

  // Standard replacements
  let signSlug = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();

  // Oggi.it uses capitalized zodiac sign names
  if (input.domain.includes('oggi.it')) {
    signSlug = input.signSlugIt;
  }

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

async function fetchHtml(url: string, userAgent: string): Promise<string> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    };

    // Headers speciali per Fanpage.it
    if (url.includes('fanpage.it')) {
      console.log('Fanpage.it - Using enhanced headers');
      headers['Referer'] = 'https://www.fanpage.it/stile-e-trend/story/oroscopo/';
      headers['Origin'] = 'https://www.fanpage.it';
      headers['Sec-Fetch-Dest'] = 'document';
      headers['Sec-Fetch-Mode'] = 'navigate';
      headers['Sec-Fetch-Site'] = 'same-origin';
      headers['Sec-Fetch-User'] = '?1';
      headers['Sec-Ch-Ua'] = '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"';
      headers['Sec-Ch-Ua-Mobile'] = '?0';
      headers['Sec-Ch-Ua-Platform'] = '"Windows"';

      // Delay casuale per sembrare più umano (1-3 secondi)
      const randomDelay = Math.floor(Math.random() * 2000) + 1000;
      console.log(`Fanpage.it - Adding ${randomDelay}ms delay to appear human-like`);
      await new Promise(resolve => setTimeout(resolve, randomDelay));
    }

    const response = await axios.get(url, {
      headers,
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Accetta anche 4xx per poter gestire meglio gli errori
    });

    // Se otteniamo un 403 specificamente su Fanpage, proviamo con strategia alternativa
    if (response.status === 403 && url.includes('fanpage.it')) {
      console.log('Fanpage.it - Got 403, trying alternative user agent...');

      // Prova con un user agent diverso (Safari su Mac)
      headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

      // Aspetta 3 secondi prima del retry
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
      throw new Error(`HTTP ${error.response?.status || 'unknown'}: ${error.message}`);
    }
    throw error;
  }
}

// Content quality scoring system
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
    let cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Extract all <p class="txt-r-s1"> elements
    let extractedParagraphs: string[] = [];
    const pTagRegex = /<p[^>]*class="txt-r-s1"[^>]*>([\s\S]*?)<\/p>/gi;
    let match;

    while ((match = pTagRegex.exec(cleanHtml)) !== null) {
      let paraContent = match[1]
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();

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

async function scrapeOnlyOroscopoHoroscopeText(url: string, input: ScraperInput): Promise<ScrapeResult> {
  try {
    console.log('OnlyOroscopo - Starting specialized scraping for:', input.signSlugIt);

    const response = await fetchHtml(url, input.userAgent);
    const html = response;

    // Clean HTML
    let cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    let bestContent = '';
    let highestScore = 0;
    const zodiacNameLower = input.signSlugIt.toLowerCase();

    // Strategy 1: Try the original elementor-widget-container approach
    const elementorWidgetContainerPattern = /<div[^>]*class="elementor-widget-container"[^>]*>([\s\S]*?)<\/div>/gi;
    let elementorMatch;

    while ((elementorMatch = elementorWidgetContainerPattern.exec(cleanHtml)) !== null) {
      let content = elementorMatch[1]
        .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();

      // Stop extraction at "Parola del giorno"
      const stopIndex = content.toLowerCase().indexOf('parola del giorno');
      if (stopIndex !== -1) {
        content = content.substring(0, stopIndex).trim();
      }

      if (content.length >= 30) {
        const currentScore = scoreHoroscopeContent(content, zodiacNameLower, input.domain);
        if (currentScore > highestScore) {
          highestScore = currentScore;
          bestContent = content;
        }
      }
    }

    // Strategy 2: If elementor approach fails, try broader div search
    if (!bestContent || highestScore < 15) {
      console.log('OnlyOroscopo - Elementor approach failed, trying broader search...');

      // Look for any div with substantial content
      const allDivPattern = /<div[^>]*>([\s\S]*?)<\/div>/gi;
      let divMatch;

      while ((divMatch = allDivPattern.exec(cleanHtml)) !== null) {
        let content = divMatch[1]
          .replace(/<div[^>]*>[\s\S]*?<\/div>/gi, '') // Remove nested divs
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .trim();

        // Stop at "Parola del giorno"
        const stopIndex = content.toLowerCase().indexOf('parola del giorno');
        if (stopIndex !== -1) {
          content = content.substring(0, stopIndex).trim();
        }

        // Only consider substantial content
        if (content.length >= 300 && content.length <= 3000) {
          const currentScore = scoreHoroscopeContent(content, zodiacNameLower, input.domain);

          if (currentScore > highestScore) {
            highestScore = currentScore;
            bestContent = content;
          }
        }
      }
    }

    // Strategy 3: Try paragraph-based extraction
    if (!bestContent || highestScore < 15) {
      console.log('OnlyOroscopo - Div search failed, trying paragraph extraction...');

      const paragraphPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      const paragraphs: string[] = [];
      let pMatch;

      while ((pMatch = paragraphPattern.exec(cleanHtml)) !== null) {
        let content = pMatch[1]
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim();

        if (content.length > 50) {
          paragraphs.push(content);
        }
      }

      if (paragraphs.length > 0) {
        const combinedContent = paragraphs.join('\n\n');
        const stopIndex = combinedContent.toLowerCase().indexOf('parola del giorno');
        const finalContent = stopIndex !== -1 ?
          combinedContent.substring(0, stopIndex).trim() :
          combinedContent;

        if (finalContent.length >= 100) {
          const currentScore = scoreHoroscopeContent(finalContent, zodiacNameLower, input.domain);
          if (currentScore > highestScore) {
            bestContent = finalContent;
            highestScore = currentScore;
          }
        }
      }
    }

    if (!bestContent || highestScore < 10) {
      return {
        success: false,
        error: `No substantial horoscope content found - best score: ${highestScore}, content length: ${bestContent.length}`
      };
    }

    console.log(`OnlyOroscopo - Successfully extracted content with score ${highestScore}, length: ${bestContent.length}`);

    return {
      success: true,
      text: bestContent.substring(0, 3500),
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
    let cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

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
            let cleanedContent = sectionContent
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
              .replace(/&agrave;/g, 'à')
              .replace(/&egrave;/g, 'è')
              .replace(/&eacute;/g, 'é')
              .replace(/&igrave;/g, 'ì')
              .replace(/&ograve;/g, 'ò')
              .replace(/&ugrave;/g, 'ù')
              .replace(/[ \t]+/g, ' ')
              .replace(/\n[ \t]+/g, '\n')
              .replace(/\n{3,}/g, '\n\n')
              .trim();

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
    let cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');

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
      let cleanedSectionText = sectionText
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
        .replace(/&agrave;/g, 'à')
        .replace(/&egrave;/g, 'è')
        .replace(/&eacute;/g, 'é')
        .replace(/&igrave;/g, 'ì')
        .replace(/&ograve;/g, 'ò')
        .replace(/&ugrave;/g, 'ù')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

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
async function findFanpageArticleUrl(archiveUrl: string, targetDate: string): Promise<string | null> {
  try {
    console.log('Fanpage.it - Searching archive page for today\'s horoscope...');

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
    const dateObj = new Date(targetDate);
    const day = dateObj.getDate();
    const month = ITALIAN_MONTHS[dateObj.getMonth()];
    const weekday = ITALIAN_WEEKDAYS[dateObj.getDay()];
    const year = dateObj.getFullYear();

    // Pattern: oroscopo-di-weekday-day-month-year
    const datePattern = `oroscopo-di-${weekday}-${day}-${month}-${year}`;
    console.log(`Fanpage.it - Looking for pattern: ${datePattern}`);

    // Cerca link che contengono questo pattern
    const urlPattern = new RegExp(`href=["']([^"']*${datePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"']*)["']`, 'gi');
    let match;

    while ((match = urlPattern.exec(html)) !== null) {
      let foundUrl = match[1];

      // Se l'URL è relativo, rendilo assoluto
      if (foundUrl.startsWith('/')) {
        foundUrl = 'https://www.fanpage.it' + foundUrl;
      }

      // Verifica che sia un URL dell'oroscopo
      if (foundUrl.includes('attualita') && foundUrl.includes('oroscopo')) {
        console.log(`Fanpage.it - Found article URL: ${foundUrl}`);
        return foundUrl;
      }
    }

    // Prova anche con varianti senza apostrofi o con "l'oroscopo" invece di "loroscopo"
    const alternativePattern = `href=["']([^"']*oroscopo[^"']*${weekday}[^"']*${day}[^"']*${month}[^"']*${year}[^"']*)["']`;
    const altRegex = new RegExp(alternativePattern, 'gi');

    while ((match = altRegex.exec(html)) !== null) {
      let foundUrl = match[1];

      if (foundUrl.startsWith('/')) {
        foundUrl = 'https://www.fanpage.it' + foundUrl;
      }

      if (foundUrl.includes('attualita')) {
        console.log(`Fanpage.it - Found article URL (alternative pattern): ${foundUrl}`);
        return foundUrl;
      }
    }

    console.log('Fanpage.it - No article found in archive page');
    return null;
  } catch (error) {
    console.error('Fanpage.it - Error searching archive:', error);
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

    // Special handling for OnlyOroscopo
    if (url.includes('onlyoroscopo.it')) {
      return await scrapeOnlyOroscopoHoroscopeText(url, input);
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
    if (domain.includes('oggi.it')) {
      console.log("Oggi.it - Starting specialized extraction for:", zodiacName);

      // Use a generic h4 regex that looks for any h4 tag
      const h4GenericRegex = /<h4[^>]*>(?:Oroscopo\s+di\s+)?[^<]*<\/h4>/gi;

      let h4Matches = cleanHtml.matchAll(h4GenericRegex);

      for (const matchH4 of h4Matches) {
        if (matchH4.index === undefined) continue;

        console.log(`Oggi.it - Found h4 tag: ${matchH4[0]}`);

        // Find the <!-- GIORNALIERO --> comment AFTER this H4 tag
        const commentStartIndex = cleanHtml.indexOf('<!-- GIORNALIERO -->', matchH4.index);

        let contentToSearch = '';
        if (commentStartIndex !== -1) {
          // If the comment is found after the H4, restrict the search scope up to the comment
          contentToSearch = cleanHtml.substring(matchH4.index + matchH4[0].length, commentStartIndex);
          console.log(`Oggi.it - Found <!-- GIORNALIERO --> comment at index ${commentStartIndex}. Restricting search scope.`);
        } else {
          // If the comment is not found after the H4, search from H4 till the end of the HTML (as a fallback)
          contentToSearch = cleanHtml.substring(matchH4.index + matchH4[0].length);
          console.log(`Oggi.it - <!-- GIORNALIERO --> comment not found after H4. Searching till end.`);
        }

        // Find all <p> tags within this restricted content
        const pTagRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
        let allParagraphs: string[] = [];
        let matchP;

        while ((matchP = pTagRegex.exec(contentToSearch)) !== null) {
          if (matchP[1]) {
            let paragraphContent = matchP[1]
              // Clean HTML tags
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<[^>]*>/g, ' ')
              // Decode HTML entities
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
              .replace(/&agrave;/g, 'à')
              .replace(/&egrave;/g, 'è')
              .replace(/&eacute;/g, 'é')
              .replace(/&igrave;/g, 'ì')
              .replace(/&ograve;/g, 'ò')
              .replace(/&ugrave;/g, 'ù')
              // Clean up whitespace
              .replace(/\s+/g, ' ')
              .trim();

            // Filter out navigation and very short content
            const isNavigation = /^(menu|naviga|cookie|privacy|leggi anche|condividi|share|login|registrati|abbonati|tags?:|categor)/i.test(paragraphContent);
            const isSubstantial = paragraphContent.length > 20;

            if (!isNavigation && isSubstantial) {
              allParagraphs.push(paragraphContent);
            }
          }
        }

        // Validate that the extracted content contains the zodiac sign or horoscope keywords
        const combinedText = allParagraphs.join(' ');
        const hasZodiacSign = combinedText.toLowerCase().includes(zodiacName);
        const hasHoroscopeContent = /\b(oroscopo|previsioni|stelle|fortuna|amore|lavoro|salute|giornata|energia|periodo)\b/i.test(combinedText);

        if ((hasZodiacSign || hasHoroscopeContent) && combinedText.length > 50) {
          console.log(`Oggi.it - Successfully extracted and validated content from ${allParagraphs.length} paragraphs.`);

          // Try to identify sections
          let extractedSections: Record<string, string[]> = {
            'GENERALE': [],
            'AMORE': [],
            'LAVORO': [],
            'BENESSERE': []
          };

          let currentSection = 'GENERALE';

          for (const paragraph of allParagraphs) {
            // Check if this is a section header
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

            extractedSections[currentSection].push(paragraph);
          }

          // Build combined content with section markers
          let finalContent = '';

          if (extractedSections['GENERALE'].length > 0) {
            finalContent += extractedSections['GENERALE'].join(' ') + '\n\n';
          }

          if (extractedSections['AMORE'].length > 0) {
            finalContent += `---AMORE_SECTION_START---\n${extractedSections['AMORE'].join(' ')}\n\n`;
          }

          if (extractedSections['LAVORO'].length > 0) {
            finalContent += `---LAVORO_SECTION_START---\n${extractedSections['LAVORO'].join(' ')}\n\n`;
          }

          if (extractedSections['BENESSERE'].length > 0) {
            finalContent += `---SALUTE_SECTION_START---\n${extractedSections['BENESSERE'].join(' ')}\n\n`;
          }

          if (!finalContent.trim()) {
            finalContent = allParagraphs.join('\n\n');
          }

          return {
            success: true,
            text: finalContent.trim().substring(0, 3500),
            url,
            actualUrl: url
          };
        } else {
          console.log(`Oggi.it - Content validation failed for this h4. Zodiac sign found: ${hasZodiacSign}, Horoscope content: ${hasHoroscopeContent}`);
        }
      }

      // If no valid content was found with any h4, return an error
      return {
        success: false,
        error: `Specific Oggi.it scraping failed for ${input.signSlugIt}. No valid horoscope content found between h4 tags and <!-- GIORNALIERO --> comment.`
      };
    }

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