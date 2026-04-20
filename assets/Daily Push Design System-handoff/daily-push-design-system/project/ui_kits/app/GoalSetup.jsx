// Goal setup — intake form with quick picks
function GoalSetup({ onSubmit }) {
  const [text, setText] = React.useState('');
  const picks = [
    'Get a senior engineering job at a product company',
    'Build and ship an AI-powered product',
    'Get promoted to senior / staff engineer',
    'Transition from backend to full-stack',
    'Become an AI/LLM engineer',
  ];

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--sky-600)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>1</div>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-1)' }}>Your goal</span>
        <div style={{ width: 32, height: 1, background: 'var(--border-base)' }} />
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--slate-200)', color: 'var(--fg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>2</div>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-3)' }}>Clarify</span>
      </div>

      <div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>
          What are you trying to achieve?
        </h1>
        <p style={{ margin: '6px 0 0', color: 'var(--fg-2)', fontSize: 14, lineHeight: 1.55 }}>
          Tell us your situation, where you are now, and what success looks like. Don't worry about being precise — just talk.
        </p>
      </div>

      <textarea value={text} onChange={e => setText(e.target.value)} rows={5}
        placeholder="e.g. I'm a mid-level backend developer at a startup, been there 3 years. I want to move to a senior role at a bigger company. I've been passed over for promotion twice and I'm not sure what's missing. I have about 45 mins a day to study..."
        style={{
          width: '100%', boxSizing: 'border-box', border: '1px solid var(--border-base)',
          borderRadius: 12, padding: '12px 14px', fontSize: 14, fontFamily: 'inherit',
          color: 'var(--fg-1)', outline: 'none', resize: 'none', lineHeight: 1.5,
        }} />

      <div>
        <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Or pick a starting point
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {picks.map(p => (
            <button key={p} onClick={() => setText(p)}
              style={{
                textAlign: 'left', fontSize: 13, padding: '9px 12px', borderRadius: 10,
                border: '1px solid var(--border-base)', background: '#fff',
                color: 'var(--fg-2)', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 200ms',
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--sky-300)'; e.currentTarget.style.background = 'var(--sky-50)'; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-base)'; e.currentTarget.style.background = '#fff'; }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <button disabled={!text.trim()} onClick={() => onSubmit?.(text)}
        style={{
          width: '100%', padding: '12px', borderRadius: 12, border: 'none',
          background: 'var(--brand-primary)', color: '#fff', fontSize: 14, fontWeight: 600,
          fontFamily: 'inherit', cursor: text.trim() ? 'pointer' : 'default',
          opacity: text.trim() ? 1 : 0.4, transition: 'all 120ms',
        }}>
        Continue →
      </button>
    </div>
  );
}

Object.assign(window, { GoalSetup });
