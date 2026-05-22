import { useEffect, useState, FormEvent } from 'react';
import { SignIn, useSignIn } from '@clerk/clerk-react';
import { Capacitor } from '@capacitor/core';
import { useLocation } from 'wouter';
import { useAuth } from '../hooks/use-auth';
import { trackLogin } from '../lib/analytics';

const isNative = Capacitor.isNativePlatform();

// Clerk's <SignIn> UI component uses modern CSS (@layer, custom properties) that
// fails to render in some Android WebView versions — visible background, no content.
// On native we use useSignIn() directly with a plain React form instead.
function NativeSignInForm() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded || busy) return;
    setError('');
    setBusy(true);
    try {
      const result = await signIn!.create({ identifier: email, password });
      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
        trackLogin('email', true);
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? 'Errore durante il login.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      background: '#053c8e',
      borderRadius: 12,
      padding: '32px 24px',
      width: '100%',
      maxWidth: 400,
      boxSizing: 'border-box',
    }}>
      <h2 style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, marginBottom: 24, textAlign: 'center' }}>
        Accedi
      </h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{
              background: '#2d1e50',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#ffffff',
              fontSize: 15,
              padding: '10px 12px',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{
              background: '#2d1e50',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#ffffff',
              fontSize: 15,
              padding: '10px 12px',
              outline: 'none',
            }}
          />
        </div>

        {error && (
          <p style={{ color: '#ff8080', fontSize: 13, margin: 0 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || !isLoaded}
          style={{
            background: '#E1B64E',
            border: 'none',
            borderRadius: 8,
            color: '#1a1a1a',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontSize: 15,
            fontWeight: 700,
            marginTop: 4,
            opacity: busy ? 0.7 : 1,
            padding: '12px',
          }}
        >
          {busy ? 'Accesso in corso…' : 'Accedi'}
        </button>
      </form>

      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 20, textAlign: 'center' }}>
        Per registrarti o usare Google, accedi dalla versione web.
      </p>
    </div>
  );
}

export default function Login() {
  const { isLoggedIn, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      trackLogin('google', true);
      navigate('/');
    }
  }, [isLoggedIn, isLoading, navigate]);

  if (isLoading || isLoggedIn) return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      {isNative ? (
        <NativeSignInForm />
      ) : (
        <SignIn
          routing="virtual"
          fallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
          appearance={{
            variables: {
              colorPrimary: '#E1B64E',
              colorBackground: '#053c8e',
              colorText: '#ffffff',
              colorInputBackground: '#2d1e50',
              colorInputText: '#ffffff',
            },
          }}
        />
      )}
    </div>
  );
}
