import { useEffect, useRef, useState, FormEvent } from 'react';
import { SignIn, useSignIn } from '@clerk/clerk-react';
import { Capacitor } from '@capacitor/core';
import { useLocation } from 'wouter';
import { useAuth } from '../hooks/use-auth';
import { trackLogin } from '../lib/analytics';

const isNative = Capacitor.isNativePlatform();
console.log('[Login] isNative:', isNative, '| platform:', Capacitor.getPlatform());

// Email-link (magic link) flow for native Android.
//
// How it works:
//   1. User enters email and submits.
//   2. signIn.create() finds the email_link first factor.
//   3. startEmailLinkFlow() sends the magic link email AND starts polling
//      Clerk's FAPI from this WebView.
//   4. User opens their email (in any app/browser) and clicks the link.
//   5. The link opens staging.confrontaoroscopo.it/login which processes
//      the __clerk_ticket param and marks the sign-in complete on the server.
//   6. The WebView polling detects status === 'complete' → setActive() → done.
function NativeSignInForm() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<'email' | 'waiting'>('email');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => () => { cancelRef.current?.(); }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded || busy) return;
    setError('');
    setBusy(true);

    try {
      const si = await signIn!.create({ identifier: email });

      const emailLinkFactor = si.supportedFirstFactors?.find(
        (f: any) => f.strategy === 'email_link'
      ) as any;

      if (!emailLinkFactor) {
        setError('Accesso via link email non disponibile. Contatta il supporto.');
        setBusy(false);
        return;
      }

      const { startEmailLinkFlow, cancelEmailLinkFlow } = si.createEmailLinkFlow();
      cancelRef.current = cancelEmailLinkFlow;

      // Show waiting screen before the async poll starts
      setStage('waiting');
      setBusy(false);

      // redirectUrl is embedded in the magic link email.
      // When clicked it opens this page, which handles __clerk_ticket.
      // Meanwhile this WebView polls independently until completion.
      const result = await startEmailLinkFlow({
        emailAddressId: emailLinkFactor.emailAddressId,
        redirectUrl: window.location.origin + '/login',
      });

      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
        trackLogin('email_link', true);
      } else {
        setError('Link scaduto o non valido. Riprova.');
        setStage('email');
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage
        ?? err?.errors?.[0]?.message
        ?? 'Errore durante il login.';
      setError(msg);
      setStage('email');
      setBusy(false);
    }
  }

  function handleChangeEmail() {
    cancelRef.current?.();
    cancelRef.current = null;
    setStage('email');
    setError('');
  }

  const cardStyle: React.CSSProperties = {
    background: '#053c8e',
    borderRadius: 12,
    boxSizing: 'border-box',
    maxWidth: 400,
    padding: '32px 24px',
    width: '100%',
  };

  if (stage === 'waiting') {
    return (
      <div style={cardStyle}>
        <h2 style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, marginBottom: 12, textAlign: 'center' }}>
          Controlla la tua email
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.5, marginBottom: 8, textAlign: 'center' }}>
          Abbiamo inviato un link di accesso a
        </p>
        <p style={{ color: '#E1B64E', fontSize: 15, fontWeight: 600, marginBottom: 24, textAlign: 'center', wordBreak: 'break-all' }}>
          {email}
        </p>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.5, marginBottom: 24, textAlign: 'center' }}>
          Apri l'email e tocca il link. Questa schermata si aggiornerà automaticamente.
        </p>

        {error && (
          <p style={{ color: '#ff8080', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>{error}</p>
        )}

        <button
          onClick={handleChangeEmail}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 8,
            color: 'rgba(255,255,255,0.7)',
            cursor: 'pointer',
            fontSize: 14,
            padding: '10px',
            width: '100%',
          }}
        >
          ← Cambia email
        </button>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
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
            placeholder="la-tua@email.com"
            style={{
              background: '#2d1e50',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#ffffff',
              fontSize: 15,
              outline: 'none',
              padding: '10px 12px',
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
          {busy ? 'Invio in corso…' : 'Invia link di accesso'}
        </button>
      </form>

      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 20, textAlign: 'center' }}>
        Riceverai un'email con il link per accedere.
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
