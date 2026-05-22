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
    // cleartext: true — uncomment only for debug builds connecting to HTTP
    // allowNavigation lets the WebView follow Clerk's post-OAuth redirect chain
    // (accounts.clerk.dev → Railway app URL) without being intercepted by the OS.
    // Note: Google OAuth itself still requires Chrome Custom Tabs (@capacitor/browser).
    allowNavigation: [
      '*.clerk.accounts.dev',
      '*.accounts.dev',
      '*.clerk.com',
      'clerk.confrontaoroscopo.com',
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
