import { useEffect } from 'react';
import { SignIn } from '@clerk/clerk-react';
import { useLocation } from 'wouter';
import { useAuth } from '../hooks/use-auth';

export default function Login() {
  const { isLoggedIn, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && isLoggedIn) {
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
        }}
      />
    </div>
  );
}
