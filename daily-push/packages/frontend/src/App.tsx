import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Today from './pages/Today';
import Goals from './pages/Goals';
import GoalSetup from './pages/GoalSetup';
import GoalDetail from './pages/GoalDetail';
import Map from './pages/Map';
import History from './pages/History';
import News from './pages/News';
import Settings from './pages/Settings';
import ReflectionModal from './components/ReflectionModal';
import { getPrimaryGoal, getReflectionPrompt, getStreak } from './api/client';

const navItems = [
  { to: '/', label: 'Today', end: true },
  { to: '/map', label: 'Map' },
  { to: '/goals', label: 'Goals' },
  { to: '/news', label: 'News' },
  { to: '/history', label: 'History' },
];

// ── Flame icon ────────────────────────────────────────────────────────────────
function FlameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2C13 8 6 9 6 15a6 6 0 0 0 12 0c0-4-3-5-4-8Z" />
    </svg>
  );
}

// ── Bell icon ─────────────────────────────────────────────────────────────────
function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

// ── Chevron icon ──────────────────────────────────────────────────────────────
function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none', color: 'var(--slate-400)' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Dropdown menu item ────────────────────────────────────────────────────────
function DropdownItem({
  icon, label, hint, danger, onClick,
}: {
  icon: 'settings' | 'logout' | 'user' | 'help';
  label: string;
  hint?: number | null;
  danger?: boolean;
  onClick?: () => void;
}) {
  const [hov, setHov] = useState(false);
  const paths: Record<string, React.ReactNode> = {
    user:     <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
    help:     <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
    logout:   <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
  };
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '9px 14px',
        background: hov ? (danger ? 'var(--red-50)' : 'var(--slate-50)') : 'transparent',
        border: 'none', fontSize: 13, fontWeight: 500,
        color: danger ? 'var(--red-600)' : 'var(--fg-1)',
        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'background 120ms',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        style={{ color: danger ? 'var(--red-600)' : 'var(--fg-3)', flexShrink: 0 }}>
        {paths[icon]}
      </svg>
      <span style={{ flex: 1 }}>{label}</span>
      {hint != null && hint > 0 && (
        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--sky-500)', padding: '2px 6px', borderRadius: 999 }}>{hint}</span>
      )}
    </button>
  );
}

// ── Top nav ───────────────────────────────────────────────────────────────────
function TopNav({ streak }: { streak: number }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const initials = user?.name
    ? user.name.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase()
    : '?';
  const firstName = user?.name?.split(' ')[0] ?? '';

  return (
    <nav style={{
      background: 'var(--bg-nav)', color: '#fff',
      padding: '0 20px', height: 49,
      display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      position: 'relative', zIndex: 20,
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginRight: 18 }}>
        <img src="/logo-mark.svg" alt="" style={{ width: 26, height: 26 }} />
        <span style={{ fontFamily: 'Cagliostro, sans-serif', fontSize: 16, letterSpacing: '-0.02em', color: '#fff', whiteSpace: 'nowrap' }}>
          Daily Push
        </span>
      </div>

      {/* Nav links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            style={{ textDecoration: 'none' }}
            className={({ isActive }) =>
              `text-[13px] font-medium px-3 py-[7px] rounded-lg transition-all ${
                isActive
                  ? 'text-white nav-active'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* Right cluster */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>

        {/* Streak pill */}
        {streak > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px 5px 8px', borderRadius: 999,
            background: 'rgba(251,146,60,.12)', border: '1px solid rgba(251,146,60,.28)',
            color: '#fdba74', fontSize: 12, fontWeight: 600,
          }}>
            <FlameIcon />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontVariantNumeric: 'tabular-nums' }}>{streak}</span>
          </div>
        )}

        {/* Bell */}
        <button
          type="button"
          title="Notifications"
          className="group relative w-[34px] h-[34px] flex items-center justify-center rounded-lg border-0 bg-transparent text-slate-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer"
        >
          <BellIcon />
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.08)' }} />

        {/* User chip */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 9px 4px 4px', borderRadius: 999,
              background: open ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#fff', cursor: 'pointer', transition: 'background 120ms',
            }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
              color: '#fff', fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              letterSpacing: '0.01em', flexShrink: 0,
            }}>
              {initials}
            </div>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{firstName}</span>
            <ChevronDown open={open} />
          </button>

          {open && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              width: 240, background: '#fff', border: '1px solid var(--border-base)',
              borderRadius: 12, boxShadow: '0 18px 40px -12px rgba(15,23,42,.35)',
              color: 'var(--fg-1)', overflow: 'hidden', zIndex: 30,
            }}>
              {/* User header */}
              <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--border-base)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
                    color: '#fff', fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {initials}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
                  </div>
                </div>
              </div>

              <DropdownItem icon="settings" label="Settings" onClick={() => { setOpen(false); navigate('/settings'); }} />
              <DropdownItem icon="help" label="Help & feedback" />

              <div style={{ height: 1, background: 'var(--border-base)', margin: '4px 0' }} />

              <DropdownItem icon="logout" label="Sign out" danger onClick={() => { setOpen(false); signOut(); }} />
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

// ── Protected layout ──────────────────────────────────────────────────────────
function ProtectedLayout() {
  const { user, loading, signOut: _signOut } = useAuth();
  const [streak, setStreak] = useState(0);
  const [reflectionState, setReflectionState] = useState<{
    goalId: string;
    prompt: { question: string; context: string };
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    getStreak().then(d => setStreak(d.streak ?? 0)).catch(() => {});
    const t = setTimeout(async () => {
      try {
        const goal = await getPrimaryGoal();
        if (!goal?._id) return;
        const goalId = goal._id.toString();
        const { due, prompt } = await getReflectionPrompt(goalId);
        if (due && prompt) setReflectionState({ goalId, prompt });
      } catch { /* non-critical */ }
    }, 3000);
    return () => clearTimeout(t);
  }, [user]);

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <TopNav streak={streak} />
      <MainContent />
      {reflectionState && (
        <ReflectionModal
          goalId={reflectionState.goalId}
          prompt={reflectionState.prompt}
          onDismiss={() => setReflectionState(null)}
        />
      )}
    </div>
  );
}

function MainContent() {
  const { pathname } = useLocation();
  const isMap = pathname === '/map';

  if (isMap) {
    return (
      <Routes>
        <Route path="/map" element={<Map />} />
      </Routes>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 w-full">
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/goals/new" element={<GoalSetup />} />
        <Route path="/goals/:id" element={<GoalDetail />} />
        <Route path="/news" element={<News />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}
