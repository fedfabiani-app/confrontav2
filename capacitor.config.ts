import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.confrontaoroscopo.app',
  appName: 'Confronta Oroscopo',
  webDir: 'dist/public',
  server: {
    // Load the live production site directly.
    //
    // Why not local assets + hostname:
    //   Capacitor's WebViewLocalServer intercepts ALL requests to the registered
    //   hostname (including /api/...) and returns 404 for paths with no local file.
    //   CapacitorHttp only bypasses this for cross-origin requests, but with
    //   hostname == origin they are same-origin and still go through the local server.
    //   Setting url = production site sidesteps the conflict entirely: the WebView
    //   loads the real site, Clerk sees Origin: https://confrontaoroscopo.it ✅, and
    //   all API calls are same-origin and reach the real Railway server ✅.
    //   The Capacitor bridge (push notifications, Browser plugin, deep links) is
    //   still injected by the native shell regardless of where the content is hosted.
    url: 'https://confrontaoroscopo.it',
    androidScheme: 'https',
    // allowNavigation lets the WebView follow Clerk's post-OAuth redirect chain
    // without being intercepted by the OS.
    allowNavigation: [
      '*.clerk.accounts.dev',
      '*.accounts.dev',
      '*.clerk.com',
      'clerk.confrontaoroscopo.it',
      'accounts.google.com',
      '*.google.com',
    ],
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
