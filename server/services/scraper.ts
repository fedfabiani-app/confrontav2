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

              const result: ScraperOutput = {
                sourceId: input.sourceId,
                signSlugIt: input.signSlugIt,
                dateISO: input.dateISO,
                original_url: usedUrl,
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

              // Enhanced handling for Gazzetta.it - they use multiple URL patterns
              if (input.domain.includes('gazzetta.it')) {
                const prevDate = new Date(targetDate);
                prevDate.setDate(prevDate.getDate() - 1);
                const prevDateFormatted = prevDate.toISOString().split('T')[0].split('-').reverse().join('-');
                const currentDateFormatted = targetDate.toISOString().split('T')[0].split('-').reverse().join('-');

                const gazzettaSignSlug = signMap[input.signSlugIt] || input.signSlugIt.toLowerCase();
                const baseSlug = `oroscopo-${weekday}-${day}-${monthName}-${year}`;
                const slug1 = `${baseSlug}-previsioni-per-12-i-segni`;
                const slug2 = `${baseSlug}-previsioni-per-tutti-i-segni`;

                const url1 = `${input.baseUrl}/oroscopo/storie/${prevDateFormatted}/${slug1}/${gazzettaSignSlug}.shtml`;
                const url2 = `${input.baseUrl}/oroscopo/storie/${prevDateFormatted}/${slug2}/${gazzettaSignSlug}.shtml`;
                const url3 = `${input.baseUrl}/oroscopo/storie/${currentDateFormatted}/${slug1}/${gazzettaSignSlug}.shtml`;
                const url4 = `${input.baseUrl}/oroscopo/storie/${currentDateFormatted}/${slug2}/${gazzettaSignSlug}.shtml`;

                return [url1, url2, url3, url4];
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
              const response = await axios.get(url, {
                headers: {
                  'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                  'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
                  'Accept-Encoding': 'gzip, deflate, br',
                  'DNT': '1',
                  'Connection': 'keep-alive',
                  'Upgrade-Insecure-Requests': '1',
                  'Cache-Control': 'max-age=0',
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

              // Extract from elementor-widget-container
              let bestContent = '';
              let highestScore = 0;
              const zodiacNameLower = input.signSlugIt.toLowerCase();

              const elementorWidgetContainerPattern = /<div[^>]*class="elementor-widget-container"[^>]*>([\s\S]*?)<\/div>/gi;
              let elementorMatch;

              while ((elementorMatch = elementorWidgetContainerPattern.exec(cleanHtml)) !== null) {
                const match = elementorMatch;
                let content = match[1]
                  .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, '')
                  .replace(/<[^>]*>/g, ' ')
                  .replace(/&nbsp;/g, ' ')
                  .replace(/&amp;/g, '&')
                  .replace(/\s+/g, ' ')
                  .trim();

                if (content.length < 30 || content.length > 3000) continue;

                const currentScore = scoreHoroscopeContent(content, zodiacNameLower, input.domain);

                if (currentScore > highestScore) {
                  highestScore = currentScore;
                  bestContent = content;
                }
              }

              if (!bestContent || highestScore < 25) {
                return {
                  success: false,
                  error: `No substantial horoscope content found - best score: ${highestScore}`
                };
              }

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

              const html = await fetchHtml(url, input.userAgent);

              // Clean HTML but preserve structure for Gazzetta
              let cleanHtml = html
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
                .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
                .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
                .replace(/<!--[\s\S]*?-->/g, '');

              // Look for the main article content that contains all sections
              const articlePatterns = [
                /<article[^>]*>([\s\S]*?)<\/article>/gi,
                /<div[^>]*class="[^"]*story[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
                /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
                /<main[^>]*>([\s\S]*?)<\/main>/gi
              ];

              let bestContent = '';
              let highestScore = 0;

              for (const pattern of articlePatterns) {
                let match;
                while ((match = pattern.exec(cleanHtml)) !== null) {
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
                    .replace(/[ \t]+/g, ' ')
                    .replace(/\n[ \t]+/g, '\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();

                  // Check if this content contains the key sections
                  const hasMainSections = /LA TUA GIORNATA[\s\S]*AMORE[\s\S]*AMICIZIA[\s\S]*LAVORO/i.test(processedContent);
                  const containsZodiacSign = processedContent.toLowerCase().includes(input.signSlugIt.toLowerCase());
                  
                  if (hasMainSections && containsZodiacSign && processedContent.length > 200) {
                    const currentScore = scoreHoroscopeContent(processedContent, input.signSlugIt.toLowerCase(), 'gazzetta.it');
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
                
                while ((match = paragraphPattern.exec(cleanHtml)) !== null) {
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
                  const combinedScore = scoreHoroscopeContent(combinedContent, input.signSlugIt.toLowerCase(), 'gazzetta.it');
                  
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

                const h4GenericRegex = /<h4[^>]*>(?:Oroscopo\s+di\s+)?[^<]*<\/h4>/gi;
                let matchH4;
                let allExtractedParagraphs: string[] = [];

                while ((matchH4 = h4GenericRegex.exec(cleanHtml)) !== null) {
                  if (matchH4.index === undefined) continue;

                  const commentStartIndex = cleanHtml.indexOf('<!-- GIORNALIERO -->', matchH4.index);
                  let contentToSearch = '';

                  if (commentStartIndex !== -1) {
                    contentToSearch = cleanHtml.substring(matchH4.index + matchH4[0].length, commentStartIndex);
                  } else {
                    contentToSearch = cleanHtml.substring(matchH4.index + matchH4[0].length);
                  }

                  // Extract ALL paragraphs from this section, not just the first one
                  const pTagRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
                  let matchP;
                  let sectionParagraphs: string[] = [];

                  while ((matchP = pTagRegex.exec(contentToSearch)) !== null) {
                    if (matchP[1]) {
                      let extractedParagraphContent = matchP[1]
                        .replace(/<br\s*\/?>/gi, '\n')
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
                        .trim();

                      // Check if this paragraph contains relevant horoscope content
                      const hasHoroscopeContent = /\b(oroscopo|previsioni|stelle|fortuna|amore|lavoro|salute|giornata|energia|periodo|eros|denaro|benessere)\b/i.test(extractedParagraphContent);
                      const hasZodiacSign = extractedParagraphContent.toLowerCase().includes(zodiacName);
                      const isSubstantial = extractedParagraphContent.length > 30;

                      if (isSubstantial && (hasZodiacSign || hasHoroscopeContent)) {
                        sectionParagraphs.push(extractedParagraphContent);
                        console.log(`Oggi.it - Found relevant paragraph: ${extractedParagraphContent.substring(0, 100)}...`);
                      }
                    }
                  }

                  // If we found paragraphs in this section, add them to our collection
                  if (sectionParagraphs.length > 0) {
                    allExtractedParagraphs.push(...sectionParagraphs);
                  }
                }

                // Combine all extracted paragraphs
                if (allExtractedParagraphs.length > 0) {
                  const combinedText = allExtractedParagraphs.join('\n\n');
                  console.log(`Oggi.it - Successfully extracted ${allExtractedParagraphs.length} paragraphs for ${input.signSlugIt}`);
                  
                  return {
                    success: true,
                    text: combinedText.substring(0, 3500),
                    url,
                    actualUrl: url
                  };
                }

                return {
                  success: false,
                  error: `Specific Oggi.it scraping failed for ${input.signSlugIt}. No valid horoscope content found.`
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
