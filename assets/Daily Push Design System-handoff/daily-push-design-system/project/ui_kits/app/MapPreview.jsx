// Knowledge map preview — interactive graph with pan/zoom + detail panel
function MapPreview() {
  // Authoritative node list
  const NODES = [
    { id: 'a', x: 60,  y: 40,  title: 'Token embeddings',     track: 'Foundational', est: 20, state: 'done',   conf: 4, reviewIn: 6, summary: 'How discrete tokens map to dense vectors. Covers vocab, tokenizers, and embedding lookup.' },
    { id: 'b', x: 380, y: 40,  title: 'Positional encoding',  track: 'Foundational', est: 15, state: 'done',   conf: 5, reviewIn: 12, summary: 'Sinusoidal vs learned position vectors and why order matters in transformer inputs.' },
    { id: 'c', x: 220, y: 200, title: 'Self-attention',       track: 'Intermediate', est: 30, state: 'avail',  conf: null, reviewIn: null, summary: 'Query/key/value mechanics, scaled dot-product attention, and the intuition behind attention weights.' },
    { id: 'd', x: 60,  y: 360, title: 'Multi-head attention', track: 'Intermediate', est: 25, state: 'locked', conf: null, reviewIn: null, summary: 'Splitting attention into parallel heads to capture different relation types. Requires self-attention.' },
    { id: 'e', x: 380, y: 360, title: 'Transformer block',    track: 'Intermediate', est: 25, state: 'review', conf: 2, reviewIn: -1, summary: 'Assembling attention + FFN + residual + layer-norm into the repeatable transformer unit.' },
    { id: 'f', x: 220, y: 520, title: 'Fine-tuning with LoRA', track: 'Advanced',    est: 40, state: 'locked', conf: null, reviewIn: null, summary: 'Low-rank adaptation for parameter-efficient fine-tuning on custom datasets.' },
  ];
  const EDGES = [
    ['a', 'c', 'hard'], ['b', 'c', 'hard'],
    ['c', 'd', 'hard'], ['c', 'e', 'soft'],
    ['d', 'f', 'hard'], ['e', 'f', 'hard'],
  ];

  const NODE_W = 176;
  const NODE_H = 76;

  const stateStyles = {
    done:   { bg: 'var(--emerald-100)', br: 'var(--emerald-400)', fg: 'var(--emerald-700)', dot: 'var(--emerald-500)', label: 'Done' },
    avail:  { bg: 'var(--sky-50)',      br: 'var(--sky-400)',     fg: 'var(--sky-800)',     dot: 'var(--sky-500)',     label: 'Available' },
    review: { bg: 'var(--orange-50)',   br: 'var(--orange-400)',  fg: 'var(--orange-700)',  dot: 'var(--orange-500)',  label: 'Review due' },
    locked: { bg: 'var(--slate-50)',    br: 'var(--slate-300)',   fg: 'var(--slate-400)',   dot: 'var(--slate-400)',   label: 'Locked' },
  };

  const byId = React.useMemo(() => Object.fromEntries(NODES.map(n => [n.id, n])), []);
  const neighbors = React.useMemo(() => {
    const m = {};
    NODES.forEach(n => { m[n.id] = { in: [], out: [] }; });
    EDGES.forEach(([f, t]) => { m[f].out.push(t); m[t].in.push(f); });
    return m;
  }, []);

  const [filter, setFilter] = React.useState('all');
  const [selected, setSelected] = React.useState('c');
  const [hovered, setHovered] = React.useState(null);

  // Pan/zoom
  const [view, setView] = React.useState({ x: 0, y: 0, k: 1 });
  const panState = React.useRef(null);
  const canvasRef = React.useRef(null);

  const onMouseDown = e => {
    if (e.target.closest('[data-node]')) return;
    panState.current = { startX: e.clientX, startY: e.clientY, origX: view.x, origY: view.y };
    e.preventDefault();
  };
  const onMouseMove = e => {
    if (!panState.current) return;
    const dx = e.clientX - panState.current.startX;
    const dy = e.clientY - panState.current.startY;
    setView(v => ({ ...v, x: panState.current.origX + dx, y: panState.current.origY + dy }));
  };
  const onMouseUp = () => { panState.current = null; };

  const onWheel = e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setView(v => ({ ...v, k: Math.max(0.5, Math.min(2, v.k * factor)) }));
  };

  const zoomIn  = () => setView(v => ({ ...v, k: Math.min(2, v.k * 1.15) }));
  const zoomOut = () => setView(v => ({ ...v, k: Math.max(0.5, v.k / 1.15) }));
  const zoomFit = () => setView({ x: 0, y: 0, k: 1 });

  const visible = filter === 'all' ? NODES : NODES.filter(n => n.track.toLowerCase() === filter);
  const visibleIds = new Set(visible.map(n => n.id));

  const selNode = byId[selected];

  // Edges touching the hover/selection get highlighted
  const highlightId = hovered || selected;
  const isEdgeHot = (f, t) => highlightId && (f === highlightId || t === highlightId);

  return (
    <div style={{ height: 'calc(100vh - 51px)', background: '#f8fafc', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border-base)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-3)', fontSize: 11, marginBottom: 3 }}>
            <span>Goals</span>
            <span>›</span>
            <span style={{ color: 'var(--fg-2)' }}>AI/LLM engineer</span>
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--fg-1)', letterSpacing: '-0.01em' }}>Become an AI/LLM engineer</h1>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--fg-3)' }}>6 nodes · 2 done · 1 review due · 1 available</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {[
            ['all', 'All', 6],
            ['foundational', 'Foundational', 2],
            ['intermediate', 'Intermediate', 3],
            ['advanced', 'Advanced', 1],
          ].map(([id, label, count]) => (
            <button key={id} onClick={() => setFilter(id)} style={{
              padding: '5px 11px',
              borderRadius: 999,
              border: 'none',
              fontSize: 11,
              fontWeight: 600,
              background: filter === id ? 'var(--slate-800)' : 'var(--slate-100)',
              color: filter === id ? '#fff' : 'var(--fg-2)',
              cursor: 'pointer',
              transition: 'background 120ms',
              fontFamily: 'inherit',
            }}>{label} <span style={{ opacity: .55 }}>({count})</span></button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Canvas */}
        <div
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            cursor: panState.current ? 'grabbing' : 'grab',
            backgroundImage: 'radial-gradient(var(--slate-200) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
        >

          <div style={{
            position: 'absolute',
            left: 0, top: 0,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
            transformOrigin: '0 0',
            transition: panState.current ? 'none' : 'transform 160ms ease-out',
          }}>
            {/* Edges layer */}
            <svg style={{ position: 'absolute', left: 0, top: 0, width: 700, height: 680, overflow: 'visible', pointerEvents: 'none' }}>
              <defs>
                <marker id="arrHot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#0284c7" /></marker>
                <marker id="arrDim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#cbd5e1" /></marker>
              </defs>
              {EDGES.map(([f, t, type], i) => {
                if (!visibleIds.has(f) || !visibleIds.has(t)) return null;
                const a = byId[f], b = byId[t];
                const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H;
                const x2 = b.x + NODE_W / 2, y2 = b.y;
                const my = (y1 + y2) / 2;
                const hot = isEdgeHot(f, t);
                return (
                  <path key={i}
                    d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`}
                    stroke={hot ? '#0284c7' : (type === 'hard' ? '#94a3b8' : '#cbd5e1')}
                    strokeWidth={hot ? 2.5 : (type === 'hard' ? 1.8 : 1.4)}
                    strokeDasharray={type === 'soft' ? '5 4' : '0'}
                    fill="none"
                    opacity={highlightId && !hot ? 0.3 : 1}
                    markerEnd={hot ? 'url(#arrHot)' : 'url(#arrDim)'}
                    style={{ transition: 'all 150ms' }} />
                );
              })}
            </svg>

            {/* Nodes layer */}
            {visible.map(n => {
              const s = stateStyles[n.state];
              const isSel = selected === n.id;
              const isHover = hovered === n.id;
              const related = highlightId && (highlightId === n.id || neighbors[highlightId]?.in.includes(n.id) || neighbors[highlightId]?.out.includes(n.id));
              const dim = highlightId && !related;
              return (
                <div key={n.id}
                     data-node
                     onClick={() => setSelected(n.id)}
                     onMouseEnter={() => setHovered(n.id)}
                     onMouseLeave={() => setHovered(null)}
                     style={{
                       position: 'absolute', left: n.x, top: n.y, width: NODE_W, minHeight: NODE_H,
                       background: s.bg,
                       border: `2px solid ${isSel ? 'var(--slate-900)' : s.br}`,
                       color: s.fg,
                       borderRadius: 12,
                       padding: '10px 12px',
                       boxSizing: 'border-box',
                       fontSize: 12,
                       cursor: 'pointer',
                       boxShadow: isSel ? '0 0 0 4px rgba(15,23,42,0.08), 0 8px 20px -8px rgba(15,23,42,0.25)' : (isHover ? 'var(--shadow-md)' : (n.state === 'avail' ? 'var(--shadow-sm)' : 'none')),
                       opacity: dim ? 0.45 : 1,
                       transition: 'all 150ms',
                       userSelect: 'none',
                     }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.75 }}>{s.label}</span>
                    {n.state === 'done' && <span style={{ marginLeft: 'auto', fontSize: 11 }}>✓</span>}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.25, color: 'var(--fg-1)' }}>{n.title}</div>
                  <div style={{ fontSize: 10, opacity: 0.75, marginTop: 4 }}>{n.track} · {n.est}m</div>
                </div>
              );
            })}
          </div>

          {/* Zoom controls */}
          <div style={{
            position: 'absolute', top: 14, left: 14,
            display: 'flex', flexDirection: 'column',
            background: '#fff',
            border: '1px solid var(--border-base)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
          }}>
            <ZoomBtn onClick={zoomIn}>+</ZoomBtn>
            <div style={{ height: 1, background: 'var(--border-base)' }} />
            <ZoomBtn onClick={zoomOut}>−</ZoomBtn>
            <div style={{ height: 1, background: 'var(--border-base)' }} />
            <ZoomBtn onClick={zoomFit} title="Reset view">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 4 20 10 20" /><polyline points="20 10 20 4 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </ZoomBtn>
          </div>

          {/* Zoom readout */}
          <div style={{
            position: 'absolute', top: 14, left: 56,
            background: '#fff',
            border: '1px solid var(--border-base)',
            borderRadius: 999,
            padding: '4px 10px',
            fontSize: 11, fontWeight: 600, color: 'var(--fg-2)',
            boxShadow: 'var(--shadow-sm)',
          }}>{Math.round(view.k * 100)}%</div>

          {/* Legend */}
          <div style={{
            position: 'absolute', bottom: 14, left: 14,
            background: '#fff',
            border: '1px solid var(--border-base)',
            borderRadius: 12,
            padding: '10px 12px',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex', flexWrap: 'wrap', gap: '6px 14px',
            fontSize: 10, color: 'var(--fg-2)',
            maxWidth: 'calc(100% - 28px)',
          }}>
            {[
              ['Available', 'var(--sky-50)', 'var(--sky-400)'],
              ['Done', 'var(--emerald-100)', 'var(--emerald-400)'],
              ['Review due', 'var(--orange-50)', 'var(--orange-400)'],
              ['Locked', 'var(--slate-100)', 'var(--slate-300)'],
            ].map(([l, bg, br]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 11, height: 11, borderRadius: 3, background: bg, border: `1px solid ${br}` }} />
                {l}
              </div>
            ))}
          </div>

          {/* Pan hint */}
          <div style={{
            position: 'absolute', bottom: 14, right: 14,
            fontSize: 10, color: 'var(--fg-3)',
            background: 'rgba(255,255,255,0.8)',
            padding: '4px 8px', borderRadius: 6,
            backdropFilter: 'blur(4px)',
          }}>Drag to pan · ⌘+scroll to zoom</div>
        </div>

        {/* Detail panel */}
        {selNode && (
          <aside style={{
            width: 320,
            background: '#fff',
            borderLeft: '1px solid var(--border-base)',
            padding: '20px 20px 24px',
            display: 'flex', flexDirection: 'column', gap: 14,
            flexShrink: 0,
            overflowY: 'auto',
          }}>
            {/* State chip */}
            <div>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '3px 10px',
                borderRadius: 999,
                background: stateStyles[selNode.state].bg,
                color: stateStyles[selNode.state].fg,
                border: `1px solid ${stateStyles[selNode.state].br}`,
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: stateStyles[selNode.state].dot }} />
                {stateStyles[selNode.state].label}
              </span>
            </div>

            {/* Title */}
            <div>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--fg-1)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{selNode.title}</h2>
              <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 6 }}>{selNode.track} · ~{selNode.est} min</div>
            </div>

            {/* Summary */}
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.55 }}>{selNode.summary}</p>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 2 }}>
              <Stat label="Confidence" value={selNode.conf != null ? `${selNode.conf}/5` : '—'} color={selNode.conf != null ? `var(--conf-${selNode.conf})` : 'var(--fg-3)'} />
              <Stat label="Next review" value={
                selNode.reviewIn == null ? '—'
                : selNode.reviewIn < 0 ? 'Overdue'
                : `in ${selNode.reviewIn}d`
              } color={
                selNode.reviewIn == null ? 'var(--fg-3)'
                : selNode.reviewIn < 0 ? 'var(--orange-600)'
                : 'var(--fg-1)'
              } />
            </div>

            {/* Prereqs */}
            {neighbors[selNode.id].in.length > 0 && (
              <Section title="Requires">
                {neighbors[selNode.id].in.map(id => <NodeChip key={id} node={byId[id]} onClick={() => setSelected(id)} stateStyles={stateStyles} />)}
              </Section>
            )}

            {/* Unlocks */}
            {neighbors[selNode.id].out.length > 0 && (
              <Section title="Unlocks">
                {neighbors[selNode.id].out.map(id => <NodeChip key={id} node={byId[id]} onClick={() => setSelected(id)} stateStyles={stateStyles} />)}
              </Section>
            )}

            {/* Actions */}
            <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-base)' }}>
              {selNode.state === 'avail' && (
                <button style={primaryBtn}>▶ Start session · {selNode.est}m</button>
              )}
              {selNode.state === 'review' && (
                <button style={{ ...primaryBtn, background: 'var(--orange-500)' }}>↻ Review now</button>
              )}
              {selNode.state === 'done' && (
                <button style={secondaryBtn}>View notes</button>
              )}
              {selNode.state === 'locked' && (
                <button style={{ ...secondaryBtn, cursor: 'not-allowed', opacity: 0.6 }} disabled>Locked · complete prereqs</button>
              )}
              <button style={ghostBtn}>Edit node</button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function ZoomBtn({ children, onClick, title }) {
  return (
    <button type="button" onClick={onClick} title={title} style={{
      width: 32, height: 30,
      border: 'none', background: '#fff',
      color: 'var(--fg-2)',
      fontSize: 16, fontWeight: 500,
      cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'inherit',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--slate-50)'}
      onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
      {children}
    </button>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: 'var(--slate-50)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
    </div>
  );
}

function NodeChip({ node, onClick, stateStyles }) {
  const s = stateStyles[node.state];
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 10px',
      background: 'var(--slate-50)',
      border: '1px solid var(--border-base)',
      borderRadius: 8,
      fontSize: 12, fontWeight: 500,
      color: 'var(--fg-1)',
      cursor: 'pointer', textAlign: 'left',
      fontFamily: 'inherit', width: '100%',
    }}
      onMouseEnter={e => e.currentTarget.style.background = '#fff'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--slate-50)'}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.title}</span>
      <span style={{ fontSize: 10, color: 'var(--fg-3)' }}>→</span>
    </button>
  );
}

const primaryBtn = {
  padding: '10px 14px',
  borderRadius: 10,
  border: 'none',
  background: 'var(--slate-900)',
  color: '#fff',
  fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const secondaryBtn = {
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--border-base)',
  background: '#fff',
  color: 'var(--fg-1)',
  fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const ghostBtn = {
  padding: '8px 14px',
  borderRadius: 10,
  border: 'none',
  background: 'transparent',
  color: 'var(--fg-3)',
  fontSize: 12, fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

Object.assign(window, { MapPreview });
