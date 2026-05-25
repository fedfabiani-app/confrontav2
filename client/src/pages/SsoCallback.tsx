import { useEffect, useRef } from 'react';
import { useUser, useClerk, AuthenticateWithRedirectCallback } from '@clerk/clerk-react';
import { Capacitor } from '@capacitor/core';

// ── Native Android OAuth relay ──────────────────────────────────────────────
// When the app uses Chrome Custom Tabs for Google OAuth, Clerk redirects here
// after the flow completes.  The redirectUrl in signIn.create() is
//   <origin>/sso-callback
// We detect the native context via Capacitor.isNativePlatform() (not via a
// ?native=1 query param) so Clerk only needs one URL in its Allowed redirect
// URLs list and the same URL serves both web and Android.
//
// Why this works:
//  • Clerk's FAPI sets a session cookie for .confrontaoroscopo.it when it
//    redirects here.  Chrome Custom Tab picks up that cookie.
//  • We call our backend (/api/native-auth-relay) — the request carries the
//    cookie → the server validates the session → mints a short-lived sign-in
//    token.
//  • We redirect to the custom scheme deep-link with the token:
//      confrontaoroscopo://clerk-callback?ticket=<token>
//  • Android routes the deep-link back to the Capacitor WebView.
//  • The appUrlOpen listener in Login.tsx receives the ticket and calls
//    signIn.create({ strategy: 'ticket', ticket }) to log the user in natively.
//
// ── Web OAuth callback ──────────────────────────────────────────────────────
// When there is no ?native=1 (direct browser visit), we delegate to Clerk's
// built-in <AuthenticateWithRedirectCallback /> which handles the URL params
// and navigates to afterSignInUrl.
// ─────────────────────────────────────────────────────────────────────────────

function NativeRelay() {
  const { isLoaded, isSignedIn } = useUser();
  const { handleRedirectCallback } = useClerk();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || ranRef.current) return;
    ranRef.current = true;

    async function relay() {
      // If Clerk hasn't picked up the session automatically yet, trigger the
      // standard redirect-callback handler.  We point afterSignInUrl back to
      // the same page (with status=ready) so the page doesn't navigate away.
      if (!isSignedIn) {
        try {
          await handleRedirectCallback({
            afterSignInUrl: `${window.location.pathname}${window.location.search}&status=ready`,
            afterSignUpUrl: `${window.location.pathname}${window.location.search}&status=ready`,
          });
          // handleRedirectCallback navigates (SPA push); our effect will re-run
          // with the updated URL and isSignedIn=true.
        } catch (err) {
          console.error('[SsoCallback] handleRedirectCallback error:', err);
          window.location.href = 'confrontaoroscopo://clerk-callback?error=callback_failed';
        }
        return;
      }

      // Session is active — call the relay endpoint (Chrome Tab cookies are
      // automatically included because it's a same-domain fetch).
      try {
        const response = await fetch('/api/native-auth-relay', {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          const body = await response.text();
          console.error('[SsoCallback] relay failed:', response.status, body);
          window.location.href = 'confrontaoroscopo://clerk-callback?error=relay_failed';
          return;
        }

        const { ticket } = await response.json();
        console.log('[SsoCallback] relay succeeded, redirecting to deep-link');
        window.location.href = `confrontaoroscopo://clerk-callback?ticket=${encodeURIComponent(ticket)}`;
      } catch (err) {
        console.error('[SsoCallback] relay exception:', err);
        window.location.href = 'confrontaoroscopo://clerk-callback?error=relay_exception';
      }
    }

    relay();
  }, [isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p style={{ color: '#fff', fontSize: 14 }}>Completamento accesso…</p>
    </div>
  );
}

export default function SsoCallback() {
  // Detect native Android/iOS via Capacitor rather than a ?native=1 query param.
  // This lets us use the same clean /sso-callback URL for both web and native,
  // avoiding Clerk's strict URL allowlist rejecting a URL with unknown query params.
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    return <NativeRelay />;
  }

  // Web flow: Clerk's built-in component processes the URL params and navigates.
  return <AuthenticateWithRedirectCallback />;
}
