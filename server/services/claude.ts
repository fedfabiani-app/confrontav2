import Anthropic from '@anthropic-ai/sdk';
import { OpenAIInput, OpenAIOutput, openaiOutputSchema } from "@shared/schema";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: {
    "anthropic-beta": "prompt-caching-2024-07-31"
  }
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

La superquote è l'unico elemento editoriale originale della
card. È la sintesi dell'intero oroscopo espressa in forma
evocativa — non una decorazione, ma il modo per comunicare
il messaggio essenziale dell'oroscopo senza riprodurlo.

STRUTTURA — due frasi con ruoli distinti:

FRASE 1 — TONO/ATMOSFERA:
  Cattura l'energia o il clima emotivo dominante
  della giornata. Tono evocativo, quasi poetico.
  Deve rispecchiare fedelmente le priorità dell'oroscopo.
  Può riferirsi a qualsiasi ambito (lavoro, relazioni,
  energia personale) purché sia il tema principale
  dell'oroscopo originale.

FRASE 2 — INVITO/AZIONE:
  Un'azione concreta o un atteggiamento suggerito
  dalla giornata. Tono assertivo e diretto.
  Usa sempre il "tu" diretto.
  Può toccare un ambito diverso dalla frase 1
  purché rispecchi le priorità dell'originale.

CASO NEUTRO (tono né positivo né negativo):
  Frase 1 → descrive l'energia stabile della giornata
  Frase 2 → suggerisce come sfruttarla al meglio

LIMITI:
  - Minimo 80 caratteri totali (spazi inclusi)
  - Massimo 140 caratteri totali (spazi inclusi)
  - Entrambe le frasi con punto finale

VINCOLI ASSOLUTI:
  - Tono fedele all'oroscopo originale:
    positivo se la giornata è positiva,
    negativo se la giornata è difficile,
    neutro se la giornata è nella norma
  - Zero riferimenti a pianeti, transiti, segni,
    date, fonti, dettagli astrologici
  - Le due frasi devono essere complementari,
    non ridondanti — la seconda non è una
    variazione della prima
  - Non possono riassumere o anticipare l'incipit
  - Devono funzionare lette da sole, fuori contesto

ESEMPI TONO POSITIVO:
  "Qualcosa si sta sbloccando, anche se non è ancora visibile.
  Fidati di ciò che senti e muoviti senza aspettare."

ESEMPI TONO NEGATIVO:
  "Non è il momento di forzare le cose, meglio lasciar scorrere.
  Conserva le energie per quando il vento girerà."

ESEMPI TONO NEUTRO:
  "La giornata scorre su binari stabili, senza scossoni.
  Usala per costruire qualcosa che durerà nel tempo."

ESEMPI DA EVITARE:
  "Venere favorisce i tuoi piani." → astrologico
  "Le stelle ti sorridono." → riferimento a fonte
  "Giornata positiva per le relazioni." → descrittivo
  "Oggi potresti sentirti meglio." → vago e generico
  "È una buona giornata." → troppo corto e piatto

VERIFICA SUPERQUOTE:
□ Sono esattamente due frasi?
□ Frase 1 è evocativa e cattura il tono?
□ Frase 2 usa il "tu" diretto ed è assertiva?
□ Le due frasi sono complementari?
□ Totale tra 80 e 140 caratteri?
□ Entrambe con punto finale?
□ Zero riferimenti astrologici o a fonti?
□ Tono fedele all'originale?
□ Non anticipano né riassumono l'incipit?
□ Funzionano lette da sole?

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
          }
        }
      ],
      tool_choice: { type: 'tool', name: 'extract_horoscope' }
    });

    const toolBlock = response.content.find(b => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('No tool use block in Claude response');
    }

    console.log(`[Claude] Tool response received`);
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