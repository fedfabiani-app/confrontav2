import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScraperInput, ScraperOutput, scraperOutputSchema } from '@shared/schema';
import { ITALIAN_WEEKDAYS, ITALIAN_MONTHS } from '@shared/constants';

// Rate limiting and domain backoff
const domainLastRequest = new Map<string, number>();
const DOMAIN_DELAY_MS = 2000; // 2 seconds between requests to same domain

export async function scrapeHoroscope(input: ScraperInput): Promise<ScraperOutput> {
  try {
    // Build URL from pattern
    const url = buildUrlFromPattern(input);
    
    // Respect domain rate limiting
    await respectDomainRateLimit(input.domain);
    
    // Fetch HTML
    const html = await fetchHtml(url, input.userAgent);
    
    // Extract horoscope text
    const extractedText = extractHoroscopeText(html, input);
    
    const result: ScraperOutput = {
      sourceId: input.sourceId,
      signSlugIt: input.signSlugIt,
      dateISO: input.dateISO,
      original_url: url,
      scraped_at: new Date(),
      extracted_text: extractedText,
    };

    return scraperOutputSchema.parse(result);
  } catch (error) {
    console.error(`Scraping error for ${input.sourceName} - ${input.signSlugIt}:`, error);
    throw new Error(`Failed to scrape ${input.sourceName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function buildUrlFromPattern(input: ScraperInput): string {
  const date = new Date(input.dateISO);
  const day = date.getDate();
  const month = date.getMonth() + 1; // 0-indexed
  const year = date.getFullYear();
  const weekday = ITALIAN_WEEKDAYS[date.getDay()];
  const monthName = ITALIAN_MONTHS[date.getMonth()];

  let url = input.baseUrl + input.urlPattern;

  // Replace URL placeholders
  url = url.replace('{sign}', input.signSlugIt);
  url = url.replace('{dd}', day.toString().padStart(2, '0'));
  url = url.replace('{day}', day.toString());
  url = url.replace('{mm}', month.toString().padStart(2, '0'));
  url = url.replace('{month}', monthName);
  url = url.replace('{yyyy}', year.toString());
  url = url.replace('{year}', year.toString());
  url = url.replace('{weekday}', weekday);
  url = url.replace('{date}', input.gazzettaDatePath); // For Gazzetta special format

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
    const response = await axios.get(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 10000, // 10 second timeout
      maxRedirects: 5,
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`HTTP ${error.response?.status || 'unknown'}: ${error.message}`);
    }
    throw error;
  }
}

function extractHoroscopeText(html: string, input: ScraperInput): string {
  const $ = cheerio.load(html);
  let extractedText = '';

  // Domain-specific extraction logic
  switch (input.domain) {
    case 'repubblica.it':
      extractedText = extractRepubblica($, input.signSlugIt);
      break;
    case 'iodonna.it':
      extractedText = extractIoDonna($);
      break;
    case 'alfemminile.com':
      extractedText = extractAlfemminile($, input.signSlugIt);
      break;
    case 'gazzetta.it':
      extractedText = extractGazzetta($);
      break;
    case 'corriere.it':
    case 'style.corriere.it':
      extractedText = extractCorriere($);
      break;
    case 'oggi.it':
      extractedText = extractOggi($);
      break;
    case 'virgilio.it':
      extractedText = extractVirgilio($);
      break;
    case 'tg24.sky.it':
      extractedText = extractSky($);
      break;
    case 'vogue.it':
      extractedText = extractVogue($);
      break;
    case 'amica.it':
      extractedText = extractAmica($);
      break;
    case 'quotidiano.net':
      extractedText = extractQuotidiano($, input.signSlugIt);
      break;
    case 'onlyoroscopo.it':
      extractedText = extractOnlyOroscopo($);
      break;
    case 'oroscopo.grazia.it':
      extractedText = extractGrazia($);
      break;
    default:
      extractedText = extractGeneric($);
  }

  // Clean and validate extracted text
  extractedText = cleanExtractedText(extractedText);
  
  if (!extractedText || extractedText.length < 50) {
    throw new Error('Insufficient horoscope content extracted');
  }

  return extractedText;
}

// Domain-specific extraction functions
function extractRepubblica($: cheerio.CheerioAPI, signSlug: string): string {
  // Repubblica shows all signs on one page, need to find the specific sign section
  const signText = $(`.oroscopo-${signSlug}, [data-sign="${signSlug}"], .${signSlug}`)
    .find('p, .text, .content')
    .text()
    .trim();
  
  if (signText) return signText;
  
  // Fallback: look for headers with sign name and get following content
  const signName = getSignNameItalian(signSlug);
  const signHeader = $(`h2, h3, h4, .title`).filter((_, el) => 
    $(el).text().toLowerCase().includes(signName.toLowerCase())
  ).first();
  
  return signHeader.next('p, .text, .content').text().trim() ||
         signHeader.parent().find('p').text().trim();
}

function extractIoDonna($: cheerio.CheerioAPI): string {
  return $('.article-content p, .content p, .text p, .oroscopo-text')
    .first()
    .text()
    .trim();
}

function extractAlfemminile($: cheerio.CheerioAPI, signSlug: string): string {
  // Try sign-specific content first
  const signContent = $(`.${signSlug}, [data-sign="${signSlug}"]`)
    .find('p, .text')
    .text()
    .trim();
  
  if (signContent) return signContent;
  
  // Fallback to main article content
  return $('.article-content p, .content p, .entry-content p')
    .first()
    .text()
    .trim();
}

function extractGazzetta($: cheerio.CheerioAPI): string {
  return $('.article-body p, .content p, .story-text p, .entry-content p')
    .first()
    .text()
    .trim();
}

function extractCorriere($: cheerio.CheerioAPI): string {
  return $('.chapter-paragraph p, .content p, .article-content p')
    .first()
    .text()
    .trim();
}

function extractOggi($: cheerio.CheerioAPI): string {
  return $('.article-content p, .content p, .entry-content p, .text p')
    .first()
    .text()
    .trim();
}

function extractVirgilio($: cheerio.CheerioAPI): string {
  return $('.oroscopo-content p, .content p, .article p, .text p')
    .first()
    .text()
    .trim();
}

function extractSky($: cheerio.CheerioAPI): string {
  return $('.sdc-article-body p, .content p, .article-content p')
    .first()
    .text()
    .trim();
}

function extractVogue($: cheerio.CheerioAPI): string {
  return $('.ArticleBodyText p, .article-content p, .content p')
    .first()
    .text()
    .trim();
}

function extractAmica($: cheerio.CheerioAPI): string {
  return $('.article-content p, .content p, .entry-content p')
    .first()
    .text()
    .trim();
}

function extractQuotidiano($: cheerio.CheerioAPI, signSlug: string): string {
  // Quotidiano might show all signs, find specific one
  const signName = getSignNameItalian(signSlug);
  const signSection = $('h2, h3, .title').filter((_, el) => 
    $(el).text().toLowerCase().includes(signName.toLowerCase())
  ).first();
  
  return signSection.next('p, .text').text().trim() ||
         signSection.parent().find('p').first().text().trim();
}

function extractOnlyOroscopo($: cheerio.CheerioAPI): string {
  return $('.content p, .oroscopo-text, .article p, .entry-content p')
    .first()
    .text()
    .trim();
}

function extractGrazia($: cheerio.CheerioAPI): string {
  return $('.article-content p, .content p, .entry-content p')
    .first()
    .text()
    .trim();
}

function extractGeneric($: cheerio.CheerioAPI): string {
  // Generic fallback extraction
  const selectors = [
    '.content p', '.article-content p', '.entry-content p', 
    '.text p', '.oroscopo p', '.article p', 'main p',
    '.post-content p', '.story p'
  ];
  
  for (const selector of selectors) {
    const text = $(selector).first().text().trim();
    if (text && text.length > 50) {
      return text;
    }
  }
  
  return $('p').first().text().trim();
}

function cleanExtractedText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s.,!?;:()\-àèéìíîòóùúâêôûç]/gi, '') // Keep only safe characters
    .trim();
}

function getSignNameItalian(signSlug: string): string {
  const signMap: Record<string, string> = {
    ariete: 'Ariete',
    toro: 'Toro', 
    gemelli: 'Gemelli',
    cancro: 'Cancro',
    leone: 'Leone',
    vergine: 'Vergine',
    bilancia: 'Bilancia',
    scorpione: 'Scorpione',
    sagittario: 'Sagittario',
    capricorno: 'Capricorno',
    acquario: 'Acquario',
    pesci: 'Pesci',
  };
  
  return signMap[signSlug] || signSlug;
}

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
