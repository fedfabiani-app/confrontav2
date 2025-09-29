import OpenAI from "openai";
import { OpenAIInput, OpenAIOutput, openaiOutputSchema } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || "default_key"
});

export async function processHoroscopeWithAI(input: OpenAIInput): Promise<OpenAIOutput> {
  try {
    console.log(`[OpenAI] Processing ${input.sourceName} - ${input.signSlugIt} (${input.extracted_text.length} chars)`);
    
    const systemPrompt = `You are an expert at analyzing Italian horoscope content. Your task is to:
1. Create a paraphrased, copyright-safe Italian summary (maximum 300 characters)
2. Extract integer ratings from 1-5 for: Relazioni (relationships), Lavoro (work), Benessere (wellbeing)
3. Determine the overall tone: positive, neutral, or negative

Return ONLY valid JSON in this exact format:
{
  "summary": "string (max 300 chars)",
  "relazioni": number (1-5),
  "lavoro": number (1-5), 
  "benessere": number (1-5),
  "tone": "positive" | "neutral" | "negative"
}`;

    const userPrompt = `Analyze this Italian horoscope text for sign "${input.signSlugIt}" from source "${input.sourceName}":

${input.extracted_text}

Provide the summary and ratings as requested.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    console.log(`[OpenAI] Raw response: ${content}`);
    const parsed = JSON.parse(content);
    
    // Validate and clamp ratings
    const result = {
      summary: parsed.summary || '',
      ratings: {
        relazioni: Math.max(1, Math.min(5, Math.round(parsed.relazioni || 3))),
        lavoro: Math.max(1, Math.min(5, Math.round(parsed.lavoro || 3))),
        benessere: Math.max(1, Math.min(5, Math.round(parsed.benessere || 3))),
      },
      tone: ['positive', 'neutral', 'negative'].includes(parsed.tone) 
        ? parsed.tone as 'positive' | 'neutral' | 'negative'
        : 'neutral'
    };

    // Ensure summary is within 300 characters
    if (result.summary.length > 300) {
      result.summary = result.summary.substring(0, 297) + '...';
    }

    console.log(`[OpenAI] Processed result: Relazioni=${result.ratings.relazioni}, Lavoro=${result.ratings.lavoro}, Benessere=${result.ratings.benessere}, Tone=${result.tone}`);
    
    return openaiOutputSchema.parse(result);
  } catch (error) {
    console.error('OpenAI processing error:', error);
    throw new Error(`Failed to process horoscope with AI: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function processHoroscopeWithRetry(
  input: OpenAIInput, 
  maxRetries: number = 3
): Promise<OpenAIOutput> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await processHoroscopeWithAI(input);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      if (attempt === maxRetries) {
        break;
      }
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`OpenAI attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}
