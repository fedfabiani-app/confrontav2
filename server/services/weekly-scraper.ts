
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

async function findSuperGuidaTVWeeklyUrl(input: WeeklyScraperInput): Promise<string | null> {
  try {
    const archiveUrl = 'https://www.superguidatv.it/oroscopo-branko/';
    console.log(`[WeeklyScraper] Searching SuperGuidaTV archive: ${archiveUrl}`);
    
    const html = await fetchHtml(archiveUrl, input.userAgent);
    const $ = cheerio.load(html);
    
    const weekStart = new Date(input.weekStartDate);
    const weekEnd = new Date(input.weekEndDate);
    const startDay = weekStart.getDate();
    const endDay = weekEnd.getDate();
    const startMonth = ITALIAN_MONTHS[weekStart.getMonth()].toLowerCase();
    const endMonth = ITALIAN_MONTHS[weekEnd.getMonth()].toLowerCase();
    
    // Build search patterns - SuperGuidaTV uses various formats
    // e.g., "dal-7-al-13-ottobre" or "dall-7-al-13-ottobre"
    const searchPatterns = [
      `dal-${startDay}-al-${endDay}-${startMonth}`,
      `dall-${startDay}-al-${endDay}-${startMonth}`,
      `dal ${startDay} al ${endDay} ${startMonth}`,
      `dall ${startDay} al ${endDay} ${startMonth}`,
      `${startDay}-${endDay} ${startMonth}`,
    ];
    
    // Look for article links in the archive
    let foundUrl: string | null = null;
    $('a').each((_, element) => {
      const href = $(element).attr('href');
      const text = $(element).text().toLowerCase();
      
      if (href && href.includes('oroscopo')) {
        for (const pattern of searchPatterns) {
          if (href.toLowerCase().includes(pattern) || text.includes(pattern)) {
            foundUrl = href.startsWith('http') ? href : `https://www.superguidatv.it${href}`;
            console.log(`[WeeklyScraper] Found SuperGuidaTV URL: ${foundUrl}`);
            return false; // break the loop
          }
        }
      }
    });
    
    return foundUrl;
  } catch (error) {
    console.error('[WeeklyScraper] Error finding SuperGuidaTV URL:', error);
    return null;
  }
}

async function findMarieClairWeeklyUrl(input: WeeklyScraperInput): Promise<string | null> {
  try {
    const archiveUrl = 'https://www.marieclaire.it/oroscopo/';
    console.log(`[WeeklyScraper] Searching Marie Claire archive: ${archiveUrl}`);
    
    const html = await fetchHtml(archiveUrl, input.userAgent);
    const $ = cheerio.load(html);
    
    const weekStart = new Date(input.weekStartDate);
    const weekEnd = new Date(input.weekEndDate);
    const startDay = weekStart.getDate();
    const endDay = weekEnd.getDate();
    const startMonth = ITALIAN_MONTHS[weekStart.getMonth()].toLowerCase();
    const endMonth = ITALIAN_MONTHS[weekEnd.getMonth()].toLowerCase();
    
    // Build search patterns - Marie Claire uses formats like:
    // "oroscopo-settimana-di-marie-claire-dal-6-al-12-ottobre"
    const searchPatterns = [
      `oroscopo-settimana-di-marie-claire-dal-${startDay}-al-${endDay}-${startMonth}`,
      `oroscopo-settimana-dal-${startDay}-al-${endDay}-${startMonth}`,
      `dal-${startDay}-al-${endDay}-${startMonth}`,
      `dal ${startDay} al ${endDay} ${startMonth}`,
      `${startDay} al ${endDay} ${startMonth}`,
    ];
    
    // Look for article links in the archive
    let foundUrl: string | null = null;
    $('a').each((_, element) => {
      const href = $(element).attr('href');
      const text = $(element).text().toLowerCase();
      
      if (href && (href.includes('oroscopo') || href.includes('settimana'))) {
        for (const pattern of searchPatterns) {
          if (href.toLowerCase().includes(pattern) || text.includes(pattern)) {
            foundUrl = href.startsWith('http') ? href : `https://www.marieclaire.it${href}`;
            console.log(`[WeeklyScraper] Found Marie Claire URL: ${foundUrl}`);
            return false; // break the loop
          }
        }
      }
    });
    
    return foundUrl;
  } catch (error) {
    console.error('[WeeklyScraper] Error finding Marie Claire URL:', error);
    return null;
  }
}

async function findRepubblicaWeeklyUrl(input: WeeklyScraperInput): Promise<string | null> {
  try {
    const archiveUrl = 'https://d.repubblica.it/oroscopo/oroscopo-della-settimana/';
    console.log(`[WeeklyScraper] Searching Repubblica archive: ${archiveUrl}`);
    
    const html = await fetchHtml(archiveUrl, input.userAgent);
    const $ = cheerio.load(html);
    
    // Repubblica's week can start on different days, let's check both Saturday and the actual week start
    const weekStart = new Date(input.weekStartDate);
    const weekEnd = new Date(input.weekEndDate);
    
    // Try with the given week start (Monday)
    const mondayDay = weekStart.getDate();
    const mondayMonth = ITALIAN_MONTHS[weekStart.getMonth()].toLowerCase();
    
    // Also try with Saturday (Repubblica's typical week start)
    const saturday = new Date(weekStart);
    const dayOfWeek = saturday.getDay();
    const daysToSaturday = dayOfWeek === 0 ? -1 : (6 - dayOfWeek);
    saturday.setDate(saturday.getDate() + daysToSaturday);
    
    const saturdayDay = saturday.getDate();
    const saturdayMonth = ITALIAN_MONTHS[saturday.getMonth()].toLowerCase();
    
    const endDay = weekEnd.getDate();
    const endMonth = ITALIAN_MONTHS[weekEnd.getMonth()].toLowerCase();
    
    console.log(`[WeeklyScraper] Searching for Repubblica dates:`, {
      monday: `${mondayDay} ${mondayMonth}`,
      saturday: `${saturdayDay} ${saturdayMonth}`,
      end: `${endDay} ${endMonth}`
    });
    
    // Build flexible search patterns - Repubblica uses various formats
    const searchPatterns = [
      // With Saturday start
      `${saturdayDay}_al_${endDay}_${saturdayMonth}`,
      `dal_${saturdayDay}_al_${endDay}_${saturdayMonth}`,
      `dal ${saturdayDay} al ${endDay} ${saturdayMonth}`,
      // With Monday start (fallback)
      `${mondayDay}_al_${endDay}_${mondayMonth}`,
      `dal_${mondayDay}_al_${endDay}_${mondayMonth}`,
      `dal ${mondayDay} al ${endDay} ${mondayMonth}`,
      // More generic patterns
      `${saturdayDay} al ${endDay}`,
      `${mondayDay} al ${endDay}`,
    ];
    
    // Look for article links in the archive
    let foundUrl: string | null = null;
    $('a').each((_, element) => {
      const href = $(element).attr('href');
      const text = $(element).text().toLowerCase();
      
      if (href && href.includes('oroscopo')) {
        const hrefLower = href.toLowerCase();
        const combinedText = `${hrefLower} ${text}`;
        
        for (const pattern of searchPatterns) {
          if (combinedText.includes(pattern.toLowerCase())) {
            foundUrl = href.startsWith('http') ? href : `https://d.repubblica.it${href}`;
            console.log(`[WeeklyScraper] Found Repubblica URL with pattern "${pattern}": ${foundUrl}`);
            return false; // break the loop
          }
        }
      }
    });
    
    if (!foundUrl) {
      console.log(`[WeeklyScraper] No Repubblica URL found. Available links on archive page:`);
      $('a[href*="oroscopo"]').slice(0, 5).each((_, element) => {
        console.log(`  - ${$(element).attr('href')}`);
        console.log(`    Text: ${$(element).text().trim()}`);
      });
    }
    
    return foundUrl;
  } catch (error) {
    console.error('[WeeklyScraper] Error finding Repubblica URL:', error);
    return null;
  }
}

async function findSorrisiWeeklyUrl(input: WeeklyScraperInput): Promise<string | null> {
  try {
    const archiveUrl = 'https://www.sorrisi.com/lifestyle/oroscopo/';
    console.log(`[WeeklyScraper] Searching Sorrisi archive: ${archiveUrl}`);
    
    const html = await fetchHtml(archiveUrl, input.userAgent);
    const $ = cheerio.load(html);
    
    // Sorrisi week starts on Saturday (not Monday)
    // Calculate Saturday from the given Monday week start
    const mondayStart = new Date(input.weekStartDate);
    const saturday = new Date(mondayStart);
    saturday.setDate(mondayStart.getDate() - 2); // Go back 2 days from Monday to Saturday
    
    // End date is Friday (6 days after Saturday)
    const friday = new Date(saturday);
    friday.setDate(saturday.getDate() + 6);
    
    const saturdayDay = saturday.getDate();
    const saturdayMonth = ITALIAN_MONTHS[saturday.getMonth()].toLowerCase();
    
    const fridayDay = friday.getDate();
    const fridayMonth = ITALIAN_MONTHS[friday.getMonth()].toLowerCase();
    
    console.log(`[WeeklyScraper] Searching for Sorrisi dates (Saturday-Friday):`, {
      saturday: `${saturdayDay} ${saturdayMonth}`,
      friday: `${fridayDay} ${fridayMonth}`
    });
    
    // Build search patterns - Sorrisi uses "dal X al Y mese" format
    const searchPatterns = [
      `dal-${saturdayDay}-al-${fridayDay}-${saturdayMonth}`,
      `dal-${saturdayDay}-al-${fridayDay}-${fridayMonth}`,
      `dal ${saturdayDay} al ${fridayDay} ${saturdayMonth}`,
      `dal ${saturdayDay} al ${fridayDay} ${fridayMonth}`,
      // Generic patterns
      `${saturdayDay} al ${fridayDay}`,
    ];
    
    // Look for article links in the archive
    let foundUrl: string | null = null;
    $('a').each((_, element) => {
      const href = $(element).attr('href');
      const text = $(element).text().toLowerCase();
      
      if (href && href.includes('oroscopo')) {
        const hrefLower = href.toLowerCase();
        const combinedText = `${hrefLower} ${text}`;
        
        for (const pattern of searchPatterns) {
          if (combinedText.includes(pattern.toLowerCase())) {
            foundUrl = href.startsWith('http') ? href : `https://www.sorrisi.com${href}`;
            console.log(`[WeeklyScraper] Found Sorrisi URL with pattern "${pattern}": ${foundUrl}`);
            return false; // break the loop
          }
        }
      }
    });
    
    if (!foundUrl) {
      console.log(`[WeeklyScraper] No Sorrisi URL found. Available links on archive page:`);
      $('a[href*="oroscopo"]').slice(0, 5).each((_, element) => {
        console.log(`  - ${$(element).attr('href')}`);
        console.log(`    Text: ${$(element).text().trim()}`);
      });
    }
    
    return foundUrl;
  } catch (error) {
    console.error('[WeeklyScraper] Error finding Sorrisi URL:', error);
    return null;
  }
}

async function scrapeMarieClairWeeklyText(url: string, input: WeeklyScraperInput): Promise<WeeklyScrapeResult> {
  try {
    console.log(`[WeeklyScraper] Marie Claire - Fetching ${url} for ${input.signSlugIt}`);
    const html = await fetchHtml(url, input.userAgent);
    const $ = cheerio.load(html);
    
    const zodiacName = input.signSlugIt;
    const zodiacNameLower = zodiacName.toLowerCase();
    
    // Marie Claire has all signs on one page with H2 headings
    // Find the H2 with the sign name
    let signContent = '';
    
    $('h2').each((_, h2Element) => {
      const h2Text = $(h2Element).text().trim();
      
      // Check if this H2 contains the zodiac sign name
      if (h2Text.toLowerCase().includes(zodiacNameLower)) {
        console.log(`[WeeklyScraper] Marie Claire - Found H2 for ${zodiacName}: ${h2Text}`);
        
        // Extract all paragraphs after this H2 until the next H2
        let currentElement = $(h2Element).next();
        const paragraphs: string[] = [];
        
        while (currentElement.length > 0) {
          const tagName = currentElement.prop('tagName')?.toLowerCase();
          
          // Stop if we hit another H2 (next sign)
          if (tagName === 'h2') {
            break;
          }
          
          // Extract paragraph content
          if (tagName === 'p') {
            const pText = currentElement.text().trim();
            if (pText.length > 20) {
              paragraphs.push(pText);
            }
          }
          
          currentElement = currentElement.next();
        }
        
        if (paragraphs.length > 0) {
          signContent = paragraphs.join('\n\n');
          console.log(`[WeeklyScraper] Marie Claire - Extracted ${paragraphs.length} paragraphs for ${zodiacName}`);
          return false; // break the each loop
        }
      }
    });
    
    if (!signContent || signContent.length < 50) {
      return {
        success: false,
        error: `No content found for ${zodiacName} in Marie Claire weekly horoscope`
      };
    }
    
    const score = scoreWeeklyContent(signContent, zodiacNameLower);
    console.log(`[WeeklyScraper] Marie Claire - Content score for ${zodiacName}: ${score}`);
    
    if (score < 10) {
      return {
        success: false,
        error: `Insufficient weekly content quality for ${zodiacName} (score: ${score})`
      };
    }
    
    return {
      success: true,
      text: signContent.substring(0, 3500),
      url
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function scrapeRepubblicaWeeklyText(url: string, input: WeeklyScraperInput): Promise<WeeklyScrapeResult> {
  try {
    console.log(`[WeeklyScraper] Repubblica - Fetching ${url} for ${input.signSlugIt}`);
    const html = await fetchHtml(url, input.userAgent);
    const $ = cheerio.load(html);
    
    const zodiacName = input.signSlugIt;
    const zodiacNameLower = zodiacName.toLowerCase();
    
    // Repubblica has all signs on one page, typically with H2 or H3 headings
    // Try both H2 and H3 tags
    let signContent = '';
    
    // First try H2
    $('h2').each((_, headingElement) => {
      const headingText = $(headingElement).text().trim();
      
      if (headingText.toLowerCase().includes(zodiacNameLower)) {
        console.log(`[WeeklyScraper] Repubblica - Found H2 for ${zodiacName}: ${headingText}`);
        
        let currentElement = $(headingElement).next();
        const paragraphs: string[] = [];
        
        while (currentElement.length > 0) {
          const tagName = currentElement.prop('tagName')?.toLowerCase();
          
          // Stop if we hit another heading
          if (tagName === 'h2' || tagName === 'h3') {
            break;
          }
          
          if (tagName === 'p') {
            const pText = currentElement.text().trim();
            if (pText.length > 20) {
              paragraphs.push(pText);
            }
          }
          
          currentElement = currentElement.next();
        }
        
        if (paragraphs.length > 0) {
          signContent = paragraphs.join('\n\n');
          console.log(`[WeeklyScraper] Repubblica - Extracted ${paragraphs.length} paragraphs from H2`);
          return false;
        }
      }
    });
    
    // If not found, try H3
    if (!signContent) {
      $('h3').each((_, headingElement) => {
        const headingText = $(headingElement).text().trim();
        
        if (headingText.toLowerCase().includes(zodiacNameLower)) {
          console.log(`[WeeklyScraper] Repubblica - Found H3 for ${zodiacName}: ${headingText}`);
          
          let currentElement = $(headingElement).next();
          const paragraphs: string[] = [];
          
          while (currentElement.length > 0) {
            const tagName = currentElement.prop('tagName')?.toLowerCase();
            
            if (tagName === 'h2' || tagName === 'h3') {
              break;
            }
            
            if (tagName === 'p') {
              const pText = currentElement.text().trim();
              if (pText.length > 20) {
                paragraphs.push(pText);
              }
            }
            
            currentElement = currentElement.next();
          }
          
          if (paragraphs.length > 0) {
            signContent = paragraphs.join('\n\n');
            console.log(`[WeeklyScraper] Repubblica - Extracted ${paragraphs.length} paragraphs from H3`);
            return false;
          }
        }
      });
    }
    
    if (!signContent || signContent.length < 50) {
      return {
        success: false,
        error: `No content found for ${zodiacName} in Repubblica weekly horoscope`
      };
    }
    
    const score = scoreWeeklyContent(signContent, zodiacNameLower);
    console.log(`[WeeklyScraper] Repubblica - Content score for ${zodiacName}: ${score}`);
    
    if (score < 10) {
      return {
        success: false,
        error: `Insufficient weekly content quality for ${zodiacName} (score: ${score})`
      };
    }
    
    return {
      success: true,
      text: signContent.substring(0, 3500),
      url
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function scrapeSorrisiWeeklyText(url: string, input: WeeklyScraperInput): Promise<WeeklyScrapeResult> {
  try {
    console.log(`[WeeklyScraper] Sorrisi - Fetching ${url} for ${input.signSlugIt}`);
    const html = await fetchHtml(url, input.userAgent);
    const $ = cheerio.load(html);
    
    const zodiacName = input.signSlugIt;
    const zodiacNameLower = zodiacName.toLowerCase();
    
    // Sorrisi has all signs on one page with H3 headings
    let signContent = '';
    
    $('h3').each((_, headingElement) => {
      const headingText = $(headingElement).text().trim();
      
      // Check if this H3 contains the zodiac sign name
      if (headingText.toLowerCase().includes(zodiacNameLower)) {
        console.log(`[WeeklyScraper] Sorrisi - Found H3 for ${zodiacName}: ${headingText}`);
        
        // Extract all paragraphs after this H3 until the next H3
        let currentElement = $(headingElement).next();
        const paragraphs: string[] = [];
        
        while (currentElement.length > 0) {
          const tagName = currentElement.prop('tagName')?.toLowerCase();
          
          // Stop if we hit another H3 (next sign)
          if (tagName === 'h3') {
            break;
          }
          
          // Extract paragraph content
          if (tagName === 'p') {
            const pText = currentElement.text().trim();
            if (pText.length > 20) {
              paragraphs.push(pText);
            }
          }
          
          currentElement = currentElement.next();
        }
        
        if (paragraphs.length > 0) {
          signContent = paragraphs.join('\n\n');
          console.log(`[WeeklyScraper] Sorrisi - Extracted ${paragraphs.length} paragraphs for ${zodiacName}`);
          return false; // break the each loop
        }
      }
    });
    
    if (!signContent || signContent.length < 50) {
      return {
        success: false,
        error: `No content found for ${zodiacName} in Sorrisi weekly horoscope`
      };
    }
    
    const score = scoreWeeklyContent(signContent, zodiacNameLower);
    console.log(`[WeeklyScraper] Sorrisi - Content score for ${zodiacName}: ${score}`);
    
    if (score < 10) {
      return {
        success: false,
        error: `Insufficient weekly content quality for ${zodiacName} (score: ${score})`
      };
    }
    
    return {
      success: true,
      text: signContent.substring(0, 3500),
      url
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
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
    } 
    // Special handling for SuperGuidaTV - find URL from archive
    else if (input.domain.includes('superguidatv.it')) {
      const foundUrl = await findSuperGuidaTVWeeklyUrl(input);
      if (!foundUrl) {
        throw new Error('Could not find current week\'s horoscope URL in SuperGuidaTV archive');
      }
      url = foundUrl;
    }
    // Special handling for Marie Claire - find URL from archive
    else if (input.domain.includes('marieclaire.it')) {
      const foundUrl = await findMarieClairWeeklyUrl(input);
      if (!foundUrl) {
        throw new Error('Could not find current week\'s horoscope URL in Marie Claire archive');
      }
      url = foundUrl;
    }
    // Special handling for Repubblica - find URL from archive (week starts Saturday)
    else if (input.domain.includes('repubblica.it')) {
      const foundUrl = await findRepubblicaWeeklyUrl(input);
      if (!foundUrl) {
        throw new Error('Could not find current week\'s horoscope URL in Repubblica archive');
      }
      url = foundUrl;
    }
    // Special handling for Sorrisi - find URL from archive (week starts Saturday)
    else if (input.domain.includes('sorrisi.com')) {
      const foundUrl = await findSorrisiWeeklyUrl(input);
      if (!foundUrl) {
        throw new Error('Could not find current week\'s horoscope URL in Sorrisi archive');
      }
      url = foundUrl;
    }
    else {
      url = buildWeeklyUrl(input);
    }
    
    console.log(`[WeeklyScraper] Starting scrape for ${input.sourceName} - ${input.signSlugIt}`);
    console.log(`[WeeklyScraper] URL: ${url}`);

    await respectDomainRateLimit(input.domain);

    // Use specialized scrapers for sources with all signs on one page
    let result: WeeklyScrapeResult;
    if (input.domain.includes('marieclaire.it')) {
      result = await scrapeMarieClairWeeklyText(url, input);
    } else if (input.domain.includes('repubblica.it')) {
      result = await scrapeRepubblicaWeeklyText(url, input);
    } else if (input.domain.includes('sorrisi.com')) {
      result = await scrapeSorrisiWeeklyText(url, input);
    } else {
      result = await scrapeWeeklyText(url, input);
    }

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
