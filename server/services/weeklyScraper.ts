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
  
  const patterns = [
    /dal[l]?(\d{1,2})\s*[-]?\s*al\s*[-]?\s*(\d{1,2})\s*[-]?\s*(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s*[-]?\s*\d{4})?/i,
    /dal[l]?\s+(\d{1,2})\s*(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s*al\s*[-]?\s*(\d{1,2})\s*[-]?\s*(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s*[-]?\s*\d{4})?/i,
    /(\d{1,2})\s*[-]\s*(\d{1,2})\s*[-]?\s*(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s*[-]?\s*\d{4})?/i,
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
  
  const candidates: { url: string; dateRange: WeekDateRange }[] = [];
  
  // Special handling for Repubblica - extract URLs and dates from archive page
  if (input.domain.includes('repubblica.it')) {
    console.log('Repubblica archive - Extracting weekly URLs');
    
    $('a').each((_, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem).text();
      
      if (href && href.includes('oroscopo') && href.includes('settimana')) {
        const fullText = href + ' ' + text;
        const dateRange = parseItalianWeekRange(fullText, currentYear);
        
        if (dateRange) {
          const absoluteUrl = href.startsWith('http') ? href : 'https://d.repubblica.it' + href;
          candidates.push({ url: absoluteUrl, dateRange });
        }
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
          candidates.push({ url: absoluteUrl, dateRange });
        }
      }
    });
  }
  
  console.log(`Found ${candidates.length} candidate URLs in archive`);
  
  const targetDateStr = targetDate.toISOString().split('T')[0];
  
  for (const candidate of candidates) {
    const candidateDateStr = candidate.dateRange.startDate.toISOString().split('T')[0];
    console.log(`Candidate: ${candidate.url} => ${candidateDateStr} (target: ${targetDateStr})`);
    
    if (candidateDateStr === targetDateStr) {
      console.log(`✓ Matched archive URL: ${candidate.url}`);
      archiveUrlCache.set(cacheKey, candidate.url);
      return candidate.url;
    }
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
    const url = await buildWeeklyHoroscopeUrl(input);
    console.log(`Attempting to scrape weekly URL: ${url}`);

    await respectDomainRateLimit(input.domain);

    const scrapeResult = await scrapeWeeklyHoroscopeText(url, input);

    if (!scrapeResult.success || !scrapeResult.text) {
      throw new Error(`Failed to scrape weekly horoscope: ${scrapeResult.error}`);
    }

    const result: WeeklyScraperOutput = {
      sourceId: input.sourceId,
      signSlugIt: input.signSlugIt,
      weekStartDate: input.weekStartDate,
      original_url: url,
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
  if (input.scrapeStrategy === 'archive') {
    console.log(`Using archive strategy for ${input.sourceName}`);
    return await resolveWeeklyUrlFromArchive(input);
  }
  
  const signMap: Record<string, string> = {
    'Ariete': 'ariete', 'Toro': 'toro', 'Gemelli': 'gemelli', 'Cancro': 'cancro',
    'Leone': 'leone', 'Vergine': 'vergine', 'Bilancia': 'bilancia', 'Scorpione': 'scorpione',
    'Sagittario': 'sagittario', 'Capricorno': 'capricorno', 'Acquario': 'acquario', 'Pesci': 'pesci'
  };

  let url = input.baseUrl + input.urlPattern;
  const signSlug = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();

  // Replace all placeholders
  url = url.replace('{sign}', signSlug);
  url = url.replace('{start_day}', input.startDay);
  url = url.replace('{end_day}', input.endDay);
  url = url.replace('{week_start_day}', input.startDay);
  url = url.replace('{week_end_day}', input.endDay);
  url = url.replace('{dd}', input.startDay);
  url = url.replace('{mm}', input.month);
  url = url.replace('{month}', input.month);
  url = url.replace('{week_end_month}', input.month);
  url = url.replace('{month_name}', input.month);
  url = url.replace('{yyyy}', input.year);
  url = url.replace('{year}', input.year);

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

async function fetchHtml(url: string, userAgent: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      timeout: 10000,
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
      console.log(`Marie Claire - Extracting content for ${input.signSlugIt}`);
      
      const signMap: Record<string, string> = {
        'Ariete': 'ariete', 'Toro': 'toro', 'Gemelli': 'gemelli', 'Cancro': 'cancro',
        'Leone': 'leone', 'Vergine': 'vergine', 'Bilancia': 'bilancia', 'Scorpione': 'scorpione',
        'Sagittario': 'sagittario', 'Capricorno': 'capricorno', 'Acquario': 'acquario', 'Pesci': 'pesci'
      };

      const signId = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();
      
      // Find the h2 heading for this sign (e.g., <h2 id="toro">)
      const signHeading = $(`h2#${signId}, h2:contains("${input.signSlugIt}")`).first();
      
      if (signHeading.length > 0) {
        let extractedContent = '';
        
        // Get all siblings after the heading until the next h2
        let currentElement = signHeading.next();
        
        while (currentElement.length > 0 && currentElement.prop('tagName') !== 'H2') {
          if (currentElement.is('p')) {
            const text = currentElement.text().trim();
            if (text.length > 0 && !text.startsWith('La tip karmica:')) {
              extractedContent += text + '\n\n';
            } else if (text.startsWith('La tip karmica:')) {
              // Extract the karmic tip separately
              extractedContent += text + '\n\n';
            }
          }
          currentElement = currentElement.next();
        }
        
        if (extractedContent.trim().length > 50) {
          console.log(`Marie Claire - Successfully extracted ${extractedContent.length} chars for ${input.signSlugIt}`);
          return {
            success: true,
            text: extractedContent.trim().substring(0, 3500),
            url
          };
        }
      }
      
      console.log(`Marie Claire - Failed to find content for ${input.signSlugIt}`);
    }

    // Special handling for Repubblica - single page with all signs
    if (url.includes('repubblica.it')) {
      console.log(`Repubblica - Extracting content for ${input.signSlugIt}`);
      
      // Find the h2 heading for this sign
      const signHeading = $(`h2:contains("${input.signSlugIt}")`).first();
      
      if (signHeading.length > 0) {
        let extractedContent = '';
        
        // Get all paragraphs after the heading until the next h2
        let currentElement = signHeading.next();
        
        while (currentElement.length > 0 && currentElement.prop('tagName') !== 'H2') {
          if (currentElement.is('p')) {
            const text = currentElement.text().trim();
            if (text.length > 0) {
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
            url
          };
        }
      }
      
      console.log(`Repubblica - Failed to find content for ${input.signSlugIt}`);
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
      url
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
