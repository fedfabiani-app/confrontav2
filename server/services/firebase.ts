import admin from 'firebase-admin';
import prisma from './database';

let firebaseApp: admin.app.App | null = null;

function getApp(): admin.app.App {
  if (firebaseApp) return firebaseApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase credentials missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.'
    );
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });

  return firebaseApp;
}

export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<string> {
  const app = getApp();

  const message: admin.messaging.Message = {
    token,
    notification: { title, body },
    ...(data ? { data } : {}),
    android: {
      priority: 'high',
      notification: { sound: 'default', channelId: 'default' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
  };

  return admin.messaging(app).send(message);
}

export async function sendPushNotificationToMany(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<admin.messaging.BatchResponse> {
  const app = getApp();

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: { title, body },
    ...(data ? { data } : {}),
    android: {
      priority: 'high',
      notification: { sound: 'default', channelId: 'default' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
  };

  const response = await admin.messaging(app).sendEachForMulticast(message);

  const deadTokens = tokens.filter((_, i) => {
    const err = response.responses[i]?.error;
    return (
      err?.code === 'messaging/registration-token-not-registered' ||
      err?.code === 'messaging/invalid-registration-token'
    );
  });
  if (deadTokens.length > 0) {
    await prisma.user.updateMany({
      where: { push_token: { in: deadTokens } },
      data: { push_token: null, push_token_updated_at: null },
    });
  }

  return response;
}
