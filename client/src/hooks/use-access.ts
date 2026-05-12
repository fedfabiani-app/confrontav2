import { useAuth } from './use-auth';

interface AccessState {
  canAccessDate: (date: Date) => boolean;
  canAccessWeeksBack: (n: number) => boolean;
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

  function canAccessWeeksBack(n: number): boolean {
    return n <= maxWeeksBack;
  }

  function canAccessCompatibility(): boolean {
    return isPremium;
  }

  return {
    canAccessDate,
    canAccessWeeksBack,
    canAccessCompatibility,
    maxDaysBack,
    maxWeeksBack,
    userTier: tier,
    isLoading,
  };
}
