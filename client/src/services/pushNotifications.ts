import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  type Token,
  type PushNotificationSchema,
  type ActionPerformed,
} from '@capacitor/push-notifications';

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

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Call once after user signs in.
 * Requests permission, registers device, and wires up notification handlers.
 *
 * @example
 * // In App.tsx or ClerkAuthProvider, after auth:
 * initPushNotifications(clerkUserId, {
 *   onReceived: (n) => toast(n.title ?? ''),
 *   onTapped:   (a) => navigate(a.notification.data?.route ?? '/'),
 * });
 */
export async function initPushNotifications(
  clerkUserId: string,
  handlers?: {
    onReceived?: (notification: PushNotificationSchema) => void;
    onTapped?: (action: ActionPerformed) => void;
  }
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const granted = await requestPermission();
  if (!granted) {
    console.warn('[PushNotifications] Permission not granted');
    return;
  }

  await registerDevice(clerkUserId);

  if (handlers?.onReceived) {
    await onNotificationReceived(handlers.onReceived);
  }
  if (handlers?.onTapped) {
    await onNotificationTapped(handlers.onTapped);
  }
}
