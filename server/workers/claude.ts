import { OpenAIInput, OpenAIOutput } from '@shared/schema';
import { processHoroscopeWithRetry } from '../services/claude';

export class OpenAIWorker {
  async process(input: OpenAIInput): Promise<OpenAIOutput> {

    try {
      const aiOutput = await processHoroscopeWithRetry(input, 3);
      return aiOutput;
    } catch (error) {
      console.error(`[OpenAIWorker] Failed to process ${input.sourceName} - ${input.signSlugIt}:`, error);
      throw error;
    }
  }
}

export const openaiWorker = new OpenAIWorker();
