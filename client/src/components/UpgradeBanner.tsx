import { useLocation } from 'wouter';
import { useAccess } from '../hooks/use-access';

interface UpgradeBannerProps {
  context: 'sync' | 'history' | 'weeks' | 'compatibility';
}

type BannerConfig = { text: string; cta: string; href: string };

const CONFIGS: Record<string, BannerConfig> = {
  'guest:sync':          { text: 'Sincronizza i tuoi preferiti su tutti i dispositivi', cta: 'Crea account gratis', href: '/login' },
  'free:history':        { text: 'Accedi agli oroscopi di ieri e degli ultimi 30 giorni',  cta: 'Passa a Premium',        href: '/pricing' },
  'free:weeks':          { text: 'Consulta le ultime 4 settimane',                         cta: 'Passa a Premium',        href: '/pricing' },
  'free:compatibility':  { text: 'Scopri la compatibilità con altri segni',                cta: 'Passa a Premium',        href: '/pricing' },
};

export function UpgradeBanner({ context }: UpgradeBannerProps) {
  const { userTier, isLoading } = useAccess();
  const [, navigate] = useLocation();

  if (isLoading || userTier === 'premium') return null;
  if (userTier === 'guest' && context !== 'sync') return null;
  if (userTier === 'free' && context === 'sync') return null;

  const config = CONFIGS[`${userTier}:${context}`];
  if (!config) return null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm"
      style={{
        background: 'rgba(225, 182, 78, 0.1)',
        border: '1px solid rgba(225, 182, 78, 0.3)',
      }}
    >
      <span className="text-white">{config.text}</span>
      <button
        onClick={() => navigate(config.href)}
        className="ml-auto shrink-0 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
        style={{ background: '#E1B64E', color: '#1a1a1a' }}
      >
        {config.cta}
      </button>
    </div>
  );
}
