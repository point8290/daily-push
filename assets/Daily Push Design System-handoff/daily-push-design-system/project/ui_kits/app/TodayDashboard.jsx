// Today dashboard — idle state
function TodayDashboard({ onStartSession }) {
  const [timebox, setTimebox] = React.useState(30);

  return (
    <div style={{ maxWidth: 768, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Greeting + streak */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>Today</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--fg-2)', fontSize: 14 }}>Good work, Amit</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--amber-500)' }}>12</p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--fg-3)' }}>day streak</p>
        </div>
      </div>

      {/* Goal progress */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="eyebrow" style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Become an AI/LLM engineer
          </span>
          <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>~8w left</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 6, background: 'var(--slate-100)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: '48%', height: '100%', background: 'var(--sky-500)', borderRadius: 999, transition: 'width 400ms' }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--fg-2)', fontFamily: 'var(--font-mono)' }}>12/25</span>
        </div>
      </Card>

      {/* Today's node */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Today</span>
          <span style={{ color: 'var(--slate-200)', fontSize: 11 }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>Attention & transformers</span>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Pill>Intermediate</Pill>
            <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>~30 min</span>
          </div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--fg-1)', letterSpacing: '-0.01em' }}>
            Self-attention mechanism
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--fg-2)', lineHeight: 1.55 }}>
            How queries, keys, and values interact to let tokens attend to each other. The core operation behind every transformer.
          </p>
        </div>

        <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--fg-3)', fontWeight: 500 }}>Study for</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[15, 30, 60].map(t => (
            <button key={t} onClick={() => setTimebox(t)}
              style={{
                flex: 1, padding: '9px', borderRadius: 10, cursor: 'pointer',
                border: timebox === t ? '1px solid var(--sky-600)' : '1px solid var(--border-base)',
                background: timebox === t ? 'var(--sky-600)' : '#fff',
                color: timebox === t ? '#fff' : 'var(--fg-2)',
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                transition: 'all 120ms',
              }}>
              {t}m
            </button>
          ))}
        </div>

        <button onClick={() => onStartSession?.(timebox)} style={primaryBtn}>
          Start {timebox}min session →
        </button>
      </Card>

      {/* Review due */}
      <div style={{ background: 'var(--orange-50)', border: '1px solid var(--orange-200)', borderRadius: 16, padding: 20 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--orange-600)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Review due
        </span>
        <h3 style={{ margin: '8px 0 4px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--slate-800)' }}>Token embeddings</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.5 }}>
          Representing words as dense vectors that capture semantic meaning.
        </p>
        <button style={{ ...primaryBtn, background: 'var(--orange-500)', padding: '9px', fontSize: 13 }}
          onMouseOver={e => e.currentTarget.style.background = 'var(--orange-600)'}
          onMouseOut={e => e.currentTarget.style.background = 'var(--orange-500)'}>
          Start 15min review →
        </button>
      </div>
    </div>
  );
}

const primaryBtn = {
  width: '100%', background: 'var(--brand-primary)', color: '#fff',
  border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 600,
  fontFamily: 'inherit', cursor: 'pointer', transition: 'background 120ms',
};

function Card({ children }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border-base)', borderRadius: 16,
      padding: 20, boxShadow: 'var(--shadow-xs)',
    }}>{children}</div>
  );
}

function Pill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: { bg: 'var(--slate-100)', fg: 'var(--fg-2)' },
    sky: { bg: 'var(--sky-100)', fg: 'var(--sky-700)' },
  };
  const t = tones[tone];
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
      background: t.bg, color: t.fg,
    }}>{children}</span>
  );
}

Object.assign(window, { TodayDashboard, Card, Pill, primaryBtn });
