import { OpenAIInput, OpenAIOutput } from '@shared/schema';
import { processHoroscopeWithRetry } from '../services/openai';

export class OpenAIWorker {
  async process(input: OpenAIInput): Promise<OpenAIOutput> {
    console.log(`[OpenAIWorker] Processing ${input.sourceName} - ${input.signSlugIt} for ${input.dateISO}`);
    
    try {
      const result = await processHoroscopeWithRetry(input, 3);
      
      console.log(`[OpenAIWorker] Successfully processed ${input.sourceName} - ${input.signSlugIt}`);
      return result;
    } catch (error) {
      console.error(`[OpenAIWorker] Failed to process ${input.sourceName} - ${input.signSlugIt}:`, error);
      throw error;
    }
  }
}

export const openaiWorker = new OpenAIWorker();
