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
  } else if (input.domain.includes('marieclaire.it')) {
    console.log('Marie Claire archive - Extracting weekly URLs');
    
    // Marie Claire specific pattern: /lifestyle/coolmix/a{random}/oroscopo-settimana...
    const urlPattern = /\/lifestyle\/coolmix\/a\d+\/oroscopo[-_]settimana/i;
    
    $('a').each((_, elem) => {
      const href = $(elem).attr('href');
      const linkText = $(elem).text().trim();
      
      if (!href || !urlPattern.test(href)) {
        return;
      }
      
      let score = 0;
      
      // Extract date range from URL or link text
      const fullText = href + ' ' + linkText;
      const dateRange = parseItalianWeekRange(fullText, currentYear);
      
      if (dateRange) {
        score += 20;
        
        // Bonus for recent articles
        const articleMatch = href.match(/\/a(\d+)\//);
        if (articleMatch) {
          const articleId = parseInt(articleMatch[1]);
          score += Math.min(articleId / 1000000, 50); // Higher article ID = more recent
        }
        
        const absoluteUrl = href.startsWith('http') ? href : input.baseUrl + href;
        candidates.push({ url: absoluteUrl, dateRange, score });
        
        console.log(`Found Marie Claire URL (score: ${score}): ${absoluteUrl}`);
      }
    });
    
    // Sort by score (highest first)
    candidates.sort((a, b) => b.score - a.score);
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
      return candidate.url;
    }
  }
  
  // Second try: date within range (for weekly horoscopes that cover a week)
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
  // Archive strategy - resolve from archive page
  if (input.scrapeStrategy === 'archive') {
    console.log(`Using archive strategy for ${input.sourceName}`);
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

  // Replace all placeholders - CRITICAL: replace longer patterns first to avoid partial replacements
  // Order matters! {week_start_day} must be replaced before {start_day}
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
      console.log(`Marie Claire - Extracting content for ${input.signSlugIt}`);
      
      const signMap: Record<string, string> = {
        'Ariete': 'ariete', 'Toro': 'toro', 'Gemelli': 'gemelli', 'Cancro': 'cancro',
        'Leone': 'leone', 'Vergine': 'vergine', 'Bilancia': 'bilancia', 'Scorpione': 'scorpione',
        'Sagittario': 'sagittario', 'Capricorno': 'capricorno', 'Acquario': 'acquario', 'Pesci': 'pesci'
      };

      const signId = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();
      
      // Strategy 1: Find h2 with id attribute
      let signHeading = $(`h2#${signId}`).first();
      
      // Strategy 2: Find h2 containing the sign name in strong tag
      if (signHeading.length === 0) {
        $('h2').each((_, h2) => {
          const strongText = $(h2).find('strong').text().trim();
          if (strongText.toLowerCase() === input.signSlugIt.toLowerCase()) {
            signHeading = $(h2);
            return false; // Break loop
          }
        });
      }
      
      // Strategy 3: Find h2 containing sign name anywhere
      if (signHeading.length === 0) {
        signHeading = $(`h2:contains("${input.signSlugIt}")`).first();
      }
      
      if (signHeading.length > 0) {
        let extractedContent = '';
        
        // Get all siblings after the heading until the next h2
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
          console.log(`Marie Claire - Successfully extracted ${extractedContent.length} chars for ${input.signSlugIt}`);
          return {
            success: true,
            text: extractedContent.trim().substring(0, 3500),
            url
          };
        }
      }
      
      console.log(`Marie Claire - Failed to find heading for ${input.signSlugIt}, trying alternative selectors`);
      
      // Fallback: Try to find content in article body with different structure
      const articleBody = $('article, .article-body, [class*="article"]').first();
      if (articleBody.length > 0) {
        let foundSign = false;
        let extractedContent = '';
        
        articleBody.find('p, h2, h3, h4').each((_, elem) => {
          const $elem = $(elem);
          const text = $elem.text().trim();
          
          if ($elem.is('h2, h3, h4') && text.toLowerCase().includes(input.signSlugIt.toLowerCase())) {
            foundSign = true;
            extractedContent = '';
          } else if (foundSign && $elem.is('p')) {
            extractedContent += text + '\n\n';
          } else if (foundSign && $elem.is('h2, h3, h4')) {
            // Next sign found, stop
            return false;
          }
        });
        
        if (extractedContent.trim().length > 50) {
          console.log(`Marie Claire - Extracted ${extractedContent.length} chars using fallback method`);
          return {
            success: true,
            text: extractedContent.trim().substring(0, 3500),
            url
          };
        }
      }
      
      console.log(`Marie Claire - All extraction methods failed for ${input.signSlugIt}`);
    }

    // Special handling for Repubblica - single page with all signs
    if (url.includes('repubblica.it')) {
      console.log(`Repubblica - Extracting content for ${input.signSlugIt} from URL: ${url}`);
      
      // Try multiple selectors for the main content area
      const contentSelectors = [
        '.story__content',
        'article .article-content',
        '[data-component="ArticleBody"]',
        'main article'
      ];
      
      let mainContent = $('body');
      for (const selector of contentSelectors) {
        const elem = $(selector);
        if (elem.length > 0) {
          mainContent = elem;
          console.log(`Repubblica - Using content selector: ${selector}`);
          break;
        }
      }
      
      // Find the heading for this sign (try different heading levels)
      const signHeadingSelectors = [
        `h2:contains("${input.signSlugIt}")`,
        `h3:contains("${input.signSlugIt}")`,
        `h4:contains("${input.signSlugIt}")`,
        `strong:contains("${input.signSlugIt}")`
      ];
      
      let signHeading = $();
      for (const selector of signHeadingSelectors) {
        signHeading = mainContent.find(selector).first();
        if (signHeading.length > 0) {
          console.log(`Repubblica - Found ${input.signSlugIt} using: ${selector}`);
          break;
        }
      }
      
      if (signHeading.length > 0) {
        let extractedContent = '';
        
        // Get parent container if heading is within a structured section
        const parent = signHeading.parent();
        
        // Strategy 1: Extract from structured section
        if (parent.is('div') || parent.is('section')) {
          parent.find('p').each((_, p) => {
            const text = $(p).text().trim();
            if (text.length > 0 && !text.match(/^(pubblicato|condividi|leggi anche)/i)) {
              extractedContent += text + '\n\n';
            }
          });
        }
        
        // Strategy 2: Get siblings after heading
        if (!extractedContent || extractedContent.length < 50) {
          extractedContent = '';
          let currentElement = signHeading.next();
          
          while (currentElement.length > 0) {
            const tagName = currentElement.prop('tagName');
            
            // Stop at next sign heading
            if (['H2', 'H3', 'H4'].includes(tagName)) {
              const headingText = currentElement.text();
              const zodiacSigns = ['ariete', 'toro', 'gemelli', 'cancro', 'leone', 'vergine', 
                                   'bilancia', 'scorpione', 'sagittario', 'capricorno', 'acquario', 'pesci'];
              if (zodiacSigns.some(sign => headingText.toLowerCase().includes(sign))) {
                break;
              }
            }
            
            if (currentElement.is('p')) {
              const text = currentElement.text().trim();
              if (text.length > 0 && !text.match(/^(pubblicato|condividi|leggi anche)/i)) {
                extractedContent += text + '\n\n';
              }
            }
            
            currentElement = currentElement.next();
          }
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
      
      console.log(`Repubblica - Failed to find heading or content for ${input.signSlugIt}`);
      
      // Fallback: try to find content in a tab-based layout
      const tabContent = mainContent.find(`[data-sign="${input.signSlugIt.toLowerCase()}"], .tab-content:contains("${input.signSlugIt}")`);
      if (tabContent.length > 0) {
        const text = tabContent.text().trim();
        if (text.length > 50) {
          console.log(`Repubblica - Found content in tab layout for ${input.signSlugIt}`);
          return {
            success: true,
            text: text.substring(0, 3500),
            url
          };
        }
      }
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
