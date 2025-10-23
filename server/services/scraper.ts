<script[^>]*>[\s\S]*?<\/script>/gi, '')
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