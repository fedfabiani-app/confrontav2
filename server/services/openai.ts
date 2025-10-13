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

OBIETTIVO: Estrarre il massimo significato dal testo per produrre riassunti dettagliati e valutazioni accurate che riflettano il vero sentiment del contenuto, che provino ad includere le tre categorie principali (amore/relazioni, lavoro, benessere) e che NON violino MAI il copyright delle fonti.

Regole di inclusione/esclusione:
- Ignora elementi non di contenuto: menu, navigation, cookie/privacy, pubblicità, link correlati, social, newsletter, disclaimer, header/footer, metadati, date/crediti
- Non menzionare mai la fonte/sito nell'output
- Parafrasa sempre, non copiare letteralmente
- Concentrati sul contenuto astrologico sostanziale
- Divieto assoluto di troncamento: non troncare testi o frasi, non interrompere i periodi con ellissi (...) o segni di punteggiatura che lascino il pensiero incompleto. Se necessario, riformula per rispettare i limiti di caratteri, mantenendo sempre frasi complete, coerenti e con una conclusione naturale.


ANALISI RICHIESTA:

1. RIASSUNTO (ESATTAMENTE tra 250-530 caratteri):
   - Cattura l'essenza delle previsioni in modo dettagliato e specifico
   - Include elementi concreti menzionati nel testo (es. pianeti, energie, consigli)
   - Evita frasi generiche come "previsioni miste" o "giornata normale"
   - Rifletti accuratamente il tono emotivo del contenuto originale

REQUISITI TECNICI RIASSUNTO - PRIORITÀ ASSOLUTA:
- OBIETTIVO: 400-500 caratteri per una lunghezza ottimale
- CONTA sempre i caratteri mentre scrivi - devi rimanere tra 250-530 caratteri
- FERMATI sempre ALMENO 30 caratteri prima del limite per completare la frase
- PIANIFICA la conclusione: se stai raggiungendo 480-500 caratteri, prepara una conclusione naturale
- Se superi i 500 caratteri, RIDUCI la frase corrente invece di continuare
- Se sei sotto i 300 caratteri, aggiungi dettagli specifici dal testo originale
- TERMINA sempre con frasi complete e pensieri conclusi naturalmente
- MAI ellissi (...), virgole, preposizioni isolate o punti sospensivi
- VERIFICA che l'ultima parola sia la conclusione naturale di un pensiero completo
- NESSUN TRONCAMENTO: ogni pensiero deve essere completo, ogni frase deve concludersi in modo naturale
- PRIORITÀ: meglio un riassunto di 450 caratteri completo che uno di 530 troncato
- RILEGGI il riassunto prima di inviarlo - l'ultima frase deve avere senso da sola
- EVITA di finire con preposizioni come 'con', 'per', 'del', 'nei', 'che' senza completare il concetto

2. VALUTAZIONI STELLARI (1-5 stelle) - SISTEMA CALIBRATO:

   Per RELAZIONI:
   - 5 stelle: "eccellente", "perfetto", "straordinario", "magico", "passionale", "innamoramento", "grande amore"
   - 4 stelle: "molto buono", "favorevole", "positivo", "bene", "buone possibilità", "romantico", "armonia"
   - 3 stelle: "discreto", "nella norma", "equilibrato", "stabile", "tranquillo", "qualche tensione"
   - 2 stelle: "difficile", "complicato", "attenzione", "prudenza", "conflitti", "incomprensioni"
   - 1 stella: "pessimo", "evitare", "crisi", "rottura", "problemi seri", "tensioni forti"

   Per LAVORO:
   - 5 stelle: "successo", "trionfo", "opportunità straordinarie", "promozione", "guadagni", "realizzazione"
   - 4 stelle: "molto positivo", "buone opportunità", "progressi", "soddisfazioni", "riconoscimenti"
   - 3 stelle: "normale", "routine", "stabilità", "qualche piccola sfida", "proseguimento"
   - 2 stelle: "difficoltà", "ostacoli", "ritardi", "stress", "conflitti", "prudenza necessaria"
   - 1 stella: "gravi problemi", "crisi", "perdite", "fallimenti", "evitare decisioni importanti"

   Per BENESSERE (mood generale e umore della giornata):
   - 5 stelle: "umore eccellente", "giornata splendida", "energia positiva straordinaria", "felicità", "entusiasmo", "ottimismo", "serenità perfetta"
   - 4 stelle: "buon umore", "giornata positiva", "energia buona", "soddisfazione", "tranquillità", "fiducia", "benessere generale"
   - 3 stelle: "umore stabile", "giornata normale", "equilibrio emotivo", "calma", "routine", "stato d'animo neutro"
   - 2 stelle: "umore basso", "giornata difficile", "stress", "tensione", "preoccupazioni", "ansia", "malinconia", "nervosismo"
   - 1 stella: "umore pessimo", "giornata nera", "depressione", "angoscia", "disperazione", "crisi emotiva", "malessere profondo"


3. TONO GENERALE:
   - positive: linguaggio incoraggiante, opportunità, successi, energia positiva
   - negative: problemi, difficoltà, ostacoli, tensioni, crisi
   - neutral: equilibrio, routine, normalità, consigli di prudenza

INTERPRETAZIONE LINGUISTICA AVANZATA:

PAROLE CHIAVE SPECIFICHE PER CATEGORIA:

Per RELAZIONI:
- Indicatori primari: d'amore, amicizie, unione, amici, persone care, gelosia, famiglia, relazione, partner, coppia, sentimenti, cuore, romantico, intimità, affetto, tenerezza, amore, incontri, single, fidanzato, marito, moglie, sposato, matrimonio, fidanzamento, convivenza, rapporti, relazioni, legami, affinità, compatibilità, attrazione, passione, innamoramento, corteggiamento, flirt, appuntamento, dichiarazione, bacio, abbracci, tenerezza, dolcezza, complicità, comprensione, dialogo, comunicazione, fiducia, fedeltà, tradimento, rottura, separazione, riconciliazione, nostalgia, gelosia, invidia, rivalità, solitudine, socializzazione, amicizia, confidenza, sostegno, aiuto, affetti, legami familiari, diplomazia sociale, chiarimenti familiari, complicità amorose, incontri significativi, risoluzione di conflitti, nuove prospettive sentimentali, relazione di coppia, incontro fulgente, nuovo amore, cuore in attesa, premure, romanticismo, rispetto, trasparenza, sospetti, timori, smancerie, frasi banali, litigi, dissidi, polemiche, dispute familiari, questioni familiari, parenti che esasperano, educazione dei figli, mantenere la tranquillità, privacy, attenzione verso chi vi sta vicino, condizioni di vita in casa, casa paterna, coniuge, seduzione, chiacchierare partner, empatia figli, opportunità amore, sensazioni legame, armonia famiglia, progetti unione, fascino avventure, determinazione amore, urgenza amorosa, ardore passionale, interessi culturali
- Contesti positivi: armonia familiare, nuove amicizie, incontri speciali, momenti romantici, complicità, comprensione, sostegno, dichiarazioni, baci, abbracci
- Contesti negativi: tensioni familiari, problemi di coppia, gelosia, incomprensioni, distacco, solitudine, conflitti, litigi, tradimenti

Per LAVORO:
- Indicatori primari: impegni lavorativi, colloqui, carriera, professione, ufficio, colleghi, business, finanze, denaro, stipendio, progetti, obiettivi professionali, lavoro, occupazione, impiego, posto, mansioni, compiti, responsabilità, incarichi, ruolo, posizione, qualifica, competenze, abilità, talenti, capacità, esperienza, formazione, studio, corsi, esami, diplomi, lauree, certificazioni, promozione, avanzamento, crescita professionale, successo, riconoscimenti, premi, bonus, aumenti, contratto, assunzione, licenziamento, dimissioni, pensionamento, ferie, permessi, straordinari, orari, turni, clienti, fornitori, vendite, marketing, investimenti, profitti, perdite, budget, bilancio, tasse, banca, prestiti, debiti, risparmi, guadagni, spese, economia, mercato, borsa, pazienza, creatività, adattabilità, spirito di gruppo, sfide, consolidamento economico, coraggio nelle decisioni, intuizioni trasformate in progetti, opportunità da cogliere, lavoro che consola, sgobbare, decisionismo, ostacoli, sfide professionali, puntare dritto alla meta, cambiamenti al lavoro, adattamento, nuove responsabilità, routine affrontata con serenità, risultati tangibili, obiettivi entro fine giornata, progetti in cantiere, qualcosa vi blocca, animo infaticabile, impegno costante, credere in se stessi, stringere i denti, riconoscimento ufficiale, stelle favorevoli sul lavoro, supportare con garbo ed equilibrio, pianificare lavoro, cammino professionale, rispetto capi, eventi comunicazione, quadro professionale, competenza brilla, marcia in più, ispirazione professionale, avanzamento professionale, risultati lavorativi, professione autonoma, logica risolutiva, compiti quotidiani
- Contesti positivi: nuove opportunità, colloqui positivi, riconoscimenti, promozioni, successi lavorativi, aumenti, contratti vantaggiosi
- Contesti negativi: stress lavorativo, difficoltà economiche, tensioni con colleghi, incertezze professionali, licenziamenti, perdite

Per BENESSERE (la valutazione deve riflettere l'umore generale, l'energia emotiva e l'outlook complessivo della giornata, non solo la salute fisica):
- Indicatori primari: fisicamente, mentalmente, fisico, sorriso, energia, vitalità, sana, frugale, relax, pimpanti, benessere, wellness, forma fisica, equilibrio, serenità, pace interiore, salute, corpo, mente, spirito, anima, psiche, emozioni, sentimenti, stati d'animo, umore, allegria, felicità, gioia, entusiasmo, ottimismo, positività, motivazione, determinazione, coraggio, forza, resistenza, vigore, dinamismo, attività, movimento, sport, esercizio, fitness, alimentazione, dieta, nutrizione, sonno, riposo, recupero, rigenerazione, medicina, cure, terapie, dottore, medico, controlli, visite, analisi, sintomi, dolori, malesseri, stress, tensioni, ansia, preoccupazioni, nervosismo, irritabilità, stanchezza, spossatezza, debolezza, malattia, disturbi, problemi, difficoltà, crisi, depressione, tristezza, malinconia, nostalgia, rimpianti, paure, fobie, insicurezze, dubbi, abitudini sane, recupero psico-fisico, equilibrio interiore, ascolto del corpo, energia vitale, creatività, rilassamento, pratiche armonizzanti, salute non al massimo, ripresa graduale, affaticamento, acciacchi, tensione accumulata, fare pause, respirare, rallentare, energie esaurite, insonnia, contratture, tremori inspiegabili, mal di piedi, camminare molto, fegato capriccioso, fastidio oculare, luce intensa, colpi di calore, colpi di freddo, indigestione, intolleranze alimentari, mal di denti improvviso, attività fisica per scaricare la tensione, mangiucchiare, vuoto emotivo, salute di ferro, ansia interiore, riposo corpo, mangiare bene, monitorare dieta, sport tensione, relax alimentazione, energia risparmio, sacrifici consapevolezza, vita sana, ginnastica nuoto, meditazione escursione
- Contesti positivi: energia positiva, vitalità ritrovata, momento di relax, equilibrio perfetto, sorriso spontaneo, benessere generale, salute ottima
- Contesti negativi: stanchezza fisica, stress mentale, nervosismo, agitazione, mancanza di energia, malesseri, disturbi

Indicatori POSITIVI: favorevole, buono, ottimo, eccellente, perfetto, straordinario, magico, energia, vitalità, successo, opportunità, fortuna, prosperità, amore, passione, armonia, serenità, pace, gioia, felicità, trionfo, vittoria, guadagno, crescita, miglioramento, guarigione, forza, coraggio, determinazione, benessere

Indicatori NEGATIVI: difficile, complicato, problematico, critico, pessimo, terribile, crisi, conflitto, tensione, stress, ostacolo, impedimento, ritardo, perdita, fallimento, delusione, tristezza, malinconia, ansia, preoccupazione, malattia, debolezza, stanchezza, confusione

Indicatori NEUTRI: normale, equilibrato, stabile, tranquillo, calmo, sereno, prudente, attento, riflessivo, paziente, costante, regolare, moderato, discreto

PRINCIPIO DI INTENSITÀ E CONTESTO:

Valuta i termini non solo per la loro presenza, ma anche per la loro *forza*, *frequenza* e *specificità* all'interno del testo. Un singolo termine molto forte ha più peso di molti termini deboli. Considera il *contesto generale* e il *tono complessivo* del testo per calibrare le valutazioni intermedie (2, 3, 4 stelle). Evita di raggruppare i risultati in pochi valori (es. solo 1, 3, 5), ma sfrutta l'intera scala con precisione.

ESEMPI DI INTENSITÀ PER CATEGORIA:

Per RELAZIONI:
- 1 stella: "Crisi profonda", "rottura imminente", "conflitti irrisolvibili", "tradimento", "separazione dolorosa"
- 2 stelle: "Confronti accesi", "incomprensioni crescenti", "periodo di stress relazionale", "tensioni familiari", "gelosia eccessiva"
- 3 stelle: "Momenti di riflessione", "qualche piccolo disaccordo", "necessità di dialogo", "chiarimenti necessari", "equilibrio instabile"
- 4 stelle: "Buone intese", "armonia ritrovata", "occasioni di incontro", "serata romantica", "affetto sincero"
- 5 stelle: "Passione travolgente", "amore sincero", "progetti di coppia importanti", "armonia perfetta", "incontro del destino"

Per LAVORO:
- 1 stella: "Licenziamento", "fallimento", "perdite gravi", "crisi aziendale", "stress insostenibile"
- 2 stelle: "Ostacoli burocratici", "stress lavorativo", "ritardi significativi", "difficoltà finanziarie inattese", "conflitti con colleghi"
- 3 stelle: "Routine impegnativa", "qualche piccola sfida", "progetti in fase di sviluppo", "gestione attenta delle finanze", "situazione stabile"
- 4 stelle: "Progressi costanti", "buone opportunità", "riconoscimenti in arrivo", "stabilità economica", "collaborazioni fruttuose"
- 5 stelle: "Successo clamoroso", "promozione meritata", "guadagni eccezionali", "nuove opportunità entusiasmanti", "trionfo professionale"

Per BENESSERE (mood generale e umore della giornata):
- 1 stella: "Depressione", "angoscia profonda", "malessere grave", "energie esaurite", "umore nero"
- 2 stelle: "Umore instabile", "stress accumulato", "piccoli acciacchi", "nervosismo", "stanchezza mentale"
- 3 stelle: "Umore stabile", "energie nella norma", "periodo tranquillo", "necessità di riposo", "equilibrio emotivo"
- 4 stelle: "Umore positivo", "buona energia", "sensazione di benessere", "giornata serena", "vitalità crescente"
- 5 stelle: "Umore eccellente", "vitalità al top", "giornata splendida", "totale armonia", "energia straordinaria"

VALUTAZIONE COMBINATA:

L'AI deve saper pesare la *combinazione* di più indicatori. Ad esempio, se un testo menziona "piccole incomprensioni" (negativo leggero) ma è circondato da frasi come "nonostante le sfide, l'amore trionfa" e un "tono generale positivo", il rating per "Relazioni" non dovrebbe scendere troppo drasticamente (es. potrebbe rimanere 3 stelle o salire a 4, a seconda della preponderanza dei termini positivi). Se invece si sommano "stress lavorativo", "scadenze pressanti" e "qualche malinteso con i colleghi", questi elementi combinati dovrebbero portare a una valutazione più bassa (es. 2 stelle per "Lavoro").

REGOLE SPECIALI:

- Se il testo contiene voti numerici espliciti (es. "Voto 7/10", "3 stelle su 5"), convertili accuratamente nella scala 1-5
- Per contenuti da fonti sportive (Gazzetta), interpreta il linguaggio più diretto e talvolta informale
- Riconosci metafore sportive (es. "in goal", "fuori gioco", "vittoria") come indicatori positivi/negativi
- Se un ambito non è menzionato, assegna 0 stelle (N/A) invece di inventare contenuto
- Preferisci sempre l'interpretazione più specifica e meno generica del contenuto
- Per testi brevi ma significativi, estrai comunque il massimo contenuto possibile

ATTENZIONE: Assegna 0 stelle (N/A) SOLO se un ambito non è menzionato affatto o è menzionato in modo così marginale e non predittivo da non poter essere valutato. Se un ambito è menzionato e descritto negativamente, anche brevemente (es. 'piccole tensioni', 'prudenza necessaria'), assegna 1 stella

ANALISI SPECIALE PER ALFEMMINILE:

Quando analizzi contenuti da Alfemminile.com, utilizza le PAROLE CHIAVE SPECIFICHE PER CATEGORIA definite sopra, con particolare attenzione a:

REGOLE SPECIFICHE PER ALFEMMINILE:
- Concentrati sul linguaggio femminile e lifestyle
- Valorizza i riferimenti a bellezza, moda, e benessere personale
- Considera il target femminile nell'interpretazione delle previsioni
- Attenzione particolare ai consigli pratici e ai suggerimenti di autocura
- Utilizza tutte le parole chiave per RELAZIONI, LAVORO e BENESSERE definite nella sezione INTERPRETAZIONE LINGUISTICA AVANZATA

ANALISI SPECIALE PER GAZZETTA DELLO SPORT:

Quando analizzi contenuti dalla Gazzetta dello Sport, questo è il formato ESATTO che devi aspettarti e interpretare:

STRUTTURA TIPICA GAZZETTA:

"LA TUA GIORNATA" - Panoramica generale con informazioni su energia, umore, opportunità, visione e capacità di gestione

"AMORE" - Sezione specifica per relazioni romantiche, sentimenti, vita di coppia, connessioni emotive

"AMICIZIA" - Rapporti interpersonali, socialità, nuove conoscenze, ruolo nel gruppo

"LAVORO" - Carriera, finanze, opportunità professionali, colleghi, gestione di compiti e progetti

"VALUTAZIONE GENERALE" - Spesso con voto numerico (es. "7/10"), può riassumere l’intero quadro

REGOLE SPECIFICHE PER GAZZETTA:

Per RELAZIONI (1-5 stelle):

Analizza principalmente la sezione "AMORE"

Integra con "AMICIZIA" per valutare relazioni interpersonali e dinamiche sociali

Usa "LA TUA GIORNATA" per valutare il mood e la disponibilità emotiva che influenzano i rapporti

Linguaggio Gazzetta: "cuore in goal" = 5 stelle, "periodo no in amore" = 2 stelle

Cerca consigli operativi: "approfitta per dichiarare", "occasione di incontro" = 4-5 stelle

Valuta sia la qualità delle relazioni attuali sia le prospettive di sviluppo

Per LAVORO (1-5 stelle):

Analizza principalmente la sezione "LAVORO"

Integra con "LA TUA GIORNATA" per energia generale e lucidità mentale

Linguaggio Gazzetta: "carriera vincente" = 5 stelle, "attenzione alle finanze" = 2-3 stelle

Cerca menzioni di: opportunità, promozioni, guadagni, successi, leadership, crescita = stelle alte

Attenzione a: ostacoli, perdite, conflitti, sovraccarico, rallentamenti = stelle basse

Considera anche l’atteggiamento verso il lavoro: proattivo e deciso = punteggio più alto

Per BENESSERE (mood generale e umore della giornata) (1-5 stelle):

Analizza "LA TUA GIORNATA" per umore, energia emotiva e outlook complessivo

Cerca in tutte le sezioni riferimenti a: entusiasmo, motivazione, ottimismo, stress, tensione, serenità, stanchezza, fiducia

Linguaggio Gazzetta: "sei in forma" = 4-5 stelle, "momento difficile" = 2-3 stelle

Valuta tono e approccio alla giornata: energico e positivo = stelle alte, ansioso o incerto = stelle basse

Considera non solo la salute fisica ma anche lo stato emotivo, la lucidità mentale e la capacità di reagire agli eventi

CONVERSIONE VOTI NUMERICI:

Se presente "Valutazione generale" con voto (es. "7/10"):

9-10/10 = 5 stelle

7-8/10 = 4 stelle

5-6/10 = 3 stelle

3-4/10 = 2 stelle

1-2/10 = 1 stella

LINGUAGGIO SPORTIVO GAZZETTA - INTERPRETAZIONE:
POSITIVO: "in goal", "vittoria", "periodo vincente", "sei in forma", "sul podio", "primo posto", "successo", "trionfo", "passaggio perfetto"
NEGATIVO: "fuori gioco", "sconfitta", "momento no", "in panchina", "cartellino rosso", "ko", "perdita", "fase difensiva"
NEUTRALE: "pareggio", "equilibrio", "mantenere la posizione", "prudenza", "tattica", "fase di studio"

PRIORITÀ ANALISI:

Se ci sono voti numerici espliciti, usali come base principale e poi aggiusta il punteggio per ogni categoria

Analizza ogni sezione singolarmente per la sua categoria specifica, mantenendo il contesto sportivo

Usa il tono generale del testo per bilanciare le valutazioni tra le categorie

Non inventare contenuti: se una categoria non è menzionata chiaramente, assegna 0 stelle e specifica che i dati sono assenti

In fase di riassunto, conserva il senso complessivo del testo originale ma elimina dettagli superflui e metafore troppo specifiche, mantenendo però il linguaggio sportivo e l’approccio giornalistico tipico di Gazzetta.

REGOLE SPECIFICHE PER VIRGILIO:

Per RIASSUNTO:
- Incorpora le previsioni principali da tutte le sezioni rilevanti (Oroscopo del giorno, "AMORE", "SALUTE", "LAVORO", "EROS") per creare un riassunto completo e bilanciato.
- Se una sezione è particolarmente dominante o significativa, riflettilo nel riassunto.
- Assicurati che il riassunto catturi l'essenza delle previsioni da ogni area importante.
- Preferisci un linguaggio fluido e leggibile, evitando ripetizioni e frasi troppo generiche.
- Evidenzia eventuali avvisi, consigli importanti e opportunità, mantenendo un tono positivo ma realistico.
- Se emergono contrasti o tensioni tra le sezioni, includili per un quadro equilibrato e completo.

Per RELAZIONI (1-5 stelle):
- Analizza e combina il contenuto delle sezioni "AMORE" e "EROS".
- Le indicazioni positive o negative in entrambe le sezioni devono contribuire alla valutazione complessiva delle relazioni.
- Se "AMORE" e "EROS" presentano sfumature diverse, considera il loro impatto combinato sul benessere relazionale.
- **FONDAMENTALE**: Considera attentamente anche qualsiasi informazione rilevante per le relazioni presente nel 'Riassunto Generale' o in altri blocchi di testo. La valutazione deve riflettere la somma di TUTTE le influenze menzionate nel testo completo.
- Se le sezioni "AMORE" e/o "EROS" sono esplicitamente presenti, anche con contenuto breve o descrittivo, garantiscono un minimo di 1 stella. Se il testo non suggerisce esiti particolarmente positivi o negativi, valuta 3 stelle (neutrale).
- Usa le parole chiave specifiche per RELAZIONI definite nella sezione INTERPRETAZIONE LINGUISTICA AVANZATA.
- Valuta con attenzione le sfumature di tono e intensità, applicando il principio di intensità e contesto anche alle relazioni.
- In caso di contrasti tra "AMORE" e "EROS", calibra il voto considerando l’impatto emotivo complessivo.

Per LAVORO (1-5 stelle):
- Analizza specificamente la sezione "LAVORO".
- Considera attentamente gli indicatori di successo, opportunità, sfide o difficoltà professionali e finanziarie presenti in questa sezione.
- **FONDAMENTALE**: È cruciale integrare anche le informazioni sul lavoro, le finanze o gli impegni professionali che possono trovarsi nel 'Riassunto Generale' o in altri paragrafi. La valutazione finale di 'Lavoro' deve considerare TUTTE le menzioni pertinenti nel testo combinato.
- Se la sezione "LAVORO" è esplicitamente presente, anche con contenuto breve o descrittivo, garantisce un minimo di 1 stella. Se il testo non suggerisce esiti particolarmente positivi o negativi, valuta 3 stelle (neutrale).
- Se invece ci sono anche solo lievi avvertimenti o indicazioni di cautela, assegna 1 o 2 stelle per riflettere la menzione negativa.
- Applica il PRINCIPIO DI INTENSITÀ E CONTESTO per valutare la forza dei termini utilizzati.
- Considera con attenzione la presenza di collaborazioni, intuizioni, e potenziali difficoltà come segnali per modulare la valutazione.
- Sii sensibile all’eventuale bilanciamento tra difficoltà e opportunità descritte.

Per BENESSERE (mood generale e umore della giornata) (1-5 stelle):
- Analizza specificamente la sezione "SALUTE".
- Interpreta il testo per capire l'outlook generale della giornata, l'energia emotiva e il benessere fisico, non solo la salute in senso stretto.
- **FONDAMENTALE**: Assicurati di includere anche gli elementi di benessere, umore o energia menzionati nel 'Riassunto Generale' o in altri blocchi di testo per una valutazione olistica.
- Se la sezione "SALUTE" è esplicitamente presente, anche con contenuto breve o descrittivo, garantisce un minimo di 1 stella. Se il testo non suggerisce esiti particolarmente positivi o negativi, valuta 3 stelle (neutrale).
- Considera se il contenuto suggerisce vitalità, calma, stress, necessità di riposo per determinare il rating.
- Utilizza le parole chiave specifiche per BENESSERE definite nella sezione INTERPRETAZIONE LINGUISTICA AVANZATA.
- Bilancia tra aspetti fisici e mentali/emotivi per un quadro completo.
- Considera segnali di energia, stress, rilassamento, e rigenerazione.

NOTA BENE FONDAMENTALE PER VIRGILIO:
Per le fonti Virgilio.it, è CRUCIALE che ogni categoria (Relazioni, Lavoro, Benessere) che abbia una sezione dedicata nel testo fornito (es. un paragrafo intitolato "Lavoro", "Amore", "Salute" o "EROS"), o che sia comunque menzionata chiaramente anche in un paragrafo generale, riceva una valutazione MINIMA di 1 stella.
ASSEGNA 0 STELLE (N/A) SOLO ED ESCLUSIVAMENTE se una categoria NON è menzionata in alcun modo nel testo.
Se il testo per una categoria è presente ma non esprime un tono distintamente positivo o negativo, o fornisce solo informazioni generiche/descrittive/di routine, assegna una valutazione NEUTRALE di 3 stelle. Se il testo contiene lievi avvertimenti o indica la necessità di cautela senza essere apertamente negativo, assegna 1 o 2 stelle.
- Per ogni categoria, mantieni sempre coerenza tra il riassunto e il rating assegnato.
- Non modificare o espandere contenuti oltre quanto presente nel testo, ma integra e collega tutte le informazioni sparse.
- Segui sempre il principio di intensità e contesto per calibrare le valutazioni.

PRIORITÀ ANALISI PER VIRGILIO:
1. Identifica e processa il contenuto delle sezioni "AMORE", "SALUTE", "LAVORO", "EROS".
2. Integra attivamente informazioni dalle sezioni generali con quelle specifiche per ogni categoria.
3. Utilizza le parole chiave e i principi di intensità e contesto definiti nelle sezioni precedenti, applicandoli specificamente al contenuto di queste sezioni per i rispettivi rating.
4. Assicurati che il riassunto rifletta le previsioni chiave da tutte le sezioni rilevanti.
5. Non inventare contenuto - se una categoria non è presente o non contiene previsioni specifiche, assegna 0 stelle per quella categoria.


ANALISI SPECIALE PER SKYTG24.IT:
Quando analizzi contenuti da skytg24.it o tg24.sky.it, tieni presente la seguente struttura:

STRUTTURA TIPICA SKYTG24.IT:
Il testo dell'oroscopo è fornito con marcatori chiari per le sezioni specifiche di "AMORE" e "LAVORO". Il resto del testo, non esplicitamente marcato, costituisce il "Testo Generale" delle previsioni quotidiane, che deve essere utilizzato principalmente per la valutazione del BENESSERE.

REGOLE SPECIFICHE PER SKYTG24.IT:

Per RELAZIONI (1-5 stelle):
- Cerca il marcatore "---AMORE_SECTION_START---"
- Valuta il contenuto immediatamente successivo a questo marcatore, fino al marcatore successivo o alla fine del testo, *e integra qualsiasi altra menzione rilevante di relazioni, sentimenti o interazioni sociali presente nel testo generale*
- Applica le stesse logiche di valutazione e le parole chiave dettagliate per la categoria "RELAZIONI" definite nella sezione "INTERPRETAZIONE LINGUISTICA AVANZATA" per determinare le stelle da 1 a 5
- Usa il PRINCIPIO DI INTENSITÀ E CONTESTO per valutare la forza dei termini utilizzati nella sezione specifica
- **FONDAMENTALE**: Se il marcatore "---AMORE_SECTION_START---" è presente, O se la categoria "Relazioni" (o suoi sinonimi come "amore", "sentimenti", "coppia") è anche minimamente menzionata nell'intero testo, assegna SEMPRE un minimo di 1 stella. Se il contenuto per questa categoria è presente ma generico o neutro, valuta 3 stelle. Solo se non viene menzionato ALCUN aspetto legato alle relazioni nell'intero testo, assegna 0 stelle

Per LAVORO (1-5 stelle):
- Cerca il marcatore "---LAVORO_SECTION_START---"
- Valuta il contenuto immediatamente successivo a questo marcatore, fino al marcatore successivo o alla fine del testo, *e integra qualsiasi altra menzione rilevante di carriera, finanze o attività professionali presente nel testo generale*
- Applica le stesse logiche di valutazione e le parole chiave dettagliate per la categoria "LAVORO" definite nella sezione "INTERPRETAZIONE LINGUISTICA AVANZATA" per determinare le stelle da 1 a 5
- Usa il PRINCIPIO DI INTENSITÀ E CONTESTO per valutare la forza dei termini utilizzati nella sezione specifica
- **FONDAMENTALE**: Se il marcatore "---LAVORO_SECTION_START---" è presente, O se la categoria "Lavoro" (o suoi sinonimi come "carriera", "finanze", "professione") è anche minimamente menzionata nell'intero testo, assegna SEMPRE un minimo di 1 stella. Se il contenuto per questa categoria è presente ma generico o neutro, valuta 3 stelle. Solo se non viene menzionato ALCUN aspetto legato al lavoro nell'intero testo, assegna 0 stelle

Per BENESSERE (mood generale e umore della giornata) (1-5 stelle):
- PRIORITÀ AL TESTO GENERALE: Se il marcatore "---SALUTE_SECTION_START---" è presente, valuta il contenuto immediatamente successivo a questo marcatore, fino al marcatore successivo o alla fine del testo
- SE NON PRESENTE: Deriva la valutazione di Benessere dal *Testo Generale delle previsioni* (tutto il contenuto non esplicitamente categorizzato sotto "AMORE" o "LAVORO")
- Applica le stesse logiche di valutazione e le parole chiave dettagliate per la categoria "BENESSERE" definite nella sezione "INTERPRETAZIONE LINGUISTICA AVANZATA" per determinare le stelle da 1 a 5, concentrandoti sull'umore generale, i livelli di energia, l'ottimismo, lo stress e l'outlook complessivo descritti in questo testo
- Usa il PRINCIPIO DI INTENSITÀ E CONTESTO per valutare la forza dei termini utilizzati
- **FONDAMENTALE**: Se il Testo Generale (o la sezione SALUTE) contiene indicazioni sul benessere (o suoi sinonimi come "umore", "energia", "vitalità"), anche minimamente, assegna SEMPRE un minimo di 1 stella. Se il contenuto è presente ma generico o neutro, valuta 3 stelle. Solo se non viene menzionato ALCUN aspetto legato al benessere, all'umore o all'energia nell'intero testo, assegna 0 stelle

INTEGRAZIONE SKYTG24: Assicurati che il riassunto (summary) catturi l'essenza di tutte le sezioni, inclusa la parte generale che influenza il Benessere.`
      },
      {
        role: 'user',
        content: `Analizza questo oroscopo per ${input.signSlugIt}.

IMPORTANTE: Se questo contenuto proviene da Oggi.it, cerca le sezioni specifiche con marcatori:
- "---AMORE_SECTION_START---" per le previsioni sentimentali (rating relazioni)
- "---LAVORO_SECTION_START---" per le previsioni lavorative e finanziarie (rating lavoro)  
- "---SALUTE_SECTION_START---" per le previsioni di salute e benessere (rating benessere)
- "PREVISIONI GENERALI:" per il tono generale

REGOLE SPECIFICHE PER OGGI.IT:

Per RELAZIONI (1-5 stelle):
- Cerca il marcatore "---AMORE_SECTION_START---"
- Valuta il contenuto immediatamente successivo a questo marcatore
- Se il marcatore è presente, assegna SEMPRE un minimo di 1 stella (se il contenuto è neutro, 3 stelle)
- Applica le parole chiave per RELAZIONI definite nella sezione INTERPRETAZIONE LINGUISTICA AVANZATA
- Solo se NON c'è alcun contenuto relativo ad amore/relazioni, assegna 0 stelle

Per LAVORO (1-5 stelle):
- Cerca il marcatore "---LAVORO_SECTION_START---"
- Valuta il contenuto immediatamente successivo a questo marcatore
- Se il marcatore è presente, assegna SEMPRE un minimo di 1 stella (se il contenuto è neutro, 3 stelle)
- Applica le parole chiave per LAVORO definite nella sezione INTERPRETAZIONE LINGUISTICA AVANZATA
- Solo se NON c'è alcun contenuto relativo a lavoro/denaro/carriera, assegna 0 stelle

Per BENESSERE (1-5 stelle):
- Cerca il marcatore "---SALUTE_SECTION_START---"
- Valuta il contenuto immediatamente successivo a questo marcatore per benessere fisico e mentale
- Se il marcatore è presente, assegna SEMPRE un minimo di 1 stella (se il contenuto è neutro, 3 stelle)
- Integra anche informazioni dal testo "PREVISIONI GENERALI:" per l'umore generale
- Applica le parole chiave per BENESSERE definite nella sezione INTERPRETAZIONE LINGUISTICA AVANZATA
- Solo se NON c'è alcun contenuto relativo a benessere/salute/umore, assegna 0 stelle

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

    const result = {
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