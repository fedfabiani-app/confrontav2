import { ReactNode, useState, useEffect } from 'react';
import { ClerkProvider, useUser } from '@clerk/clerk-react';
import { AuthContext, AuthContextValue, defaultAuthState } from '../contexts/auth-context';

function ClerkAuthSync({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const [state, setState] = useState<AuthContextValue>({ ...defaultAuthState, isLoading: true });

  const userId = user?.id;

  useEffect(() => {
    console.log('[useAuth] effect triggered, userId:', userId);
    if (!isLoaded) return;
    if (!isSignedIn || !userId) {
      setState(defaultAuthState);
      return;
    }

    let cancelled = false;
    fetch('/api/user/me', { headers: { 'x-clerk-user-id': userId } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setState({
          isLoggedIn: true,
          isLoading: false,
          tier: data?.tier === 'premium' ? 'premium' : 'free',
          user: {
            id: user.id,
            email: user.primaryEmailAddress?.emailAddress,
            name: user.fullName ?? undefined,
          },
          clerkUserId: userId,
        });

        // Migrate favorites from localStorage to DB (fire-and-forget)
        const localSigns = JSON.parse(localStorage.getItem('horoscope:home-favorites:v1') || '[]');
        const localSources = JSON.parse(localStorage.getItem('horoscope:favorites:v1') || '[]');
        console.log('[Prefs] localSigns:', localSigns, 'localSources:', localSources);
        if (localSigns.length > 0 || localSources.length > 0) {
          fetch('/api/user/preferences', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-clerk-user-id': userId,
            },
            body: JSON.stringify({
              favoriteSigns: localSigns,
              favoriteSources: localSources.map(String),
            }),
          })
            .then((res) => {
              console.log('[Prefs] POST response status:', res.status);
              return res.ok ? res.json() : null;
            })
            .then((data) => console.log('[Prefs] POST result:', data))
            .catch(() => {});
        }

        // Restore favorites from DB into localStorage
        fetch('/api/user/preferences', {
          headers: { 'x-clerk-user-id': userId },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((prefs) => {
            console.log('[Prefs] GET result:', prefs);
            if (!prefs) return;
            if (prefs.favoriteSigns?.length > 0) {
              localStorage.setItem('horoscope:home-favorites:v1', JSON.stringify(prefs.favoriteSigns));
              window.dispatchEvent(new Event('storage'));
            }
            if (prefs.favoriteSources?.length > 0) {
              localStorage.setItem(
                'horoscope:favorites:v1',
                JSON.stringify(prefs.favoriteSources.map(Number))
              );
              window.dispatchEvent(new Event('storage'));
            }
          })
          .catch(() => {});
      })
      .catch(() => {
        if (!cancelled)
          setState({
            isLoggedIn: true,
            isLoading: false,
            tier: 'free',
            user: { id: userId },
            clerkUserId: userId,
          });
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function ClerkAuthProvider({
  publishableKey,
  children,
}: {
  publishableKey: string;
  children: ReactNode;
}) {
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkAuthSync>{children}</ClerkAuthSync>
    </ClerkProvider>
  );
}
