// Top navigation bar for Daily Push
function TopNav({ current = 'today', onNav, userName = 'Amit Singh', streak = 12, unread = 3 }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDoc = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const items = [
    { id: 'today', label: 'Today' },
    { id: 'map', label: 'Map' },
    { id: 'goals', label: 'Goals' },
    { id: 'history', label: 'History' },
  ];

  const initials = userName.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <nav style={{
      background: 'var(--slate-900)',
      color: '#fff',
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      flexShrink: 0,
      flexWrap: 'nowrap',
      whiteSpace: 'nowrap',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      position: 'relative',
      zIndex: 20,
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 20 }}>
        <img src="../../assets/logo-mark.svg" style={{ width: 26, height: 26 }} />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>Daily Push</span>
      </div>

      {/* Primary nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {items.map(item => {
          const active = current === item.id;
          return (
            <a key={item.id}
               onClick={() => onNav?.(item.id)}
               style={{
                 fontSize: 13,
                 fontWeight: 500,
                 cursor: 'pointer',
                 padding: '7px 12px',
                 borderRadius: 8,
                 color: active ? '#fff' : 'var(--slate-300)',
                 background: active ? 'rgba(56,189,248,0.14)' : 'transparent',
                 boxShadow: active ? 'inset 0 0 0 1px rgba(56,189,248,0.35)' : 'none',
                 transition: 'all 120ms',
               }}
               onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#fff'; }}
               onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--slate-300)'; }}>
              {item.label}
            </a>
          );
        })}
      </div>

      {/* Right cluster */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>

        {/* Streak pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px 5px 8px',
          borderRadius: 999,
          background: 'rgba(251,146,60,0.12)',
          border: '1px solid rgba(251,146,60,0.28)',
          color: '#fdba74',
          fontSize: 12,
          fontWeight: 600,
        }} title={`${streak}-day streak`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2 C 13 8, 6 9, 6 15 A 6 6 0 0 0 18 15 C 18 11, 15 10, 14 7 Z" />
          </svg>
          {streak}
        </div>

        {/* Bell */}
        <button type="button" title="Notifications" style={{
          position: 'relative',
          width: 34, height: 34, borderRadius: 8,
          border: 'none', background: 'transparent',
          color: 'var(--slate-300)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 120ms, color 120ms',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--slate-300)'; }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {unread > 0 && (
            <span style={{
              position: 'absolute', top: 5, right: 5,
              minWidth: 16, height: 16, padding: '0 4px',
              borderRadius: 999, background: 'var(--sky-500)',
              color: '#fff', fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1.5px solid var(--slate-900)',
              lineHeight: 1,
            }}>{unread}</span>
          )}
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.08)' }} />

        {/* User chip + dropdown */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => setMenuOpen(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '4px 9px 4px 4px',
            borderRadius: 999,
            background: menuOpen ? 'rgba(255,255,255,0.08)' : 'transparent',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#fff',
            cursor: 'pointer',
            transition: 'background 120ms',
          }}
            onMouseEnter={e => { if (!menuOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={e => { if (!menuOpen) e.currentTarget.style.background = 'transparent'; }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
              color: '#fff', fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              letterSpacing: '0.01em',
            }}>{initials}</div>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{userName.split(' ')[0]}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--slate-400)', transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              width: 240,
              background: '#fff',
              border: '1px solid var(--border-base)',
              borderRadius: 12,
              boxShadow: '0 18px 40px -12px rgba(15,23,42,0.35)',
              color: 'var(--fg-1)',
              overflow: 'hidden',
              zIndex: 30,
            }}>
              {/* Header */}
              <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--border-base)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
                    color: '#fff', fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{initials}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{userName}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-3)', lineHeight: 1.3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>amit@example.com</div>
                  </div>
                </div>
              </div>

              {/* Items */}
              <MenuItem icon="user" label="Profile" />
              <MenuItem icon="settings" label="Settings" onClick={() => { setMenuOpen(false); onNav?.('settings'); }} />
              <MenuItem icon="bell" label="Notifications" hint={unread > 0 ? unread : null} />
              <MenuItem icon="help" label="Help & feedback" />

              <div style={{ height: 1, background: 'var(--border-base)', margin: '4px 0' }} />

              <MenuItem icon="logout" label="Sign out" danger onClick={() => { setMenuOpen(false); onNav?.('login'); }} />
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

function MenuItem({ icon, label, hint, danger, onClick }) {
  const icons = {
    user:     <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
    bell:     <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
    help:     <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
    logout:   <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
  };
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      width: '100%', padding: '9px 14px',
      background: 'transparent', border: 'none',
      fontSize: 13, fontWeight: 500,
      color: danger ? 'var(--red-600)' : 'var(--fg-1)',
      cursor: 'pointer', textAlign: 'left',
      fontFamily: 'inherit',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'var(--red-50, #fef2f2)' : 'var(--slate-50)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: danger ? 'var(--red-600)' : 'var(--fg-3)' }}>
        {icons[icon]}
      </svg>
      <span style={{ flex: 1 }}>{label}</span>
      {hint != null && (
        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--sky-500)', padding: '2px 6px', borderRadius: 999 }}>{hint}</span>
      )}
    </button>
  );
}

Object.assign(window, { TopNav });
