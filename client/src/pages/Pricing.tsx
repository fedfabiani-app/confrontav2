import { useLocation } from 'wouter';
import { ArrowLeft, Check } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { useAccess } from '../hooks/use-access';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@clerk/clerk-react';
import { trackCheckoutStart } from '../lib/analytics';

const FREE_FEATURES = [
  'Tutti i 12 segni',
  '14+ fonti italiane',
  'Oroscopo giornaliero (solo oggi)',
  'Oroscopo settimanale (settimana corrente)',
  'Notifiche push',
  'Sync preferiti su tutti i tuoi device',
];

const PREMIUM_FEATURES = [
  ...FREE_FEATURES,
  'Storico ultimi 30 giorni',
  'Storico ultime 4 settimane',
  'Affinità tra segni per giorno e settimana',
  'Nessuna pubblicità',
  
];

const CARD_BASE = 'rounded-2xl p-6 flex flex-col gap-5';
const CARD_FREE = `${CARD_BASE} border border-white/20` ;
const CARD_PREMIUM = `${CARD_BASE}`;

export default function Pricing() {
  const [, navigate] = useLocation();
  const { userTier } = useAccess();
  const { toast } = useToast();
  const { user } = useUser();

  const handleCheckout = async (priceId: string) => {
    if (!user) {
      navigate('/login?redirect=/pricing');
      return;
    }
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-clerk-user-id': user.id
        },
        body: JSON.stringify({ priceId })
      });
      const { url } = await response.json();
      if (url) window.location.href = url;
    } catch (error) {
      console.error('Checkout error:', error);
      toast({ title: 'Errore', description: 'Impossibile avviare il pagamento' });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Torna alla home"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white">Piani</h1>
        </div>
      </AppHeader>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        <h2 className="text-center text-2xl font-bold text-white">Scegli il tuo piano</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* FREE */}
          <div className={CARD_FREE} style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white/70 mb-3">
                GRATUITO
              </span>
              <p className="text-2xl font-bold text-white">€0</p>
              <p className="text-white/50 text-sm">/ sempre</p>
            </div>

            <ul className="space-y-2 flex-1">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-white/80">
                  <Check size={15} className="mt-0.5 shrink-0 text-white/50" />
                  {f}
                </li>
              ))}
            </ul>

            {userTier === 'guest' ? (
              <button
                onClick={() => navigate('/login')}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.3)' }}
              >
                Inizia gratis
              </button>
            ) : (
              <button
                disabled
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white/40 cursor-not-allowed"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
              >
                Il tuo piano attuale
              </button>
            )}
          </div>

          {/* PREMIUM */}
          <div
            className={CARD_PREMIUM}
            style={{ background: 'rgba(225,182,78,0.08)', border: '1.5px solid #E1B64E' }}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span
                  className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: '#E1B64E', color: '#1a1a1a' }}
                >
                  PREMIUM
                </span>
                <span
                  className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: 'rgba(255,255,255,0.15)', color: '#ffffff' }}
                >
                  🎁 30 giorni gratis
                </span>
              </div>
              <p className="text-2xl font-bold text-white">€2,99</p>
              <p className="text-white/50 text-sm">/ mese</p>
              <p className="text-white/40 text-xs mt-0.5">o €19,99 / anno</p>
            </div>

            <ul className="space-y-2 flex-1">
              {PREMIUM_FEATURES.map((f, i) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check
                    size={15}
                    className={`mt-0.5 shrink-0 ${i >= FREE_FEATURES.length ? 'text-[#E1B64E]' : 'text-white/50'}`}
                  />
                  <span className={i >= FREE_FEATURES.length ? 'text-white font-medium' : 'text-white/80'}>
                    {f}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  trackCheckoutStart('monthly');
                  handleCheckout('price_1TeuFcLi2fBiRYknDybE3eul');
                }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#E1B64E', color: '#1a1a1a' }}
              >
                Prova gratis 30 giorni — poi €2,99/mese
              </button>
              <button
                onClick={() => {
                  trackCheckoutStart('yearly');
                  handleCheckout('price_1TX0IyLi2fBiRYknTy3zbGVF');
                }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white/80"
                style={{ border: '1px solid #E1B64E', background: 'transparent' }}
              >
                Prova gratis 30 giorni — poi €19,99/anno
              </button>
            </div>
          </div>

        </div>

        <p className="text-center text-white/40 text-xs">
          Pagamento sicuro gestito da Stripe. Annulla quando vuoi.
        </p>
      </main>
    </div>
  );
}
