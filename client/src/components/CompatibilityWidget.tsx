import { useState } from 'react';
import { useAccess } from '../hooks/use-access';
import { PremiumGate } from './PremiumGate';

interface CompatibilityWidgetProps {
  currentSign: string;
}

const SIGNS = [
  { en: 'aries', it: 'Ariete' }, { en: 'taurus', it: 'Toro' },
  { en: 'gemini', it: 'Gemelli' }, { en: 'cancer', it: 'Cancro' },
  { en: 'leo', it: 'Leone' }, { en: 'virgo', it: 'Vergine' },
  { en: 'libra', it: 'Bilancia' }, { en: 'scorpio', it: 'Scorpione' },
  { en: 'sagittarius', it: 'Sagittario' }, { en: 'capricorn', it: 'Capricorno' },
  { en: 'aquarius', it: 'Acquario' }, { en: 'pisces', it: 'Pesci' },
];

type Status = 'idle' | 'loading' | 'result' | 'error';

export function CompatibilityWidget({ currentSign }: CompatibilityWidgetProps) {
  const { canAccessCompatibility } = useAccess();

  const otherSigns = SIGNS.filter((s) => s.en !== currentSign);
  const [selectedSign, setSelectedSign] = useState(otherSigns[0]?.en ?? '');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<string>('');

  async function handleAnalyze() {
    if (!selectedSign || status === 'loading') return;
    setStatus('loading');
    setResult('');
    try {
      const res = await fetch('/api/compatibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sign1: currentSign, sign2: selectedSign }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data.result ?? JSON.stringify(data));
      setStatus('result');
    } catch {
      setStatus('error');
    }
  }

  const selectedIt = SIGNS.find((s) => s.en === selectedSign)?.it ?? '';

  const inner = (
    <div className="rounded-xl p-4 space-y-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <h3 className="text-white font-semibold text-sm">Compatibilità con…</h3>

      <div className="flex gap-2">
        <select
          value={selectedSign}
          onChange={(e) => { setSelectedSign(e.target.value); setStatus('idle'); setResult(''); }}
          className="flex-1 rounded-lg px-3 py-2 text-sm text-white outline-none"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          {otherSigns.map((s) => (
            <option key={s.en} value={s.en} style={{ background: '#1a1230', color: '#fff' }}>
              {s.it}
            </option>
          ))}
        </select>

        <button
          onClick={handleAnalyze}
          disabled={status === 'loading'}
          className="px-4 py-2 rounded-lg text-sm font-semibold shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          style={{ background: '#E1B64E', color: '#1a1a1a' }}
        >
          {status === 'loading' ? 'Analisi…' : 'Analizza'}
        </button>
      </div>

      {status === 'loading' && (
        <div className="flex items-center justify-center py-4">
          <div className="w-6 h-6 border-2 border-[#E1B64E] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {status === 'result' && result && (
        <div
          className="rounded-lg p-4 text-sm text-white leading-relaxed"
          style={{ background: 'rgba(225,182,78,0.08)', border: '1px solid rgba(225,182,78,0.3)' }}
        >
          <p className="text-[#E1B64E] text-xs font-semibold mb-2 uppercase tracking-wide">
            {SIGNS.find(s => s.en === currentSign)?.it} + {selectedIt}
          </p>
          {result}
        </div>
      )}

      {status === 'error' && (
        <p className="text-red-400 text-sm text-center py-2">
          Analisi non disponibile al momento. Riprova.
        </p>
      )}
    </div>
  );

  return (
    <PremiumGate locked={!canAccessCompatibility()} message="Compatibilità disponibile con Premium">
      {inner}
    </PremiumGate>
  );
}
