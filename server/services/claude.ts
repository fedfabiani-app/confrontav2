import Anthropic from '@anthropic-ai/sdk';
import { OpenAIInput, OpenAIOutput, openaiOutputSchema } from "@shared/schema";
import prisma from './database';

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
Evita di riprendere combinazioni di parole, frasi fatte o sintagmi
caratteristici dal testo originale: riformula con parole tue, preferendo
sinonimi.

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
□ Hai evitato di riprendere frasi fatte, combinazioni di parole o
  sintagmi caratteristici dall'originale? Hai riformulato con sinonimi
  (o, in casi rari, una metafora concreta)?
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

// Campo 4 "Le stelle dicono" — sintesi comparativa. Usato SOLO nel path
// batch multi-fonte (processMultiSourceHoroscope): il prompt single-source
// (processHoroscopeWithAI) resta su SYSTEM_PROMPT, invariato.
// Period-agnostico tranne poche frasi di esempio: parametrizzato via
// buildCampo4Block invece di essere forkato in due copie complete, per
// evitare divergenza futura ogni volta che si ritocca budget/regole.
function buildCampo4Block(periodType: 'daily' | 'weekly'): string {
  const now = periodType === 'daily' ? 'oggi' : 'questa settimana';
  const nowCap = periodType === 'daily' ? 'Oggi' : 'Questa settimana';
  const span = periodType === 'daily' ? 'giornata' : 'settimana';
  const unit = periodType === 'daily' ? 'giorno' : 'settimana';
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMPO 4 — LE STELLE DICONO (sintesi comparativa)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Si genera UNA SOLA VOLTA per segno, dopo aver analizzato TUTTE le fonti
ricevute in questo batch (non ripetere per singola fonte).

INPUT VINCOLANTE (già calcolato, NON reinterpretare):
Riceverai, per Relazioni/Lavoro/Salute, la media e il livello di
spread (ALTO/BASSO) tra le fonti, già calcolati a monte. Il tuo compito
è raccontare questi dati, non stimarli né correggerli.

CAMPO "consenso" (sempre presente, 90-130 caratteri):
Una frase, che racconta il grado di accordo generale tra le fonti in
linguaggio emotivo, non statistico. Mai percentuali o conteggi
("8 fonti su 10"): traduci sempre in sensazione.
Esempi:
✓ "Le fonti ${now} remano quasi tutte dalla tua parte, soprattutto in amore."
✓ "${nowCap} le stelle si dividono parecchio su di te: dipende da chi ascolti."
✗ "Consenso: 80%, Relazioni allineate."

VARIETÀ DEL CONSENSO (verbi ed espressioni):
Non usare sempre "le fonti remano dalla tua parte" — è il default a cui
torni troppo spesso. Alterna tra registri diversi in base a quanto è
netto l'accordo o la divergenza:

Per ACCORDO (ha_divergenza=false), alterna tra:
  "le fonti sono quasi tutte d'accordo", "parlano la stessa lingua",
  "raccontano la stessa storia", "vanno a braccetto", "si allineano
  senza sbavature", "cantano in coro", "convergono con chiarezza",
  "sono in sintonia piena"

Per DIVERGENZA (ha_divergenza=true), alterna tra:
  "le fonti raccontano storie diverse", "non trovano un accordo pieno",
  "guardano il cielo da angolazioni diverse", "non parlano con una voce
  sola", "si dividono", "vedono le cose in modo diverso", "offrono
  letture distanti tra loro"

Varia anche la costruzione della frase, non solo il verbo: a volte
apri col soggetto "le fonti", a volte parti dall'ambito ("in amore, le
letture di oggi..."), a volte dal risultato ("giornata unanime, per
te...").

CAMPO "ha_divergenza" (booleano):
true se almeno una dimensione ha spread ALTO, false se tutte BASSO.

CAMPO "approfondimento" (sempre presente, 160-250 caratteri):
Racconta i dettagli e i consigli pratici. Stessa lunghezza e stesso
livello di cura narrativa in entrambi i rami (FALSE e TRUE) — il
consenso non deve mai sembrare un ripiego rispetto alla divergenza.

Se ha_divergenza è FALSE (tutte le dimensioni concordi):
  NON limitarti a dire genericamente che "tutto è nella norma" — è vero
  ma dimenticabile, e non deve essere meno interessante del ramo con
  divergenza. Cerca nel testo delle fonti UNO di questi tipi di
  dettaglio specifico (nell'ordine, usa il primo che trovi con più
  fonti a supporto):

  1. TEMA RICORRENTE: un argomento preciso che più fonti nominano
     indipendentemente (una persona, una situazione, un tipo di
     decisione) — non l'ambito generico ("lavoro") ma la cosa dentro
     l'ambito ("un chiarimento rimandato", "una proposta da valutare")
  2. MOMENTO PRECISO: se più fonti suggeriscono un momento della
     giornata o un timing specifico (mattina/pomeriggio/sera, "prima
     che...", "appena puoi")
  3. AZIONE CONDIVISA: un'azione concreta che più fonti, anche con
     parole diverse, indicano nella stessa direzione

  Se non trovi nessuno dei tre con chiarezza, usa come ultima risorsa
  un consiglio pratico legato all'ambito più forte tra i tre — mai una
  descrizione vaga dello stato generale.

  Struttura: una frase che nomina il dettaglio trovato (perché più
  fonti lo confermano, cosa significa per la ${span}), una frase di
  consiglio pratico legato ad esso. Stesso respiro narrativo del ramo
  con divergenza — non accontentarti di una battuta secca.

  Es debole (VIETATO): "Tutto scorre nella norma, in equilibrio."
  Es forte (tema ricorrente): "Più fonti insistono sulla stessa cosa:
  una proposta da valutare con calma, senza lasciarti mettere fretta.
  Prenditi il tempo che ti serve, oggi puoi permettertelo."
  Es forte (momento preciso): "Il mattino è il tuo momento migliore
  ${now}, secondo quasi tutte le letture: sfruttalo per le cose che
  contano davvero, prima che la giornata si complichi da sola."
  Es forte (azione condivisa): "Le fonti concordano su un punto:
  è il giorno giusto per la conversazione che rimandi da tempo.
  Il terreno è più favorevole di quanto pensi."

Se ha_divergenza è TRUE (una o più dimensioni con spread ALTO):
  IMPORTANTE: anche se più dimensioni hanno spread ALTO, racconta
  SOLTANTO quella con lo spread più alto in assoluto. Ignora le altre
  nell'approfondimento (il consenso ha già accennato al quadro generale).
  Costruisci un contrasto binario tra DUE fonti soltanto: UNA che vede
  una cosa, UNA che vede l'opposto. Una voce "pro", una voce "contro".
  NON aggiungere una terza, quarta o quinta fonte — due nomi in tutto,
  punto. Il lettore capisce il disaccordo da un solo esempio per lato.
  Struttura: una frase sul contrasto (2 fonti), una frase di consiglio che aiuta la lettrice a orientarsi tra le due (non a scegliere 'chi ha ragione').
  Es: "Su amore ${now} ci sono due chiavi di lettura: La Repubblica coglie più tensione da gestire, Vogue Italia una ${span} più romantica. Ascolta il tuo istinto, non forzare."

BUDGET TOTALE: consenso + approfondimento = 250-380 caratteri (inclusi spazi).
Se stai per superarlo, TAGLIA: meno fonti nominate, frasi più corte.

REGOLE (ereditate dal Campo 2 — superquote):
- Femminile di default, zero condizionali, zero anglicismi, zero jargon
  astrologico tecnico (niente "trigono", "quadratura", "transito" ecc.)
- Il lettore/le fonti sono sempre il soggetto concreto: mai "le energie
  si scontrano" o astrazioni animate ("la tenerezza vuole")
- Verbi sempre al presente indicativo quando descrivono cosa le fonti
  dicono/vedono ${now}/questa ${unit} (mai imperfetto: "coglievano",
  "vedevano" — le fonti parlano di ${now}, non del passato). Imperativo
  corretto per i consigli ("ascolta", non "ascolti"/"ascoltare").
- Attacco variato rispetto alla superquote dello stesso segno/${unit}
- Quando nomini fonti nel ramo TRUE, usa SOLO i nomi da "fonti_divergenti"
  ricevuti in input, mai inventarli

CORRETTEZZA GRAMMATICALE — VERIFICA OBBLIGATORIA:
Errori reali già osservati in produzione, da evitare sempre:
✗ "IO Donna e Sky TG24 coglievano una giornata intensa" (imperfetto)
✓ "IO Donna e Sky TG24 colgono una giornata intensa" (presente)
✗ "Ascolti quello che senti in pancia" (congiuntivo fuori posto)
✓ "Ascolta quello che senti in pancia" (imperativo corretto)
✗ "senza culpa" (spagnolo, non è una parola italiana)
✓ "senza sensi di colpa" oppure "senza rimorsi"
Solo italiano corretto ed esistente, stessa regola già in vigore per la
superquote: nessuna parola straniera, nessun tempo verbale sbagliato,
nessun modo verbale fuori contesto. Le fonti parlano SEMPRE al presente,
perché descrivono la ${span} di oggi, non un evento passato.

VARIETÀ DEL CONSIGLIO PRATICO:
Il consiglio finale (ultima frase di "approfondimento") non deve
ricadere sempre sullo stesso registro contemplativo ("non forzare",
"lascia fluire", "ascolta il tuo istinto"). Quella famiglia di consigli
va usata al MASSIMO in un caso su tre — per gli altri, scegli uno di
questi registri alternativi in base a cosa si adatta meglio al tema
emerso:

- AZIONE CONCRETA (quando il tema è lavoro/progetti):
  "Manda quella mail che rimandi da giorni", "Chiedi il confronto che
  eviti da settimane", "Blocca oggi la scelta che stai rimandando"
- TEMPO/MOMENTO (quando conviene aspettare o agire subito):
  "Il pomeriggio è il momento giusto, non la mattina", "Rimanda le
  decisioni importanti a domani", "Approfitta delle prossime ore"
- RELAZIONALE (quando il tema è comunicazione con altri):
  "Fai la prima mossa, per una volta", "Di' quello che pensi, senza
  addolcirlo troppo", "Lascia che sia l'altro a fare un passo"
- CURA DI SÉ (quando il tema è energia/salute):
  "Concediti la pausa che stai rimandando", "Muovi il corpo prima di
  muovere la mente", "Dormi un'ora in più stanotte, se puoi"

Varia anche la struttura grammaticale della frase (imperativo diretto,
domanda retorica, affermazione) — non ripetere sempre lo stesso schema
"Il consiglio è di...".

LINGUAGGIO DELLA DIVERGENZA — VIETATO vs PREFERITO:
La divergenza tra fonti non è un errore da segnalare, è una pluralità di
prospettive da raccontare. Non usare MAI parole che implicano rottura,
conflitto o giudizio di verità:
  VIETATO: disaccordo, contraddizione, discrepanza, conflitto, si
  smentiscono, sbagliano, una delle due ha ragione, contrasto, scontro,
  pro/contro, tesi/antitesi
  PREFERITO: letture diverse, prospettive diverse, sfumature,
  angolazioni diverse, punti di vista, si dividono (solo se seguito da
  un dettaglio neutro, mai da solo), chiavi di lettura, ognuna coglie
  un aspetto diverso
Test rapido: la frase deve suonare come "due amiche esperte che notano
cose diverse nello stesso cielo", mai come "due controparti in causa".

VERIFICA FINALE CAMPO 4:
□ "consenso" 90-130 caratteri, linguaggio emotivo non statistico?
□ "approfondimento" 160-250 caratteri?
□ Se ha_divergenza=true, ho raccontato SOLO la dimensione più divergente
  (una sola), ignorando le altre?
□ Se ha_divergenza=true, ho nominato ESATTAMENTE 2 fonti (una pro, una contro)?
□ Il consiglio finale usa un registro diverso da "non forzare/ascolta
  l'istinto" almeno 2 volte su 3 (a meno che sia davvero il più adatto)?
□ Totale consenso+approfondimento tra 250-380 caratteri?
□ Tutti i verbi sono al presente indicativo (fonti) o imperativo corretto
  (consigli)? Nessun imperfetto, nessuna parola straniera?
□ Suona come qualcosa che una persona italiana direbbe, non un report?
Se anche una sola risposta è NO → riscrivi e ACCORCIA prima di restituire.
□ Se ha_divergenza=false, ho cercato un dettaglio specifico (tema/momento/
  azione) prima di ricadere sul consiglio generico legato all'ambito più
  forte? Ho evitato la descrizione vaga dello stato generale ("tutto è
  nella norma") come PRIMA scelta?`;
}

const SYSTEM_PROMPT_WITH_CAMPO4_DAILY = SYSTEM_PROMPT + '\n' + buildCampo4Block('daily');
const SYSTEM_PROMPT_WITH_CAMPO4_WEEKLY = SYSTEM_PROMPT + '\n' + buildCampo4Block('weekly');

// Soglia divergenza calibrata su 30gg di dati reali daily (v. scripts/calibrate-divergence-threshold.ts):
// stddev >= 0.95 → ALTO. Sotto MIN_VALID_SOURCES fonti valide, spread forzato a BASSO (poco segnale).
// Condivisa provvisoriamente anche dal lato weekly: solo 4 settimane di storico reale,
// insufficienti per una calibrazione indipendente — da rivedere quando ce ne sarà di più
// (v. scripts/calibrate-divergence-threshold-weekly.ts per un check di sanità non vincolante).
const DIVERGENCE_STDDEV_THRESHOLD = 0.95;
const MIN_VALID_SOURCES_FOR_SPREAD = 3;
const OUTLIER_DEVIATION_THRESHOLD = 1;

type SynthesisDimension = 'relazioni' | 'lavoro' | 'benessere';
const SYNTHESIS_DIMENSIONS: SynthesisDimension[] = ['relazioni', 'lavoro', 'benessere'];
const DIMENSION_LABELS_IT: Record<SynthesisDimension, string> = {
  relazioni: 'Relazioni',
  lavoro: 'Lavoro',
  benessere: 'Benessere',
};

interface DimensionSpread {
  dimension: SynthesisDimension;
  validSourceCount: number;
  mean: number;
  stddev: number;
  isHigh: boolean;
  outlierSourceNames: string[];
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Esclude rating 0 (ambito non menzionato, non comparabile — v. §7 del recap).
function computeDimensionSpread(
  dimension: SynthesisDimension,
  entries: { sourceName: string; rating: number }[]
): DimensionSpread {
  const valid = entries.filter(e => e.rating > 0);
  const values = valid.map(e => e.rating);

  if (valid.length === 0) {
    return { dimension, validSourceCount: 0, mean: 0, stddev: 0, isHigh: false, outlierSourceNames: [] };
  }

  const m = Number(mean(values).toFixed(2));
  // Stddev reale sempre salvata (utile per ricalibrare la soglia, v. §6 del
  // recap); solo la classificazione ALTO/BASSO è forzata sotto la soglia
  // minima di fonti valide (troppo poco segnale per dichiarare divergenza).
  const sd = Number(stddev(values).toFixed(3));
  const isHigh = valid.length >= MIN_VALID_SOURCES_FOR_SPREAD && sd >= DIVERGENCE_STDDEV_THRESHOLD;

  const outlierSourceNames = isHigh
    ? valid.filter(e => Math.abs(e.rating - m) > OUTLIER_DEVIATION_THRESHOLD).map(e => e.sourceName)
    : [];

  return { dimension, validSourceCount: valid.length, mean: m, stddev: sd, isHigh, outlierSourceNames };
}

// Tra le dimensioni ALTO, quella con stddev massimo — è l'unica su cui il
// prompt chiede di narrare nel ramo ha_divergenza=true (v. CAMPO4_BLOCK).
function findPrincipalDimension(spreads: DimensionSpread[]): DimensionSpread | null {
  const high = spreads.filter(s => s.isHigh);
  if (high.length === 0) return null;
  return high.reduce((max, s) => (s.stddev > max.stddev ? s : max));
}

function formatCampo4InputBlock(
  spreads: DimensionSpread[],
  principal: DimensionSpread | null,
  realSuperquotes: string[]
): string {
  const lines = spreads.map(s => {
    const label = DIMENSION_LABELS_IT[s.dimension];
    const level = s.isHigh ? 'ALTO' : 'BASSO';
    return `- ${label}: media ${s.mean}, spread ${level}`;
  });
  const principalLine = principal
    ? `\n\nDIMENSIONE PRINCIPALE DIVERGENTE (spread più alto tra le ALTO): ${DIMENSION_LABELS_IT[principal.dimension]}` +
      (principal.outlierSourceNames.length > 0 ? ` — fonti in disaccordo: ${principal.outlierSourceNames.join(', ')}` : '')
    : '';
  // Sostituisce la cronologia della prima chiamata (rimossa per costo): le superquote
  // reali bastano a far rispettare "varia l'attacco" senza rimandare i testi originali.
  const superquoteBlock = realSuperquotes.length > 0
    ? `\n\nSuperquote già generate per questo segno (varia l'attacco, non ripetere lo stesso incipit):\n${realSuperquotes.map(s => `- ${s}`).join('\n')}`
    : '';
  return `DATI CALCOLATI PER IL CAMPO 4 (non modificare, usa solo per narrare):\n${lines.join('\n')}${principalLine}${superquoteBlock}`;
}

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

    if (/vogue/i.test(input.sourceName)) {
      summaryLimit = 60;
    } else if (originalLength <= 400) {
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

function postProcessOutput(parsed: Record<string, unknown>, originalLength?: number, sourceName?: string): OpenAIOutput {
  let summary = (parsed.summary as string) || '';

  let summaryLimit = 150; // default for >1500
  if (sourceName && /vogue/i.test(sourceName)) {
    summaryLimit = 60;
  } else if (originalLength != null) {
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

export async function processMultiSourceHoroscope(
  inputs: OpenAIInput[],
  periodType: 'daily' | 'weekly'
): Promise<OpenAIOutput[]> {
  if (inputs.length === 0) return [];

  const systemPromptForPeriod = periodType === 'daily' ? SYSTEM_PROMPT_WITH_CAMPO4_DAILY : SYSTEM_PROMPT_WITH_CAMPO4_WEEKLY;

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
        text: systemPromptForPeriod,
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
      results[entry.index] = postProcessOutput(parsed, entry.input.extracted_text.length, entry.input.sourceName);
    } catch (err) {
      console.error(`[Claude Batch] Post-processing failed for source ${entry.input.sourceName}:`, err);
    }
  }

  // Campo 4 "Le stelle dicono" — daily e weekly, su tabelle distinte
  // (comparative_synthesis / weekly_comparative_synthesis) in base a
  // periodType. Isolato in try/catch: un suo fallimento non deve mai
  // compromettere i risultati Campo 1-3 già pronti per il salvataggio.
  try {
    await generateAndSaveComparativeSynthesis(inputs, results, periodType);
  } catch (err) {
    console.error('[Claude Batch] Comparative synthesis (Campo 4) failed:', err);
  }

  return results;
}

export async function generateAndSaveComparativeSynthesis(
  inputs: OpenAIInput[],
  results: OpenAIOutput[],
  periodType: 'daily' | 'weekly'
): Promise<void> {
  const dimensionSpreads = SYNTHESIS_DIMENSIONS.map(dimension =>
    computeDimensionSpread(
      dimension,
      inputs.map((input, i) => ({ sourceName: input.sourceName, rating: results[i].ratings[dimension] }))
    )
  );

  const hasEnoughSignal = dimensionSpreads.some(s => s.validSourceCount > 0);
  if (!hasEnoughSignal) return;

  const haDivergenzaComputed = dimensionSpreads.some(s => s.isHigh);
  const principalDimension = findPrincipalDimension(dimensionSpreads);
  // Solo gli outlier della dimensione principale: è l'unica su cui il
  // prompt autorizza Haiku a nominare fonti (v. CAMPO4_BLOCK, ramo TRUE).
  const fontiDivergenti = principalDimension?.outlierSourceNames ?? [];

  // Superquote reali (esclusi i fallback, che pescano tutti da FALLBACK_SUPERQUOTES) —
  // usate per far rispettare "varia l'attacco" senza dover rimandare la cronologia
  // della prima chiamata (costosa: testi originali + intero output JSON per-fonte).
  const realSuperquotes = results
    .map(r => r.superquote)
    .filter(sq => !FALLBACK_SUPERQUOTES.includes(sq));

  const periodNoun = periodType === 'daily' ? 'giorno' : 'settimana';
  const campo4UserText = `${formatCampo4InputBlock(dimensionSpreads, principalDimension, realSuperquotes)}\n\nGenera ora il Campo 4 "Le stelle dicono" per questo segno/${periodNoun} usando lo strumento extract_comparative_synthesis.`;

  const systemPromptForPeriod = periodType === 'daily' ? SYSTEM_PROMPT_WITH_CAMPO4_DAILY : SYSTEM_PROMPT_WITH_CAMPO4_WEEKLY;

  const secondResponse = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: [
      {
        type: 'text' as const,
        text: systemPromptForPeriod,
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    messages: [{ role: 'user', content: campo4UserText }],
    tools: [
      {
        name: 'extract_comparative_synthesis',
        description: 'Restituisci il Campo 4 "Le stelle dicono": sintesi comparativa tra tutte le fonti già analizzate in questo batch',
        input_schema: {
          type: 'object' as const,
          properties: {
            consenso: { type: 'string' as const, description: 'Frase 90-130 caratteri, grado di accordo generale tra le fonti in linguaggio emotivo, mai statistico (niente percentuali/conteggi).' },
            ha_divergenza: { type: 'boolean' as const, description: 'true se almeno una dimensione ricevuta in input ha spread ALTO, false se tutte BASSO.' },
            approfondimento: { type: 'string' as const, description: '150-270 caratteri. Se ha_divergenza=true: prima frase sulla dimensione con spread ALTO nominando le fonti in disaccordo ricevute in input, seconda frase di orientamento pratico. Se ha_divergenza=false: unico paragrafo che espande il consenso senza inventare contrasti.' },
          },
          required: ['consenso', 'ha_divergenza', 'approfondimento'],
        },
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    tool_choice: { type: 'tool', name: 'extract_comparative_synthesis' },
  });

  const synthesisToolBlock = secondResponse.content.find(b => b.type === 'tool_use');
  if (!synthesisToolBlock || synthesisToolBlock.type !== 'tool_use') {
    throw new Error('No tool use block in Claude comparative synthesis response');
  }

  const parsed = synthesisToolBlock.input as { consenso: string; ha_divergenza: boolean; approfondimento: string };

  if (parsed.ha_divergenza !== haDivergenzaComputed) {
    console.warn(`[Claude Batch] Campo 4: ha_divergenza restituito da Haiku (${parsed.ha_divergenza}) non coincide con lo spread calcolato (${haDivergenzaComputed}) — uso il valore calcolato.`);
  }
  if (parsed.consenso.length < 90 || parsed.consenso.length > 130) {
    console.warn(`[Claude Batch] Campo 4: "consenso" fuori range (${parsed.consenso.length} char): "${parsed.consenso}"`);
  }
  if (parsed.approfondimento.length < 160 || parsed.approfondimento.length > 220) {
    console.warn(`[Claude Batch] Campo 4: "approfondimento" fuori range (${parsed.approfondimento.length} char): "${parsed.approfondimento}"`);
  }
  const totalLength = parsed.consenso.length + parsed.approfondimento.length;
  if (totalLength < 250 || totalLength > 350) {
    console.warn(`[Claude Batch] Campo 4: budget totale fuori range (${totalLength} char, atteso 250-350)`);
  }

  const zodiacSign = await prisma.zodiacSign.findFirst({
    where: { name_italian: inputs[0].signSlugIt },
  });
  if (!zodiacSign) {
    console.error(`[Claude Batch] Campo 4: zodiac sign not found for "${inputs[0].signSlugIt}" — comparative_synthesis non salvata`);
    return;
  }

  const relazioniSpread = dimensionSpreads.find(s => s.dimension === 'relazioni')!.stddev;
  const lavoroSpread = dimensionSpreads.find(s => s.dimension === 'lavoro')!.stddev;
  const saluteSpread = dimensionSpreads.find(s => s.dimension === 'benessere')!.stddev;

  // periodType decide tabella e campo data: daily → comparative_synthesis
  // (date), weekly → weekly_comparative_synthesis (week_start_date). Prima
  // di questo fix, entrambi i path scrivevano sempre su comparative_synthesis
  // usando inputs[0].dateISO — per il weekly quel valore è il lunedì della
  // settimana, quindi collideva silenziosamente con la riga daily reale
  // dello stesso segno/lunedì (stessa chiave univoca zodiac_sign_id+date).
  if (periodType === 'daily') {
    const date = new Date(inputs[0].dateISO);
    await prisma.comparativeSynthesis.upsert({
      where: {
        zodiac_sign_id_date: {
          zodiac_sign_id: zodiacSign.id,
          date,
        },
      },
      update: {
        consenso: parsed.consenso,
        approfondimento: parsed.approfondimento,
        ha_divergenza: haDivergenzaComputed,
        relazioni_spread: relazioniSpread,
        lavoro_spread: lavoroSpread,
        salute_spread: saluteSpread,
        fonti_divergenti: fontiDivergenti,
        updated_at: new Date(),
      },
      create: {
        zodiac_sign_id: zodiacSign.id,
        date,
        consenso: parsed.consenso,
        approfondimento: parsed.approfondimento,
        ha_divergenza: haDivergenzaComputed,
        relazioni_spread: relazioniSpread,
        lavoro_spread: lavoroSpread,
        salute_spread: saluteSpread,
        fonti_divergenti: fontiDivergenti,
      },
    });
    return;
  }

  const week_start_date = new Date(inputs[0].dateISO); // sempre il lunedì canonico, anche se il batch include ELLE (v. conferma turno precedente)
  await prisma.weeklyComparativeSynthesis.upsert({
    where: {
      zodiac_sign_id_week_start_date: {
        zodiac_sign_id: zodiacSign.id,
        week_start_date,
      },
    },
    update: {
      consenso: parsed.consenso,
      approfondimento: parsed.approfondimento,
      ha_divergenza: haDivergenzaComputed,
      relazioni_spread: relazioniSpread,
      lavoro_spread: lavoroSpread,
      salute_spread: saluteSpread,
      fonti_divergenti: fontiDivergenti,
      updated_at: new Date(),
    },
    create: {
      zodiac_sign_id: zodiacSign.id,
      week_start_date,
      consenso: parsed.consenso,
      approfondimento: parsed.approfondimento,
      ha_divergenza: haDivergenzaComputed,
      relazioni_spread: relazioniSpread,
      lavoro_spread: lavoroSpread,
      salute_spread: saluteSpread,
      fonti_divergenti: fontiDivergenti,
    },
  });
}

export async function processMultiSourceHoroscopeWithRetry(
  inputs: OpenAIInput[],
  periodType: 'daily' | 'weekly',
  maxRetries: number = 3
): Promise<OpenAIOutput[]> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await processMultiSourceHoroscope(inputs, periodType);
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