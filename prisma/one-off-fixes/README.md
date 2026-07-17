# One-off data fixes

Questa cartella raccoglie script standalone per correggere problemi di dati **una tantum** — cose come rimuovere un record duplicato, ripulire righe sporche introdotte da un bug ormai risolto, o eliminare un'entità che non deve più esistere.

## Convenzione

- Quando si scopre un problema di dati da sistemare manualmente, si aggiunge qui un **nuovo file** (mai dentro `prisma/seed.ts`, che deve restare idempotente e sicuro da rieseguire ad ogni deploy).
- Ogni script segue lo stesso pattern:
  - `PrismaClient` + una funzione `main()`
  - un controllo di esistenza prima di qualsiasi `delete`/`deleteMany` (se il dato non c'è più, loggare e uscire senza errori — deve essere sicuro rieseguirlo)
  - log chiaro di cosa è stato trovato e di quante righe sono state cancellate
  - un commento in testa con la data presunta di creazione e la nota che va eseguito manualmente
- Si esegue **a mano, una sola volta**, contro l'ambiente giusto:
  ```
  npx tsx prisma/one-off-fixes/<nome-script>.ts
  ```
  assicurandosi che `DATABASE_URL` punti all'ambiente corretto (locale o produzione) prima di lanciarlo.
- Lo script **non va richiamato** da `seed.ts` né dallo start command di deploy (`railway.json`) — nessuno script in questa cartella deve comparire in `package.json` o in pipeline automatiche.
- Dopo l'esecuzione, il file **resta nel repo** come traccia storica di cosa è stato fatto e quando — non va cancellato dopo l'uso.
