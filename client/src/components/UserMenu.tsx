import { useRef, useState, useEffect } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { useLocation } from 'wouter';
import { useAuth } from '../hooks/use-auth';
import { useAccess } from '../hooks/use-access';

export function UserMenu() {
  const { isLoggedIn, isLoading, user } = useAuth();
  const { userTier } = useAccess();
  const { signOut } = useClerk();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  console.log('[UserMenu] isLoggedIn:', isLoggedIn, 'isLoading:', isLoading, 'tier:', userTier);

  if (!isLoggedIn) {
    return (
      <button
        onClick={() => navigate('/login')}
        className="px-3 py-1.5 rounded-full text-sm font-medium text-white transition-colors hover:bg-white/10"
        style={{ border: '1px solid rgba(255,255,255,0.3)' }}
      >
        Accedi
      </button>
    );
  }

  const avatarLetter = (user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase();
  const displayName = user?.name || user?.email || 'Utente';

  return (
    <div ref={containerRef} className="relative">
      {/* Avatar button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 focus:outline-none"
        style={{ background: '#E1B64E', color: '#1a1a1a' }}
        aria-label="Menu utente"
      >
        {avatarLetter}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-52 py-2 z-50"
          style={{
            background: '#1a1230',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {/* User info */}
          <div className="px-4 py-2 border-b border-white/10 mb-1">
            <p className="text-white text-sm font-medium truncate">{displayName}</p>
            <span
              className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold"
              style={
                userTier === 'premium'
                  ? { background: '#E1B64E', color: '#1a1a1a' }
                  : { background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }
              }
            >
              {userTier === 'premium' ? 'PREMIUM' : 'FREE'}
            </span>
          </div>

          {/* Links */}
          <MenuItem onClick={() => { setOpen(false); navigate('/account'); }}>
            Il mio account
          </MenuItem>
          <MenuItem onClick={() => { setOpen(false); navigate('/pricing'); }}>
            Piani
          </MenuItem>

          {/* Separator + logout */}
          <div className="border-t border-white/10 mt-1 pt-1">
            <MenuItem
              onClick={async () => { setOpen(false); await signOut(); navigate('/'); }}
              className="text-white/50 hover:text-white/80"
            >
              Esci
            </MenuItem>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  children,
  className = '',
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 text-sm text-white hover:bg-white/8 transition-colors ${className}`}
    >
      {children}
    </button>
  );
}
