import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';

type Tier = 'guest' | 'free' | 'premium';

interface AuthState {
  isLoggedIn: boolean;
  isLoading: boolean;
  tier: Tier;
  user: { id?: string; email?: string; name?: string } | null;
  clerkUserId: string | null;
}

export function useAuth(): AuthState {
  const { isLoaded, isSignedIn, user } = useUser();
  console.log('[useAuth] isLoaded:', isLoaded, 'isSignedIn:', isSignedIn, 'userId:', user?.id);
  const [tier, setTier] = useState<Tier>('guest');
  const [tierLoading, setTierLoading] = useState(false);

  const userId = user?.id;

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !userId) {
      setTier('guest');
      setTierLoading(false);
      return;
    }

    setTierLoading(true);
    let cancelled = false;

    fetch('/api/user/me', {
      headers: { 'x-clerk-user-id': userId },
    })
      .then((res) => {
        if (!res.ok) throw new Error('API error');
        return res.json() as Promise<{ tier: string }>;
      })
      .then((data) => {
        if (!cancelled) setTier(data.tier === 'premium' ? 'premium' : 'free');
      })
      .catch(() => {
        if (!cancelled) setTier('free');
      })
      .finally(() => {
        if (!cancelled) setTierLoading(false);
      });

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, userId]);

  const isLoggedIn = isLoaded && (isSignedIn ?? false);

  return {
    isLoggedIn,
    isLoading: !isLoaded || tierLoading,
    tier: isLoggedIn ? tier : 'guest',
    user: isLoggedIn && user
      ? {
          id: user.id,
          email: user.primaryEmailAddress?.emailAddress,
          name: user.fullName ?? undefined,
        }
      : null,
    clerkUserId: isLoggedIn ? (userId ?? null) : null,
  };
}
