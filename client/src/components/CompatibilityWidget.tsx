import { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { useAccess } from '../hooks/use-access';
import { useAuth } from '../hooks/use-auth';
import { useLocation } from 'wouter';

interface CompatibilityWidgetProps {
  currentSign?: string;
  viewType?: 'daily' | 'weekly';
  weekStartDate?: string;
}

const SIGNS = [
  { en: 'aries', it: 'Ariete' }, { en: 'taurus', it: 'Toro' },
  { en: 'gemini', it: 'Gemelli' }, { en: 'cancer', it: 'Cancro' },
  { en: 'leo', it: 'Leone' }, { en: 'virgo', it: 'Vergine' },
  { en: 'libra', it: 'Bilancia' }, { en: 'scorpio', it: 'Scorpione' },
  { en: 'sagittarius', it: 'Sagittario' }, { en: 'capricorn', it: 'Capricorno' },
  { en: 'aquarius', it: 'Acquario' }, { en: 'pisces', it: 'Pesci' },
];

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatWeekLabel(weekStartDate: string): string {
  const start = new Date(weekStartDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
}

type Status = 'idle' | 'loading' | 'result' | 'error';

export function CompatibilityWidget({ currentSign, viewType = 'daily', weekStartDate }: CompatibilityWidgetProps) {
  const { canAccessCompatibility } = useAccess();
  const { clerkUserId } = useAuth();
  const [, navigate] = useLocation();

  const defaultSign1 = currentSign && SIGNS.find(s => s.en === currentSign) ? currentSign : SIGNS[0].en;
  const defaultSign2 = SIGNS.find(s => s.en !== defaultSign1)?.en ?? SIGNS[1].en;

  const [sign1, setSign1] = useState(defaultSign1);
  const [sign2, setSign2] = useState(defaultSign2);
  const [date, setDate] = useState(todayStr());
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState('');

  const isPremium = canAccessCompatibility();

  function resetResult() {
    setStatus('idle');
    setResult('');
  }

  useEffect(() => {
    resetResult();
  }, [viewType, weekStartDate]);

  async function handleAnalyze() {
    if (status === 'loading') return;
    setStatus('loading');
    setResult('');
    try {
      const isWeekly = viewType === 'weekly';
      const endpoint = isWeekly ? '/api/weekly-compatibility' : '/api/compatibility';
      const body = isWeekly
        ? { sign1, sign2, weekStartDate }
        : { sign1, sign2, date };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(clerkUserId ? { 'x-clerk-user-id': clerkUserId } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data.result ?? '');
      setStatus('result');
    } catch {
      setStatus('error');
    }
  }

  const sign1Label = SIGNS.find(s => s.en === sign1)?.it ?? sign1;
  const sign2Label = SIGNS.find(s => s.en === sign2)?.it ?? sign2;

  const selectStyle = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
  } as const;

  return (
    <div
      className="relative rounded-xl p-4 space-y-4"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <h3 className="text-white font-semibold text-sm">Affinità tra segni</h3>

      {/* Dual sign selectors */}
      <div className="flex gap-2 items-center">
        <select
          value={sign1}
          onChange={e => { setSign1(e.target.value); resetResult(); }}
          className="flex-1 rounded-lg px-3 py-2 text-sm text-white outline-none"
          style={selectStyle}
        >
          {SIGNS.map(s => (
            <option key={s.en} value={s.en} style={{ background: '#1a1230', color: '#fff' }}>{s.it}</option>
          ))}
        </select>

        <span className="text-white/50 text-xs font-medium shrink-0">+</span>

        <select
          value={sign2}
          onChange={e => { setSign2(e.target.value); resetResult(); }}
          className="flex-1 rounded-lg px-3 py-2 text-sm text-white outline-none"
          style={selectStyle}
        >
          {SIGNS.map(s => (
            <option key={s.en} value={s.en} style={{ background: '#1a1230', color: '#fff' }}>{s.it}</option>
          ))}
        </select>
      </div>

      {/* Date picker (daily) or week label (weekly) */}
      {viewType === 'weekly' ? (
        <div
          className="w-full rounded-lg px-3 py-2 text-sm text-white/70 text-center"
          style={selectStyle}
        >
          {weekStartDate ? formatWeekLabel(weekStartDate) : 'Settimana corrente'}
        </div>
      ) : (
        <input
          type="date"
          value={date}
          max={todayStr()}
          onChange={e => { setDate(e.target.value); resetResult(); }}
          className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
          style={selectStyle}
        />
      )}

      {/* Analyze button */}
      <button
        onClick={handleAnalyze}
        disabled={status === 'loading'}
        className="w-full py-2 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        style={{ background: '#E1B64E', color: '#1a1a1a' }}
      >
        {status === 'loading' ? 'Analisi in corso…' : 'Analizza Compatibilità'}
      </button>

      {/* Loading spinner */}
      {status === 'loading' && (
        <div className="flex items-center justify-center py-3">
          <div className="w-5 h-5 border-2 border-[#E1B64E] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Result */}
      {status === 'result' && result && (
        <div
          className="rounded-lg p-4 text-sm leading-relaxed"
          style={{
            background: 'rgba(225,182,78,0.08)',
            border: '1px solid rgba(225,182,78,0.3)',
          }}
        >
          <p className="text-[#E1B64E] text-xs font-semibold mb-2 uppercase tracking-wide">
            {sign1Label} + {sign2Label}
          </p>
          <p className="text-white">{result}</p>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <p className="text-red-400 text-sm text-center py-2">
          Analisi non disponibile. Controlla la data o riprova.
        </p>
      )}

      {/* Premium gate overlay — covers the entire widget */}
      {!isPremium && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl"
          style={{
            background: 'rgba(10,7,30,0.82)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          <Lock className="text-[#E1B64E]" size={28} strokeWidth={1.6} />
          <p className="text-white text-sm font-semibold text-center px-4">
            Affinità tra segni 
          </p>
          <p className="text-white/60 text-xs text-center px-6 leading-relaxed">
            Scopri la compatibilità astrologica con Premium
          </p>
          <button
            onClick={() => navigate('/pricing')}
            className="mt-1 px-5 py-2 rounded-full text-xs font-semibold transition-opacity hover:opacity-90"
            style={{ background: '#E1B64E', color: '#1a1a1a' }}
          >
            Scopri Premium
          </button>
        </div>
      )}
    </div>
  );
}
