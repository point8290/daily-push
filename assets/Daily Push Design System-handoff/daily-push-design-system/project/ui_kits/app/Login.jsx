// Login / register card
function Login({ onSignIn }) {
  const [mode, setMode] = React.useState('login');
  const [email, setEmail] = React.useState('');
  const [pwd, setPwd] = React.useState('');
  const [name, setName] = React.useState('');

  const input = {
    width: '100%', boxSizing: 'border-box', border: '1px solid var(--border-base)',
    borderRadius: 'var(--radius-md)', padding: '9px 12px', fontSize: 14,
    fontFamily: 'inherit', color: 'var(--fg-1)', outline: 'none',
  };
  const label = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--fg-2)', marginBottom: 5 };

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="../../assets/logo-mark.svg" style={{ width: 44, height: 44, marginBottom: 12 }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--fg-1)', letterSpacing: '-0.02em', margin: 0 }}>Daily Push</h1>
          <p style={{ color: 'var(--fg-2)', fontSize: 14, marginTop: 4 }}>Your personal upskilling system</p>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--border-base)', padding: 24, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', background: 'var(--slate-100)', borderRadius: 8, padding: 4, marginBottom: 18 }}>
            {['login', 'register'].map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: mode === m ? '#fff' : 'transparent',
                  color: mode === m ? 'var(--fg-1)' : 'var(--fg-2)',
                  boxShadow: mode === m ? 'var(--shadow-xs)' : 'none',
                }}>
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'register' && (
              <div>
                <label style={label}>Name</label>
                <input style={input} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </div>
            )}
            <div>
              <label style={label}>Email</label>
              <input style={input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <label style={label}>Password</label>
              <input style={input} type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="Min. 8 characters" />
            </div>
            <button onClick={() => onSignIn?.(email || 'amit@dailypush.app')}
              style={{
                width: '100%', background: 'var(--brand-primary)', color: '#fff',
                border: 'none', borderRadius: 10, padding: '11px', fontSize: 14,
                fontWeight: 600, cursor: 'pointer', marginTop: 4, transition: 'background 120ms',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--brand-primary-hov)'}
              onMouseOut={e => e.currentTarget.style.background = 'var(--brand-primary)'}>
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Login });
