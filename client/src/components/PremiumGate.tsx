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
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[inherit]"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)' }}
      >
        <Lock className="text-white" size={28} strokeWidth={1.8} />
        <p className="text-white text-sm font-medium">{message}</p>
        <button
          onClick={() => navigate('/pricing')}
          className="px-4 py-1.5 rounded-full text-sm font-semibold"
          style={{ background: '#E1B64E', color: '#1a1a1a' }}
        >
          Scopri Premium
        </button>
      </div>
    </div>
  );
}
