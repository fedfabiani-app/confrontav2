import { Source, ZodiacSign } from "@/shared/types";

declare global {
  interface D1Database {
    prepare(query: string): D1PreparedStatement;
  }
  
  interface D1PreparedStatement {
    bind(...values: any[]): D1PreparedStatement;
    all(): Promise<D1Result>;
    run(): Promise<D1ExecResult>;
  }
  
  interface D1Result {
    results: any[];
    success: boolean;
    meta: any;
  }
  
  interface D1ExecResult {
    success: boolean;
    meta: any;
  }
}
import { createOpenAIClient, extractHoroscopeData } from "./openai";
import { saveHoroscopeData } from "./database";

interface ScrapeResult {
  success: boolean;
  text?: string;
  url?: string;
  error?: string;
  actualUrl?: string; // The actual URL that was scraped (for cases where URL discovery happens)
  relazioni_rating?: number;
  lavoro_rating?: number;
  salute_rating?: number;
}

function buildIoDonnaUrl(source: Source, zodiacSign: ZodiacSign, date: string): string {
  // For IO Donna, we have two URL patterns to try:
  // 1. Date-specific: /oroscopo/giorno/{sign}-{dd}-{mm}-{yyyy}/
  // 2. Generic today: /oroscopo/oggi/{sign}/
  
  const signMap: Record<string, string> = {
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
  };
  
  const signSlug = signMap[zodiacSign.name_italian] || zodiacSign.name_italian.toLowerCase();
  
  // Parse the date for the date-specific URL format
  const targetDate = new Date(date);
  const day = targetDate.getDate().toString().padStart(2, '0');
  const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');
  const year = targetDate.getFullYear();
  
  // Return the date-specific URL first (this will be tried first)
  const dateSpecificUrl = `${source.base_url}/oroscopo/giorno/${signSlug}-${day}-${month}-${year}/`;
  
  return dateSpecificUrl;
}

export function buildHoroscopeUrl(source: Source, zodiacSign: ZodiacSign, date: string): string | string[] {
  // Define signMap early for use throughout the function
  const signMap: Record<string, string> = {
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
  };

  // Handle Repubblica.it special case - we'll use the index page first
  if (source.domain.includes('repubblica.it')) {
    return source.base_url + source.url_pattern; // This will be the index page
  }
  
  // Handle IO Donna special case - try date-specific URL first
  if (source.domain.includes('iodonna.it')) {
    return buildIoDonnaUrl(source, zodiacSign, date);
  }
  
  // Most URLs are now generic and don't need zodiac sign specific URLs
  // The scraping will need to extract all zodiac signs from these pages
  let url = source.base_url + source.url_pattern;
  
  // Handle date-specific URLs for sources that need them
  const targetDate = new Date(date);
  const dateFormatted = targetDate.toISOString().split('T')[0];
  
  console.log(`Building URL for ${source.domain} - ${zodiacSign.name_italian} on ${date}`);
  
  // Handle Alfemminile, Fanpage, and Gazzetta specific date formatting with Italian weekdays
  if ((source.domain.includes('alfemminile.com') || source.domain.includes('fanpage.it') || source.domain.includes('gazzetta.it')) && url.includes('{weekday}')) {
    const italianWeekdays = [
      'domenica', 'lunedi', 'martedi', 'mercoledi', 
      'giovedi', 'venerdi', 'sabato'
    ];
    
    const italianMonths = [
      'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
      'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'
    ];
    
    // Create date object ensuring correct timezone handling
    const dateForTarget = new Date(targetDate.getTime());
    const weekday = italianWeekdays[dateForTarget.getDay()];
    const day = dateForTarget.getDate();
    const month = italianMonths[dateForTarget.getMonth()];
    const year = dateForTarget.getFullYear();
    
    console.log(`Date calculation for ${date}: weekday=${weekday}, day=${day}, month=${month}, year=${year}`);
    
    url = url.replace('{weekday}', weekday);
    url = url.replace('{day}', day.toString());
    url = url.replace('{month}', month);
    url = url.replace('{year}', year.toString());
    url = url.replace('{optionalSuffix}', ''); // Remove optional suffix for Fanpage
    
    // Enhanced handling for Gazzetta.it - they use multiple URL patterns
    if (source.domain.includes('gazzetta.it')) {
      const prevDate = new Date(dateForTarget);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateFormatted = prevDate.toISOString().split('T')[0].split('-').reverse().join('-'); // DD-MM-YYYY format
      
      // Generate signSlug for gazzetta specifically
      const gazzettaSignSlug = signMap[zodiacSign.name_italian] || zodiacSign.name_italian.toLowerCase();
      
      // Generate both possible URL variations for Gazzetta.it
      const baseSlug = `oroscopo-${weekday}-${day}-${month}-${year}`;
      const slug1 = `${baseSlug}-previsioni-per-12-i-segni`;
      const slug2 = `${baseSlug}-previsioni-per-tutti-i-segni`;
      
      // Also try with alternative date formats that Gazzetta might use
      const currentDateFormatted = dateForTarget.toISOString().split('T')[0].split('-').reverse().join('-'); // DD-MM-YYYY format
      
      const url1 = `${source.base_url}oroscopo/storie/${prevDateFormatted}/${slug1}/${gazzettaSignSlug}.shtml`;
      const url2 = `${source.base_url}oroscopo/storie/${prevDateFormatted}/${slug2}/${gazzettaSignSlug}.shtml`;
      const url3 = `${source.base_url}oroscopo/storie/${currentDateFormatted}/${slug1}/${gazzettaSignSlug}.shtml`;
      const url4 = `${source.base_url}oroscopo/storie/${currentDateFormatted}/${slug2}/${gazzettaSignSlug}.shtml`;
      
      console.log(`Gazzetta.it - Date info: target=${date}, weekday=${weekday}, day=${day}, month=${month}, year=${year}`);
      console.log(`Gazzetta.it - Generated URLs:`, { url1, url2, url3, url4 });
      
      return [url1, url2, url3, url4];
    }
    
    // Fix for Fanpage.it - ensure the URL format is correct
    if (source.domain.includes('fanpage.it')) {
      // Fanpage URL pattern should be: /oroscopo/giorno/martedi-24-settembre-2024/
      // Make sure we construct it properly
      url = url.replace('{optionalSuffix}', '');
      if (!url.endsWith('/')) {
        url += '/';
      }
    }
  } else {
    // Standard date replacement for other sources
    url = url.replace('{date}', dateFormatted);
  }
  
  // For sources that still use zodiac signs in URL (if any)
  
  // Handle special cases for specific sources
  let signSlug = signMap[zodiacSign.name_italian] || zodiacSign.name_italian.toLowerCase();
  
  // Oggi.it uses capitalized zodiac sign names  
  if (source.domain.includes('oggi.it')) {
    signSlug = zodiacSign.name_italian; // Keep original capitalization for Oggi.it
    console.log(`OGGI.IT URL construction for ${zodiacSign.name_italian} (${date}): using signSlug="${signSlug}"`);
  }
  
  url = url.replace('{sign}', signSlug);
  
  // Log final URL for debugging
  console.log(`Final URL constructed for ${source.domain}: ${url}`);
  
  return url;
}

async function scrapeVirgilioHoroscopeText(url: string, zodiacSign: ZodiacSign, _date: string): Promise<ScrapeResult> {
  try {
    console.log('Virgilio.it - Starting enhanced scraping for:', zodiacSign.name_italian);
    console.log('Virgilio.it - URL:', url);
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    };

    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.error(`Virgilio.it - HTTP error for ${url}: ${response.status} ${response.statusText}`);
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const html = await response.text();
    console.log('Virgilio.it - Fetched HTML length:', html.length);

    // Clean HTML but preserve structure we need
    let cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<video[^>]*>[\s\S]*?<\/video>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // New approach: directly extract all <p class="txt-r-s1"> elements
    let extractedParagraphs: string[] = [];
    
    console.log('Virgilio.it - Using new p.txt-r-s1 extraction method');
    
    // Regex to find all <p class="txt-r-s1"> tags and capture their content
    const pTagRegex = new RegExp(`<p[^>]*class="txt-r-s1"[^>]*>([\\s\\S]*?)<\/p>`, 'gi');
    let match;
    
    while ((match = pTagRegex.exec(cleanHtml)) !== null) {
      // Clean up the matched content: remove any nested tags and normalize whitespace
      let paraContent = match[1]
        .replace(/<[^>]*>/g, ' ') // Remove any remaining HTML tags within the paragraph
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
        .replace(/\s+/g, ' ') // Consolidate multiple spaces
        .trim();
      
      // Only add non-trivial paragraphs (e.g., more than 10 characters after cleaning)
      if (paraContent.length > 10) {
        extractedParagraphs.push(paraContent);
        console.log(`Virgilio.it - Extracted paragraph (${paraContent.length} chars):`, paraContent.substring(0, 150));
      }
    }

    // Join all extracted paragraphs with double newlines for clear separation
    let finalExtractedText = extractedParagraphs.join('\n\n'); 

    console.log(`Virgilio.it - Total paragraphs extracted: ${extractedParagraphs.length}`);
    console.log('Virgilio.it - Final Extracted Text (first 1000 chars):', finalExtractedText.substring(0, 1000));
    console.log('Virgilio.it - Length of Final Extracted Text:', finalExtractedText.length);
    console.log('Virgilio.it - Full captured content:', finalExtractedText);

    // Check if sufficient content was extracted
    if (!finalExtractedText || finalExtractedText.length < 50) { // Minimum 50 characters for a meaningful horoscope
      return {
        success: false,
        error: `No sufficient horoscope content found using p.txt-r-s1 for ${zodiacSign.name_italian} on Virgilio.it - extracted ${finalExtractedText.length} chars`
      };
    }

    return {
      success: true,
      text: finalExtractedText.substring(0, 3500), // Limit text length for OpenAI
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

async function scrapeOnlyOroscopoHoroscopeText(url: string, zodiacSign: ZodiacSign, _date: string): Promise<ScrapeResult> {
  try {
    console.log('OnlyOroscopo - Starting specialized scraping for:', zodiacSign.name_italian);
    console.log('OnlyOroscopo - URL:', url);
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    };

    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.error(`OnlyOroscopo - HTTP error for ${url}: ${response.status} ${response.statusText}`);
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const html = await response.text();
    console.log('OnlyOroscopo - Fetched HTML length:', html.length);

    // Clean HTML but preserve structure we need
    let cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Extract main horoscope text from elementor-widget-container using enhanced scoring system
    let bestContent = '';
    let highestScore = 0;
    const zodiacNameLower = zodiacSign.name_italian.toLowerCase();
    
    // Enhanced patterns targeting the specific structure from customer's finding
    const elementorWidgetContainerPattern = /<div[^>]*class="elementor-widget-container"[^>]*>([\s\S]*?)<\/div>/gi;
    const textEditorDropCapPattern = /<div[^>]*elementor-drop-cap-yes[^>]*>[\s\S]*?<div[^>]*class="elementor-widget-container"[^>]*>([\s\S]*?)<\/div>/gi;
    const textEditorPattern = /<div[^>]*elementor-widget-text-editor[^>]*>[\s\S]*?<div[^>]*class="elementor-widget-container"[^>]*>([\s\S]*?)<\/div>/gi;
    
    // Combine all patterns for comprehensive extraction, prioritizing drop-cap text editors
    const elementorMatches = [
      ...cleanHtml.matchAll(textEditorDropCapPattern),
      ...cleanHtml.matchAll(textEditorPattern),
      ...cleanHtml.matchAll(elementorWidgetContainerPattern)
    ];
    
    for (const match of elementorMatches) {
      let content = match[1]
        .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, '') // Remove all headers and their content
        .replace(/<div[^>]*class="[^"]*(?:social|share|nav|menu)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '') // Remove social/nav widgets
        .replace(/<a[^>]*href[^>]*>[\s\S]*?<\/a>/gi, '') // Remove navigation links
        .replace(/<img[^>]*>/gi, '') // Remove images
        .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '') // Remove buttons
        .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '') // Remove forms
        .replace(/<[^>]*>/g, ' ') // Remove all remaining HTML tags
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
        .trim();
      
      // More lenient length filtering for OnlyOroscopo
      if (content.length < 30 || content.length > 3000) {
        continue;
      }

      // Calculate relevance score with enhanced OnlyOroscopo-specific logic
      let currentScore = 0;

      // Bonus 1: Enhanced horoscope keywords detection
      const coreHoroscopeKeywords = ['oroscopo', 'previsioni', 'stelle', 'fortuna', 'amore', 'lavoro', 'salute', 'giornata', 'oggi', 'energia', 'pianeti', 'luna', 'sole', 'periodo', 'momento', 'transiti', 'influenze', 'aspetti', 'celesti', 'zodiacali', 'astrali', 'cosmici', 'planetari', 'astrologici', 'destino', 'futuro'];
      const horoscopeKeywordMatches = (content.match(new RegExp(`\\b(${coreHoroscopeKeywords.join('|')})\\b`, 'gi')) || []).length;
      if (horoscopeKeywordMatches > 0) {
        currentScore += 40 + (horoscopeKeywordMatches * 8); // Enhanced scoring
      }

      // Bonus 2: Enhanced daily/temporal indicators
      const dailyIndicators = ['oggi', 'giornata', 'momento', 'periodo', 'questa mattina', 'stamattina', 'stasera', 'in serata', 'questo pomeriggio'];
      const dailyMatches = (content.match(new RegExp(`\\b(${dailyIndicators.join('|')})\\b`, 'gi')) || []).length;
      if (dailyMatches > 0) {
        currentScore += 30; // Increased bonus for daily context
      }

      // Bonus 3: Zodiac sign mention (highest priority)
      if (content.toLowerCase().includes(zodiacNameLower)) {
        currentScore += 80; // Very high bonus for zodiac name
      }

      // Bonus 4: Predictive/advice language patterns
      const predictiveLanguage = ['sarà', 'sarai', 'potrai', 'dovresti', 'dovrai', 'aspettati', 'aspetta', 'previsto', 'prevede', 'indica', 'suggerisce', 'consiglia', 'favorisce', 'porta', 'porterà', 'meglio', 'evita', 'attenzione', 'prudenza', 'concentrati', 'punta', 'sfrutta', 'approfitta'];
      const predictiveMatches = (content.match(new RegExp(`\\b(${predictiveLanguage.join('|')})\\b`, 'gi')) || []).length;
      if (predictiveMatches > 0) {
        currentScore += 25 + (predictiveMatches * 5);
      }

      // Bonus 5: Category-specific keywords (Amore, Lavoro, Salute themes)
      const categoryKeywords = ['relazioni', 'sentimenti', 'cuore', 'partner', 'coppia', 'famiglia', 'amicizia', 'carriera', 'professione', 'business', 'denaro', 'finanze', 'benessere', 'forma', 'equilibrio', 'vitalità'];
      const categoryMatches = (content.match(new RegExp(`\\b(${categoryKeywords.join('|')})\\b`, 'gi')) || []).length;
      if (categoryMatches > 0) {
        currentScore += categoryMatches * 8;
      }
      
      // Bonus 6: Content quality indicators
      const sentenceCount = (content.match(/[.!?]+/g) || []).length;
      if (sentenceCount >= 2) {
        currentScore += 15; // Bonus for multiple sentences
      }
      if (sentenceCount >= 4) {
        currentScore += 15; // Additional bonus for longer content
      }
      
      // Length bonus (optimized for OnlyOroscopo)
      if (content.length > 100) currentScore += 10;
      if (content.length > 200) currentScore += 15;
      if (content.length > 400) currentScore += 20;
      
      // Bonus for proper paragraph structure
      if (/^[A-Z]/.test(content)) {
        currentScore += 10; // Starts with capital letter
      }

      // Penalty 1: Enhanced navigation/boilerplate detection
      const navigationTerms = ['menu', 'naviga', 'accedi', 'iscriviti', 'abbonati', 'cookie', 'privacy', 'pubblicità', 'home', 'sezioni', 'login', 'registrati', 'newsletter', 'social', 'condividi', 'leggi anche', 'altri oroscopi', 'tutti i segni'];
      const navigationMatches = (content.match(new RegExp(`\\b(${navigationTerms.join('|')})\\b`, 'gi')) || []).length;
      if (navigationMatches > 0) {
        const penalty = Math.min(navigationMatches * 15, 60); // Progressive penalty, max 60
        currentScore -= penalty;
      }

      // Penalty 2: Multiple zodiac signs (indicates list/navigation page)
      const allZodiacNamesList = ['ariete', 'toro', 'gemelli', 'cancro', 'leone', 'vergine', 'bilancia', 'scorpione', 'sagittario', 'capricorno', 'acquario', 'pesci'];
      let zodiacCountInContent = 0;
      for (const sign of allZodiacNamesList) {
        if (content.toLowerCase().includes(sign)) {
          zodiacCountInContent++;
        }
      }
      
      // Progressive penalty based on number of zodiac signs
      if (zodiacCountInContent > 3) {
        const zodiacPenalty = (zodiacCountInContent - 1) * 25; // Heavy penalty for lists
        currentScore -= zodiacPenalty;
      } else if (zodiacCountInContent > 1 && !content.toLowerCase().includes(zodiacNameLower)) {
        // Penalty if multiple signs but not our target sign
        currentScore -= 30;
      }

      // Penalty 3: Very short content unless it's high quality
      if (content.length < 80 && currentScore < 50) {
        currentScore -= 20;
      }

      // Update best content if this one scores higher
      if (currentScore > highestScore) {
        highestScore = currentScore;
        bestContent = content;
      }
    }

    // Final selection and validation
    if (!bestContent || highestScore < 25) {
      return {
        success: false,
        error: `No substantial horoscope content found - best score: ${highestScore}, threshold: 25`
      };
    }

    let extractedMainText = bestContent;

    // Extract category ratings (Amore->Relazioni, Soldi->Lavoro, Fortuna->Benessere)
    let relazioniRating: number | undefined;
    let lavoroRating: number | undefined;
    let saluteRating: number | undefined;

    // Look for Amore rating patterns
    const amorePatterns = [
      /Amore[:\s]*(\d+)[\s]*stelle?/i,
      /Amore[:\s]*(\d+)[\s]*\/[\s]*5/i,
      /Amore[^<>]*?(\d+)[^<>]*?stelle?/i,
      /<[^>]*>Amore<[^>]*>[\s\S]*?(\d+)[\s]*stelle?/i,
      /Amore[\s\S]*?(\d+)[\s]*stelle?/i
    ];
    
    for (const pattern of amorePatterns) {
      const match = cleanHtml.match(pattern);
      if (match && match[1]) {
        relazioniRating = parseInt(match[1]);
        break;
      }
    }

    // Look for Soldi rating patterns  
    const soldiPatterns = [
      /Soldi[:\s]*(\d+)[\s]*stelle?/i,
      /Soldi[:\s]*(\d+)[\s]*\/[\s]*5/i,
      /Soldi[^<>]*?(\d+)[^<>]*?stelle?/i,
      /<[^>]*>Soldi<[^>]*>[\s\S]*?(\d+)[\s]*stelle?/i,
      /Soldi[\s\S]*?(\d+)[\s]*stelle?/i
    ];
    
    for (const pattern of soldiPatterns) {
      const match = cleanHtml.match(pattern);
      if (match && match[1]) {
        lavoroRating = parseInt(match[1]);
        break;
      }
    }

    // Look for Fortuna rating patterns
    const fortunaPatterns = [
      /Fortuna[:\s]*(\d+)[\s]*stelle?/i,
      /Fortuna[:\s]*(\d+)[\s]*\/[\s]*5/i,
      /Fortuna[^<>]*?(\d+)[^<>]*?stelle?/i,
      /<[^>]*>Fortuna<[^>]*>[\s\S]*?(\d+)[\s]*stelle?/i,
      /Fortuna[\s\S]*?(\d+)[\s]*stelle?/i
    ];
    
    for (const pattern of fortunaPatterns) {
      const match = cleanHtml.match(pattern);
      if (match && match[1]) {
        saluteRating = parseInt(match[1]);
        break;
      }
    }

    if (!extractedMainText || extractedMainText.length < 30) {
      return {
        success: false,
        error: 'No substantial horoscope content found in elementor-widget-container'
      };
    }

    return {
      success: true,
      text: extractedMainText.substring(0, 3500),
      url,
      actualUrl: url,
      relazioni_rating: relazioniRating,
      lavoro_rating: lavoroRating,
      salute_rating: saluteRating
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown OnlyOroscopo scraping error'
    };
  }
}

async function scrapeRepubblicaHoroscopeText(url: string, zodiacSign: ZodiacSign, date: string): Promise<ScrapeResult> {
  try {
    // Special handling for Repubblica.it - first find the actual article URL
    if (url.includes('repubblica.it/oroscopo/') && !url.includes('/news/')) {
      const articleUrl = await findRepubblicaArticleUrl(url, date);
      
      if (!articleUrl) {
        return {
          success: false,
          error: 'Could not find today\'s horoscope article on Repubblica.it index page'
        };
      }
      
      url = articleUrl; // Update URL to the actual article
    }
    
    // Now proceed with normal scraping using the found article URL
    const result = await scrapeHoroscopeText(url, zodiacSign, date);
    
    // Ensure we return the actual URL that was discovered and used
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
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    };

    const response = await fetch(indexUrl, { headers });
    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    
    // Parse the target date to create different formats for matching
    const dateObj = new Date(targetDate);
    const day = dateObj.getDate();
    const month = dateObj.getMonth() + 1;
    const year = dateObj.getFullYear();
    
    // Create comprehensive date patterns for Repubblica.it
    const datePatterns = [
      // Standard formats
      `${year}/${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}`, // 2025/09/23
      `${year}/${month}/${day}`, // 2025/9/23
    ];
    
    // Use Set to avoid duplicates and only search for exact URL patterns we expect
    const potentialUrls = new Set<string>();
    
    // Look specifically for Repubblica oroscopo URLs with date patterns
    for (const pattern of datePatterns) {
      const urlPattern = new RegExp(`<a[^>]*href=["']([^"']*oroscopo[^"']*${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"']*)["'][^>]*>`, 'gi');
      let match;
      while ((match = urlPattern.exec(html)) !== null) {
        let foundUrl = match[1];
        
        // Normalize URL
        if (foundUrl.startsWith('/')) {
          foundUrl = 'https://www.repubblica.it' + foundUrl;
        }
        
        // Validate URL format and ensure it's today's article
        if (foundUrl.startsWith('https://') && foundUrl.includes('oroscopo') && foundUrl.includes(pattern)) {
          potentialUrls.add(foundUrl);
        }
      }
    }
    
    // Return the first URL that matches today's date
    if (potentialUrls.size > 0) {
      const selectedUrl = Array.from(potentialUrls)[0];
      return selectedUrl;
    }
    
    return null;
    
  } catch (error) {
    return null;
  }
}

// Enhanced comprehensive keyword lists for better content validation
const COMPREHENSIVE_HOROSCOPE_KEYWORDS = [
  // Core horoscope terms
  'oroscopo', 'previsioni', 'stelle', 'fortuna', 'destino', 'zodiaco', 'segno', 'astrale', 'cosmico', 'celeste',
  // Life categories
  'amore', 'lavoro', 'salute', 'benessere', 'relazioni', 'carriera', 'famiglia', 'amicizia', 'denaro', 'finanze',
  // Temporal indicators
  'giornata', 'periodo', 'momento', 'oggi', 'domani', 'settimana', 'mese', 'anno', 'futuro', 'presente',
  // Energy and emotions
  'energia', 'vitalità', 'forza', 'potenza', 'magnetismo', 'carisma', 'fascino', 'charme', 'appeal',
  'emozioni', 'sentimenti', 'passione', 'ardore', 'fuoco', 'calore', 'intensità', 'profondità',
  'gioia', 'felicità', 'serenità', 'pace', 'tranquillità', 'equilibrio', 'armonia', 'sintonia',
  'ansia', 'stress', 'tensione', 'nervosismo', 'agitazione', 'inquietudine', 'preoccupazione',
  // Astrological elements
  'luna', 'sole', 'pianeti', 'mercurio', 'venere', 'marte', 'giove', 'saturno', 'urano', 'nettuno', 'plutone',
  'ascendente', 'discendente', 'casa', 'transiti', 'congiunzione', 'opposizione', 'quadratura', 'trigono', 'sestile',
  'influenze', 'aspetti', 'configurazione', 'posizione', 'movimento', 'retrogrado', 'diretto'
];

const COMPREHENSIVE_PREDICTIVE_LANGUAGE = [
  // Future tense
  'sarà', 'sarai', 'sarete', 'diventerà', 'diventerai', 'diventerete', 'diverrà', 'diverrái', 'diverrete',
  // Ability and possibility
  'potrai', 'potrete', 'riuscirai', 'riuscirete', 'saprai', 'saprete', 'potrebbe', 'potrebbero',
  // Advice and recommendations
  'dovresti', 'dovreste', 'dovrai', 'dovrete', 'conviene', 'converrebbe', 'meglio', 'preferibile',
  // Expectations
  'aspettati', 'aspettatevi', 'attendi', 'attendete', 'prevedi', 'prevedete', 'prepara', 'preparate',
  // Predictions and forecasts
  'previsto', 'prevedono', 'prevede', 'annuncia', 'annunciano', 'promette', 'promettono',
  // Indications and suggestions
  'indica', 'indicano', 'suggerisce', 'suggeriscono', 'segnala', 'segnalano', 'evidenzia', 'evidenziano',
  // Advice verbs
  'consiglia', 'consigliano', 'raccomanda', 'raccomandano', 'invita', 'invitano', 'esorta', 'esortano',
  // Influence and effects
  'favorisce', 'favoriscono', 'facilita', 'facilitano', 'aiuta', 'aiutano', 'sostiene', 'sostengono',
  'porta', 'portano', 'apporte', 'arriva', 'arrivano', 'giunge', 'giungono', 'conduce', 'conducono'
];

const ENHANCED_NAVIGATION_TERMS = [
  // Standard navigation
  'menu', 'naviga', 'navigazione', 'navbar', 'header', 'footer', 'sidebar', 'aside',
  // Authentication and accounts
  'accedi', 'login', 'entra', 'registrati', 'iscriviti', 'abbonati', 'profilo', 'account',
  // Legal and policies
  'cookie', 'privacy', 'consenso', 'termini', 'condizioni', 'policy', 'gdpr', 'tracciamento',
  // Content management
  'pubblicità', 'ads', 'banner', 'sponsorizzato', 'partner', 'collaborazioni',
  'leggi anche', 'articoli correlati', 'potrebbe interessarti', 'altri contenuti',
  // Interactive elements
  'clicca qui', 'click', 'tap', 'tocca', 'premi', 'seleziona', 'scegli', 'vai a',
  // Site structure
  'home', 'homepage', 'sezioni', 'categorie', 'archivio', 'tag', 'etichette',
  'video', 'foto', 'gallery', 'multimedia', 'podcast', 'audio',
  'cerca', 'ricerca', 'search', 'trova', 'filtra', 'ordina', 'classifica',
  // Social and sharing
  'condividi', 'share', 'facebook', 'twitter', 'instagram', 'whatsapp', 'telegram',
  'social', 'network', 'follow', 'segui', 'like', 'commenta', 'rating', 'vota',
  // Newsletter and updates
  'newsletter', 'iscrizione', 'notifiche', 'aggiornamenti', 'news', 'novità',
  // Other signs navigation
  'altri oroscopi', 'tutti i segni', 'scegli il tuo segno', 'altri segni zodiacali',
  'ariete toro gemelli', 'cancro leone vergine', 'bilancia scorpione sagittario', 'capricorno acquario pesci',
  // Time navigation
  'oggi domani settimana', 'ieri oggi domani', 'mensile annuale', 'precedente successivo', 'prev next',
  // Generic content indicators
  'leggi tutto', 'continua', 'approfondisci', 'dettagli', 'scopri di più', 'ulteriori informazioni'
];

// Enhanced content quality scoring system
function scoreHoroscopeContent(content: string, zodiacName: string, domain: string): number {
  // Use domain for logging
  console.log(`Scoring content for domain: ${domain}`);
  let score = 0;
  const contentLower = content.toLowerCase();
  
  // Core horoscope keywords with enhanced scoring
  const horoscopeMatches = (content.match(new RegExp(`\\b(${COMPREHENSIVE_HOROSCOPE_KEYWORDS.join('|')})\\b`, 'gi')) || []).length;
  score += horoscopeMatches * 8;
  
  // Predictive language with enhanced scoring
  const predictiveMatches = (content.match(new RegExp(`\\b(${COMPREHENSIVE_PREDICTIVE_LANGUAGE.join('|')})\\b`, 'gi')) || []).length;
  score += predictiveMatches * 6;
  
  // Zodiac sign mention
  if (contentLower.includes(zodiacName)) {
    score += 25;
  }
  
  // Content length scoring
  if (content.length > 50) score += 5;
  if (content.length > 100) score += 10;
  if (content.length > 200) score += 15;
  if (content.length > 400) score += 20;
  if (content.length > 800) score += 10;
  
  // Quality indicators
  const hasNumbers = /\d/.test(content);
  if (hasNumbers) score += 8;
  
  const hasColons = /[:]/.test(content);
  if (hasColons) score += 5;
  
  // Heavy penalties for unwanted content
  const navigationMatches = (content.match(new RegExp(`\\b(${ENHANCED_NAVIGATION_TERMS.join('|')})\\b`, 'gi')) || []).length;
  const totalWords = content.split(/\s+/).length;
  const navigationRatio = navigationMatches / Math.max(totalWords, 1);
  
  // Progressive penalties based on navigation ratio
  if (navigationRatio > 0.5) score -= 100;
  else if (navigationRatio > 0.3) score -= 60;
  else if (navigationRatio > 0.15) score -= 30;
  else if (navigationRatio > 0.05) score -= 10;
  
  // Penalty for zodiac lists
  const zodiacListPattern = /\b(ariete|toro|gemelli|cancro|leone|vergine|bilancia|scorpione|sagittario|capricorno|acquario|pesci)\b.*?\b(ariete|toro|gemelli|cancro|leone|vergine|bilancia|scorpione|sagittario|capricorno|acquario|pesci)\b.*?\b(ariete|toro|gemelli|cancro|leone|vergine|bilancia|scorpione|sagittario|capricorno|acquario|pesci)\b/i;
  if (zodiacListPattern.test(content)) {
    score -= 50;
  }
  
  // Penalty for very short content unless it's high quality
  if (content.length < 30 && score < 50) {
    score -= 30;
  }
  
  return Math.max(score, 0);
}

// Enhanced zodiac section extraction
function extractZodiacSection(content: string, zodiacName: string): string {
  const allZodiacNames = ['ariete', 'toro', 'gemelli', 'cancro', 'leone', 'vergine', 'bilancia', 'scorpione', 'sagittario', 'capricorno', 'acquario', 'pesci'];
  const otherZodiacNames = allZodiacNames.filter(name => name.toLowerCase() !== zodiacName.toLowerCase());
  const otherZodiacNamesPattern = otherZodiacNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const primaryZodiacNamePattern = zodiacName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Enhanced patterns specifically for Repubblica.it paragraph titles
  const startPattern = new RegExp(
    `(?:` +
    `<h[1-6][^>]*>\\s*${primaryZodiacNamePattern}(?:[^<]*<\\/h[1-6]>|[^<]*)|` +
    `\\b${primaryZodiacNamePattern}\\s*\\([^)]*\\)\\s*[:.\\-–—]?\\s*|` +
    `\\b${primaryZodiacNamePattern}(?:\\s+[:.\\-–—]?\\s*\\d{1,2}\\s+\\w+\\s*[\\-–—]\\s*\\d{1,2}\\s+\\w+)?[:.\\-–—]?\\s*|` +
    `\\b${primaryZodiacNamePattern}\\s*[:.\\-–—]\\s*|` +
    `(?:^|\\s)${primaryZodiacNamePattern.toUpperCase()}(?=\\s|[:.\\-–—])|` +
    `<(?:strong|b)[^>]*>\\s*${primaryZodiacNamePattern}[^<]*<\\/(?:strong|b)>|` +
    `<p[^>]*>\\s*${primaryZodiacNamePattern}[^<]*|` +
    `<br[^>]*>\\s*${primaryZodiacNamePattern}\\s*[:.\\-–—]?)`,
    'gi'
  );

  // Enhanced end pattern to match next zodiac section
  const endPattern = new RegExp(
    `(?:` +
    `<h[1-6][^>]*>\\s*(?:${otherZodiacNamesPattern})(?:[^<]*<\\/h[1-6]>|[^<]*)|` +
    `\\b(?:${otherZodiacNamesPattern})\\s*\\([^)]*\\)\\s*[:.\\-–—]?\\s*|` +
    `\\b(?:${otherZodiacNamesPattern})(?:\\s+[:.\\-–—]?\\s*\\d{1,2}\\s+\\w+\\s*[\\-–—]\\s*\\d{1,2}\\s+\\w+)?[:.\\-–—]?\\s*|` +
    `\\b(?:${otherZodiacNamesPattern})\\s*[:.\\-–—]\\s*|` +
    `(?:^|\\s)(?:${otherZodiacNamesPattern.toUpperCase()})(?=\\s|[:.\\-–—])|` +
    `<(?:strong|b)[^>]*>\\s*(?:${otherZodiacNamesPattern})[^<]*<\\/(?:strong|b)>|` +
    `<p[^>]*>\\s*(?:${otherZodiacNamesPattern})[^<]*|` +
    `<br[^>]*>\\s*(?:${otherZodiacNamesPattern})\\s*[:.\\-–—]?)`,
    'gi'
  );

  let bestMatch = '';
  let bestScore = 0;

  // Try multiple pattern matching approaches
  const startMatches = content.matchAll(startPattern);
  
  for (const startMatch of startMatches) {
    const startIndex = startMatch.index! + startMatch[0].length;
    let endIndex = content.length;

    // Find the end of this section by looking for the next zodiac sign
    const remainingContent = content.substring(startIndex);
    const endMatches = remainingContent.matchAll(endPattern);
    
    for (const endMatch of endMatches) {
      endIndex = startIndex + endMatch.index!;
      break; // Take the first match
    }

    let candidateSection = content.substring(startIndex, endIndex).trim();
    
    // Clean the extracted section but preserve zodiac name
    candidateSection = candidateSection
      .replace(/^[\s\-–—:.;,<>/]+|[\s\-–—:.;,<>/]+$/g, '') // Clean leading/trailing punctuation
      .trim();

    // Score this candidate section
    if (candidateSection.length > 15) {
      const score = scoreHoroscopeContent(candidateSection, zodiacName.toLowerCase(), '');
      
      if (score > bestScore && score > 15) {
        bestScore = score;
        bestMatch = candidateSection;
      }
    }
  }

  // If we found a good match, use it
  if (bestMatch && bestScore > 15) {
    return bestMatch;
  }

  return '';
}

export async function scrapeHoroscopeText(url: string, zodiacSign: ZodiacSign, date: string): Promise<ScrapeResult> {
  try {
    console.log(`Starting scrape for ${zodiacSign.name_italian} at URL: ${url}`);
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    };

    // Special handling for Virgilio.it
    if (url.includes('virgilio.it')) {
      return await scrapeVirgilioHoroscopeText(url, zodiacSign, date);
    }

    // Special handling for OnlyOroscopo
    if (url.includes('onlyoroscopo.it')) {
      return await scrapeOnlyOroscopoHoroscopeText(url, zodiacSign, date);
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const html = await response.text();
    
    // Enhanced HTML cleaning to remove more non-content elements
    let cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
      .replace(/<div[^>]*class="[^"]*c-banner-call-to-action[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '') // Remove intrusive call-to-action banner
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const zodiacName = zodiacSign.name_italian.toLowerCase();
    
    // Source-specific extraction strategies
    const domain = url.match(/\/\/(?:www\.)?([^\/]+)/)?.[1] || '';
    let extractedText = '';

    // Try domain-specific patterns first
    if (domain.includes('oggi.it')) {
      console.log("Oggi.it - Starting specialized extraction for:", zodiacName);
      
      // Use a more generic h4 regex that looks for any h4 tag that might contain horoscope content
      // This could be "Oroscopo di [weekday] [date]" or similar variations
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
        
        // Find the first <p> tag within this restricted content
        const pTagRegex = /<p[^>]*>([\s\S]*?)<\/p>/i; 
        let matchP = contentToSearch.match(pTagRegex);
        
        if (matchP && matchP[1]) {
          // The content of the paragraph
          let extractedParagraphContent = matchP[1];
          
          // Clean the content: convert <br> tags to newlines, remove any other HTML tags, and normalize whitespace
          extractedParagraphContent = extractedParagraphContent
            .replace(/<br\s*\/?>/gi, '\n') // Convert <br> or <br/> to single newline
            .replace(/<[^>]*>/g, ' ')     // Remove any other HTML tags (e.g., strong, em)
            // Decode common HTML entities
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
            .replace(/\s+/g, ' ') // Consolidate multiple spaces
            .trim();
          
          // Validate that the extracted content contains the zodiac sign we're looking for
          const hasZodiacSign = extractedParagraphContent.toLowerCase().includes(zodiacName);
          const hasHoroscopeContent = /\b(oroscopo|previsioni|stelle|fortuna|amore|lavoro|salute|giornata|energia|periodo)\b/i.test(extractedParagraphContent);
          
          if (hasZodiacSign || (hasHoroscopeContent && extractedParagraphContent.length > 50)) {
            extractedText = extractedParagraphContent;
            console.log(`Oggi.it - Successfully extracted and validated content from paragraph.`);
            console.log(`Oggi.it - Extracted text (first 200 chars): ${extractedText.substring(0, 200)}`);
            
            // If successful, return the result directly
            return {
              success: true,
              text: extractedText.substring(0, 3500), // Limit text length for OpenAI
              url,
              actualUrl: url
            };
          } else {
            console.log(`Oggi.it - Content validation failed. Zodiac sign found: ${hasZodiacSign}, Horoscope content: ${hasHoroscopeContent}`);
          }
        } else {
          console.log(`Oggi.it - Could not find paragraph within the specified range for this h4.`);
        }
      }
      
      // If no valid content was found with any h4, return an error
      return {
        success: false,
        error: `Specific Oggi.it scraping failed for ${zodiacSign.name_italian} on ${date}. No valid horoscope content found between h4 tags and <!-- GIORNALIERO --> comment.`
      };
    } else if (domain.includes('gazzetta.it')) {
      console.log("Gazzetta.it - Starting specialized extraction for:", zodiacName);
      
      // Enhanced Gazzetta.it extraction with multiple strategies
      let bestContent = '';
      let highestScore = 0;
      
      // Strategy 1: Look for the main article content
      const articlePatterns = [
        // Main article content
        /<article[^>]*>([\s\S]*?)<\/article>/gi,
        /<div[^>]*class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<div[^>]*class="[^"]*story-content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<div[^>]*class="[^"]*content-body[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        // Gazzetta specific containers
        /<div[^>]*class="[^"]*story-text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<div[^>]*id="story-text"[^>]*>([\s\S]*?)<\/div>/gi,
        // Generic content containers
        /<main[^>]*>([\s\S]*?)<\/main>/gi,
        /<section[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/section>/gi
      ];
      
      for (const pattern of articlePatterns) {
        const matches = cleanHtml.match(pattern);
        if (matches) {
          for (const match of matches) {
            // Look for Gazzetta-style sections within the content
            let processedContent = match;
            
            // Check for Gazzetta's specific section headers
            const hasGazzettaSections = /LA TUA GIORNATA|AMORE|AMICIZIA|LAVORO|VALUTAZIONE/i.test(match);
            if (hasGazzettaSections) {
              console.log("Gazzetta.it - Found structured sections in content");
              
              // Convert Gazzetta section headers to markers
              processedContent = processedContent
                .replace(/(?:<[^>]*>)*\s*LA TUA GIORNATA\s*(?:<[^>]*>)*/gi, '\n\nLA TUA GIORNATA:\n')
                .replace(/(?:<[^>]*>)*\s*AMORE\s*(?:<[^>]*>)*/gi, '\n\nAMORE:\n')
                .replace(/(?:<[^>]*>)*\s*AMICIZIA\s*(?:<[^>]*>)*/gi, '\n\nAMICIZIA:\n')
                .replace(/(?:<[^>]*>)*\s*LAVORO\s*(?:<[^>]*>)*/gi, '\n\nLAVORO:\n')
                .replace(/(?:<[^>]*>)*\s*VALUTAZIONE(?:\s+GENERALE)?\s*(?:<[^>]*>)*/gi, '\n\nVALUTAZIONE:\n');
            }
            
            // Clean HTML and extract text
            let cleanContent = processedContent
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
              .replace(/[ \t]+/g, ' ')
              .replace(/\n[ \t]+/g, '\n')
              .replace(/\n{3,}/g, '\n\n')
              .trim();
            
            // Score this content
            if (cleanContent.length > 50) {
              const currentScore = scoreHoroscopeContent(cleanContent, zodiacName, domain);
              console.log(`Gazzetta.it - Content candidate scored ${currentScore} (length: ${cleanContent.length})`);
              
              if (currentScore > highestScore) {
                highestScore = currentScore;
                bestContent = cleanContent;
              }
            }
          }
        }
      }
      
      // Strategy 2: If no good content found, try paragraph extraction
      if (!bestContent || highestScore < 30) {
        console.log("Gazzetta.it - Trying paragraph extraction fallback");
        
        const paragraphPattern = /<p[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/p>/gi;
        const paragraphs = [];
        let match;
        
        while ((match = paragraphPattern.exec(cleanHtml)) !== null) {
          const pContent = match[1]
            .replace(/<[^>]*>/g, ' ')
            .replace(/&[^;]+;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (pContent.length > 20 && scoreHoroscopeContent(pContent, zodiacName, domain) > 15) {
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
      
      extractedText = bestContent;
      console.log(`Gazzetta.it - Final extraction score: ${highestScore}, length: ${extractedText.length}`);
      
    } else if (domain.includes('skytg24.it') || domain.includes('tg24.sky.it')) {
      console.log("Sky TG24 - Starting specialized extraction for:", zodiacName);

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
              // Extract content after H2. Replace H2 with empty string before processing.
              sectionText = sectionHtml.replace(/<h2[^>]*>\s*Amore\s*<\/h2>/i, '');
          } else if (/<h2[^>]*>\s*Lavoro\s*<\/h2>/i.test(sectionHtml)) {
              sectionMarker = '\n\n---LAVORO_SECTION_START---\n';
              // Extract content after H2. Replace H2 with empty string before processing.
              sectionText = sectionHtml.replace(/<h2[^>]*>\s*Lavoro\s*<\/h2>/i, '');
          } else if (/<h2[^>]*>\s*Salute\s*<\/h2>/i.test(sectionHtml)) {
              // Although less common for SkyTG24, include for completeness based on prompt rules
              sectionMarker = '\n\n---SALUTE_SECTION_START---\n';
              sectionText = sectionHtml.replace(/<h2[^>]*>\s*Salute\s*<\/h2>/i, '');
          } else {
              // This is the general section (Benessere/overall daily horoscope)
              // Assign a general marker. The AI prompt in openai.ts will use this for Benessere if no specific SALUTE marker is found.
              sectionMarker = '\n\n---GENERAL_SECTION_START---\n';
              sectionText = sectionHtml; // Keep all content
          }

          // Clean the section HTML to plain text
          let cleanedSectionText = sectionText
              .replace(/<br[^>]*>/gi, '\n') // Convert line breaks
              .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n') // Convert paragraph breaks
              .replace(/<p[^>]*>/gi, '\n')
              .replace(/<\/p>/gi, '\n')
              .replace(/<[^>]*>/g, ' ') // Remove all other HTML tags
              // Decode common HTML entities
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
              // Clean up whitespace while preserving structure
              .replace(/[ \t]+/g, ' ')
              .replace(/\n[ \t]+/g, '\n')
              .replace(/\n{3,}/g, '\n\n')
              .trim();
          
          if (cleanedSectionText.length > 0) {
              combinedSectionTexts.push(sectionMarker + cleanedSectionText);
          }
      }

      extractedText = combinedSectionTexts.join('\n').trim();

      console.log("Sky TG24 Debug: Final extractedText (first 1500 chars):", extractedText.substring(0, 1500));
      console.log("Sky TG24 Debug: Final extractedText length:", extractedText.length);

      // Validate the structured content
      if (!extractedText || extractedText.length < 15) {
        extractedText = ''; // Will trigger fallback below
      }
    }

    // If domain-specific extraction didn't work, try generic patterns
    if (!extractedText) {
      // Look for content with zodiac sign mentioned
      const zodiacPatterns = [
        new RegExp(`<h[1-6][^>]*>[^<]*${zodiacName}[^<]*<\/h[1-6]>[\\s\\S]*?(?=<h[1-6]|$)`, 'gi'),
        new RegExp(`<(?:div|section)[^>]*(?:class|id)[^>]*${zodiacName}[^>]*>([\\s\\S]*?)<\/(?:div|section)>`, 'gi'),
        new RegExp(`(?:<p[^>]*>[^<]*${zodiacName}[^<]*<\/p>[\\s\\S]*?){1,5}`, 'gi'),
      ];

      for (const pattern of zodiacPatterns) {
        const matches = cleanHtml.match(pattern);
        if (matches && matches.length > 0) {
          extractedText = matches.join(' ');
          break;
        }
      }
    }

    // Convert to plain text and clean up
    if (extractedText) {
      extractedText = extractedText
        .replace(/<[^>]*>/g, ' ')
        .replace(/&[^;]+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Try zodiac section extraction
      const zodiacSection = extractZodiacSection(extractedText, zodiacName);
      if (zodiacSection && scoreHoroscopeContent(zodiacSection, zodiacName, domain) > 30) {
        extractedText = zodiacSection;
      }
    }

    // Final validation
    if (!extractedText || extractedText.length < 20) {
      return {
        success: false,
        error: `No substantial horoscope content found for ${zodiacSign.name_italian} on ${domain}`
      };
    }
    
    // Additional quality check with scoring
    const finalScore = scoreHoroscopeContent(extractedText, zodiacName, domain);
    
    if (finalScore < 15 && extractedText.length < 100) {
      return {
        success: false,
        error: `Extracted content quality too low (score: ${finalScore}) for ${zodiacSign.name_italian} on ${domain}`
      };
    }

    return {
      success: true,
      text: extractedText.substring(0, 3500), // Limit text length
      url,
      actualUrl: url // For regular scraping, actualUrl is the same as url
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown scraping error'
    };
  }
}

export async function scrapeAndProcessHoroscope(
  db: D1Database,
  source: Source,
  zodiacSign: ZodiacSign,
  date: string,
  openaiApiKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const urlResult = buildHoroscopeUrl(source, zodiacSign, date);
    const urls = Array.isArray(urlResult) ? urlResult : [urlResult];
    
    // Try multiple URLs if available (e.g., for Gazzetta.it with multiple patterns)
    let scrapeResult: ScrapeResult | null = null;
    let usedUrl = '';
    
    for (const url of urls) {
      console.log(`Attempting to scrape URL: ${url}`);
      
      let currentResult: ScrapeResult;
      if (source.domain.includes('repubblica.it')) {
        currentResult = await scrapeRepubblicaHoroscopeText(url, zodiacSign, date);
      } else {
        currentResult = await scrapeHoroscopeText(url, zodiacSign, date);
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
    
    // If all URLs failed, use the last attempt's error
    if (!scrapeResult) {
      scrapeResult = { success: false, error: `Failed to scrape from all ${urls.length} URL(s)` };
    }
    
    if (!scrapeResult.success || !scrapeResult.text) {
      console.error(`Failed to scrape ${source.name} for ${zodiacSign.name_italian}:`, scrapeResult.error);
      return { success: false, error: scrapeResult.error };
    }

    // Log the scraped text for debugging
    console.log(`Scraped text for ${zodiacSign.name_italian} from ${source.name}:`, scrapeResult.text);

    // Enhanced validation using the new scoring system
    const textLength = scrapeResult.text.length;
    const qualityScore = scoreHoroscopeContent(scrapeResult.text, zodiacSign.name_italian, source.domain);
    
    // Enhanced keyword detection with comprehensive patterns
    const hasHoroscopeKeywords = (scrapeResult.text.match(new RegExp(`\\b(${COMPREHENSIVE_HOROSCOPE_KEYWORDS.join('|')})\\b`, 'gi')) || []).length > 0;
    
    // Enhanced predictive language detection
    const hasPredictiveLanguage = (scrapeResult.text.match(new RegExp(`\\b(${COMPREHENSIVE_PREDICTIVE_LANGUAGE.join('|')})\\b`, 'gi')) || []).length > 0;
    
    // Enhanced content quality indicators
    const hasQualityContent = hasHoroscopeKeywords || hasPredictiveLanguage || qualityScore > 30;
    console.log(`Content quality assessment - hasQualityContent: ${hasQualityContent}`);
    
    // Check for navigation-heavy content using enhanced terms
    const navigationWords = (scrapeResult.text.match(new RegExp(`\\b(${ENHANCED_NAVIGATION_TERMS.join('|')})\\b`, 'gi')) || []).length;
    const totalWords = scrapeResult.text.split(/\s+/).length;
    const navigationRatio = navigationWords / Math.max(totalWords, 1);
    
    // More accurate navigation-only detection
    const isNavigationOnly = qualityScore < 25 && (
      /^(scegli il tuo segno|scopri come sarà|ariete toro gemelli|oggi domani settimana|menu naviga)/i.test(scrapeResult.text.trim()) ||
      navigationRatio > 0.7
    );
    
    // Determine source-specific validation
    const isSkytg24 = source.domain.includes('skytg24.it') || source.domain.includes('tg24.sky.it');
    
    // Enhanced validation using quality score and adaptive thresholds
    if (isSkytg24) {
      // Lenient validation for Sky TG24 due to H2 structured content
      if (textLength < 15 || (qualityScore < 15 && textLength < 40)) {
        return { success: false, error: 'Sky TG24 content insufficient' };
      }
      if (navigationRatio > 0.7 && qualityScore < 30) {
        return { success: false, error: 'Sky TG24 content too navigation-heavy' };
      }
    } else {
      // Standard validation
      if (textLength < 20 || (qualityScore < 25 && textLength < 60)) {
        return { success: false, error: 'Content insufficient' };
      }
      if (qualityScore < 40 && (isNavigationOnly || navigationRatio > 0.4)) {
        return { success: false, error: 'Content navigation issues' };
      }
    }
    
    // Universal minimum quality check
    if (qualityScore < 10 && textLength < 100) {
      return { success: false, error: 'Content quality too low' };
    }

    const openai = createOpenAIClient(openaiApiKey);
    const analysis = await extractHoroscopeData(openai, scrapeResult.text, zodiacSign.name_italian);
    
    // Log category rankings for every source
    console.log(`--- Rankings for ${source.name} (${zodiacSign.name_italian}) on ${date} ---`);
    console.log(`  Relazioni Rating: ${analysis.relazioni_rating} / 5`);
    console.log(`  Lavoro Rating: ${analysis.lavoro_rating} / 5`);
    console.log(`  Benessere Rating: ${analysis.salute_rating} / 5`);
    console.log(`  Tone Analysis: ${analysis.tone_analysis}`);
    console.log(`-----------------------------------------------------`);
    
    // Use extracted ratings from scrapeResult if available, otherwise use AI analysis
    const finalRelazioniRating = scrapeResult.relazioni_rating !== undefined ? scrapeResult.relazioni_rating : analysis.relazioni_rating;
    const finalLavoroRating = scrapeResult.lavoro_rating !== undefined ? scrapeResult.lavoro_rating : analysis.lavoro_rating;
    const finalSaluteRating = scrapeResult.salute_rating !== undefined ? scrapeResult.salute_rating : analysis.salute_rating;
    
    // Use the actual URL that was scraped
    const urlToSave = scrapeResult.actualUrl || usedUrl;
    
    await saveHoroscopeData(db, {
      source_id: source.id,
      zodiac_sign_id: zodiacSign.id,
      date,
      original_text: scrapeResult.text,
      summary: analysis.summary,
      relazioni_rating: finalRelazioniRating,
      lavoro_rating: finalLavoroRating,
      salute_rating: finalSaluteRating,
      tone_analysis: analysis.tone_analysis,
      original_url: urlToSave
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    console.error(`Error processing horoscope for ${source.name} - ${zodiacSign.name_italian}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}
