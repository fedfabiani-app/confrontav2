import { useEffect } from 'react';
import { SignIn } from '@clerk/clerk-react';
import { Capacitor } from '@capacitor/core';
import { useLocation } from 'wouter';
import { useAuth } from '../hooks/use-auth';
import { trackLogin } from '../lib/analytics';

// Google (and other providers) block OAuth inside Android WebView since 2021.
// On native, we hide social buttons so only email/password works in-app.
// TODO: install @capacitor/browser and use Chrome Custom Tabs for full OAuth support.
const isNative = Capacitor.isNativePlatform();

const nativeAppearanceOverride = isNative
  ? {
      elements: {
        // Hide social OAuth buttons and the divider — they trigger a redirect
        // that Capacitor sends to the system browser, leaving the WebView blank.
        socialButtonsRoot: { display: 'none' },
        dividerRow: { display: 'none' },
      },
    }
  : {};

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
          ...nativeAppearanceOverride,
        }}
      />
    </div>
  );
}
