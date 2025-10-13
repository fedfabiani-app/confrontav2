import { OpenAIInput, OpenAIOutput } from '@shared/schema';
import { processHoroscopeWithRetry } from '../services/openai';
import { db } from '@shared/database';

export class OpenAIWorker {
  async process(input: OpenAIInput): Promise<OpenAIOutput> {
    console.log(`[OpenAIWorker] Processing ${input.sourceName} - ${input.signSlugIt} for ${input.dateISO}`);

    try {
      const scraperOutput = await db.scraperOutput.findUniqueOrThrow({
        where: {
          source_id_date_unique: {
            source_id: input.sourceId,
            date: new Date(input.dateISO),
          },
        },
      });

      const zodiacSign = await db.zodiacSign.findUniqueOrThrow({
        where: { slug: input.signSlugIt },
      });

      const aiOutput = await processHoroscopeWithRetry(input, 3);

      await db.horoscopeData.upsert({
        where: {
          source_id_zodiac_sign_id_date_unique: {
            source_id: input.sourceId,
            zodiac_sign_id: zodiacSign.id,
            date: new Date(input.dateISO),
          },
        },
        update: {
          original_text: scraperOutput.extracted_text,
          superquote: aiOutput.superquote,
          summary: aiOutput.summary,
          relazioni_rating: aiOutput.ratings.relazioni,
          lavoro_rating: aiOutput.ratings.lavoro,
          salute_rating: aiOutput.ratings.benessere,
          tone_analysis: aiOutput.tone,
          original_url: scraperOutput.original_url,
          scraped_at: scraperOutput.scraped_at,
        },
        create: {
          source_id: input.sourceId,
          zodiac_sign_id: zodiacSign.id,
          date: new Date(input.dateISO),
          original_text: scraperOutput.extracted_text,
          superquote: aiOutput.superquote,
          summary: aiOutput.summary,
          relazioni_rating: aiOutput.ratings.relazioni,
          lavoro_rating: aiOutput.ratings.lavoro,
          salute_rating: aiOutput.ratings.benessere,
          tone_analysis: aiOutput.tone,
          original_url: scraperOutput.original_url,
          scraped_at: scraperOutput.scraped_at,
        },
      });

      console.log(`[OpenAIWorker] Successfully processed ${input.sourceName} - ${input.signSlugIt}`);
      return aiOutput;
    } catch (error) {
      console.error(`[OpenAIWorker] Failed to process ${input.sourceName} - ${input.signSlugIt}:`, error);
      throw error;
    }
  }
}

export const openaiWorker = new OpenAIWorker();