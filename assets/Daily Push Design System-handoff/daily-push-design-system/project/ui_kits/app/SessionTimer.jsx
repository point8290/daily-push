// Active session: timer + rating
function SessionTimer({ timebox = 30, onComplete }) {
  const [stage, setStage] = React.useState('in_session'); // in_session | rating
  const [conf, setConf] = React.useState(0);
  const [elapsed, setElapsed] = React.useState(8 * 60 + 18); // 08:18 pre-set

  const remaining = Math.max(0, timebox * 60 - elapsed);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = Math.min(100, (elapsed / (timebox * 60)) * 100);
  const r = 52;
  const circ = 2 * Math.PI * r;

  const confLabels = { 1: 'Barely recall', 2: 'Fuzzy memory', 3: 'Getting there', 4: 'Solid grasp', 5: 'Nailed it' };
  const confBgs = {
    1: { border: 'var(--red-400)', bg: 'var(--red-50)', fg: 'var(--red-600)' },
    2: { border: 'var(--orange-400)', bg: 'var(--orange-50)', fg: 'var(--orange-600)' },
    3: { border: 'var(--amber-400)', bg: 'var(--amber-50)', fg: 'var(--amber-700)' },
    4: { border: 'var(--sky-400)', bg: 'var(--sky-50)', fg: 'var(--sky-700)' },
    5: { border: 'var(--emerald-400)', bg: 'var(--emerald-50)', fg: 'var(--emerald-700)' },
  };

  if (stage === 'rating') {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ textAlign: 'center', paddingTop: 16 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Rate your understanding
          </p>
          <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--fg-1)' }}>
            Self-attention mechanism
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {[1, 2, 3, 4, 5].map(n => {
            const sel = conf === n;
            const s = confBgs[n];
            return (
              <button key={n} onClick={() => setConf(n)}
                style={{
                  aspectRatio: '1/1', borderRadius: 12, cursor: 'pointer',
                  border: sel ? `2px solid ${s.border}` : '2px solid var(--border-base)',
                  background: sel ? s.bg : '#fff',
                  color: sel ? s.fg : 'var(--fg-3)',
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18,
                  transform: sel ? 'scale(1.05)' : 'scale(1)',
                  transition: 'all 200ms var(--ease-out)',
                }}>{n}</button>
            );
          })}
        </div>

        {conf > 0 && (
          <p style={{ margin: 0, textAlign: 'center', fontSize: 14, fontWeight: 500, color: 'var(--fg-2)' }}>
            {confLabels[conf]}
          </p>
        )}

        <div>
          <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--fg-3)', fontWeight: 500 }}>
            Explain it back (optional — get AI feedback)
          </p>
          <textarea rows={3}
            placeholder='How would you explain "Self-attention mechanism" to a colleague?'
            style={{
              width: '100%', boxSizing: 'border-box', border: '1px solid var(--border-base)',
              borderRadius: 12, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit',
              color: 'var(--fg-1)', outline: 'none', resize: 'none',
            }} />
        </div>

        <button disabled={!conf} onClick={() => onComplete?.(conf)}
          style={{
            width: '100%', padding: '13px', borderRadius: 12, border: 'none', cursor: conf ? 'pointer' : 'default',
            background: 'var(--emerald-600)', color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
            opacity: conf ? 1 : 0.4, transition: 'opacity 120ms',
          }}>
          Submit →
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 768, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a style={{ color: 'var(--fg-3)', fontSize: 13, cursor: 'pointer' }}>← Stop session</a>
        <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>New concept</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '24px 0' }}>
        <div style={{ position: 'relative', width: 132, height: 132 }}>
          <svg viewBox="0 0 120 120" style={{ width: 132, height: 132, transform: 'rotate(-90deg)' }}>
            <circle cx="60" cy="60" r={r} fill="none" stroke="var(--slate-200)" strokeWidth="8" />
            <circle cx="60" cy="60" r={r} fill="none" stroke="var(--sky-500)" strokeWidth="8"
              strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
              style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--slate-800)', fontVariantNumeric: 'tabular-nums' }}>
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
            <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{timebox}m session</span>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--fg-1)' }}>Self-attention mechanism</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--fg-3)' }}>Intermediate</p>
        </div>

        <div style={{ background: 'var(--slate-50)', border: '1px solid var(--border-base)', borderRadius: 12, padding: 16, fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6, maxWidth: 420 }}>
          How queries, keys, and values interact to let tokens attend to each other — the core operation behind every transformer.
        </div>
      </div>

      <button onClick={() => setStage('rating')}
        style={{
          width: '100%', padding: '13px', borderRadius: 12, border: 'none',
          background: 'var(--slate-900)', color: '#fff', fontSize: 14, fontWeight: 600,
          fontFamily: 'inherit', cursor: 'pointer', transition: 'background 120ms',
        }}
        onMouseOver={e => e.currentTarget.style.background = 'var(--slate-800)'}
        onMouseOut={e => e.currentTarget.style.background = 'var(--slate-900)'}>
        Mark complete →
      </button>
    </div>
  );
}

Object.assign(window, { SessionTimer });
