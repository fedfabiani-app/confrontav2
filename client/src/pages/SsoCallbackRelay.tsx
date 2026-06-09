import { useEffect, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';

// Arrived here via SPA navigation from SsoCallback after handleRedirectCallback
// established the Clerk session.  Works for both web and native Android:
//
//  Native (Chrome Custom Tab):
//    1. Call /api/native-auth-relay → server validates session cookie, mints ticket
//    2. Navigate to confrontaoroscopo://clerk-callback?ticket=...
//    3. Android intercepts → opens Capacitor WebView → appUrlOpen fires → WebView signs in
//
//  Web (regular browser):
//    1. Same relay call (session cookie already set)
//    2. Deep-link navigation fails silently in a browser
//    3. 300 ms fallback → navigate to "/"

function LoadingScreen() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p style={{ color: '#fff', fontSize: 14 }}>Completamento accesso…</p>
    </div>
  );
}

export default function SsoCallbackRelay() {
  const { isLoaded, isSignedIn } = useUser();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || ranRef.current) return;
    ranRef.current = true;

    if (!isSignedIn) {
      window.location.href = '/login';
      return;
    }

    async function relay() {
      try {
        const response = await fetch('/api/native-auth-relay', {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          const body = await response.text();
          console.error('[SsoCallbackRelay] relay failed:', response.status, body);
          window.location.href = '/';
          return;
        }

        const { ticket } = await response.json();

        // Attempt deep-link — Android intercepts and opens the native app
        window.location.href = `confrontaoroscopo://clerk-callback?ticket=${encodeURIComponent(ticket)}`;

        // Web fallback: if deep-link didn't navigate away, go home after 300 ms
        setTimeout(() => {
          window.location.href = '/';
        }, 300);
      } catch (err) {
        console.error('[SsoCallbackRelay] relay exception:', err);
        window.location.href = '/';
      }
    }

    relay();
  }, [isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  return <LoadingScreen />;
}
