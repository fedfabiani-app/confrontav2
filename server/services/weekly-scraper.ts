
import axios from 'axios';
import * as cheerio from 'cheerio';
import { WeeklyScraperInput, WeeklyScraperOutput, weeklyScraperOutputSchema } from '@shared/schema';
import { ITALIAN_WEEKDAYS, ITALIAN_MONTHS } from '@shared/constants';

// Rate limiting
const domainLastRequest = new Map<string, number>();
const DOMAIN_DELAY_MS = 2000;

interface WeeklyScrapeResult {
  success: boolean;
  text?: string;
  url?: string;
  error?: string;
}

// Weekly horoscope keywords for content validation
const WEEKLY_HOROSCOPE_KEYWORDS = [
  'settimana', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica',
  'dal', 'al', 'periodo', 'prossimi giorni', 'nei prossimi', 'questa settimana',
  'oroscopo', 'previsioni', 'stelle', 'zodiaco', 'segno', 'astrale',
  'amore', 'lavoro', 'salute', 'benessere', 'relazioni', 'carriera'
];

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
        'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
      },
      timeout: 15000,
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

function scoreWeeklyContent(content: string, zodiacName: string): number {
  let score = 0;
  const contentLower = content.toLowerCase();

  // Weekly-specific keywords
  const weeklyMatches = (content.match(new RegExp(`\\b(${WEEKLY_HOROSCOPE_KEYWORDS.join('|')})\\b`, 'gi')) || []).length;
  score += weeklyMatches * 5;

  // Zodiac sign mention
  if (contentLower.includes(zodiacName.toLowerCase())) {
    score += 20;
  }

  // Content length
  if (content.length > 100) score += 10;
  if (content.length > 300) score += 15;
  if (content.length > 500) score += 20;

  return score;
}

async function findCosmopolitanWeeklyUrl(input: WeeklyScraperInput): Promise<string | null> {
  try {
    const archiveUrl = 'https://www.cosmopolitan.com/it/oroscopo/oroscopo-settimana/';
    console.log(`[WeeklyScraper] Searching Cosmopolitan archive: ${archiveUrl}`);
    
    const html = await fetchHtml(archiveUrl, input.userAgent);
    const $ = cheerio.load(html);
    
    const weekStart = new Date(input.weekStartDate);
    const weekEnd = new Date(input.weekEndDate);
    const startDay = weekStart.getDate();
    const endDay = weekEnd.getDate();
    const startMonth = ITALIAN_MONTHS[weekStart.getMonth()].toLowerCase();
    const endMonth = ITALIAN_MONTHS[weekEnd.getMonth()].toLowerCase();
    
    // Build search pattern: "oroscopo settimana {start_day}-{end_day} {month}"
    // or "oroscopo-settimana-{start_day}-{end_day}-{start_month}-{year}"
    const searchPatterns = [
      `oroscopo-settimana-${startDay}-${endDay}-${startMonth}`,
      `oroscopo settimana ${startDay}-${endDay} ${startMonth}`,
      `${startDay}-${endDay} ${startMonth}`,
    ];
    
    // Look for article links
    let foundUrl: string | null = null;
    $('a[href*="oroscopo-settimana"]').each((_, element) => {
      const href = $(element).attr('href');
      const text = $(element).text().toLowerCase();
      
      if (href) {
        for (const pattern of searchPatterns) {
          if (href.toLowerCase().includes(pattern) || text.includes(pattern)) {
            foundUrl = href.startsWith('http') ? href : `https://www.cosmopolitan.com${href}`;
            console.log(`[WeeklyScraper] Found Cosmopolitan URL: ${foundUrl}`);
            return false; // break the loop
          }
        }
      }
    });
    
    return foundUrl;
  } catch (error) {
    console.error('[WeeklyScraper] Error finding Cosmopolitan URL:', error);
    return null;
  }
}

function buildWeeklyUrl(input: WeeklyScraperInput): string {
  const signMap: Record<string, string> = {
    'Ariete': 'ariete', 'Toro': 'toro', 'Gemelli': 'gemelli', 'Cancro': 'cancro',
    'Leone': 'leone', 'Vergine': 'vergine', 'Bilancia': 'bilancia', 'Scorpione': 'scorpione',
    'Sagittario': 'sagittario', 'Capricorno': 'capricorno', 'Acquario': 'acquario', 'Pesci': 'pesci'
  };

  let url = input.baseUrl + input.urlPattern;
  
  const weekStart = new Date(input.weekStartDate);
  const weekEnd = new Date(input.weekEndDate);

  const signSlug = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();

  // Week start components
  const startDay = weekStart.getDate();
  const startMonth = weekStart.getMonth();
  const startYear = weekStart.getFullYear();
  const startWeekday = ITALIAN_WEEKDAYS[weekStart.getDay()];
  const startMonthName = ITALIAN_MONTHS[startMonth];

  // Week end components
  const endDay = weekEnd.getDate();
  const endMonth = weekEnd.getMonth();
  const endWeekday = ITALIAN_WEEKDAYS[weekEnd.getDay()];
  const endMonthName = ITALIAN_MONTHS[endMonth];

  // Replace placeholders
  url = url.replace('{sign}', signSlug);
  url = url.replace('{week_start_day}', startDay.toString());
  url = url.replace('{start_day}', startDay.toString());
  url = url.replace('{week_start_month}', startMonthName);
  url = url.replace('{week_end_day}', endDay.toString());
  url = url.replace('{end_day}', endDay.toString());
  url = url.replace('{week_end_month}', endMonthName);
  url = url.replace('{day}', startDay.toString());
  url = url.replace('{dd}', startDay.toString().padStart(2, '0'));
  url = url.replace('{month}', startMonthName);
  url = url.replace('{mm}', (startMonth + 1).toString().padStart(2, '0'));
  url = url.replace('{year}', startYear.toString());
  url = url.replace('{yyyy}', startYear.toString());
  url = url.replace('{weekday}', startWeekday);

  return url;
}

async function scrapeWeeklyText(url: string, input: WeeklyScraperInput): Promise<WeeklyScrapeResult> {
  try {
    console.log(`[WeeklyScraper] Fetching ${url}`);
    const html = await fetchHtml(url, input.userAgent);

    // Clean HTML
    let cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    const $ = cheerio.load(cleanHtml);
    const zodiacName = input.signSlugIt.toLowerCase();
    
    // Try common selectors for weekly content
    const selectors = [
      '.article-content p',
      '.content p',
      '.entry-content p',
      '.post-content p',
      'article p',
      'main p',
      '.story p',
      '.text p'
    ];

    let bestText = '';
    let bestScore = 0;

    for (const selector of selectors) {
      const paragraphs: string[] = [];
      $(selector).each((_, element) => {
        const text = $(element).text().trim();
        if (text.length > 30) {
          paragraphs.push(text);
        }
      });

      if (paragraphs.length > 0) {
        const combinedText = paragraphs.join('\n\n');
        const score = scoreWeeklyContent(combinedText, zodiacName);
        
        if (score > bestScore) {
          bestScore = score;
          bestText = combinedText;
        }
      }
    }

    // Fallback: extract all paragraphs
    if (!bestText || bestScore < 20) {
      const allParagraphs: string[] = [];
      $('p').each((_, element) => {
        const text = $(element).text().trim();
        if (text.length > 30) {
          allParagraphs.push(text);
        }
      });
      
      if (allParagraphs.length > 0) {
        const combinedText = allParagraphs.join('\n\n');
        const score = scoreWeeklyContent(combinedText, zodiacName);
        
        if (score > bestScore) {
          bestScore = score;
          bestText = combinedText;
        }
      }
    }

    if (!bestText || bestScore < 15) {
      return {
        success: false,
        error: `Insufficient weekly content found (score: ${bestScore})`
      };
    }

    console.log(`[WeeklyScraper] Extracted weekly content with score ${bestScore}`);
    
    return {
      success: true,
      text: bestText.substring(0, 3500),
      url
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function scrapeWeeklyHoroscope(input: WeeklyScraperInput): Promise<WeeklyScraperOutput> {
  try {
    let url: string;
    
    // Special handling for Cosmopolitan - find URL from archive
    if (input.domain.includes('cosmopolitan.com')) {
      const foundUrl = await findCosmopolitanWeeklyUrl(input);
      if (!foundUrl) {
        throw new Error('Could not find current week\'s horoscope URL in Cosmopolitan archive');
      }
      url = foundUrl;
    } else {
      url = buildWeeklyUrl(input);
    }
    
    console.log(`[WeeklyScraper] Starting scrape for ${input.sourceName} - ${input.signSlugIt}`);
    console.log(`[WeeklyScraper] URL: ${url}`);

    await respectDomainRateLimit(input.domain);

    const result = await scrapeWeeklyText(url, input);

    if (!result.success || !result.text) {
      throw new Error(result.error || 'Failed to scrape weekly horoscope');
    }

    const output: WeeklyScraperOutput = {
      sourceId: input.sourceId,
      signSlugIt: input.signSlugIt,
      weekStartDate: input.weekStartDate,
      original_url: url,
      scraped_at: new Date(),
      extracted_text: result.text,
    };

    return weeklyScraperOutputSchema.parse(output);
  } catch (error) {
    console.error(`[WeeklyScraper] Error for ${input.sourceName} - ${input.signSlugIt}:`, error);
    throw new Error(`Failed to scrape weekly ${input.sourceName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function scrapeWeeklyWithRetry(
  input: WeeklyScraperInput,
  maxRetries: number = 3
): Promise<WeeklyScraperOutput> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await scrapeWeeklyHoroscope(input);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      if (attempt === maxRetries) {
        break;
      }

      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[WeeklyScraper] Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
