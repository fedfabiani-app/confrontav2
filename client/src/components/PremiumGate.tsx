import React from 'react';
import { Lock } from 'lucide-react';
import { useLocation } from 'wouter';

interface PremiumGateProps {
  locked: boolean;
  message?: string;
  children: React.ReactNode;
}

export function PremiumGate({ locked, message = 'Funzionalità Premium', children }: PremiumGateProps) {
  const [, navigate] = useLocation();

  if (!locked) return <>{children}</>;

  return (
    <div className="relative overflow-hidden">
      {children}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[inherit] pt-8 pb-8"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)' }}
      >
        <Lock className="text-white" size={28} strokeWidth={1.8} />
        <p className="text-white text-sm font-medium">{message}</p>
        <span
          className="px-3 py-0.5 rounded-full text-xs font-bold"
          style={{ background: 'rgba(var(--header-gold-rgb), 0.15)', color: 'var(--header-gold)', border: '1px solid rgba(var(--header-gold-rgb), 0.4)' }}
        >
          🎁 30 giorni gratis
        </span>
        <button
          onClick={() => navigate('/pricing')}
          className="px-4 py-1.5 rounded-full text-sm font-semibold mb-4"
          style={{ background: 'var(--header-gold)', color: '#1a1a1a' }}
        >
          Prova gratis per 30 giorni
        </button>
      </div>
    </div>
  );
}
