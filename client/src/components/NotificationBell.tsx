import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { requestNotificationPermission } from '@/services/pushNotifications';

export interface NotificationPreference {
  id: number;
  sign_id: number;
  daily: boolean;
  weekly: boolean;
  notify_time: string;
  timezone: string;
  sign?: { id: number; name_italian: string; name_english: string };
}

// ─── NotificationModal ────────────────────────────────────────────────────────

interface NotificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signId: number;
  signNameItalian: string;
  initialPref?: Pick<NotificationPreference, 'daily' | 'weekly' | 'notify_time'> | null;
  clerkUserId: string;
  onSaved: () => void;
}

export function NotificationModal({
  open,
  onOpenChange,
  signId,
  signNameItalian,
  initialPref,
  clerkUserId,
  onSaved,
}: NotificationModalProps) {
  const [osPermission, setOsPermission] = useState<'granted' | 'denied'>('granted');
  const [daily, setDaily] = useState(true);
  const [weekly, setWeekly] = useState(true);
  const [notifyTime, setNotifyTime] = useState('08:00');
  const [timeError, setTimeError] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-populate form whenever the modal opens
  useEffect(() => {
    if (!open) return;

    const checkOsPermission = async () => {
      if (Capacitor.isNativePlatform()) {
        const { receive } = await PushNotifications.checkPermissions();
        setOsPermission(receive === 'granted' ? 'granted' : 'denied');
      } else {
        setOsPermission('granted');
      }
    };

    setDaily(initialPref?.daily ?? true);
    setWeekly(initialPref?.weekly ?? true);
    setNotifyTime(initialPref?.notify_time ?? '08:00');
    setTimeError('');
    checkOsPermission();
  }, [open, initialPref]);

  const handleSave = async () => {
    if (notifyTime < '07:00') {
      setTimeError("L'orario minimo è 07:00");
      return;
    }

    setSaving(true);
    try {
      if (!daily && !weekly) {
        await fetch(`/api/notifications/preferences/${signId}`, {
          method: 'DELETE',
          headers: { 'x-clerk-user-id': clerkUserId },
        });
      } else {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        await fetch('/api/notifications/preferences', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-clerk-user-id': clerkUserId,
          },
          body: JSON.stringify({ signId, daily, weekly, notifyTime, timezone }),
        });

        if (Capacitor.isNativePlatform()) {
          await requestNotificationPermission(clerkUserId);
        }
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error('[NotificationModal] Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Notifiche per {signNameItalian}</DialogTitle>
        </DialogHeader>

        {osPermission === 'denied' ? (
          <p className="text-sm text-muted-foreground py-2">
            Per ricevere notifiche, vai in Impostazioni → Notifiche sul tuo dispositivo
          </p>
        ) : (
          <div className="space-y-5 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Giornaliero</span>
              <Switch checked={daily} onCheckedChange={setDaily} />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Settimanale (ogni lunedì)</span>
              <Switch checked={weekly} onCheckedChange={setWeekly} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Orario</label>
              <input
                type="time"
                value={notifyTime}
                onChange={(e) => { setNotifyTime(e.target.value); setTimeError(''); }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {timeError && <p className="text-xs text-destructive">{timeError}</p>}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          {osPermission !== 'denied' && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvataggio…' : 'Salva'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── NotificationBell ─────────────────────────────────────────────────────────

interface NotificationBellProps {
  signId: number;
  signNameItalian: string;
}

export function NotificationBell({ signId, signNameItalian }: NotificationBellProps) {
  const { isLoggedIn, clerkUserId } = useAuth();
  const [, navigate] = useLocation();

  const [pref, setPref] = useState<NotificationPreference | null | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchPref = useCallback(async () => {
    if (!isLoggedIn || !clerkUserId) return;
    try {
      const res = await fetch('/api/notifications/preferences', {
        headers: { 'x-clerk-user-id': clerkUserId },
      });
      if (!res.ok) { setPref(null); return; }
      const all: NotificationPreference[] = await res.json();
      setPref(all.find(p => p.sign_id === signId) ?? null);
    } catch {
      setPref(null);
    }
  }, [isLoggedIn, clerkUserId, signId]);

  useEffect(() => { fetchPref(); }, [fetchPref]);

  const isActive = pref != null && (pref.daily || pref.weekly);

  const handleBellClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLoggedIn) { navigate('/login'); return; }
    setModalOpen(true);
  };

  if (pref === undefined) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleBellClick}
        className="p-1 h-8 w-8 hover:bg-gray-50 dark:hover:bg-gray-800"
        title={isActive ? 'Gestisci notifiche' : 'Attiva notifiche'}
      >
        {isActive ? (
          <Bell className="w-4 h-4" style={{ color: '#E1B64E', fill: '#E1B64E' }} />
        ) : (
          <BellOff className="w-4 h-4 text-muted-foreground" />
        )}
      </Button>

      {clerkUserId && (
        <NotificationModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          signId={signId}
          signNameItalian={signNameItalian}
          initialPref={pref}
          clerkUserId={clerkUserId}
          onSaved={fetchPref}
        />
      )}
    </>
  );
}
