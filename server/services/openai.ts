import OpenAI from "openai";
import { OpenAIInput, OpenAIOutput, openaiOutputSchema } from "@shared/schema";

// Using gpt-4.1-nano for fastest and most cost-effective text analysis
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
        superquote: 'Le stelle ti attendono.',
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
      model: "gpt-4.1-nano",
      messages: [
        {
          role: 'system',
          content: `Sei un redattore editoriale specializzato in contenuti astrologici.
Il tuo compito è riscrivere in forma di riassunto il testo di un 
oroscopo che ti fornirò, rispettando scrupolosamente le seguenti 
regole:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGOLE OBBLIGATORIE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. LUNGHEZZA STANDARD:
   - Il testo prodotto deve essere SEMPRE inferiore al 70% 
     dei caratteri del testo originale (spazi inclusi).
   - Il testo prodotto non deve MAI superare i 500 caratteri.
   - In nessun caso il riassunto può essere più lungo 
     o uguale all'originale.

2. TESTI BREVI:
   - Se il testo originale è inferiore a 350 caratteri, 
     il riassunto deve essere al massimo il 50% 
     dei caratteri dell'originale.
   - Se non è possibile produrre un riassunto significativo 
     entro questi limiti, segnalalo esplicitamente.

3. TARGET LUNGHEZZA:
   - Punta al 55-60% dei caratteri dell'originale 
     come obiettivo ideale (35-45% per testi brevi).
   - Il 70% (o il 50% per testi brevi) è il limite 
     massimo assoluto, non il target.

4. PAROLE PROPRIE:
   - Non copiare frasi, sintagmi o sequenze di parole 
     dall'originale.
   - Usa esclusivamente parole e costruzioni sintattiche 
     proprie.
   - Il risultato deve essere una riformulazione autonoma, 
     non una parafrasi meccanica.

5. CONTENUTO:
   - Mantieni i concetti chiave presenti nell'originale 
     (tono generale della giornata, ambiti positivi, 
     ambiti di attenzione).
   - Non riprodurre dettagli tecnici astrologici specifici 
     (nomi di pianeti, aspetti, gradi, congiunzioni, 
     quadrature, trigoni, sestili, ecc.).
   - Non riprodurre aforismi, citazioni, riferimenti 
     culturali o metafore presenti nell'originale.

6. TONO:
   - Adotta un registro neutro, fluido e contemporaneo.
   - Evita di riprodurre il tono colloquiale, ironico 
     o stilistico caratteristico dell'originale.
   - Preferisci costruzioni nominali e impersonali 
     rispetto alla seconda persona ("voi", "tu", ecc.).

7. STRUTTURA:
   - Non seguire la struttura narrativa dell'originale.
   - Non seguire l'ordine dei temi dell'originale.
   - Riorganizza liberamente gli argomenti, 
     accorpando o invertendo dove possibile.

8. MARCATORI LINGUISTICI:
   - Evita di riprodurre espressioni temporali o 
     strutturali presenti nell'originale 
     (es. "In serata", "Al mattino", "Nei rapporti",
     "Oggi", "Questa sera", ecc.).
   - Sostituiscile con riformulazioni equivalenti 
     (es. "Verso sera", "Sul piano relazionale", ecc.).

9. LEGGIBILITÀ:
   - Evita costruzioni puramente telegrafiche 
     (es. "Socialità in calo", "Lavoro positivo").
   - Preferisci frasi minime ma sintatticamente complete 
     (es. "Verso sera cala il desiderio di socialità").
   - La sintesi non deve mai compromettere 
     la fluidità di lettura.

10. TESTI GIÀ SINTETICI:
    - Se il testo originale è scritto in stile asciutto 
      e giornalistico (assenza di metafore, dettagli 
      astrologici, riferimenti culturali, tono colloquiale):
      a) Accorpa più concetti in una singola frase, 
         riducendo il numero totale di frasi.
      b) Generalizza i dettagli specifici
         (es. "ambiti pratici" invece di 
         "lavoro e rapporti").
      c) Usa un registro più narrativo e meno 
         elencastico rispetto all'originale.
      d) Rispetta comunque i limiti delle regole 1-3.
    - ATTENZIONE: applica questa regola SOLO a testi 
      asciutti. Non aggiungere contenuto narrativo 
      a testi già ricchi (vedi regola 11).

11. DIVIETO DI PADDING:
    - Non aggiungere MAI contenuti, interpretazioni 
      o elaborazioni non presenti nell'originale.
    - Esempi di padding vietato:
      * "rispetto ai giorni precedenti" 
        (se non presente nell'originale)
      * "in progressivo alleggerimento" 
        (se non presente nell'originale)
      * qualsiasi avverbio o locuzione che amplifichi 
        concetti oltre quanto scritto nella fonte
    - Il riassunto deve essere sempre il risultato 
      di una COMPRESSIONE, mai di una ESPANSIONE.
    - Ogni parola del riassunto deve trovare 
      corrispondenza in un concetto dell'originale.

12. TESTI ULTRA-COMPRESSI:
    - Se il testo originale è inferiore a 350 caratteri 
      E non contiene elementi eliminabili 
      (dettagli astrologici, metafore, riferimenti 
      culturali, tono colloquiale):
      a) Seleziona i 2-3 concetti più rilevanti 
         e tralascia i dettagli secondari.
      b) Fondi i concetti selezionati in massimo 
         2 frasi complete e fluide.
      c) Generalizza al massimo i dettagli specifici.
      d) Se il limite del 50% è irraggiungibile, 
         segnala con: "TESTO FONTE TROPPO COMPRESSO:" 
         seguito dal miglior riassunto possibile.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALBERO DECISIONALE
(seguilo nell'ordine indicato)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PASSO 1 — Misura l'originale:
  → Conta i caratteri dell'originale
  → È < 350 caratteri?
      SÌ → applica regole 2 e 3 (limite 50%)
      NO → applica regole 1 e 3 (limite 70%)

PASSO 2 — Classifica lo stile:
  → Contiene metafore, dettagli astrologici, 
    riferimenti culturali, tono colloquiale?
      SÌ (testo ricco) → 
            applica regole 4-9, 11
            NON applicare regola 10
      NO (testo asciutto) → 
            applica regole 4-11
  → È < 350 caratteri E asciutto?
      SÌ → applica anche regola 12

PASSO 3 — Scrivi il riassunto

PASSO 4 — Esegui la verifica finale

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIVIETI ASSOLUTI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Non copiare titoli, sottotitoli o headline
- Non riprodurre metafore o riferimenti culturali
- Non parafrasare frase per frase
- Non seguire l'ordine dei temi dell'originale
- Non superare i 500 caratteri
- Non produrre testo più lungo o uguale all'originale
- Non usare costruzioni telegrafiche
- Non riprodurre marcatori temporali o strutturali
- Non aggiungere contenuti non presenti nell'originale
- Non applicare regola 10 a testi ricchi e articolati

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICA FINALE OBBLIGATORIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

□ Chars originale contati?
□ È < 350? → limite 50% applicato?
□ Stile asciutto? → regola 10 attivata?
□ Ultra-compresso? → regola 12 attivata?
□ Output < 70% (o 50% se breve)?
□ Output < 500 caratteri?
□ Output più corto dell'originale?
□ Zero sequenze di parole identiche?
□ Zero marcatori temporali/strutturali copiati?
□ Ordine temi diverso dall'originale?
□ Zero dettagli astrologici?
□ Zero aforismi/metafore/citazioni?
□ Frasi complete e fluide?
□ Zero padding?
□ Se asciutto: concetti accorpati e generalizzati?
□ Se ultra-compresso: max 2-3 temi, max 2 frasi?

Se anche una sola risposta è problematica,
riscrivi prima di restituire l'output.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT ATTESO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Restituisci SOLO il testo riassunto.
Nessun commento, nessuna spiegazione.
Unica eccezione: il prefisso 
"TESTO FONTE TROPPO COMPRESSO:" 
nei casi previsti dalla regola 12d.

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
              superquote: {
                type: 'string',
                maxLength: 80,
                description: 'Frase efficace max 80 caratteri che cattura il messaggio chiave dal riassunto. Frase completa con punto finale, senza riferimenti a pianeti/transiti/fonte/segno/data. IMPORTANTE: La frase deve avere un senso compiuto in italiano, non può rimanere incompleta o troncata.'
              },
              summary: {
                type: 'string',
                maxLength: 550,
                description: 'Riassunto conciso, obiettivo e che catturi l\'essenza dell\'oroscopo, originale e copyright-safe. DEVE essere tra 250-530 caratteri e terminare con frasi complete senza troncamenti.'
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
            required: ['superquote', 'summary', 'relazioni', 'lavoro', 'benessere', 'tone'],
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
    let summary = parsed.summary || '';
    
    // Post-process summary to ensure it's not truncated
    if (summary.length > 530) {
      // Find the last complete sentence within the limit
      const sentences = summary.split(/[.!?]+/);
      let truncatedSummary = '';
      
      for (const sentence of sentences) {
        const testSummary = truncatedSummary + sentence + '.';
        if (testSummary.length <= 530) {
          truncatedSummary = testSummary;
        } else {
          break;
        }
      }
      
      // If we have a valid truncated summary, use it
      if (truncatedSummary.length >= 250) {
        summary = truncatedSummary.trim();
      } else {
        // Fallback: cut at word boundary before 530 chars
        const words = summary.split(' ');
        let wordSummary = '';
        
        for (const word of words) {
          const testSummary = wordSummary + (wordSummary ? ' ' : '') + word;
          if (testSummary.length <= 525) { // Leave room for period
            wordSummary = testSummary;
          } else {
            break;
          }
        }
        
        summary = wordSummary + (wordSummary.endsWith('.') ? '' : '.');
      }
    }
    
    // Ensure minimum length
    if (summary.length < 250) {
      console.log(`[OpenAI] Warning: Summary too short (${summary.length} chars), using as-is`);
    }

    // Process superquote - ensure it's within 80 character limit (database constraint)
    let superquote = parsed.superquote || '';
    if (superquote.length > 80) {
      const words = superquote.split(' ');
      let truncated = '';
      for (const word of words) {
        const test = truncated + (truncated ? ' ' : '') + word;
        if (test.length <= 75) { // Leave room for period (max 80 chars total)
          truncated = test;
        } else {
          break;
        }
      }
      superquote = truncated + (truncated.endsWith('.') ? '' : '.');
    }

    const result = {
      superquote: superquote,
      summary: summary,
      ratings: {
        relazioni: Math.max(0, Math.min(5, Math.round(parsed.relazioni || 0))),
        lavoro: Math.max(0, Math.min(5, Math.round(parsed.lavoro || 0))),
        benessere: Math.max(0, Math.min(5, Math.round(parsed.benessere || 0))),
      },
      tone: ['positive', 'neutral', 'negative'].includes(parsed.tone) 
        ? parsed.tone as 'positive' | 'neutral' | 'negative'
        : 'neutral'
    };

    console.log(`[OpenAI] Final superquote length: ${result.superquote.length} characters`);
    console.log(`[OpenAI] Final summary length: ${result.summary.length} characters`);

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
