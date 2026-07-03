# Recap: Feature "Le stelle dicono" (sintesi comparativa)

Documento di handoff per Claude Code. Claude Code ha accesso diretto al
codice completo del repo e al DB — questo documento definisce obiettivo,
decisioni prese e vincoli, non implementazione. Dove indicato, verificare
sempre contro lo stato reale del codice/schema prima di procedere.

**Repo:** github.com/fedfabiani-app/confrontav2 (app originariamente
costruita su Replit)
**App live:** https://confrontav2-production.up.railway.app/

## Vincoli non negoziabili (validi per TUTTA l'implementazione)

1. **Solo funzione giornaliera.** Scope: `sources` + `horoscope_data` e
   relativi job/servizi/UI giornalieri. Il lato settimanale
   (`weekly_sources` + `weekly_horoscope_data`) è una fase successiva
   separata, da NON toccare ora — richiederà calibrazione propria della
   soglia e possibile adattamento del tono testuale.
2. **Coerenza grafica totale con il tema attuale.** La nuova card e
   l'accordion devono riusare i componenti, i token di colore, la
   tipografia e lo stile card già esistenti nell'app. Nessun nuovo
   linguaggio visivo: la feature deve sembrare nata con l'app.
3. **Zero modifiche alle altre funzioni.** Nessuna alterazione a scraping,
   superquote, incipit, ratings esistenti, notifiche, freemium, weekly,
   compatibilità o qualunque altra parte dell'app. Le uniche modifiche
   ammesse fuori dalla nuova feature sono quelle esplicitamente elencate
   in questo documento (estensione del prompt Haiku con il Campo 4,
   estensione di processMultiSourceHoroscope, riposizionamento della card
   Premium nella pagina segno).

---

## 1. Obiettivo della feature

Oggi il "confronto" tra fonti è implicito: le 14 fonti sono affiancate,
ma nessuno le mette a sistema. "Le stelle dicono" è una sintesi editoriale
generata da Haiku che dice esplicitamente quanto le fonti concordano o
divergono su un segno/giorno, e perché — valore che nessuna singola
fonte può offrire, ed è anche uno dei requisiti già individuati per
l'eleggibilità AdSense (verdetto comparativo sopra gli estratti).

## 2. Naming

- **Nome pubblico in UI:** "Le stelle dicono"
- Da NON chiamare "sintesi" nell'interfaccia, perché ogni fonte usa già
  l'etichetta "La nostra sintesi:" per il proprio estratto — rischio di
  confusione tra "sintesi di una fonte" e "sintesi dell'app".

## 3. Contenuto testuale — struttura in 2 campi

Generato da Haiku, non a mano. Sempre in italiano, tono narrato/emotivo
mai statistico (mai "8 fonti su 10", sempre tradotto in sensazione),
femminile di default, zero condizionali/anglicismi/jargon astrologico
tecnico — stesse regole di stile già in uso nel Campo 2 (superquote) del
prompt Haiku esistente.

### `consenso` (sempre visibile, snippet in card)
- 90-130 caratteri
- Racconta il grado di accordo generale in linguaggio emotivo
- Esempio: "Le fonti oggi remano quasi tutte dalla tua parte, soprattutto
  in amore."

### `approfondimento` (dentro accordion "Leggi tutto")
- 150-270 caratteri
- **Se `ha_divergenza = true`:** prima frase sulla dimensione con spread
  alto, nominando le fonti realmente in disaccordo (mai inventate);
  seconda frase di orientamento pratico che tiene conto del disaccordo.
- **Se `ha_divergenza = false`:** un unico paragrafo naturale che espande
  il consenso con un dettaglio pratico in più — NON forzare un contrasto
  inesistente.

Totale card: 250-400 caratteri complessivi, coerente col budget fissato
fin dall'inizio.

## 4. Principio chiave: dati calcolati, non stimati da Haiku

Per evitare contraddizioni tra il testo e i voti numerici già mostrati
in UI (Relazioni/Lavoro/Benessere), lo spread tra fonti va **calcolato
nel backend prima della chiamata Haiku** e passato come input vincolante
nel prompt. Haiku narra i dati, non li inventa/stima dal testo grezzo.

Dati da calcolare e passare nel prompt per ciascuna dimensione
(relazioni/lavoro/salute — nel DB "Benessere" corrisponde al campo
`salute_rating`):
- media
- deviazione standard tra fonti
- classificazione ALTO/BASSO spread (soglia da calibrare, vedi §7)
- elenco nominale delle fonti "outlier" (scostamento > 1 punto dalla
  media), da usare SOLO se si deve nominare la divergenza

Se le fonti valide per una dimensione in un giorno sono meno di 3,
forzare spread = BASSO di default (troppo poco segnale per dichiarare
divergenza).

## 5. Architettura di generazione

Confermato: il progetto già fa **una chiamata Haiku per segno con tutte
le fonti bundled nel prompt** (non N chiamate per fonte), tramite
`enqueueAggregatedNlpJob` (server/jobs/index.ts) e
`processMultiSourceHoroscope` (server/services/claude.ts), tool
`extract_horoscopes_batch`.

**Nota di revisione (post-ricognizione):** la versione originaria di
questo paragrafo prevedeva l'aggiunta del Campo 4 dentro la stessa,
unica chiamata esistente. Claude Code ha correttamente individuato una
contraddizione: lo spread tra fonti richiesto come input vincolante nel
prompt (§4) dipende dai rating per-fonte che quella stessa chiamata deve
ancora produrre — non possono esistere prima della chiamata se la
chiamata è una sola. Architettura corretta, di seguito.

**Due chiamate Haiku sequenziali per segno, dentro la stessa funzione
`processMultiSourceHoroscope`** (non un job separato, non una nuova
infrastruttura di scheduling/coda):

1. **Chiamata 1 (invariata):** estrae incipit/superquote/rating per
   tutte le fonti del batch, tool `extract_horoscopes_batch` esistente.
2. **Calcolo backend (deterministico, in codice, non in AI):** una volta
   ottenuti i rating per-fonte dalla Chiamata 1, calcola media, deviazione
   standard e fonti outlier per Relazioni/Lavoro/Salute — vedi §4 e §7.
3. **Chiamata 2 (nuova, leggera):** riceve SOLO i dati aggregati calcolati
   al punto 2 (medie, spread, nomi fonti outlier) — non i 14 testi grezzi
   delle fonti, già processati alla Chiamata 1. Restituisce esclusivamente
   il campo `sintesi_comparativa` secondo lo schema dell'Appendice A.

Costo: si passa da 12 a 24 chiamate Haiku/giorno, ma la Chiamata 2 è
minuscola in input/output (solo numeri e nomi, due frasi di output) —
costo marginale trascurabile rispetto alla Chiamata 1.

## 6. Schema DB — nuova tabella

`horoscope_data` è per-fonte (una riga per fonte×segno×giorno);
"Le stelle dicono" è per-segno (una riga per segno×giorno, aggregata).
Grana diversa → nuova tabella, non un campo aggiuntivo su horoscope_data.

Naming coerente con lo stile osservato in `horoscope_data` (id Int
autoincrement, FK Int, snake_case, campi rating con suffisso
`_rating`/`_spread`, contenuto editoriale in italiano):

```prisma
model ComparativeSynthesis {
  id                Int      @id @default(autoincrement())
  zodiac_sign_id    Int      // FK verso zodiac_signs
  date              DateTime

  consenso          String   // 90-130 char
  approfondimento   String   // 150-270 char
  ha_divergenza     Boolean

  relazioni_spread  Float
  lavoro_spread     Float
  salute_spread     Float
  fonti_divergenti  String[] // nomi source outlier, se ha_divergenza = true

  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt

  @@unique([zodiac_sign_id, date])
  @@map("comparative_synthesis")
}
```

Salvare anche gli spread calcolati (non solo il testo finale) per poter
ricalibrare la soglia in futuro senza dover riprocessare `horoscope_data`
da capo — solo un UPDATE condizionale sui record esistenti.

**Verificare con lo schema.prisma reale:**
- nome esatto del modello Prisma corrispondente a `horoscope_data`
- se `source_id` in `horoscope_data` è raggiungibile via relazione
  Prisma verso una tabella `Source`/`sources` per ottenere il nome
  leggibile della fonte (serve per popolare `fonti_divergenti`)
- se ELLE (cadenza biweekly, logica valid_from/valid_to) confluisce in
  `horoscope_data` insieme alle fonti daily standard, o è gestita altrove
  — se confluisce qui, va esclusa dai calcoli di spread per non
  confrontare date non comparabili

## 7. Soglia di divergenza — DA CALIBRARE, non ancora definitiva

Ipotesi di partenza: **deviazione standard ≥ 0.8 → ALTO**, sotto → BASSO.
Non fissare in codice come valore definitivo: prima far girare lo script
di calibrazione allegato (`calibrate-divergence-threshold.ts`) sugli
ultimi 30 giorni di `horoscope_data` reali.

Target: soglia che classifichi come "divergenza alta" circa il **20-35%**
delle combinazioni segno×giorno. Sotto, il contenuto extra
nell'accordion sarebbe troppo raro per valere lo sforzo editoriale;
sopra, "divergenza" perde di significato.

Lo script (allegato separatamente) ha alcune parti da adattare da parte
di Claude Code prima dell'esecuzione (nome modello Prisma esatto,
relazione verso Source, gestione ELLE) — sono segnalate esplicitamente
nei commenti del file.

Rating = 0 (o null) va sempre escluso dal calcolo di media/spread:
rappresenta "ambito non menzionato", non è un dato comparabile.

## 8. UI/UX — card unificata

Sostituisce l'attuale sequenza di card separate (Media Generale + 3 box
Relazioni/Lavoro/Benessere) con UNA card unica, ordine dall'alto:

```
┌───────────────────────────────┐
│  Le stelle dicono               │
│  {consenso}                     │
│  Leggi tutto ›  (accordion)     │
│  ┈┈┈┈┈┈┈┈┈┈┈ (espanso) ┈┈┈┈┈┈┈  │
│  {approfondimento}              │
│  ─────────────────────────      │
│  Media Generale  X.X ★★★★☆     │
│  Relazioni X.X · Lavoro X.X ·   │
│  Benessere X.X                  │
└───────────────────────────────┘
```

- Testo narrativo PRIMA dei numeri (il numero conferma la storia, non
  il contrario)
- Etichetta card: "Le stelle dicono" — evitare la parola "sintesi"
- Colore/stile testo distinto dal giallo usato per "La nostra sintesi"
  delle fonti, per non creare confusione visiva tra voce dell'app e
  voce delle testate

### Accordion — requisito SEO, non solo UX
Il contenuto di `approfondimento` deve essere presente nel markup HTML
renderizzato **server-side fin dal primo caricamento** (non fetchato via
chiamata API al click), e l'espansione gestita solo visivamente. Soluzione
consigliata: tag nativo `<details>/<summary>` — semanticamente corretto,
accessibile di default, contenuto sempre presente nel DOM per il
crawler anche senza esecuzione JS.

### Riposizionamento contenuti esistenti
La card Premium "Affinità tra segni" (attualmente subito sopra la prima
fonte, above the fold) va spostata più in basso nella pagina — dopo le
prime 2-3 fonti — per lasciare spazio alla nuova card "Le stelle dicono"
e a un eventuale ad nativo, mantenendo **alfemminile (prima fonte)
visibile al primo scroll** (vincolo esplicito: le fonti danno
autorevolezza all'app, devono restare in vista presto).

### Pubblicità
Se previsto un ad above the fold, posizionarlo dopo la card "Le stelle
dicono" e prima della prima fonte — mai tra header e voti, per non dare
l'impressione che l'app apra con pubblicità invece che con contenuto
(rischio sia di fiducia utente sia di policy AdSense).

## 9. Ordine di esecuzione consigliato

1. Verificare schema Prisma reale (modello horoscope_data, relazione
   Source, gestione ELLE)
2. Creare tabella `comparative_synthesis` via migration Prisma
3. Adattare ed eseguire lo script di calibrazione su dati storici reali
   → confermare/aggiustare soglia 0.8
4. Estendere il prompt Haiku esistente con il blocco Campo 4 (fornito
   separatamente) e il calcolo spread lato backend prima della chiamata
5. Estendere `processMultiSourceHoroscope` per calcolare spread, passarli
   nel prompt, salvare il risultato in `comparative_synthesis`
6. Implementare la card UI unificata con accordion SSR
7. Spostare la card Premium più in basso nella pagina
8. Solo a validazione completata: pianificare la stessa struttura
   (logica + UI) per `weekly_sources`/`weekly_horoscope_data`, come fase
   separata successiva

## 10. File allegati a questo recap

- `calibrate-divergence-threshold.ts` — script di calibrazione soglia
  (da adattare secondo le note nei commenti prima dell'esecuzione)
- Blocco prompt "Campo 4" completo: vedi Appendice A in fondo a questo
  documento

## 11. Punti aperti da verificare direttamente nel codice/DB

- Nome esatto del modello Prisma per `horoscope_data`
- Se e come `source_id` è collegato via relazione a un modello `Source`
  con campo `name` leggibile
- Se ELLE confluisce in `horoscope_data` o ha gestione separata
- Se in pratica esistono rating a 0/null in `horoscope_data` da gestire
  nel calcolo, oltre al caso teorico previsto dal prompt Haiku

---

## Appendice A — Prompt "Campo 4" per la Chiamata 2 (sintesi comparativa)

Questo NON va aggiunto in coda al prompt esistente dei Campi 1-3 (che
resta invariato). È il prompt di sistema per una seconda chiamata Haiku
dedicata, leggera, eseguita subito dopo la Chiamata 1 nello stesso
flusso di `processMultiSourceHoroscope` (vedi §5 per l'architettura a
due chiamate).

Input della Chiamata 2: SOLO i dati aggregati calcolati dal backend dopo
la Chiamata 1 (medie, spread, nomi fonti outlier) — non i testi grezzi
delle fonti, già processati alla Chiamata 1.

**Budget totale:** consenso + approfondimento = **250-400 caratteri** (inclusi spazi).

```
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
✓ "Le fonti oggi remano quasi tutte dalla tua parte, soprattutto in amore."
✓ "Oggi le stelle si dividono parecchio su di te: dipende da chi ascolti."
✗ "Consenso: 80%, Relazioni allineate."

CAMPO "ha_divergenza" (booleano):
true se almeno una dimensione ha spread ALTO, false se tutte BASSO.

CAMPO "approfondimento" (sempre presente, 160-270 caratteri):
Racconta i dettagli e i consigli pratici.

Se ha_divergenza è FALSE (tutte le dimensioni concordi):
  Espandi il consenso con un dettaglio pratico su cosa significa per la
  giornata. Può coprire una o più dimensioni, ma il tono deve restare
  naturale e una idea principale per frase — non impilare tre temi in
  una riga.
  Es: "Fiducia negli amici: loro sono il vero motore della giornata."
  oppure: "Relazioni, lavoro e benessere convergono verso una giornata
  complessivamente positiva. Il consiglio è di non forzare: lascia che
  le cose fluiscano naturalmente."

Se ha_divergenza è TRUE (una o più dimensioni con spread ALTO):
  Prima parte: identifica quale dimensione (o dimensioni) si divide,
  nomina i nomi delle fonti in disaccordo — usa SOLO i nomi ricevuti
  in input come "fonti_divergenti", mai inventarli.
  Seconda parte: un consiglio pratico che tiene conto di questo
  dissenso (es. "meglio non forzare", "ascolta il tuo istinto").
  Es: "Su amore le voci si dividono: alfemminile e Paolo Fox vedono
  chiarezza, mentre Gazzetta dello Sport frena. Meglio ascoltare il
  tuo istinto, non forzare."

REGOLE (ereditate dal Campo 2 — superquote):
- Femminile di default, zero condizionali, zero anglicismi, zero jargon
  astrologico tecnico (niente "trigono", "quadratura", "transito" ecc.)
- Il lettore/le fonti sono sempre il soggetto concreto: mai "le energie
  si scontrano" o astrazioni animate ("la tenerezza vuole")
- Attacco variato rispetto alla superquote dello stesso segno/giorno
  (non ripetere lo stesso incipit di frase)
- Nominare sempre le testate per nome quando c'è divergenza — è il
  valore editoriale distintivo di questo campo, non va omesso

VERIFICA FINALE CAMPO 4:
□ "consenso" 90-130 caratteri, linguaggio emotivo non statistico, una frase?
□ "approfondimento" 160-270 caratteri, racconta il dettaglio/consiglio pratico?
□ "ha_divergenza" coerente con lo spread ricevuto in input?
□ Se divergenza=true, le fonti nominate sono davvero in "fonti_divergenti"?
□ Totale consenso+approfondimento tra 250-400 caratteri?
□ Suona come qualcosa che una persona italiana direbbe, non un report?
Se anche una sola risposta è NO → riscrivi prima di restituire.
```

Formato di input dei dati calcolati da includere nel prompt a runtime
(esempio, generato dal backend prima della chiamata):

```
DATI CALCOLATI PER IL CAMPO 4 (non modificare, usa solo per narrare):
- Relazioni: media 3.9, spread BASSO
- Lavoro: media 3.6, spread ALTO — fonti in disaccordo: Grazia, IO Donna
- Benessere: media 3.8, spread BASSO
```

Output JSON atteso (aggiunto allo schema del tool extract_horoscopes_batch):

```json
{
  "sintesi_comparativa": {
    "consenso": "...",
    "ha_divergenza": true,
    "approfondimento": "..."
  }
}
```

---

## Appendice B — Fase 5: Duplicazione lato WEEKLY

Feature "Il quadro d'insieme" duplicata sul lato settimanale
(`weekly_sources` / `weekly_horoscope_data`), dopo validazione completa
del lato daily. Titolo UI: "Il quadro della settimana" (vs "Il quadro
di oggi" per il daily).

### Bug preesistente scoperto e corretto (prerequisito, non extra)

`processMultiSourceHoroscope` è condivisa da entrambi i batch (daily via
`enqueueAggregatedNlpJob`, weekly via `enqueueAggregatedWeeklyNlpJob`).
La logica Campo 4 scriveva incondizionatamente in `comparative_synthesis`
usando `inputs[0].dateISO` come chiave — nel path weekly quel valore è un
lunedì (`weekStartDate`). Conseguenza: un refresh weekly poteva
sovrascrivere silenziosamente una riga daily dello stesso segno/lunedì
(stessa chiave univoca `zodiac_sign_id + date`). Bug latente (0 righe
attuali cadono di lunedì) ma armato.

**Fix strutturale:** parametro `periodType: 'daily' | 'weekly'`
obbligatorio (non opzionale, prima di parametri con default) propagato
lungo tutta la catena: `processMultiSourceHoroscope` →
`processMultiSourceHoroscopeWithRetry` →
`generateAndSaveComparativeSynthesis`. Il compilatore TypeScript segnala
ogni call site non aggiornato — impossibile dimenticare quale tabella
target usare. La persistenza finale biforca: `daily` →
`comparativeSynthesis.upsert` con `date`; `weekly` →
`weeklyComparativeSynthesis.upsert` con `week_start_date`.

### Assunzione date weekly/ELLE — verificata fino al sorgente

`inputs[0].dateISO` nel path weekly è sempre il lunedì canonico, identico
per ogni fonte del batch (ELLE inclusa). Catena verificata:
`weekStart` validato come lunedì prima del loop fonti
(`/api/refresh-weekly/sign/:sign`) → passato identico a ogni fonte →
lo scraper ELLE/biweekly aggiunge `validFrom`/`validTo` come campi
SEPARATI ma lascia `weekStartDate` invariato → diventa `dateISO`. La
logica ELLE (`valid_from`/`valid_to`) entra in gioco solo dopo, in
`enqueueWeeklyUpsertJob` (persistenza per-fonte), a valle della sintesi
comparativa. Nessuna contaminazione.

### Struttura della duplicazione

- **Schema:** nuovo modello `WeeklyComparativeSynthesis`
  (`@@map("weekly_comparative_synthesis")`), identico a
  `ComparativeSynthesis` ma `date` → `week_start_date @db.Date`, chiave
  `@@unique([zodiac_sign_id, week_start_date])`. Relazione inversa
  aggiunta a `ZodiacSign`.
- **Prompt:** `CAMPO4_BLOCK` trasformato in funzione
  `buildCampo4Block(periodType)` — UNA sola fonte di verità per le regole
  (budget caratteri, parole vietate, checklist), con sostituzione solo di
  `oggi`/`questa settimana`, `giornata`/`settimana` nelle frasi di
  esempio. NON due copie complete (eviterebbe divergenza futura ad ogni
  ritocco del prompt). Due costanti derivate:
  `SYSTEM_PROMPT_WITH_CAMPO4_DAILY` e `_WEEKLY`, ciascuna con la propria
  cache lineage (corretto: sono testualmente diverse).
- **Endpoint:** nuovo `GET /api/weekly-comparative-synthesis`
  (`weekStartDate` + `sign`), stesso pattern del daily, `null` se assente
  (graceful degradation).
- **Frontend:** `SignDetail.tsx` — nuova query weekly (`enabled: viewType
  === "weekly"`), variabile generica `currentComparativeSynthesis =
  viewType === "daily" ? comparativeSynthesis : weeklyComparativeSynthesis`,
  titolo condizionale. Card, accordion, griglia voti già generici e
  riusati senza duplicazione.

### Soglia divergenza weekly — riusata, NON ancora calibrata

La soglia 0.95 è stata calibrata sul comportamento delle fonti
GIORNALIERE (30 giorni di dati). Per il weekly è riusata come default
ragionevole, ma NON validata: le fonti settimanali potrebbero divergere
strutturalmente più o meno di quelle giornaliere (previsioni più ampie e
vaghe → spread potenzialmente compresso o amplificato). Calibrazione
formale rimandata: solo ~4 settimane di dati disponibili, insufficienti.
`weekly_comparative_synthesis` salva gli spread grezzi da subito → i dati
per una ricalibrazione weekly-aware si accumulano automaticamente.

**Check di sanità da fare dopo il deploy (non bloccante):** far girare
lo script di calibrazione puntato su `weekly_comparative_synthesis` anche
solo sulle 4 settimane disponibili — NON per fissare la soglia, ma per
vedere in che direzione punta lo spread settimanale rispetto allo 0.95
ereditato. Se con 0.95 il weekly classifica ~5% o ~70% dei casi come
ALTO (invece del 20-35% target), la soglia va rivista presto anche con
pochi dati. Quando ci sarà più storico, la ricalibrazione dovrà mutuare
la gestione overlap ELLE da `fetchWeeklyHoroscopes` (range intersection),
non l'exact-match usato per le altre fonti.

### Nota su prisma db push

Il repo non traccia `prisma/migrations`: workflow = editare schema →
`npx prisma generate` → `npx prisma db push` sull'ambiente reale.
Su Windows, fermare prima il dev server se attivo (blocca la dll del
query engine Prisma, già successo in passato).