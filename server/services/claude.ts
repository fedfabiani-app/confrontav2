import Anthropic from '@anthropic-ai/sdk';
import { OpenAIInput, OpenAIOutput, openaiOutputSchema } from "@shared/schema";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY environment variable is required');
}

const SYSTEM_PROMPT = `Sei un redattore editoriale specializzato in contenuti astrologici.
Il tuo compito è analizzare il testo di un oroscopo e restituire:
1. L'incipit testuale dell'oroscopo originale
2. Una superquote editoriale originale
3. Le valutazioni per ambito e il tono generale

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMPO 1 — INCIPIT (summary)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

L'incipit è la riproduzione testuale e fedele dell'inizio
dell'oroscopo originale. Non rielaborare, non parafrasare,
non modificare nemmeno una parola.

REGOLE:
- Estrai le prime due frasi dell'originale, verbatim
- Limite assoluto: 200 caratteri (spazi inclusi)
- Se entrambe le frasi rientrano nei 200 caratteri
  → includi entrambe
- Se solo la prima rientra nei 200 caratteri
  → includi solo la prima
- Se anche la prima supera i 200 caratteri
  → tronca a 200 caratteri esatti e aggiungi "…"
- Non aggiungere mai una terza frase
- Non modificare punteggiatura, maiuscole o stile

VERIFICA INCIPIT:
□ È riproduzione testuale fedele?
□ Sono al massimo due frasi?
□ È entro i 200 caratteri?
□ Se troncato: termina con "…"?
□ Zero modifiche al testo originale?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMPO 2 — SUPERQUOTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


La superquote è un testo ORIGINALE scritto da zero — NON una citazione né una
parafrasi del testo sorgente. Non deve contenere frasi, espressioni o costrutti
riconoscibili del testo originale.
Deve essere COERENTE con il messaggio dell'oroscopo (stesso tema, stesso tono
generale) ma espressa con vocabolario e struttura completamente diversi e originali.

Struttura OBBLIGATORIA — due frasi distinte e complementari:
- Frase 1 — evocativa: descrive qualcosa che il lettore SENTE o VIVE in prima
  persona. Il lettore è sempre il soggetto implicito o esplicito. Mai usare
  "la giornata" o concetti astratti come soggetto principale.
- Frase 2 — assertiva: usa "tu" diretto o imperativo, suggerisce un'azione
  o atteggiamento concreto coerente con F1.
Le due frasi devono essere COMPLEMENTARI: F2 non ripete F1, la completa.

Limiti: 80–140 caratteri totali (spazi inclusi). Entrambe le frasi con punto finale.
Vincoli: tono fedele all'originale (positivo/negativo/neutro). Zero riferimenti a
pianeti, transiti, segni, date, fonti. Se produci una sola frase il risultato
è INVALIDO — riscrivi sempre con due frasi.

Soggetto di F1 — REGOLE PRECISE:
✓ CORRETTO: "Senti che qualcosa si sta muovendo nella direzione giusta."
✓ CORRETTO: "C'è un'energia nuova dentro di te, ancora silenziosa ma presente."
✓ CORRETTO: "Qualcosa si allenta, e respiri meglio di ieri."
✗ VIETATO:  "La giornata oscilla tra spinta e prudenza." → soggetto astratto
✗ VIETATO:  "L'energia è generosa e multiforme." → non coinvolge il lettore
✗ VIETATO:  "Il confronto è inevitabile." → filosofico, distante

Esempi corretti per tono:
  POSITIVO: "Qualcosa si sta sbloccando dentro di te, anche se non è ancora visibile.
             Fidati di ciò che senti e muoviti senza aspettare."
  NEGATIVO: "Oggi fai fatica a trovare il ritmo, e le energie non bastano mai.
             Conserva le forze e rimanda ciò che può aspettare."
  NEUTRO:   "Scorre tutto in modo ordinato, senza scossoni né grandi sorprese.
             Usa questa stabilità per costruire qualcosa che durerà nel tempo."

Da evitare assoluto:
  "Venere favorisce i tuoi piani." → riferimento astrologico
  "Le stelle ti sorridono." → riferimento astrologico
  "La giornata è favorevole per le relazioni." → descrittivo e generico
  "Il silenzio custodisce il veleno." → metafora astratta senza lettore
  "Oggi potresti sentirti meglio." → condizionale che indebolisce
  Qualsiasi frase con soggetto "la giornata", "l'energia", "il momento" isolati
  senza aggancio al lettore

Verifica OBBLIGATORIA prima di restituire:
□ Sono esattamente due frasi con punto finale?
□ F1 ha il lettore come soggetto implicito o esplicito?
□ F2 usa "tu" diretto o imperativo?
□ F2 completa F1 senza ripeterla?
□ Totale caratteri tra 80 e 140?
□ Zero riferimenti astrologici o a fonti?
□ Tono coerente con l'originale (positivo/negativo/neutro)?
□ Se anche una sola risposta è NO → riscrivi prima di restituire.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMPO 3 — RATINGS E TONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Analizza l'intero testo originale e assegna:

RELAZIONI (0-5):
  Valutazione dell'ambito relazionale.
  0 = non menzionato nell'oroscopo.

LAVORO (0-5):
  Valutazione dell'ambito professionale.
  0 = non menzionato nell'oroscopo.

BENESSERE (0-5):
  Valutazione di umore, energia emotiva
  e outlook generale della giornata.
  0 = non menzionato nell'oroscopo.

TONE:
  "positive" = giornata complessivamente favorevole
  "negative" = giornata complessivamente difficile
  "neutral"  = giornata nella norma, senza picchi

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICA FINALE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

□ Incipit: testuale, max 200 caratteri, max 2 frasi?
□ Superquote: 2 frasi, 80-140 caratteri, tono fedele?
□ Ratings: 0 per ambiti non menzionati?
□ Tone: coerente con superquote e ratings?

Se anche una sola risposta è problematica,
correggi prima di restituire l'output.`;

export async function processHoroscopeWithAI(input: OpenAIInput): Promise<OpenAIOutput> {
  try {
    console.log(`[Claude] Processing ${input.sourceName} - ${input.signSlugIt} (${input.extracted_text.length} chars)`);

    let useNeutralFallback = false;

    if (input.extracted_text.length < 30) {
      console.log(`[Claude] Text too short (${input.extracted_text.length} chars), using neutral fallback`);
      useNeutralFallback = true;
    } else {
      const hasHoroscopeKeywords = /\b(oroscopo|previsioni|stelle|fortuna|amore|lavoro|salute|giornata|periodo|energia|voto|destino|luna|sole|pianeti|segno|zodiaco|oggi|domani|settimana|relazioni|carriera|benessere|marte|venere|saturno|giove|mercurio|plutone|nettuno|urano|ariete|toro|gemelli|cancro|leone|vergine|bilancia|scorpione|sagittario|capricorno|acquario|pesci)\b/i.test(input.extracted_text.toLowerCase());
      const hasNavigationWords = /\b(menu|naviga|accedi|iscriviti|abbonati|cookie|privacy|pubblicità|home|sezioni|login|registrati|newsletter|social)\b/i.test(input.extracted_text.toLowerCase());
      const hasPaywallWords = /\b(per leggere|abbonati|registrati|accesso|premium|paywall|login|iscriviti|wall|visualizzare)\b/i.test(input.extracted_text.toLowerCase());
      const hasAstrologicalContent = /\b(pianeta|congiunzione|quadratura|trigono|sestile|casa|cuspide|transiti?|aspetti?|influssi?|influenze?|configurazioni?|astri|cielo|combinazione|astrologica|energia|vitalità|serenità|nervosismo|ansia|felicità|tristezza|preoccupazioni|ottimismo|passione)\b/i.test(input.extracted_text);

      if (!hasHoroscopeKeywords && !hasAstrologicalContent &&
          ((hasNavigationWords && input.extracted_text.length < 100) ||
           (hasPaywallWords && input.extracted_text.length < 80))) {
        console.log(`[Claude] Text appears to be navigation/paywall content, using neutral fallback`);
        useNeutralFallback = true;
      }
    }

    if (useNeutralFallback) {
      return {
        superquote: 'La giornata scorre su binari stabili. Usala per costruire qualcosa che durerà.',
        summary: 'Le previsioni di oggi non sono disponibili.',
        ratings: {
          relazioni: 0,
          lavoro: 0,
          benessere: 0,
        },
        tone: 'neutral' as const
      };
    }

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: [
        {
          type: 'text' as const,
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' as const }
        }
      ],
      messages: [
        {
          role: 'user',
          content: `Testo da analizzare:\n${input.extracted_text}`
        }
      ],
      tools: [
        {
          name: 'extract_horoscope',
          description: "Restituisci incipit, superquote, ratings e tone dell'oroscopo analizzato",
          input_schema: {
            type: 'object' as const,
            properties: {
              superquote: {
                type: 'string',
                description: 'Due frasi originali che sintetizzano il messaggio dell\'oroscopo. Frase 1: evocativa, cattura il tono/atmosfera. Frase 2: assertiva con "tu" diretto, suggerisce un\'azione o atteggiamento. Minimo 80, massimo 140 caratteri totali. Entrambe con punto finale. Zero riferimenti astrologici o a fonti.'
              },
              summary: {
                type: 'string',
                description: 'Riproduzione testuale fedele delle prime due frasi dell\'oroscopo originale. Massimo 200 caratteri. Se entrambe le frasi rientrano nei 200 caratteri includile entrambe, altrimenti solo la prima. Se anche la prima supera i 200 caratteri, tronca a 200 caratteri e aggiungi "…". Non modificare nulla del testo originale.'
              },
              relazioni: {
                type: 'integer',
                minimum: 0,
                maximum: 5,
                description: 'Valutazione relazioni da 0 a 5 stelle basata sul contenuto (0 = non menzionato)'
              },
              lavoro: {
                type: 'integer',
                minimum: 0,
                maximum: 5,
                description: 'Valutazione lavoro da 0 a 5 stelle basata sul contenuto (0 = non menzionato)'
              },
              benessere: {
                type: 'integer',
                minimum: 0,
                maximum: 5,
                description: 'Valutazione benessere/umore/energia emotiva da 0 a 5 stelle basata sul contenuto (0 = non menzionato)'
              },
              tone: {
                type: 'string',
                enum: ['positive', 'negative', 'neutral'],
                description: 'Tono generale dell\'oroscopo: positive = favorevole, negative = difficile, neutral = nella norma'
              }
            },
            required: ['superquote', 'summary', 'relazioni', 'lavoro', 'benessere', 'tone']
          },
          cache_control: { type: 'ephemeral' as const }
        }
      ],
      tool_choice: { type: 'tool', name: 'extract_horoscope' }
    });

    const toolBlock = response.content.find(b => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('No tool use block in Claude response');
    }

    console.log(`[Claude] Tool response received`);
    console.log(`[Claude] Cache usage — creation: ${response.usage.cache_creation_input_tokens ?? 0}, read: ${response.usage.cache_read_input_tokens ?? 0}, input: ${response.usage.input_tokens}`);
    const parsed = toolBlock.input as Record<string, unknown>;

    // Process summary (incipit) — enforce 200 char hard limit
    let summary = (parsed.summary as string) || '';
    if (summary.length > 200) {
      summary = summary.slice(0, 199) + '…';
    }

    // Process superquote — enforce 80-140 char limits
    let superquote = (parsed.superquote as string) || '';
    if (superquote.length > 140) {
      // Trim to last complete sentence within 140 chars
      const sentences = superquote.match(/[^.!?]+[.!?]+/g) || [];
      let trimmed = '';
      for (const sentence of sentences) {
        if ((trimmed + sentence).length <= 140) {
          trimmed += sentence;
        } else {
          break;
        }
      }
      superquote = trimmed.trim() || superquote.slice(0, 139) + '.';
    }
    if (superquote.length < 80) {
      console.log(`[Claude] Warning: Superquote too short (${superquote.length} chars), using as-is`);
    }

    const result = {
      superquote,
      summary,
      ratings: {
        relazioni: Math.max(0, Math.min(5, Math.round((parsed.relazioni as number) || 0))),
        lavoro: Math.max(0, Math.min(5, Math.round((parsed.lavoro as number) || 0))),
        benessere: Math.max(0, Math.min(5, Math.round((parsed.benessere as number) || 0))),
      },
      tone: ['positive', 'neutral', 'negative'].includes(parsed.tone as string)
        ? parsed.tone as 'positive' | 'neutral' | 'negative'
        : 'neutral'
    };

    console.log(`[Claude] Final superquote length: ${result.superquote.length} characters`);
    console.log(`[Claude] Final summary (incipit) length: ${result.summary.length} characters`);
    console.log(`[Claude] Processed result: Relazioni=${result.ratings.relazioni}, Lavoro=${result.ratings.lavoro}, Benessere=${result.ratings.benessere}, Tone=${result.tone}`);

    return openaiOutputSchema.parse(result);
  } catch (error) {
    console.error('Claude processing error:', error);
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

      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[Claude] Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

const NEUTRAL_FALLBACK: OpenAIOutput = {
  superquote: 'La giornata scorre su binari stabili. Usala per costruire qualcosa che durerà.',
  summary: 'Le previsioni di oggi non sono disponibili.',
  ratings: { relazioni: 0, lavoro: 0, benessere: 0 },
  tone: 'neutral' as const,
};

function isInvalidText(text: string): boolean {
  if (text.length < 30) return true;
  const hasHoroscopeKeywords = /\b(oroscopo|previsioni|stelle|fortuna|amore|lavoro|salute|giornata|periodo|energia|voto|destino|luna|sole|pianeti|segno|zodiaco|oggi|domani|settimana|relazioni|carriera|benessere|marte|venere|saturno|giove|mercurio|plutone|nettuno|urano|ariete|toro|gemelli|cancro|leone|vergine|bilancia|scorpione|sagittario|capricorno|acquario|pesci)\b/i.test(text.toLowerCase());
  const hasAstrologicalContent = /\b(pianeta|congiunzione|quadratura|trigono|sestile|casa|cuspide|transiti?|aspetti?|influssi?|influenze?|configurazioni?|astri|cielo|combinazione|astrologica|energia|vitalità|serenità|nervosismo|ansia|felicità|tristezza|preoccupazioni|ottimismo|passione)\b/i.test(text);
  const hasNavigationWords = /\b(menu|naviga|accedi|iscriviti|abbonati|cookie|privacy|pubblicità|home|sezioni|login|registrati|newsletter|social)\b/i.test(text.toLowerCase());
  const hasPaywallWords = /\b(per leggere|abbonati|registrati|accesso|premium|paywall|login|iscriviti|wall|visualizzare)\b/i.test(text.toLowerCase());
  if (!hasHoroscopeKeywords && !hasAstrologicalContent &&
      ((hasNavigationWords && text.length < 100) || (hasPaywallWords && text.length < 80))) {
    return true;
  }
  return false;
}

function postProcessOutput(parsed: Record<string, unknown>): OpenAIOutput {
  let summary = (parsed.summary as string) || '';
  if (summary.length > 200) {
    summary = summary.slice(0, 199) + '…';
  }

  let superquote = (parsed.superquote as string) || '';
  if (superquote.length > 140) {
    const sentences = superquote.match(/[^.!?]+[.!?]+/g) || [];
    let trimmed = '';
    for (const sentence of sentences) {
      if ((trimmed + sentence).length <= 140) {
        trimmed += sentence;
      } else {
        break;
      }
    }
    superquote = trimmed.trim() || superquote.slice(0, 139) + '.';
  }
  if (superquote.length < 80) {
    console.log(`[Claude] Warning: Superquote too short (${superquote.length} chars), using as-is`);
  }

  return openaiOutputSchema.parse({
    superquote,
    summary,
    ratings: {
      relazioni: Math.max(0, Math.min(5, Math.round((parsed.relazioni as number) || 0))),
      lavoro: Math.max(0, Math.min(5, Math.round((parsed.lavoro as number) || 0))),
      benessere: Math.max(0, Math.min(5, Math.round((parsed.benessere as number) || 0))),
    },
    tone: ['positive', 'neutral', 'negative'].includes(parsed.tone as string)
      ? parsed.tone as 'positive' | 'neutral' | 'negative'
      : 'neutral',
  });
}

export async function processMultiSourceHoroscope(inputs: OpenAIInput[]): Promise<OpenAIOutput[]> {
  if (inputs.length === 0) return [];

  const results: OpenAIOutput[] = inputs.map(() => ({ ...NEUTRAL_FALLBACK, ratings: { ...NEUTRAL_FALLBACK.ratings } }));

  const validEntries: { index: number; input: OpenAIInput }[] = [];
  for (let i = 0; i < inputs.length; i++) {
    if (isInvalidText(inputs[i].extracted_text)) {
      console.log(`[Claude Batch] Source ${inputs[i].sourceName} (${inputs[i].extracted_text.length} chars) — using fallback`);
    } else {
      validEntries.push({ index: i, input: inputs[i] });
    }
  }

  if (validEntries.length === 0) return results;

  console.log(`[Claude Batch] Processing ${validEntries.length}/${inputs.length} valid sources for ${inputs[0].signSlugIt} (${inputs[0].dateISO})`);

  const userMessage = `Hai ${validEntries.length} oroscopi da analizzare. Per ognuno estrai i dati strutturati.\n\n` +
    validEntries.map((e, i) => `[FONTE ${i + 1} - ${e.input.sourceName}]\n${e.input.extracted_text}`).join('\n\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: [
      {
        type: 'text' as const,
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
    tools: [
      {
        name: 'extract_horoscopes_batch',
        description: 'Restituisci incipit, superquote, ratings e tone per ogni oroscopo nella lista, nello stesso ordine in cui sono stati forniti',
        input_schema: {
          type: 'object' as const,
          properties: {
            results: {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                properties: {
                  source_index: { type: 'integer' as const, description: 'Indice 1-based della fonte (1 = prima fonte)' },
                  superquote: { type: 'string' as const, description: 'Due frasi originali che sintetizzano il messaggio. Frase 1 evocativa, frase 2 assertiva con "tu". 80-140 caratteri totali.' },
                  summary: { type: 'string' as const, description: 'Riproduzione testuale fedele delle prime due frasi originali. Massimo 200 caratteri.' },
                  relazioni: { type: 'integer' as const, minimum: 0, maximum: 5 },
                  lavoro: { type: 'integer' as const, minimum: 0, maximum: 5 },
                  benessere: { type: 'integer' as const, minimum: 0, maximum: 5 },
                  tone: { type: 'string' as const, enum: ['positive', 'neutral', 'negative'] },
                },
                required: ['source_index', 'superquote', 'summary', 'relazioni', 'lavoro', 'benessere', 'tone'],
              },
            },
          },
          required: ['results'],
        },
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    tool_choice: { type: 'tool', name: 'extract_horoscopes_batch' },
  });

  const toolBlock = response.content.find(b => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('No tool use block in Claude batch response');
  }

  console.log(`[Claude Batch] Response received — cache creation: ${response.usage.cache_creation_input_tokens ?? 0}, read: ${response.usage.cache_read_input_tokens ?? 0}, input: ${response.usage.input_tokens}`);

  const batchResults = (toolBlock.input as { results: Record<string, unknown>[] }).results;
  for (let i = 0; i < batchResults.length; i++) {
    const parsed = batchResults[i];
    const entry = validEntries[i];
    if (!entry) continue;
    try {
      results[entry.index] = postProcessOutput(parsed);
      console.log(`[Claude Batch] Source ${entry.input.sourceName}: superquote=${results[entry.index].superquote.length}ch, tone=${results[entry.index].tone}`);
    } catch (err) {
      console.error(`[Claude Batch] Post-processing failed for source ${entry.input.sourceName}:`, err);
    }
  }

  return results;
}

export async function processMultiSourceHoroscopeWithRetry(
  inputs: OpenAIInput[],
  maxRetries: number = 3
): Promise<OpenAIOutput[]> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await processMultiSourceHoroscope(inputs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      if (attempt === maxRetries) {
        break;
      }

      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[Claude Batch] Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
