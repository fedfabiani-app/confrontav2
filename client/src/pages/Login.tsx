import { useEffect, useRef, useState, FormEvent } from 'react';
import { SignIn, useSignIn } from '@clerk/clerk-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { useLocation } from 'wouter';
import { useAuth } from '../hooks/use-auth';
import { trackLogin } from '../lib/analytics';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const isNative = Capacitor.isNativePlatform();
console.log('[Login] isNative:', isNative, '| platform:', Capacitor.getPlatform());

const cardStyle: React.CSSProperties = {
  background: '#053c8e',
  borderRadius: 12,
  boxSizing: 'border-box',
  maxWidth: 400,
  padding: '32px 24px',
  width: '100%',
};

const inputStyle: React.CSSProperties = {
  background: '#2d1e50',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 8,
  color: '#ffffff',
  fontSize: 15,
  outline: 'none',
  padding: '10px 12px',
  width: '100%',
  boxSizing: 'border-box',
};

const primaryBtnStyle = (disabled: boolean): React.CSSProperties => ({
  background: 'var(--header-gold)',
  border: 'none',
  borderRadius: 8,
  color: '#1a1a1a',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 15,
  fontWeight: 700,
  marginTop: 4,
  opacity: disabled ? 0.7 : 1,
  padding: '12px',
  width: '100%',
});

const ghostBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: 8,
  color: 'rgba(255,255,255,0.7)',
  cursor: 'pointer',
  fontSize: 14,
  padding: '10px',
  width: '100%',
};

const googleBtnStyle = (disabled: boolean): React.CSSProperties => ({
  alignItems: 'center',
  background: disabled ? 'rgba(255,255,255,0.7)' : '#ffffff',
  border: 'none',
  borderRadius: 8,
  color: '#1a1a1a',
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'flex',
  fontSize: 15,
  fontWeight: 600,
  gap: 10,
  justifyContent: 'center',
  opacity: disabled ? 0.7 : 1,
  padding: '12px',
  width: '100%',
});

// Handles email_link (magic link), email_code (OTP) and oauth_google strategies.
function NativeSignInForm() {
  const { signIn, setActive, isLoaded } = useSignIn();

  // Keep refs current so the appUrlOpen handler always has the latest Clerk API
  // objects without adding them as useEffect dependencies.  Adding signIn/setActive
  // as deps caused the effect to re-run every time signIn.create() updated Clerk's
  // internal state (e.g. right after Browser.open for Google OAuth), which triggered
  // the cleanup and removed the browserFinished listener mid-flow, permanently
  // blocking the OAuth callback from completing.
  const signInRef = useRef(signIn);
  const setActiveRef = useRef(setActive);
  useEffect(() => {
    signInRef.current = signIn;
    setActiveRef.current = setActive;
  }, [signIn, setActive]);

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'email' | 'waiting' | 'otp' | 'google_pending'>('email');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const browserListenerRef = useRef<{ remove: () => Promise<void> } | null>(null);

  useEffect(() => {
    // Deep-link handler: receives the sign-in ticket from the Chrome Custom Tab
    // after the /api/native-auth-relay endpoint minted it.
    //
    // Happy path:  confrontaoroscopo://clerk-callback?ticket=<token>
    //   → signIn.create({ strategy: 'ticket', ticket })
    //   → setActive({ session: createdSessionId })
    //   → Clerk marks the user as signed-in in the WebView context
    //
    // Error path:  confrontaoroscopo://clerk-callback?error=<reason>
    //   → show an error message (or just reload for the user to retry)
    const listenerPromise = App.addListener('appUrlOpen', async ({ url }) => {
      try {
        const u = new URL(url);

        // App Link (HTTPS): https://confrontaoroscopo.it/sso-callback?__clerk_status=...
        // Custom scheme fallback: confrontaoroscopo://sso-callback?__clerk_status=...
        if (
          (u.protocol === 'https:' && u.hostname === 'confrontaoroscopo.it' && u.pathname === '/sso-callback') ||
          u.host === 'sso-callback'
        ) {
          console.log('[Login] appUrlOpen — sso-callback, navigating WebView');
          Browser.close().catch(() => {});
          const params = u.searchParams.toString();
          window.location.href = `/sso-callback${params ? '?' + params : ''}`;
          return;
        }

        if (u.host !== 'clerk-callback') return;

        const ticket = u.searchParams.get('ticket');
        const error  = u.searchParams.get('error');

        if (ticket && signInRef.current && isLoaded) {
          console.log('[Login] appUrlOpen — exchanging ticket for session');
          try {
            const result = await signInRef.current.create({
              strategy: 'ticket',
              ticket,
            } as any);
            if (result.status === 'complete') {
              await setActiveRef.current!({ session: result.createdSessionId });
              // Login component detects isLoggedIn and navigates to '/'
            } else {
              console.warn('[Login] ticket exchange incomplete:', result.status);
              setError('Accesso non completato. Riprova.');
              setGoogleBusy(false);
              setStage('email');
            }
          } catch (err: any) {
            const msg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? 'Errore ticket.';
            console.error('[Login] ticket exchange error:', msg);
            setError(msg);
            setGoogleBusy(false);
            setStage('email');
          }
        } else if (error) {
          console.error('[Login] appUrlOpen — OAuth error:', error);
          setError('Accesso Google non riuscito. Riprova.');
          setGoogleBusy(false);
          setStage('email');
        } else {
          // No ticket and no error — OAuth may have been cancelled
          setGoogleBusy(false);
          setStage('email');
        }
      } catch {
        setGoogleBusy(false);
        setStage('email');
      }
    });

    return () => {
      cancelRef.current?.();
      cancelRef.current = null;
      // Do NOT remove browserListenerRef here — it is managed by handleBack() and
      // the browserFinished listener itself.  Removing it on every effect re-run
      // (e.g. when isLoaded transitions false→true) would kill an in-flight OAuth.
      listenerPromise.then(l => l.remove());
    };
  }, [isLoaded]); // Re-register only when Clerk finishes loading, not on every signIn update

  // ── Email / magic-link / OTP submit ────────────────────────────────────────
  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded || busy) return;
    setError('');
    setBusy(true);

    try {
      const si = await signIn!.create({ identifier: email });
      const factors = si.supportedFirstFactors ?? [];
      console.log('[Login] supportedFirstFactors:', JSON.stringify(factors.map((f: any) => f.strategy)));

      const linkFactor = factors.find((f: any) => f.strategy === 'email_link') as any;
      const codeFactor = factors.find((f: any) => f.strategy === 'email_code') as any;

      if (linkFactor) {
        const { startEmailLinkFlow, cancelEmailLinkFlow } = si.createEmailLinkFlow();
        cancelRef.current = cancelEmailLinkFlow;
        setStage('waiting');
        setBusy(false);

        const result = await startEmailLinkFlow({
          emailAddressId: linkFactor.emailAddressId,
          redirectUrl: window.location.origin + '/login',
        });

        if (result.status === 'complete') {
          await setActive!({ session: result.createdSessionId });
          trackLogin('email_link', true);
        } else {
          setError('Link scaduto o non valido. Riprova.');
          setStage('email');
        }
      } else if (codeFactor) {
        await si.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: codeFactor.emailAddressId,
        });
        setStage('otp');
        setBusy(false);
      } else {
        console.log('[Login] No supported factor. Factors:', JSON.stringify(factors));
        setError('Metodo di accesso non disponibile. Contatta il supporto.');
        setBusy(false);
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? 'Errore durante il login.';
      console.log('[Login] handleEmailSubmit error:', msg);
      setError(msg);
      setBusy(false);
    }
  }

  // ── OTP verify ─────────────────────────────────────────────────────────────
  async function handleOtpSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded || busy) return;
    setError('');
    setBusy(true);

    try {
      const result = await signIn!.attemptFirstFactor({ strategy: 'email_code', code: otp });
      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
        trackLogin('email_code', true);
      } else {
        setError('Verifica non completata. Riprova.');
        setBusy(false);
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? 'Codice non valido.';
      setError(msg);
      setBusy(false);
    }
  }

  // ── Google Sign-In ──────────────────────────────────────────────────────────
  //
  // Native path: open server-side OAuth start URL in Chrome Custom Tab.
  //   Our server exchanges the Google code and mints a Clerk sign-in ticket,
  //   then redirects to confrontaoroscopo://clerk-callback?ticket=… which
  //   triggers appUrlOpen above.
  //
  // Web path: standard Clerk OAuth redirect flow (unchanged).
  async function handleGoogleSignIn() {
    if (!isLoaded || googleBusy) return;
    setError('');
    setGoogleBusy(true);

    if (isNative) {
      // Server-side OAuth — bypasses Clerk's redirect URL validation entirely.
      try {
        const listener = await Browser.addListener('browserFinished', async () => {
          await listener.remove();
          browserListenerRef.current = null;
          console.log('[Login] browserFinished — tab closed (cancel or complete)');
          setStage('email');
          setGoogleBusy(false);
        });
        browserListenerRef.current = listener;
        setStage('google_pending');
        await Browser.open({ url: 'https://confrontaoroscopo.it/api/google-oauth-start' });
      } catch (err: any) {
        console.error('[Login] handleGoogleSignIn native error:', err?.message ?? err);
        setError('Errore avvio Google Sign-In. Riprova.');
        setGoogleBusy(false);
      }
      return;
    }

    // ── Web path ────────────────────────────────────────────────────────────────
    try {
      const si = await signIn!.create({
        strategy: 'oauth_google',
        redirectUrl: window.location.origin + '/sso-callback',
      } as any);

      const oauthUrl = (si as any).firstFactorVerification?.externalVerificationRedirectURL?.toString();
      console.log('[Login] Google OAuth URL:', oauthUrl ? 'obtained' : 'missing');

      if (!oauthUrl) {
        setError('Impossibile avviare Google Sign-In. Riprova.');
        setGoogleBusy(false);
        return;
      }

      const listener = await Browser.addListener('browserFinished', async () => {
        await listener.remove();
        browserListenerRef.current = null;
        console.log('[Login] browserFinished — tab closed (cancel or complete)');
        setStage('email');
        setGoogleBusy(false);
      });
      browserListenerRef.current = listener;

      setStage('google_pending');
      await Browser.open({ url: oauthUrl });
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? 'Errore Google Sign-In.';
      console.log('[Login] handleGoogleSignIn error:', msg, JSON.stringify(err?.errors));
      setError(msg);
      setGoogleBusy(false);
    }
  }

  // ── Back / cancel helpers ───────────────────────────────────────────────────
  function handleBack() {
    cancelRef.current?.();
    cancelRef.current = null;
    browserListenerRef.current?.remove();
    browserListenerRef.current = null;
    Browser.close().catch(() => {});
    setStage('email');
    setOtp('');
    setError('');
    setGoogleBusy(false);
  }

  // ── Magic link waiting ──────────────────────────────────────────────────────
  if (stage === 'waiting') {
    return (
      <div style={cardStyle}>
        <h2 style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, marginBottom: 12, textAlign: 'center' }}>
          Controlla la tua email
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.5, marginBottom: 8, textAlign: 'center' }}>
          Abbiamo inviato un link di accesso a
        </p>
        <p style={{ color: 'var(--header-gold)', fontSize: 15, fontWeight: 600, marginBottom: 24, textAlign: 'center', wordBreak: 'break-all' }}>
          {email}
        </p>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.5, marginBottom: 24, textAlign: 'center' }}>
          Apri l'email e tocca il link. Questa schermata si aggiornerà automaticamente.
        </p>
        {error && <p style={{ color: '#ff8080', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>{error}</p>}
        <button onClick={handleBack} style={ghostBtnStyle}>← Cambia email</button>
      </div>
    );
  }

  // ── Google pending ──────────────────────────────────────────────────────────
  if (stage === 'google_pending') {
    return (
      <div style={cardStyle}>
        <h2 style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, marginBottom: 12, textAlign: 'center' }}>
          Accesso con Google
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.5, marginBottom: 24, textAlign: 'center' }}>
          Completa l'accesso nel browser. Questa schermata si aggiornerà automaticamente.
        </p>
        {error && <p style={{ color: '#ff8080', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>{error}</p>}
        <button onClick={handleBack} style={ghostBtnStyle}>← Annulla</button>
      </div>
    );
  }

  // ── OTP entry ───────────────────────────────────────────────────────────────
  if (stage === 'otp') {
    return (
      <div style={cardStyle}>
        <h2 style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, marginBottom: 12, textAlign: 'center' }}>
          Inserisci il codice
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.5, marginBottom: 8, textAlign: 'center' }}>
          Abbiamo inviato un codice a
        </p>
        <p style={{ color: 'var(--header-gold)', fontSize: 15, fontWeight: 600, marginBottom: 24, textAlign: 'center', wordBreak: 'break-all' }}>
          {email}
        </p>
        <form onSubmit={handleOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Codice a 6 cifre</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              required
              autoComplete="one-time-code"
              placeholder="123456"
              style={{ ...inputStyle, letterSpacing: 4, textAlign: 'center', fontSize: 20 }}
            />
          </div>
          {error && <p style={{ color: '#ff8080', fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={busy || otp.length < 6} style={primaryBtnStyle(busy || otp.length < 6)}>
            {busy ? 'Verifica in corso…' : 'Verifica'}
          </button>
        </form>
        <button onClick={handleBack} style={{ ...ghostBtnStyle, marginTop: 12 }}>← Cambia email</button>
      </div>
    );
  }

  // ── Email entry (default) ───────────────────────────────────────────────────
  return (
    <div style={cardStyle}>
      <h2 style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, marginBottom: 24, textAlign: 'center' }}>
        Accedi
      </h2>

      {/* Google OAuth button */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleBusy || !isLoaded}
        style={googleBtnStyle(googleBusy || !isLoaded)}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
          <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
        </svg>
        {googleBusy ? 'Attendere…' : 'Continua con Google'}
      </button>

      <div style={{ alignItems: 'center', display: 'flex', gap: 12, margin: '20px 0' }}>
        <div style={{ background: 'rgba(255,255,255,0.2)', flex: 1, height: 1 }} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>oppure</span>
        <div style={{ background: 'rgba(255,255,255,0.2)', flex: 1, height: 1 }} />
      </div>

      <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="la-tua@email.com"
            style={inputStyle}
          />
        </div>
        {error && <p style={{ color: '#ff8080', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type="submit" disabled={busy || !isLoaded} style={primaryBtnStyle(busy || !isLoaded)}>
          {busy ? 'Invio in corso…' : 'Continua con email'}
        </button>
      </form>

      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 20, textAlign: 'center' }}>
        Riceverai un codice o un link per accedere senza password.
      </p>
    </div>
  );
}

export default function Login() {
  const { isLoggedIn, isLoading } = useAuth();
  const [, navigate] = useLocation();

  // Support ?redirect=<path> so callers can bounce the user back after login
  const redirectTo = new URLSearchParams(window.location.search).get('redirect') || '/';

  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      trackLogin('google', true);
      navigate(redirectTo);
    }
  }, [isLoggedIn, isLoading, navigate, redirectTo]);

  if (isLoading || isLoggedIn) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          background: 'rgba(30, 20, 64, 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/')}
                className="text-white hover:bg-white/20 border border-white/30"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white">Accedi</h1>
                <p className="text-xs text-gray-300">o crea il tuo account</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex items-center justify-center px-4 py-12">
        {isNative ? (
          <NativeSignInForm />
        ) : (
          <SignIn
            routing="virtual"
            fallbackRedirectUrl={redirectTo}
            signUpFallbackRedirectUrl={redirectTo}
            appearance={{
              variables: {
                colorPrimary: 'var(--header-gold)',
                colorBackground: '#053c8e',
                colorText: '#ffffff',
                colorInputBackground: '#2d1e50',
                colorInputText: '#ffffff',
              },
            }}
          />
        )}
      </div>
    </div>
  );
}
