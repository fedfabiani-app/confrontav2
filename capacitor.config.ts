import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.confrontaoroscopo.app',
  appName: 'Confronta Oroscopo',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // PushNotifications placeholder — configure when adding @capacitor/push-notifications
    // PushNotifications: {
    //   presentationOptions: ['badge', 'sound', 'alert'],
    // },
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

export default config;
