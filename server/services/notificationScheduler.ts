// SIGN_ROUTE_PARAM = name_english  (route: /sign/:sign, lookup: s.name_english === sign)
import cron from 'node-cron';
import { prisma } from '../services/database';
import { sendPushNotificationToMany } from '../services/firebase';

// ─── Timezone helpers (Intl only, no external deps) ──────────────────────────

function getCurrentHHMM(timezone: string): string {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  return `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
}

function getStartOfTodayInTz(timezone: string): Date {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const elapsedMs =
    (local.getHours() * 3600 + local.getMinutes() * 60 + local.getSeconds()) * 1000 +
    local.getMilliseconds();
  return new Date(now.getTime() - elapsedMs);
}

function getStartOfWeekInTz(timezone: string): Date {
  const startOfDay = getStartOfTodayInTz(timezone);
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const dayOfWeek = local.getDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return new Date(startOfDay.getTime() - daysFromMonday * 24 * 60 * 60 * 1000);
}

function isMonday(timezone: string): boolean {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  return local.getDay() === 1;
}

// ─── Daily notifications ──────────────────────────────────────────────────────

async function runDailyNotifications(): Promise<void> {
  const tzRows = await prisma.userNotificationPreference.groupBy({
    by: ['timezone'],
    where: { daily: true },
  });

  for (const { timezone } of tzRows) {
    const currentTime = getCurrentHHMM(timezone);
    const startOfDay = getStartOfTodayInTz(timezone);

    const prefs = await prisma.userNotificationPreference.findMany({
      where: {
        daily: true,
        notify_time: currentTime,
        OR: [{ last_daily_sent_at: null }, { last_daily_sent_at: { lt: startOfDay } }],
        user: { push_token: { not: null } },
      },
      include: {
        user: { select: { push_token: true } },
        sign: { select: { id: true, name_italian: true, name_english: true } },
      },
    });

    if (prefs.length === 0) continue;

    // Group by sign — each sign produces one FCM batch with its own copy text
    const bySign = new Map<number, typeof prefs>();
    for (const pref of prefs) {
      const group = bySign.get(pref.sign_id) ?? [];
      group.push(pref);
      bySign.set(pref.sign_id, group);
    }

    for (const [, group] of bySign) {
      const { sign } = group[0];
      const tokens = group.map(p => p.user.push_token as string);

      await sendPushNotificationToMany(
        tokens,
        'Oroscopo di oggi',
        `Scopri cosa dicono le stelle per ${sign.name_italian} oggi →`,
        { route: `/sign/${sign.name_english}` },
      );

      await prisma.userNotificationPreference.updateMany({
        where: { id: { in: group.map(p => p.id) } },
        data: { last_daily_sent_at: new Date() },
      });
    }
  }
}

// ─── Weekly notifications (Monday only) ──────────────────────────────────────

async function runWeeklyNotifications(): Promise<void> {
  const tzRows = await prisma.userNotificationPreference.groupBy({
    by: ['timezone'],
    where: { weekly: true },
  });

  for (const { timezone } of tzRows) {
    if (!isMonday(timezone)) continue;

    const currentTime = getCurrentHHMM(timezone);
    const startOfWeek = getStartOfWeekInTz(timezone);

    const prefs = await prisma.userNotificationPreference.findMany({
      where: {
        weekly: true,
        notify_time: currentTime,
        OR: [{ last_weekly_sent_at: null }, { last_weekly_sent_at: { lt: startOfWeek } }],
        user: { push_token: { not: null } },
      },
      include: {
        user: { select: { push_token: true } },
        sign: { select: { id: true, name_italian: true, name_english: true } },
      },
    });

    if (prefs.length === 0) continue;

    const bySign = new Map<number, typeof prefs>();
    for (const pref of prefs) {
      const group = bySign.get(pref.sign_id) ?? [];
      group.push(pref);
      bySign.set(pref.sign_id, group);
    }

    for (const [, group] of bySign) {
      const { sign } = group[0];
      const tokens = group.map(p => p.user.push_token as string);

      await sendPushNotificationToMany(
        tokens,
        'Oroscopo della settimana',
        `Inizia la settimana con il tuo oroscopo ${sign.name_italian} →`,
        { route: `/sign/${sign.name_english}?tab=settimanale` },
      );

      await prisma.userNotificationPreference.updateMany({
        where: { id: { in: group.map(p => p.id) } },
        data: { last_weekly_sent_at: new Date() },
      });
    }
  }
}

// ─── Scheduler init ───────────────────────────────────────────────────────────

export function initNotificationScheduler(): void {
  cron.schedule('* * * * *', async () => {
    try {
      await runDailyNotifications();
      await runWeeklyNotifications();
    } catch (err) {
      console.error('[NotificationScheduler] Error:', err);
    }
  });

  console.log('[NotificationScheduler] Initialized — running every minute');
}
