import type { CapacitorConfig } from '@capacitor/cli';

// Set CAPACITOR_SERVER_URL to your Railway production URL when building for store release.
// Example: CAPACITOR_SERVER_URL=https://your-app.railway.app npx cap sync
// When unset, the app serves from the bundled dist/public folder.
const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.confrontaoroscopo.app',
  appName: 'Confronta Oroscopo',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
    // hostname makes the WebView appear to be served from confrontaoroscopo.it instead of
    // https://localhost.  Two effects:
    //   1. Clerk accepts Origin: https://confrontaoroscopo.it (production key requires it).
    //   2. fetch('/api/...') resolves to https://confrontaoroscopo.it/api/... — Capacitor
    //      passes through any request whose path has no matching local file, so API calls
    //      reach the real Railway server automatically.
    hostname: 'confrontaoroscopo.it',
    // allowNavigation lets the WebView follow Clerk's post-OAuth redirect chain
    // (accounts.clerk.dev → Railway app URL) without being intercepted by the OS.
    // Note: Google OAuth itself still requires Chrome Custom Tabs (@capacitor/browser).
    allowNavigation: [
      '*.clerk.accounts.dev',
      '*.accounts.dev',
      '*.clerk.com',
      'clerk.confrontaoroscopo.it',
      'accounts.google.com',
      '*.google.com',
    ],
    ...(serverUrl ? { url: serverUrl } : {}),
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

export default config;
