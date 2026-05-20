import { useAuth } from './use-auth';

interface OverlayAccess {
  canAccess: boolean;
  showOverlay: boolean;
}

interface AccessState {
  canAccessDate: (date: Date) => boolean;
  canAccessDateWithOverlay: (date: Date) => OverlayAccess;
  canAccessWeeksBack: (n: number) => boolean;
  canAccessWeekWithOverlay: (n: number) => OverlayAccess;
  canAccessCompatibility: () => boolean;
  maxDaysBack: number;
  maxWeeksBack: number;
  userTier: 'guest' | 'free' | 'premium';
  isLoading: boolean;
}

export function useAccess(): AccessState {
  const { tier, isLoading } = useAuth();

  const isPremium = tier === 'premium';
  const maxDaysBack = isPremium ? 29 : 1;
  const maxWeeksBack = isPremium ? 3 : 0;

  function canAccessDate(date: Date): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
    return diffDays <= maxDaysBack;
  }

  function canAccessDateWithOverlay(date: Date): OverlayAccess {
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.round((now.getTime() - target.getTime()) / 86_400_000);
    if (diffDays <= maxDaysBack) return { canAccess: true, showOverlay: false };
    if (diffDays <= 29) return { canAccess: false, showOverlay: true };
    return { canAccess: false, showOverlay: false };
  }

  function canAccessWeeksBack(n: number): boolean {
    return n <= maxWeeksBack;
  }

  function canAccessWeekWithOverlay(n: number): OverlayAccess {
    if (n <= maxWeeksBack) return { canAccess: true, showOverlay: false };
    if (n <= 3) return { canAccess: false, showOverlay: true };
    return { canAccess: false, showOverlay: false };
  }

  function canAccessCompatibility(): boolean {
    return isPremium;
  }

  return {
    canAccessDate,
    canAccessDateWithOverlay,
    canAccessWeeksBack,
    canAccessWeekWithOverlay,
    canAccessCompatibility,
    maxDaysBack,
    maxWeeksBack,
    userTier: tier,
    isLoading,
  };
}
