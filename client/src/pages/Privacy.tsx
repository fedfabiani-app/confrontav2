import { AppHeader } from "@/components/AppHeader";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader>
        <h1 className="text-2xl font-bold">Privacy Policy</h1>
      </AppHeader>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <section>
          <h2 className="text-xl font-bold mb-4">Introduzione</h2>
          <p className="text-foreground/80 leading-relaxed">
            Confronta Oroscopo ("l'App") è gestita da Federico Fabiani. Questa Privacy Policy descrive come raccogliamo, utilizziamo e proteggiamo i tuoi dati personali in conformità al Regolamento Generale sulla Protezione dei Dati (GDPR).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4">Dati Raccolti</h2>
          <p className="text-foreground/80 leading-relaxed">
            Raccogliamo i seguenti dati personali: indirizzo email (attraverso Clerk per l'autenticazione), segni zodiacali e fonti preferite (memorizzati localmente e nel nostro database per la sincronizzazione tra dispositivi), e informazioni di pagamento elaborate da Stripe (gestore dei pagamenti). I dati di pagamento non sono conservati direttamente da noi — Stripe agisce come processore dati indipendente.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4">Come Utilizziamo i Tuoi Dati</h2>
          <p className="text-foreground/80 leading-relaxed">
            Utilizziamo i tuoi dati per: fornire e migliorare l'App, autenticarrti tramite Clerk, elaborare pagamenti tramite Stripe, sincronizzare i tuoi preferiti tra dispositivi, e comunicare informazioni importanti sul tuo account. Non vendiamo, affittiamo o condividiamo i tuoi dati con terze parti per scopi di marketing.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4">Base Legale</h2>
          <p className="text-foreground/80 leading-relaxed">
            Il trattamento dei tuoi dati si basa sul consenso (per l'autenticazione e le preferenze), sull'esecuzione del contratto (per i pagamenti), e sui nostri legittimi interessi (per migliorare l'App).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4">Condivisione dei Dati</h2>
          <p className="text-foreground/80 leading-relaxed">
            I tuoi dati sono condivisi con fornitori di servizi terzi necessari al funzionamento dell'App: Clerk (autenticazione), Stripe (pagamenti), e Railway (hosting infrastruttura in UE). Questi fornitori operano come responsabili del trattamento e sono soggetti a accordi di protezione dei dati.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4">Diritti dell'Utente</h2>
          <p className="text-foreground/80 leading-relaxed">
            Hai il diritto di accedere, rettificare, cancellare, o portabilità dei tuoi dati. Puoi anche opporti al trattamento e revocare il consenso in qualsiasi momento. Per esercitare questi diritti, contattaci a fed.fabiani@gmail.com con una richiesta esplicita. Risponderemo entro 30 giorni.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4">Conservazione dei Dati</h2>
          <p className="text-foreground/80 leading-relaxed">
            Conserviamo i tuoi dati finché il tuo account è attivo e per 90 giorni dopo la cancellazione per motivi di backup. I dati di pagamento sono gestiti secondo i tempi di conservazione di Stripe (generalmente 7 anni per conformità fiscale).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4">Cookie e Tracciamento</h2>
          <p className="text-foreground/80 leading-relaxed">
            L'App utilizza cookie di sessione per mantenerti autenticato. Non utilizziamo analytics di terze parti o tracciamento pubblicitario. I dati locali (preferiti) sono memorizzati nel tuo dispositivo tramite localStorage del browser.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4">Sicurezza</h2>
          <p className="text-foreground/80 leading-relaxed">
            Implementiamo misure di sicurezza ragionevoli per proteggere i tuoi dati, inclusa la trasmissione HTTPS, l'autenticazione tramite Clerk, e l'hosting su infrastruttura Railway con crittografia. Tuttavia, nessun sistema è completamente sicuro — usa password forti e mantieni il tuo account al sicuro.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4">Contatti</h2>
          <p className="text-foreground/80 leading-relaxed">
            Per domande sulla privacy, contatta federicofabiani@gmail.com. Hai anche il diritto di presentare un reclamo all'autorità di protezione dei dati competente nel tuo paese.
          </p>
        </section>

        <section>
          <p className="text-sm text-foreground/60">
            Ultimo aggiornamento: maggio 2026
          </p>
        </section>
      </main>
    </div>
  );
}