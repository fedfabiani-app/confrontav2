import OpenAI from "openai";
import { OpenAIInput, OpenAIOutput, openaiOutputSchema } from "@shared/schema";

// Using gpt-4o-mini for cost-effective and high-quality text analysis
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY
});

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is required');
}

export async function processHoroscopeWithAI(input: OpenAIInput): Promise<OpenAIOutput> {
  try {
    console.log(`[OpenAI] Processing ${input.sourceName} - ${input.signSlugIt} (${input.extracted_text.length} chars)`);
    
    // Validate input text quality - use fallback for problematic content instead of throwing
    let useNeutralFallback = false;
    
    if (input.extracted_text.length < 30) {
      console.log(`[OpenAI] Text too short (${input.extracted_text.length} chars), using neutral fallback`);
      useNeutralFallback = true;
    } else {
      // Check if text seems to be actual horoscope content - more lenient thresholds
      const hasHoroscopeKeywords = /\b(oroscopo|previsioni|stelle|fortuna|amore|lavoro|salute|giornata|periodo|energia|voto|destino|luna|sole|pianeti|segno|zodiaco|oggi|domani|settimana|relazioni|carriera|benessere|marte|venere|saturno|giove|mercurio|plutone|nettuno|urano|ariete|toro|gemelli|cancro|leone|vergine|bilancia|scorpione|sagittario|capricorno|acquario|pesci)\b/i.test(input.extracted_text.toLowerCase());
      const hasNavigationWords = /\b(menu|naviga|accedi|iscriviti|abbonati|cookie|privacy|pubblicità|home|sezioni|login|registrati|newsletter|social)\b/i.test(input.extracted_text.toLowerCase());
      const hasPaywallWords = /\b(per leggere|abbonati|registrati|accesso|premium|paywall|login|iscriviti|wall|visualizzare)\b/i.test(input.extracted_text.toLowerCase());
      
      // Check for astrological content patterns
      const hasAstrologicalContent = /\b(pianeta|congiunzione|quadratura|trigono|sestile|casa|cuspide|transiti?|aspetti?|influssi?|influenze?|configurazioni?|astri|cielo|combinazione|astrologica|energia|vitalità|serenità|nervosismo|ansia|felicità|tristezza|preoccupazioni|ottimismo|passione)\b/i.test(input.extracted_text);
      
      // Use fallback if content seems non-horoscope (more lenient than before)
      if (!hasHoroscopeKeywords && !hasAstrologicalContent && 
          ((hasNavigationWords && input.extracted_text.length < 100) || 
           (hasPaywallWords && input.extracted_text.length < 80))) {
        console.log(`[OpenAI] Text appears to be navigation/paywall content, using neutral fallback`);
        useNeutralFallback = true;
      }
    }

    // If content is problematic, return neutral fallback instead of throwing
    if (useNeutralFallback) {
      return {
        summary: 'Le stelle stanno preparando qualcosa di speciale per te oggi.',
        ratings: {
          relazioni: 0,
          lavoro: 0,
          benessere: 0,
        },
        tone: 'neutral' as const
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: 'system',
          content: `Sei un esperto analista di oroscopi italiani specializzato nell'interpretazione di contenuti da fonti giornalistiche sportive e mainstream. Analizza esclusivamente il testo dell'oroscopo fornito come input, senza usare conoscenza esterna.

OBIETTIVO: Estrarre il massimo significato dal testo per produrre riassunti dettagliati e valutazioni accurate che riflettano il vero sentiment del contenuto.

Regole di inclusione/esclusione:
- Ignora elementi non di contenuto: menu, navigation, cookie/privacy, pubblicità, link correlati, social, newsletter, disclaimer, header/footer, metadati, date/crediti
- Non menzionare mai la fonte/sito nell'output
- Parafrasa sempre, non copiare letteralmente
- Concentrati sul contenuto astrologico sostanziale

ANALISI RICHIESTA:

1. RIASSUNTO (max 300 caratteri):
   - Cattura l'essenza delle previsioni in modo dettagliato e specifico
   - Include elementi concreti menzionati nel testo (es. pianeti, energie, consigli)
   - Evita frasi generiche come "previsioni miste" o "giornata normale"
   - Rifletti accuratamente il tono emotivo del contenuto originale
   - Assicurati che il riassunto sia grammaticalmente corretto, concluda in modo naturale e sia completamente all'interno del limite di caratteri
   - Evita di terminare frasi con virgole o punti sospensivi senza completare il pensiero

2. VALUTAZIONI STELLARI (0-5 stelle) - SISTEMA CALIBRATO:
   
   Per RELAZIONI:
   - 5 stelle: "eccellente", "perfetto", "straordinario", "magico", "passionale", "innamoramento", "grande amore"
   - 4 stelle: "molto buono", "favorevole", "positivo", "bene", "buone possibilità", "romantico", "armonia"
   - 3 stelle: "discreto", "nella norma", "equilibrato", "stabile", "tranquillo", "qualche tensione"
   - 2 stelle: "difficile", "complicato", "attenzione", "prudenza", "conflitti", "incomprensioni"
   - 1 stella: "pessimo", "evitare", "crisi", "rottura", "problemi seri", "tensioni forti"
   - 0 stelle: NON MENZIONATO nel testo
   
   Per LAVORO:
   - 5 stelle: "successo", "trionfo", "opportunità straordinarie", "promozione", "guadagni", "realizzazione"
   - 4 stelle: "molto positivo", "buone opportunità", "progressi", "soddisfazioni", "riconoscimenti"
   - 3 stelle: "normale", "routine", "stabilità", "qualche piccola sfida", "proseguimento"
   - 2 stelle: "difficoltà", "ostacoli", "ritardi", "stress", "conflitti", "prudenza necessaria"
   - 1 stella: "gravi problemi", "crisi", "perdite", "fallimenti", "evitare decisioni importanti"
   - 0 stelle: NON MENZIONATO nel testo
   
   Per BENESSERE (mood generale e umore della giornata):
   - 5 stelle: "umore eccellente", "giornata splendida", "energia positiva straordinaria", "felicità", "entusiasmo", "ottimismo", "serenità perfetta"
   - 4 stelle: "buon umore", "giornata positiva", "energia buona", "soddisfazione", "tranquillità", "fiducia", "benessere generale"
   - 3 stelle: "umore stabile", "giornata normale", "equilibrio emotivo", "calma", "routine", "stato d'animo neutro"
   - 2 stelle: "umore basso", "giornata difficile", "stress", "tensione", "preoccupazioni", "ansia", "malinconia", "nervosismo"
   - 1 stella: "umore pessimo", "giornata nera", "depressione", "angoscia", "disperazione", "crisi emotiva", "malessere profondo"
   - 0 stelle: NON MENZIONATO nel testo

3. TONO GENERALE:
   - positive: linguaggio incoraggiante, opportunità, successi, energia positiva
   - negative: problemi, difficoltà, ostacoli, tensioni, crisi
   - neutral: equilibrio, routine, normalità, consigli di prudenza

IMPORTANTE: Assegna 0 stelle SOLO se un ambito non è menzionato affatto nel testo. Se un ambito è menzionato anche brevemente (es. 'piccole tensioni', 'prudenza necessaria'), assegna almeno 1 stella.

ANALISI SPECIALE PER FONTI SPECIFICHE:

GAZZETTA DELLO SPORT: Cerca le sezioni "LA TUA GIORNATA", "AMORE", "AMICIZIA", "LAVORO", "VALUTAZIONE GENERALE" con possibili voti numerici da convertire (9-10/10 = 5 stelle, 7-8/10 = 4 stelle, 5-6/10 = 3 stelle, 3-4/10 = 2 stelle, 1-2/10 = 1 stella).

VIRGILIO.IT: Cerca le sezioni "AMORE", "SALUTE", "LAVORO", "EROS". Ogni sezione presente garantisce minimo 1 stella per la categoria corrispondente.

SKYTG24.IT: Cerca i marcatori "---AMORE_SECTION_START---", "---LAVORO_SECTION_START---", "---SALUTE_SECTION_START---". Il testo generale influenza principalmente il Benessere.`
        },
        {
          role: 'user',
          content: `Analizza questo oroscopo per ${input.signSlugIt} da ${input.sourceName}.

IMPORTANTE: Se questo contenuto proviene da Gazzetta dello Sport, cerca le sezioni specifiche:
- "LA TUA GIORNATA" 
- "AMORE"
- "AMICIZIA" 
- "LAVORO"
- "VALUTAZIONE GENERALE" (con possibili voti numerici)

Testo da analizzare:
${input.extracted_text}`
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'horoscope_analysis',
          schema: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                maxLength: 300,
                description: 'Riassunto conciso, obiettivo e che catturi l\'essenza dell\'oroscopo, originale e copyright-safe'
              },
              relazioni: {
                type: 'integer',
                minimum: 0,
                maximum: 5,
                description: 'Valutazione relazioni da 0 a 5 stelle basata sul contenuto (0 = N/A se non menzionato)'
              },
              lavoro: {
                type: 'integer',
                minimum: 0,
                maximum: 5,
                description: 'Valutazione lavoro da 0 a 5 stelle basata sul contenuto (0 = N/A se non menzionato)'
              },
              benessere: {
                type: 'integer',
                minimum: 0,
                maximum: 5,
                description: 'Valutazione benessere/mood generale da 0 a 5 stelle basata sul contenuto - include umore, energia emotiva, outlook della giornata (0 = N/A se non menzionato)'
              },
              tone: {
                type: 'string',
                enum: ['positive', 'negative', 'neutral'],
                description: 'Analisi del tono generale delle previsioni'
              }
            },
            required: ['summary', 'relazioni', 'lavoro', 'benessere', 'tone'],
            additionalProperties: false
          },
          strict: true
        }
      }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    console.log(`[OpenAI] Raw response received (${content.length} chars)`);
    const parsed = JSON.parse(content);
    
    // Validate and process ratings - allow 0 for unmentioned categories
    const result = {
      summary: parsed.summary || '',
      ratings: {
        relazioni: Math.max(0, Math.min(5, Math.round(parsed.relazioni || 0))),
        lavoro: Math.max(0, Math.min(5, Math.round(parsed.lavoro || 0))),
        benessere: Math.max(0, Math.min(5, Math.round(parsed.benessere || 0))),
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
