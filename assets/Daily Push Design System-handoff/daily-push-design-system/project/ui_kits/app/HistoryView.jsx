// History view — stats + 90-day heatmap
function HistoryView() {
  // Build a 90-day heatmap, deterministic
  const days = React.useMemo(() => {
    const arr = [];
    for (let i = 0; i < 90; i++) {
      const r = Math.sin(i * 1.7) + Math.cos(i * 0.9);
      let c = 0;
      if (r > 0.5) c = 1;
      if (r > 1) c = 2;
      if (r > 1.3) c = 3;
      if (r > 1.7) c = 4;
      if (i < 5) c = 0;
      arr.push(c);
    }
    return arr;
  }, []);
  const heat = [
    'var(--slate-100)', 'var(--sky-200)', 'var(--sky-400)', 'var(--sky-500)', 'var(--sky-700)',
  ];
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div style={{ maxWidth: 768, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>History</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <StatTile value="12" label="Day streak" color="var(--sky-600)" />
        <StatTile value="48" label="Total sessions" color="var(--slate-800)" />
        <StatTile value="24h" label="Time studied" color="var(--slate-800)" />
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--border-base)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow-xs)' }}>
        <h2 style={{ margin: '0 0 18px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--slate-700)' }}>Last 90 days</h2>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
          {weeks.map((w, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {w.map((c, di) => (
                <div key={di} style={{ width: 14, height: 14, borderRadius: 3, background: heat[c] }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 11, color: 'var(--fg-3)' }}>
          Less
          {heat.map((c, i) => <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c }} />)}
          More
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 11, color: 'var(--fg-3)', textAlign: 'center' }}>
        Last session: 2 hours ago
      </p>
    </div>
  );
}

function StatTile({ value, label, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border-base)', borderRadius: 16, padding: 20, textAlign: 'center', boxShadow: 'var(--shadow-xs)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, color, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--fg-2)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

Object.assign(window, { HistoryView, StatTile });
