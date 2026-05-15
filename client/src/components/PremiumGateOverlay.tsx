import { Lock } from 'lucide-react';
import { useLocation } from 'wouter';

interface PremiumGateOverlayProps {
  type: 'daily' | 'weekly';
  date: string;
  onClose: () => void;
}

export function PremiumGateOverlay({ type, date, onClose }: PremiumGateOverlayProps) {
  const [, navigate] = useLocation();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="bg-[#1e1440] border border-white/20 rounded-2xl p-8 max-w-sm mx-4 w-full text-center space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Lock className="w-12 h-12 mx-auto" style={{ color: '#E1B64E' }} />
        <h2 className="text-xl font-bold text-white">
          {type === 'daily' ? 'Oroscopo Premium' : 'Settimana Premium'}
        </h2>
        <p className="text-gray-300 text-sm leading-relaxed">
          Accedi a{' '}
          <span className="text-white font-medium">
            {type === 'weekly' ? `la settimana del ${date}` : date}
          </span>{' '}
          con Premium
        </p>
        <div className="flex flex-col gap-3 pt-2">
          <button
            onClick={() => navigate('/pricing')}
            className="w-full py-2.5 rounded-full font-semibold text-sm transition-opacity hover:opacity-90"
            style={{ background: '#E1B64E', color: '#1a1a1a' }}
          >
            Upgrade a Premium
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-full text-white border border-white/30 text-sm font-medium hover:bg-white/10 transition-colors"
          >
            Indietro
          </button>
        </div>
      </div>
    </div>
  );
}
