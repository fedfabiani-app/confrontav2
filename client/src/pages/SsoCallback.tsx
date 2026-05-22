import { useEffect } from 'react';

// Intermediate page for native Android Google OAuth callback.
// Clerk redirects here after OAuth completes (HTTPS URL accepted by Clerk).
// We immediately redirect to the custom scheme deep link, which Android
// intercepts → Chrome Custom Tab closes → browserFinished fires in the app.
export default function SsoCallback() {
  useEffect(() => {
    window.location.href = 'confrontaoroscopo://clerk-callback';
  }, []);

  return null;
}
