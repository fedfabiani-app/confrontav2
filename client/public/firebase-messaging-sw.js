importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDIcELhTsrlx-Ro7Q_r88Re9k-UOuCYq8w",
  authDomain: "confronta-oroscopo.firebaseapp.com",
  projectId: "confronta-oroscopo",
  storageBucket: "confronta-oroscopo.firebasestorage.app",
  messagingSenderId: "8017658699",
  appId: "1:8017658699:android:938e04719ba3e53f82dece",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico',
    data: payload.data,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = event.notification.data?.route ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(route);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(route);
    })
  );
});
