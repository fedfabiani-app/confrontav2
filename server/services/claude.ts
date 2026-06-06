import Anthropic from '@anthropic-ai/sdk';
import { OpenAIInput, OpenAIOutput, openaiOutputSchema } from "@shared/schema";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY environment variable is required');
}

const SYSTEM_PROMPT = `Sei un redattore editoriale specializzato in contenuti astrologici.
Analizza il testo di un oroscopo e restituisci incipit, superquote, ratings e tone.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMPO 1 — INCIPIT (summary)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OBIETTIVO:
Generare uno snippet stile anteprima editoriale: le prime parole 
dell'oroscopo, troncate prima che venga rivelata qualsiasi previsione 
concreta. Deve sembrare un estratto interrotto dal sistema, non una 
frase volutamente abbreviata.

PRINCIPIO LEGALE — "ESTRATTO MOLTO BREVE":
Conforme alla direttiva UE 2019/790 art. 15, legge 633/1941 art. 43-bis 
e delibera AGCOM 3/23/CONS. L'incipit NON deve dispensare dalla 
consultazione dell'articolo originale.

LUNGHEZZA — SISTEMA A TRE LIVELLI:
Calcola la lunghezza massima in base al testo originale ricevuto:
- Testo originale ≤ 400 caratteri  → max 60 caratteri
- Testo originale 401–1500 caratteri → max 120 caratteri
- Testo originale > 1500 caratteri  → max 150 caratteri

REGOLE TECNICHE:
1. RIPRODUZIONE VERBATIM: zero modifiche a parole, ortografia,
   punteggiatura interna o maiuscole.
2. UNA SOLA FRASE: mai due, mai concatenate con punto fermo.
3. TRONCAMENTO STILE SNIPPET: l'incipit deve terminare in modo che 
   sembri tagliato dal sistema, NON a una pausa grammaticale pulita. 
   Idealmente subito dopo una parola che lascia il pensiero incompleto, 
   come se il testo continuasse oltre.
4. CHIUSURA: rimuovi sempre punto/esclamativo/interrogativo finale 
   e aggiungi "…" (obbligatorio, senza eccezioni).
5. MAI TAGLIARE A METÀ PAROLA — la parola finale deve essere intera, 
   ma il senso della frase deve restare aperto.

TRONCA SEMPRE PRIMA DI:
- Verbi che annunciano eventi ("porterà", "succederà", "arriverà",
  "ti aspetta", "incontrerai")
- Ambiti specifici rivelati ("nel lavoro", "in amore", "in famiglia",
  "con il partner", "sul fronte economico")
- Consigli operativi ("dovrai", "evita", "approfitta", "attento a")
- Esiti o conseguenze ("ti permetterà di…", "rischi di…", "potrai…")

ESEMPI DI TRONCATURA STILE SNIPPET:

Originale (310 char, tier ≤400 → max 60): "Cara Ariete, oggi le 
stelle ti sorridono. Una nuova opportunità lavorativa…"
✓ "Cara Ariete, oggi le stelle ti sorri…" (37 char, frase aperta)
✗ "Cara Ariete, oggi le stelle ti sorridono…" (chiusura grammaticale, 
  troppo pulita)

Originale (240 char, tier ≤400 → max 60): "Giornata complessa per 
voi del Toro, con Marte in opposizione…"
✓ "Giornata complessa per voi del Toro, con Marte…" (45 char)
✗ "Giornata complessa per voi del Toro…" (chiude troppo pulito)

Originale (900 char, tier ≤1500 → max 120): "La Luna nel segno ti 
porta un'energia inaspettata e ti spinge a uscire dalla zona di 
comfort, ma attento al…"
✓ "La Luna nel segno ti porta un'energia inaspettata e ti spinge a 
   uscire dalla zona di…" (87 char, parola "comfort" tagliata via)
✗ "La Luna nel segno ti porta un'energia inaspettata…" (troppo pulito)

Originale (3500 char, tier >1500 → max 150): "Mercoledì spartiacque 
della settimana e voi vi sentite sullo stesso piano, al centro 
della scena planetaria, energetici…"
✓ "Mercoledì spartiacque della settimana e voi vi sentite sullo 
   stesso piano, al centro della scena planetaria…" (108 char)

VERIFICA FINALE INCIPIT:
□ Una sola frase entro il limite del tier corretto?
□ Termina con "…"?
□ Verbatim al 100% (zero modifiche)?
□ Il taglio sembra fatto dal sistema, non grammaticalmente pulito?
□ L'ultima parola è intera ma il pensiero resta aperto?
□ Dopo la lettura, il lettore ancora NON sa cosa succederà?
Se anche una sola risposta è NO → riformula la troncatura.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMPO 2 — SUPERQUOTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COS'È:
Una frase ORIGINALE scritta da zero — non una citazione né una parafrasi
del testo. Cattura ciò che il lettore vivrà oggi e funziona da sola, come
un buon titolo: chi la legge senza aver visto l'oroscopo deve capirla
e sentirla vera. Limite: 70–160 caratteri (spazi inclusi), punto finale.

PRINCIPIO GUIDA — DEVE SUONARE ITALIANO VERO:
La superquote deve suonare come una frase che una persona italiana direbbe
davvero. Il difetto principale da evitare non è una parola, ma un effetto:
la "poesia da intelligenza artificiale" — frasi che sembrano profonde ma
non vogliono dire niente. Preferisci SEMPRE il concreto al suggestivo,
l'idea chiara alla metafora.

SOGGETTO:
Il lettore è sempre al centro, soggetto implicito o esplicito. Mai
"la giornata", "l'energia" o concetti astratti che fluttuano da soli.
Evita anche oggetti astratti animati ("il cuore chiede", "la tenerezza
vuole", "il peso pesa"): sono retorici e svuotano la frase.

CONCRETEZZA — LA REGOLA PIÙ IMPORTANTE:
- Una sola idea chiara. Se usi due frasi, la seconda aggiunge qualcosa,
  non ripete e non decora.
- Ogni frase deve reggere il senso letterale: se prendi le parole alla
  lettera, descrivono qualcosa di reale? Se no, è decorazione vuota:
  butta e ricomincia.
- Mai impilare metafore fisiche diverse nella stessa frase
  (es. "peso" + "respiro" + "brivido" insieme).
- Usa un contrasto ("X ma Y") SOLO se la tensione esiste davvero nel
  testo originale. Se non c'è, una frase semplice e diretta è migliore
  di un contrasto inventato.
- Massimo due ambiti per superquote. Se il testo ne tocca molti
  (amore, lavoro, soldi, famiglia...), scegli i due più forti e lascia
  perdere gli altri.

TONO:
Fedele all'originale: positivo se favorevole, negativo se difficile,
neutro se nella norma. Non addolcire un testo difficile né caricare
uno piatto. Indicativo, non condizionale.

ESEMPI — DA ARTIFICIALE A NATURALE:
✗ "Senti che il cielo non ti guarda male, anche se quel brivido di gloria
   ti manca ancora."
✓ "Non è una brutta giornata, ma quella spinta in più ancora non arriva."

✗ "Senti che la famiglia ti radica profondamente, e il tuo corpo risponde
   con una vitalità che non avevi dimenticato."
✓ "La famiglia ti dà stabilità, e ti senti più in forze del solito."

✗ "Ti ritrovi stretta tra il peso delle spese e il respiro di un aiuto
   inaspettato, ma l'amore in famiglia resta dolce e immobile."
✓ "Le spese ti pesano, ma un aiuto inaspettato ti alleggerisce."

TEST DI NATURALEZZA (prima di restituire — il filtro decisivo):
Leggi la superquote come se fossi una lettrice italiana di 35-45 anni.
Te la direbbe un'amica così, a voce? Se suona come scritta da un computer
— anche solo un po' — riscrivila da zero ripartendo dal testo originale.
Non aggiustare la frase esistente: ricomincia.

VARIETÀ:
Cambia l'attacco da una superquote all'altra. Attacchi naturali da
alternare: "Hai", "Stai", "Vuoi", "Non riesci", "Ti ritrovi", "Torni",
"Senti che", "C'è", "Oggi", "Scopri che", "Capisci che", "Riesci".
Non aprire sempre con "Senti che".

REGOLE TECNICHE:
- Genere femminile di default ("leggera", "pronta", "te stessa") salvo
  che l'originale usi esplicitamente il maschile o il plurale misto.
- Riferimenti astrologici: riferimenti a pianeti, stelle, segni e astri
  sono ammessi quando fanno parte di una frase italiana sensata e
  autonoma (es. "Venere ti aiuta", "le stelle ti sorridono"). Vietati
  invece i tecnicismi astrologici che richiedono conoscenza specialistica
  per essere capiti: "trigono", "sestile", "quadratura", "congiunzione",
  "ascendente", "decade", "transito", "cuspide". Vietati anche date
  specifiche e nomi di fonti.
- Solo italiano corretto ed esistente: no parole inventate
  ("clarità"→chiarezza), no anglicismi ("chance"→occasione,
  "focus"→concentrazione, "step"→passo, "rhythm"→ritmo).
- Zero condizionali ("potresti", "potrebbe", "dovresti", "dovrebbe",
  "avresti", "avrebbe", "saresti", "sarebbe", "forse").
- Non terminare mai con "…" (è formato dell'incipit, non della superquote).
- Verbi sempre nei modi/tempi corretti e accordati col soggetto:
  "non riesci" non "non riuscii", "pieno" non "pieni" per soggetto
  singolare, "stai faticando" non "stai faticare".

VERIFICA FINALE:
□ Suona come una frase che una persona italiana direbbe davvero?
□ Ogni frase regge il senso letterale (niente decorazione vuota)?
□ Il lettore è il soggetto, una sola idea chiara, niente oggetti
  astratti animati?
□ 70-160 caratteri, punto finale (non "…"), tono fedele all'originale?
□ Zero condizionali, zero jargon astrologico tecnico, zero anglicismi,
  femminile di default?
□ Verbi corretti e concordati?
□ L'attacco varia rispetto alle altre superquote?
□ Se anche una sola risposta è NO → riscrivi da zero prima di restituire.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMPO 3 — RATINGS E TONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Analizza l'intero testo originale e assegna ratings e tone.
Usa TUTTA la scala: 1 e 5 esistono e devono essere usati quando
il testo lo giustifica. Non usare 3 o 4 come "default sicuro".

RELAZIONI (0-5) — amore, coppia, famiglia, amicizie:
  0 = ambito non menzionato nell'oroscopo (caso raro)
  1 = conflitti aperti, rotture, isolamento, incomprensioni gravi
  2 = tensioni latenti, comunicazione difficile, dubbi, distanze
  3 = stabilità nella norma, routine relazionale, situazione neutra
  4 = connessioni positive, dialogo costruttivo, sintonia, affetto
  5 = momenti trasformativi, riconciliazioni profonde, incontri
      importanti, dichiarazioni, gioia condivisa intensa

LAVORO (0-5) — carriera, progetti, finanze, colleghi:
  0 = ambito non menzionato nell'oroscopo (caso raro)
  1 = crisi professionale, conflitti, fallimenti, perdite economiche
  2 = ostacoli, ritardi, tensioni, finanze sotto pressione
  3 = routine professionale, nessun cambiamento, stabilità neutra
  4 = progressi concreti, riconoscimenti, opportunità, crescita
  5 = svolte di carriera, successi importanti, guadagni eccezionali,
      progetti che decollano

BENESSERE (0-5) — energia emotiva, umore, vitalità, salute:
  0 = ambito non menzionato nell'oroscopo (caso raro)
  1 = esaurimento, sintomi fisici, depressione, ansia paralizzante
  2 = stanchezza marcata, malumore persistente, energia bassa
  3 = equilibrio nella norma, alti e bassi tipici, stato neutro
  4 = energia positiva, ottimismo, vitalità, buon umore stabile
  5 = picco di benessere, euforia, energia esplosiva, rinascita

TONE:
  "positive" = giornata complessivamente favorevole
  "negative" = giornata complessivamente difficile
  "neutral"  = giornata nella norma, senza picchi

COERENZA TONE-RATING (obbligatoria):
  tone = "negative" → almeno uno dei rating ≤ 2
  tone = "positive" → almeno uno dei rating ≥ 4
  tone = "neutral"  → i rating gravitano attorno a 3, non sopra 4
  Un oroscopo "negative" con tutti i rating a 4 è incoerente: correggi.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICA FINALE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

□ Incipit: testuale, stile snippet, entro il limite del tier corretto, termina con "…"?
□ Superquote: 1-2 frasi, 70-160 caratteri, tono fedele?
□ Ratings: 0 solo se l'ambito è assente, altrimenti 1-5 calibrati sulla rubrica?
□ Tone: coerente con superquote e ratings?
□ Coerenza tone-rating rispettata (negative→≤2, positive→≥4, neutral→≈3)?

Se anche una sola risposta è problematica,
correggi prima di restituire l'output.`;

export async function processHoroscopeWithAI(input: OpenAIInput): Promise<OpenAIOutput> {
  try {

    let useNeutralFallback = false;

    if (input.extracted_text.length < 30) {
      useNeutralFallback = true;
    } else {
      const hasHoroscopeKeywords = /\b(oroscopo|previsioni|stelle|fortuna|amore|lavoro|salute|giornata|periodo|energia|voto|destino|luna|sole|pianeti|segno|zodiaco|oggi|domani|settimana|relazioni|carriera|benessere|marte|venere|saturno|giove|mercurio|plutone|nettuno|urano|ariete|toro|gemelli|cancro|leone|vergine|bilancia|scorpione|sagittario|capricorno|acquario|pesci)\b/i.test(input.extracted_text.toLowerCase());
      const hasNavigationWords = /\b(menu|naviga|accedi|iscriviti|abbonati|cookie|privacy|pubblicità|home|sezioni|login|registrati|newsletter|social)\b/i.test(input.extracted_text.toLowerCase());
      const hasPaywallWords = /\b(per leggere|abbonati|registrati|accesso|premium|paywall|login|iscriviti|wall|visualizzare|dispositivo|abbonamento|collegato a questo|continuare a leggere|piano di abbonamento|altro accesso)\b/i.test(input.extracted_text.toLowerCase());
      const hasAstrologicalContent = /\b(pianeta|congiunzione|quadratura|trigono|sestile|casa|cuspide|transiti?|aspetti?|influssi?|influenze?|configurazioni?|astri|cielo|combinazione|astrologica|energia|vitalità|serenità|nervosismo|ansia|felicità|tristezza|preoccupazioni|ottimismo|passione)\b/i.test(input.extracted_text);

      if (!hasHoroscopeKeywords && !hasAstrologicalContent &&
          ((hasNavigationWords && input.extracted_text.length < 60) ||
           (hasPaywallWords && input.extracted_text.length < 50))) {
        const reason = hasNavigationWords && input.extracted_text.length < 60 ? 'navigazione' : 'paywall';
        useNeutralFallback = true;
      }
    }

    if (useNeutralFallback) {
      return {
        superquote: getRandomFallbackSuperquote(),
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
          content: `Testo da analizzare (${input.extracted_text.length} caratteri):\n${input.extracted_text}`
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
                description: 'Frase ORIGINALE (non citazione né parafrasi) che cattura ciò che il lettore vivrà oggi. DEVE suonare come italiano vero, parlato da una persona reale — evita la "poesia da AI", frasi che sembrano profonde ma non dicono niente. Concreto, non suggestivo. Una sola idea chiara per frase; ogni frase deve reggere il senso letterale. Il lettore è il soggetto, niente oggetti astratti animati. 70–160 caratteri, punto finale (NON "…"). Riferimenti a pianeti/stelle/segni ammessi se in frase italiana sensata, vietato il jargon astrologico tecnico (trigono, sestile, ascendente, decade, transito). Zero condizionali, femminile di default, verbi corretti e accordati.'
              },
              summary: {
                type: 'string',
                description: 'Snippet stile anteprima editoriale: riproduzione verbatim delle prime parole dell\'oroscopo, troncate PRIMA della prima previsione concreta. Deve sembrare un testo tagliato dal sistema (non una pausa grammaticale pulita). Termina SEMPRE con "…". Limiti tier-based: testo ≤400 char orig→max 60; 401-1500→max 120; >1500→max 150. Zero modifiche al testo originale.'
              },
              relazioni: {
                type: 'integer',
                minimum: 0,
                maximum: 5,
                description: 'Valutazione relazioni (amore, famiglia, amicizie). 0=non menzionato. 1=conflitti/rotture. 2=tensioni/distanze. 3=stabilità neutra. 4=connessioni positive/sintonia. 5=momenti trasformativi/gioia intensa. Usa tutta la scala.'
              },
              lavoro: {
                type: 'integer',
                minimum: 0,
                maximum: 5,
                description: 'Valutazione lavoro (carriera, finanze, progetti). 0=non menzionato. 1=crisi/conflitti/perdite. 2=ostacoli/ritardi. 3=routine neutra. 4=progressi/opportunità. 5=svolte/successi eccezionali. Usa tutta la scala.'
              },
              benessere: {
                type: 'integer',
                minimum: 0,
                maximum: 5,
                description: 'Valutazione benessere (energia, umore, vitalità). 0=non menzionato. 1=esaurimento/ansia paralizzante. 2=stanchezza/malumore. 3=equilibrio neutro. 4=energia positiva/ottimismo. 5=picco di benessere/euforia. Usa tutta la scala.'
              },
              tone: {
                type: 'string',
                enum: ['positive', 'negative', 'neutral'],
                description: 'Tono generale. positive=favorevole (almeno un rating≥4). negative=difficile (almeno un rating≤2). neutral=nella norma (rating attorno a 3). Deve essere coerente con i rating assegnati.'
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

    const parsed = toolBlock.input as Record<string, unknown>;

    // Process summary (incipit) — enforce tier-based limits with snippet truncation
    let summary = (parsed.summary as string) || '';
    const originalLength = input.extracted_text.length;
    let summaryLimit = 150; // default for >1500
    
    if (originalLength <= 400) {
      summaryLimit = 60;
    } else if (originalLength <= 1500) {
      summaryLimit = 120;
    }
    
    if (summary.length > summaryLimit) {
      summary = summary.substring(0, summaryLimit);
      if (!summary.endsWith('…')) {
        summary = summary.trimEnd() + '…';
      }
    } else {
      summary = summary.replace(/[.!?…]*$/, '') + '…';
    }

    // Process superquote — enforce 70-160 char limits
    let superquote = (parsed.superquote as string) || '';
    if (superquote.length > 160) {
      const sentences = superquote.match(/[^.!?]+[.!?]+/g) || [];
      let trimmed = '';
      for (const sentence of sentences) {
        if ((trimmed + sentence).length <= 160) {
          trimmed += sentence;
        } else {
          break;
        }
      }
      superquote = trimmed.trim() || superquote.slice(0, 159) + '.';
    }

    // Deterministic rule check — replace with fallback if violation detected
    const violation = hasRuleViolations(superquote);
    if (violation) {
      console.warn(`[Claude] Superquote violation (${violation}) — using fallback: "${superquote}"`);
      superquote = getRandomFallbackSuperquote();
    }

    if (superquote.length < 70) {
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
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

const FALLBACK_SUPERQUOTES = [
  "C'è più equilibrio intorno a te di quanto percepisci. Usalo per costruire qualcosa che dura.",
  "Qualcosa si muove in silenzio, anche quando tutto sembra fermo. Fidati del processo.",
  "Non tutto è come appare: dentro di te c'è più chiarezza di quanta ne mostri fuori.",
  "Il momento richiede pazienza, ma la direzione è quella giusta. Continua.",
  "Anche nelle giornate neutre si costruisce qualcosa. Non sottovalutare ciò che stai seminando."
];

function getRandomFallbackSuperquote(): string {
  return FALLBACK_SUPERQUOTES[Math.floor(Math.random() * FALLBACK_SUPERQUOTES.length)];
}

const NEUTRAL_FALLBACK: OpenAIOutput = {
  superquote: 'C\'è più equilibrio intorno a te di quanto percepisci. Usalo per costruire qualcosa che dura.',
  summary: 'Le previsioni di oggi non sono disponibili.',
  ratings: { relazioni: 0, lavoro: 0, benessere: 0 },
  tone: 'neutral' as const,
};

function isInvalidText(text: string): boolean {
  if (text.length < 30) {
    return true;
  }
  const hasHoroscopeKeywords = /\b(oroscopo|previsioni|stelle|fortuna|amore|lavoro|salute|giornata|periodo|energia|voto|destino|luna|sole|pianeti|segno|zodiaco|oggi|domani|settimana|relazioni|carriera|benessere|marte|venere|saturno|giove|mercurio|plutone|nettuno|urano|ariete|toro|gemelli|cancro|leone|vergine|bilancia|scorpione|sagittario|capricorno|acquario|pesci)\b/i.test(text.toLowerCase());
  const hasAstrologicalContent = /\b(pianeta|congiunzione|quadratura|trigono|sestile|casa|cuspide|transiti?|aspetti?|influssi?|influenze?|configurazioni?|astri|cielo|combinazione|astrologica|energia|vitalità|serenità|nervosismo|ansia|felicità|tristezza|preoccupazioni|ottimismo|passione)\b/i.test(text);
  const hasNavigationWords = /\b(menu|naviga|accedi|iscriviti|abbonati|cookie|privacy|pubblicità|home|sezioni|login|registrati|newsletter|social)\b/i.test(text.toLowerCase());
  const hasPaywallWords = /\b(per leggere|abbonati|registrati|accesso|premium|paywall|login|iscriviti|wall|visualizzare|dispositivo|abbonamento|collegato a questo|continuare a leggere|piano di abbonamento|altro accesso)\b/i.test(text.toLowerCase());
  if (!hasHoroscopeKeywords && !hasAstrologicalContent &&
      ((hasNavigationWords && text.length < 60) || (hasPaywallWords && text.length < 50))) {
    const reason = hasNavigationWords && text.length < 60 ? 'navigazione' : 'paywall';
    return true;
  }
  return false;
}

/**
 * Deterministic filter that detects superquote violations of hard rules.
 * Returns the violation name if found, null otherwise.
 * Detects: conditional verbs, ellipsis ending (incipit format), astrological jargon.
 */
function hasRuleViolations(superquote: string): string | null {
  // Conditional verbs — hard ban in the prompt
  if (/\b(potresti|potrebbe|potrebbero|dovresti|dovrebbe|dovrebbero|avresti|avrebbe|avrebbero|saresti|sarebbe|sarebbero|forse)\b/i.test(superquote)) {
    return 'conditional';
  }
  // Ending with "…" — that's the incipit format, not the superquote
  if (superquote.trim().endsWith('…')) {
    return 'ends_with_ellipsis';
  }
  // Truncated like an incipit (preposition + period as last word)
  if (/\s(a|di|per|con|in|tra|fra|su|da)\.\s*$/i.test(superquote.trim())) {
    return 'truncated_like_incipit';
  }
  // Technical astrological jargon (planet names and metaphors are OK, but tech terms aren't)
  if (/\b(trigono|sestile|quadratura|congiunzione|ascendente|cuspide|decade)\b/i.test(superquote)) {
    return 'astrological_jargon';
  }
  return null;
}

function postProcessOutput(parsed: Record<string, unknown>, originalLength?: number): OpenAIOutput {
  let summary = (parsed.summary as string) || '';
  
  // Calculate tier-based summary limit
  let summaryLimit = 150; // default for >1500
  if (originalLength != null) {
    if (originalLength <= 400) {
      summaryLimit = 60;
    } else if (originalLength <= 1500) {
      summaryLimit = 120;
    }
  }
  
  if (summary.length > summaryLimit) {
    summary = summary.substring(0, summaryLimit);
    if (!summary.endsWith('…')) {
      summary = summary.trimEnd() + '…';
    }
  } else {
    summary = summary.replace(/[.!?…]*$/, '') + '…';
  }

  let superquote = (parsed.superquote as string) || '';
  if (superquote.length > 160) {
    const sentences = superquote.match(/[^.!?]+[.!?]+/g) || [];
    let trimmed = '';
    for (const sentence of sentences) {
      if ((trimmed + sentence).length <= 160) {
        trimmed += sentence;
      } else {
        break;
      }
    }
    superquote = trimmed.trim() || superquote.slice(0, 159) + '.';
  }

  // Deterministic rule check — replace with fallback if violation detected
  const violation = hasRuleViolations(superquote);
  if (violation) {
    console.warn(`[Claude] Superquote violation (${violation}) — using fallback: "${superquote}"`);
    superquote = getRandomFallbackSuperquote();
  }

  if (superquote.length < 70) {
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

  const results: OpenAIOutput[] = inputs.map(() => ({ ...NEUTRAL_FALLBACK, superquote: getRandomFallbackSuperquote(), ratings: { ...NEUTRAL_FALLBACK.ratings } }));

  const validEntries: { index: number; input: OpenAIInput }[] = [];
  for (let i = 0; i < inputs.length; i++) {
    if (isInvalidText(inputs[i].extracted_text)) {
    } else {
      validEntries.push({ index: i, input: inputs[i] });
    }
  }

  if (validEntries.length === 0) return results;


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
                  superquote: { type: 'string' as const, description: 'Frase ORIGINALE che cattura ciò che il lettore vivrà oggi. DEVE suonare come italiano vero parlato da una persona reale — niente "poesia da AI". Concreto non suggestivo, una sola idea chiara, ogni frase regge il senso letterale. Lettore soggetto, niente oggetti astratti animati. 70-160 caratteri, punto finale (NON "…"). Riferimenti astrologici ammessi in frasi italiane sensate, vietato il jargon tecnico (trigono, sestile, ascendente, decade, transito). Zero condizionali, femminile di default, verbi corretti.' },
                  summary: { type: 'string' as const, description: 'Snippet stile anteprima: riproduzione verbatim delle prime parole originali, troncate PRIMA della prima previsione, stile testo tagliato dal sistema. Termina con "…". Limiti tier-based: ≤400 orig→60 char; 401-1500→120; >1500→150.' },
                  relazioni: { type: 'integer' as const, minimum: 0, maximum: 5, description: '0=non menzionato. 1=conflitti. 2=tensioni. 3=neutro. 4=positivo. 5=eccellente. Usa tutta la scala.' },
                  lavoro: { type: 'integer' as const, minimum: 0, maximum: 5, description: '0=non menzionato. 1=crisi. 2=ostacoli. 3=neutro. 4=progressi. 5=successi eccezionali. Usa tutta la scala.' },
                  benessere: { type: 'integer' as const, minimum: 0, maximum: 5, description: '0=non menzionato. 1=esaurimento. 2=stanchezza. 3=neutro. 4=energia positiva. 5=picco benessere. Usa tutta la scala.' },
                  tone: { type: 'string' as const, enum: ['positive', 'neutral', 'negative'], description: 'positive→almeno un rating≥4. negative→almeno un rating≤2. neutral→rating attorno a 3.' },
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


  const batchResults = (toolBlock.input as { results: Record<string, unknown>[] }).results;
  for (const parsed of batchResults) {
    const sourceIndex = (parsed.source_index as number) - 1; // 1-based → 0-based
    const entry = validEntries[sourceIndex];
    if (!entry) {
      console.warn(`[Claude Batch] source_index ${parsed.source_index} non corrisponde a nessuna fonte valida`);
      continue;
    }
    try {
      results[entry.index] = postProcessOutput(parsed, entry.input.extracted_text.length);
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
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}