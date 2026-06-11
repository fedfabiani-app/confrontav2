import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react';

// Handles the Clerk OAuth redirect callback for both web and native Android.
//
// Web:
//   The browser lands here after Google OAuth → Clerk → /sso-callback?__clerk_status=...
//   AuthenticateWithRedirectCallback reads the URL params and establishes the session.
//
// Native (Android):
//   Clerk redirects to confrontaoroscopo://sso-callback?__clerk_status=...
//   Android intercepts → appUrlOpen fires → Login.tsx navigates the WebView here
//   with the same Clerk params → same processing path as web.

export default function SsoCallback() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: '#fff', fontSize: 14 }}>Completamento accesso…</p>
      </div>
      <AuthenticateWithRedirectCallback />
    </>
  );
}
