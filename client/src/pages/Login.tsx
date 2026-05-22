import { useEffect, useRef, useState, FormEvent } from 'react';
import { SignIn, useSignIn } from '@clerk/clerk-react';
import { Capacitor } from '@capacitor/core';
import { useLocation } from 'wouter';
import { useAuth } from '../hooks/use-auth';
import { trackLogin } from '../lib/analytics';

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
  background: '#E1B64E',
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

// Handles both email_link (magic link) and email_code (OTP) strategies.
function NativeSignInForm() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'email' | 'waiting' | 'otp'>('email');
  const [strategy, setStrategy] = useState<'email_link' | 'email_code' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => () => { cancelRef.current?.(); }, []);

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
        setStrategy('email_link');
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
        setStrategy('email_code');
        await si.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: codeFactor.emailAddressId,
        });
        setStage('otp');
        setBusy(false);
      } else {
        console.log('[Login] No supported factor found. Factors:', JSON.stringify(factors));
        setError('Metodo di accesso non disponibile. Contatta il supporto.');
        setBusy(false);
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage
        ?? err?.errors?.[0]?.message
        ?? 'Errore durante il login.';
      console.log('[Login] handleEmailSubmit error:', msg);
      setError(msg);
      setBusy(false);
    }
  }

  async function handleOtpSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded || busy) return;
    setError('');
    setBusy(true);

    try {
      const result = await signIn!.attemptFirstFactor({
        strategy: 'email_code',
        code: otp,
      });

      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
        trackLogin('email_code', true);
      } else {
        setError('Verifica non completata. Riprova.');
        setBusy(false);
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage
        ?? err?.errors?.[0]?.message
        ?? 'Codice non valido.';
      setError(msg);
      setBusy(false);
    }
  }

  function handleBack() {
    cancelRef.current?.();
    cancelRef.current = null;
    setStage('email');
    setOtp('');
    setError('');
    setStrategy(null);
  }

  // Magic link waiting screen
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
        <button onClick={handleBack} style={ghostBtnStyle}>← Cambia email</button>
      </div>
    );
  }

  // OTP code entry screen
  if (stage === 'otp') {
    return (
      <div style={cardStyle}>
        <h2 style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, marginBottom: 12, textAlign: 'center' }}>
          Inserisci il codice
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.5, marginBottom: 8, textAlign: 'center' }}>
          Abbiamo inviato un codice a
        </p>
        <p style={{ color: '#E1B64E', fontSize: 15, fontWeight: 600, marginBottom: 24, textAlign: 'center', wordBreak: 'break-all' }}>
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
          {error && (
            <p style={{ color: '#ff8080', fontSize: 13, margin: 0 }}>{error}</p>
          )}
          <button type="submit" disabled={busy || otp.length < 6} style={primaryBtnStyle(busy || otp.length < 6)}>
            {busy ? 'Verifica in corso…' : 'Verifica'}
          </button>
        </form>
        <button onClick={handleBack} style={{ ...ghostBtnStyle, marginTop: 12 }}>← Cambia email</button>
      </div>
    );
  }

  // Email entry screen
  return (
    <div style={cardStyle}>
      <h2 style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, marginBottom: 24, textAlign: 'center' }}>
        Accedi
      </h2>
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
        {error && (
          <p style={{ color: '#ff8080', fontSize: 13, margin: 0 }}>{error}</p>
        )}
        <button type="submit" disabled={busy || !isLoaded} style={primaryBtnStyle(busy || !isLoaded)}>
          {busy ? 'Invio in corso…' : 'Continua'}
        </button>
      </form>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 20, textAlign: 'center' }}>
        Riceverai un'email per accedere senza password.
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
