import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  type Token,
  type PushNotificationSchema,
  type ActionPerformed,
} from '@capacitor/push-notifications';

export type NotificationPermissionResult = { status: 'granted' | 'denied' };

// ─── Permission ──────────────────────────────────────────────────────────────

export async function requestPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  const result = await PushNotifications.requestPermissions();
  return result.receive === 'granted';
}

// ─── Token registration ───────────────────────────────────────────────────────

async function sendTokenToBackend(token: string, clerkUserId: string): Promise<void> {
  try {
    await fetch('/api/notifications/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-clerk-user-id': clerkUserId,
      },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    console.error('[PushNotifications] Failed to register token with backend:', err);
  }
}

export async function registerDevice(clerkUserId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // Registration listener: fires after PushNotifications.register()
  await PushNotifications.addListener('registration', (token: Token) => {
    console.log('[PushNotifications] FCM token received');
    sendTokenToBackend(token.value, clerkUserId);
  });

  // Registration error listener
  await PushNotifications.addListener('registrationError', (err) => {
    console.error('[PushNotifications] Registration error:', err.error);
  });

  await PushNotifications.register();
}

// ─── Foreground notifications ────────────────────────────────────────────────

export async function onNotificationReceived(
  handler: (notification: PushNotificationSchema) => void
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[PushNotifications] Foreground notification received:', notification.title);
    handler(notification);
  });
}

// ─── Background / tap ────────────────────────────────────────────────────────

export async function onNotificationTapped(
  handler: (action: ActionPerformed) => void
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('[PushNotifications] Notification tapped:', action.notification.title);
    handler(action);
  });
}

// ─── Entry points ────────────────────────────────────────────────────────────

/**
 * Call once after user signs in (silent — never shows OS dialog).
 * If permission is already granted, registers the device token with the backend.
 * If permission is denied or not yet determined, returns without doing anything.
 * Push registration via dialog is handled by requestNotificationPermission().
 */
export async function initPushNotifications(
  clerkUserId: string | null | undefined,
): Promise<void> {
  if (!clerkUserId) return;
  if (!Capacitor.isNativePlatform()) return;

  const { receive } = await PushNotifications.checkPermissions();
  if (receive !== 'granted') return;

  await registerDevice(clerkUserId);
}

/**
 * Request OS permission and, if granted, register the device token.
 * Call this only from explicit user-initiated UI (e.g. the notification toggle).
 * Returns { status: 'granted' } or { status: 'denied' } — never throws.
 */
export async function requestNotificationPermission(
  clerkUserId: string,
): Promise<NotificationPermissionResult> {
  if (!Capacitor.isNativePlatform()) return { status: 'denied' };

  const granted = await requestPermission();
  if (!granted) return { status: 'denied' };

  await registerDevice(clerkUserId);
  return { status: 'granted' };
}
