import { useEffect, useState, useCallback } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { useLocation } from 'wouter';
import { ArrowLeft, Star, BookmarkCheck, BellOff } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { useAuth } from '../hooks/use-auth';
import { useAccess } from '../hooks/use-access';
import { useHomeFavorites } from '../hooks/use-favorites';
import { useFavorites } from '../hooks/use-favorites';
import { NotificationModal, type NotificationPreference } from '@/components/NotificationBell';

export default function Account() {
  const { isLoggedIn, isLoading, user, clerkUserId } = useAuth();
  const { userTier } = useAccess();
  const { signOut } = useClerk();
  const { homeFavorites } = useHomeFavorites();
  const { favorites } = useFavorites();
  const [, navigate] = useLocation();

  const [notifPrefs, setNotifPrefs] = useState<NotificationPreference[]>([]);
  const [editingPref, setEditingPref] = useState<NotificationPreference | null>(null);

  const fetchNotifPrefs = useCallback(async () => {
    if (!clerkUserId) return;
    try {
      const res = await fetch('/api/notifications/preferences', {
        headers: { 'x-clerk-user-id': clerkUserId },
      });
      if (res.ok) setNotifPrefs(await res.json());
    } catch {}
  }, [clerkUserId]);

  useEffect(() => {
    if (isLoggedIn) fetchNotifPrefs();
  }, [isLoggedIn, fetchNotifPrefs]);

  const handleDeleteNotif = async (signId: number) => {
    if (!clerkUserId) return;
    try {
      await fetch(`/api/notifications/preferences/${signId}`, {
        method: 'DELETE',
        headers: { 'x-clerk-user-id': clerkUserId },
      });
      await fetchNotifPrefs();
    } catch {}
  };

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      navigate('/login');
    }
  }, [isLoggedIn, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#E1B64E] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) return null;

  const displayName = user?.name || user?.email || 'Utente';
  const avatarLetter = (user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase();

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Torna alla home"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white">Il mio account</h1>
        </div>
      </AppHeader>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">

        {/* Profilo */}
        <section className="rounded-xl p-5 space-y-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
              style={{ background: '#E1B64E', color: '#1a1a1a' }}
            >
              {avatarLetter}
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold truncate">{displayName}</p>
              {user?.email && (
                <p className="text-white/60 text-sm truncate">{user.email}</p>
              )}
            </div>
          </div>
        </section>

        {/* Piano */}
        <section className="rounded-xl p-5 space-y-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 className="text-white/70 text-xs font-semibold uppercase tracking-wider">Il tuo piano</h2>

          {userTier === 'premium' ? (
            <div className="space-y-2">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: '#E1B64E', color: '#1a1a1a' }}>
                PREMIUM
              </span>
              <p className="text-white/80 text-sm">Hai accesso a tutte le funzionalità</p>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/stripe/portal', {
                      method: 'POST',
                      headers: { 'x-clerk-user-id': clerkUserId || '' }
                    });
                    const data = await res.json();
                    if (!res.ok || !data.portalUrl) {
                      alert(data.error || 'Impossibile aprire il portale. Riprova.');
                      return;
                    }
                    window.location.href = data.portalUrl;
                  } catch {
                    alert('Errore di rete. Riprova.');
                  }
                }}
                className="text-sm text-[#E1B64E] hover:underline"
              >
                Gestisci abbonamento
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white/70">
                GRATUITO
              </span>
              <p className="text-white/80 text-sm">Accedi a storico e compatibilità tra segni</p>
              <button
                onClick={() => navigate('/pricing')}
                className="px-4 py-1.5 rounded-full text-sm font-semibold"
                style={{ background: '#E1B64E', color: '#1a1a1a' }}
              >
                Passa a Premium
              </button>
            </div>
          )}
        </section>

        {/* Preferiti */}
        <section className="rounded-xl p-5 space-y-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 className="text-white/70 text-xs font-semibold uppercase tracking-wider">Preferiti</h2>
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <Star size={16} className="text-[#E1B64E]" />
              <span className="text-white text-sm">
                <span className="font-semibold">{homeFavorites.size}</span> segni
              </span>
            </div>
            <div className="flex items-center gap-2">
              <BookmarkCheck size={16} className="text-[#E1B64E]" />
              <span className="text-white text-sm">
                <span className="font-semibold">{favorites.length}</span> fonti
              </span>
            </div>
          </div>
        </section>

        {/* Le tue notifiche */}
        <section className="rounded-xl p-5 space-y-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 className="text-white/70 text-xs font-semibold uppercase tracking-wider">Le tue notifiche</h2>

          {notifPrefs.length === 0 ? (
            <div className="space-y-1">
              <p className="text-white/80 text-sm">Nessuna notifica attiva.</p>
              <p className="text-white/50 text-xs">Attiva 🔔 su un segno preferito per iniziare.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {notifPrefs.map((pref) => (
                <li
                  key={pref.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors hover:bg-white/5"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                  onClick={() => setEditingPref(pref)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-white text-sm font-medium truncate">
                      {pref.sign?.name_italian ?? `Segno #${pref.sign_id}`}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {pref.daily && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'rgba(225,182,78,0.15)', color: '#E1B64E' }}>
                          Giornaliero
                        </span>
                      )}
                      {pref.weekly && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'rgba(225,182,78,0.15)', color: '#E1B64E' }}>
                          Settimanale
                        </span>
                      )}
                    </div>
                    <span className="text-white/50 text-xs shrink-0">{pref.notify_time}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteNotif(pref.sign_id); }}
                    className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                    title="Disattiva notifiche"
                  >
                    <BellOff size={15} className="text-white/40 hover:text-white/70" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Logout */}
        <button
          onClick={handleSignOut}
          className="w-full py-2.5 rounded-xl text-sm font-medium text-white/70 hover:text-white transition-colors"
          style={{ border: '1px solid rgba(255,255,255,0.15)' }}
        >
          Esci dall'account
        </button>

      </main>

      {editingPref && clerkUserId && (
        <NotificationModal
          open={editingPref !== null}
          onOpenChange={(open) => { if (!open) setEditingPref(null); }}
          signId={editingPref.sign_id}
          signNameItalian={editingPref.sign?.name_italian ?? `Segno #${editingPref.sign_id}`}
          initialPref={editingPref}
          clerkUserId={clerkUserId}
          onSaved={() => { setEditingPref(null); fetchNotifPrefs(); }}
        />
      )}
    </div>
  );
}
