import { AppHeader } from "@/components/AppHeader";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b" 
        style={{
          background: 'rgba(30, 20, 64, 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)', // Per Safari
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/')}
                data-testid="button-back-info"
                className="text-white hover:bg-white/20 border border-white/30"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white">
                  Termini e condizioni
                </h1>
                <p className="text-xs text-gray-300">
                  Condizioni d’uso del servizio
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <section>
          <h2 className="text-xl text-white font-bold mb-4">Accettazione dei Termini</h2>
          <p className="text-foreground/80 leading-relaxed">
            Utilizzando Confronta Oroscopo ("l'App"), accetti questi Termini e Condizioni. Se non sei d'accordo con qualsiasi parte di questi termini, non utilizzare l'App. Ci riserviamo il diritto di modificare questi termini in qualsiasi momento — le modifiche entreranno in vigore immediatamente. Il tuo uso continuato dell'App costituisce accettazione dei termini modificati.
          </p>
        </section>

        <section>
          <h2 className="text-xl text-white font-bold mb-4">Descrizione del Servizio</h2>
          <p className="text-foreground/80 leading-relaxed">
            Confronta Oroscopo è un'applicazione web che aggrega e confronta oroscopi provenienti da molteplici fonti editoriali italiane. L'App è disponibile in due versioni: gratuita (con funzionalità base) e premium a pagamento (con accesso a storico esteso e analisi di compatibilità). L'App è fornita "così com'è" senza garanzie di accuratezza degli oroscopi stessi — gli oroscopi sono forniti esclusivamente a scopo di intrattenimento.
          </p>
        </section>

        <section>
          <h2 className="text-xl text-white font-bold mb-4">Account e Autenticazione</h2>
          <p className="text-foreground/80 leading-relaxed">
            Per accedere a funzionalità premium, devi creare un account tramite Clerk (fornitori di autenticazione). Sei responsabile di mantenere la riservatezza del tuo accesso. Non è consentito condividere le credenziali di accesso. Se sospetti accesso non autorizzato al tuo account, notificalo immediatamente a fed.fabiani@gmail.com.
          </p>
        </section>

        <section>
          <h2 className="text-xl text-white font-bold mb-4">Tier Gratuito e Premium</h2>
          <p className="text-foreground/80 leading-relaxed">
            Il tier gratuito consente di accedere agli oroscopi dei 12 segni zodiacali per i giorni corrente e precedente, alle settimane correnti, ai preferiti sincronizzati, e alle notifiche push. Il tier premium (€2,99/mese o €19,99/anno) aggiunge accesso a 30 giorni di oroscopi, 4 settimane di storico, analisi di compatibilità tra segni, e assenza di pubblicità. Gli abbonamenti rinnovano automaticamente ogni mese o anno secondo il piano scelto, a meno che non sia cancellato prima della data di rinnovo.
          </p>
        </section>

        <section>
          <h2 className="text-xl text-white font-bold mb-4">Pagamenti e Abbonamenti</h2>
          <p className="text-foreground/80 leading-relaxed">
            I pagamenti sono elaborati da Stripe, fornitore di servizi di pagamento. Accettando questi termini, autorizzi Stripe a addebitare il metodo di pagamento fornito. Gli abbonamenti rinnovano automaticamente — puoi cancellarli in qualsiasi momento tramite il portale di gestione dei pagamenti. Non è previsto rimborso per periodi parziali non utilizzati. Le fatture sono disponibili tramite il portale Stripe.
          </p>
        </section>

        <section>
          <h2 className="text-xl text-white font-bold mb-4">Disclaimer</h2>
          <p className="text-foreground/80 leading-relaxed">
            Gli oroscopi forniti nell'App sono generati da fonti editoriali pubbliche e sono forniti esclusivamente per intrattenimento. Non costituiscono consulenza astrologica professionale, medica, legale o finanziaria. Non ci assumi alcuna responsabilità per decisioni prese in base agli oroscopi. L'App è fornita "così com'è" senza garanzie di accuratezza, completezza, o disponibilità continua. Non siamo responsabili per danni diretti, indiretti, incidentali o consequenziali derivanti dall'uso o dall'impossibilità di usare l'App.
          </p>
        </section>

        <section>
          <h2 className="text-xl text-white font-bold mb-4">Limitazioni di Responsabilità</h2>
          <p className="text-foreground/80 leading-relaxed">
            Nella misura consentita dalla legge, la nostra responsabilità totale per qualsiasi reclamo derivante dall'uso dell'App è limitata all'importo da te pagato nell'ultimo anno (o zero se stai utilizzando il tier gratuito). Alcuni ordinamenti non consentono limitazioni di responsabilità — in tali casi, la suddetta limitazione potrebbe non applicarsi.
          </p>
        </section>

        <section>
          <h2 className="text-xl text-white font-bold mb-4">Proprietà Intellettuale</h2>
          <p className="text-foreground/80 leading-relaxed">
            L'App, inclusi il design, la funzionalità, e il contenuto compilato, è di proprietà di Federico Fabiani. Gli oroscopi provengono da fonti pubbliche e mantengono i diritti d'autore originali. Non puoi riprodurre, distribuire, o modificare l'App senza autorizzazione. I tuoi preferiti e dati personali rimangono di tua proprietà.
          </p>
        </section>

        <section>
          <h2 className="text-xl text-white font-bold mb-4">Cancellazione Account</h2>
          <p className="text-foreground/80 leading-relaxed">
            Puoi cancellare il tuo account in qualsiasi momento contattando fed.fabiani@gmail.com. La cancellazione è irreversibile e comporta la rimozione di tutti i tuoi dati personali (email, preferiti, storico) entro 90 giorni. Se hai un abbonamento attivo, esso verrà cancellato immediatamente. Eventuali addebiti già elaborati non saranno rimborsati.
          </p>
        </section>

        <section>
          <h2 className="text-xl text-white font-bold mb-4">Legge Applicabile</h2>
          <p className="text-foreground/80 leading-relaxed">
            Questi Termini e Condizioni sono disciplinati dalle leggi italiane. Qualsiasi controversia sarà risolta secondo la legge italiana e la competenza è della giurisdizione italiana.
          </p>
        </section>

        <section>
          <h2 className="text-xl text-white font-bold mb-4">Contatti</h2>
          <p className="text-foreground/80 leading-relaxed">
            Per domande su questi Termini, contatta fed.fabiani@gmail.com.
          </p>
        </section>

        <section>
          <p className="text-sm text-white text-foreground/60">
            Ultimo aggiornamento: maggio 2026
          </p>
        </section>
      </main>
    </div>
  );
}