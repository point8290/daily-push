import { useEffect, useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getGoals, getGoalNodes } from '../api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoalSummary {
  _id: string;
  status: string;
  structured: { title: string };
}

interface ConceptNode {
  id: string;
  learning_topic_id: string;
  title: string;
  description: string;
  depth_level: 'surface' | 'foundational' | 'intermediate' | 'advanced';
  boundary_type: string;
  estimated_mins: number;
  longevity: 'high' | 'medium' | 'low';
  ai_relationship: string;
  status: 'locked' | 'available' | 'in_progress' | 'done' | 'review_due';
  confidence: number | null;
  position: number;
  outgoing_edges: Array<{ id: string; toNodeId: string; edgeType: string }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPTH_ORDER = ['surface', 'foundational', 'intermediate', 'advanced'] as const;

const NODE_W = 210;
const NODE_H = 72;
const H_GAP = 48;
const V_GAP = 100;

const depthLabel: Record<string, string> = {
  surface: 'Surface', foundational: 'Foundational',
  intermediate: 'Intermediate', advanced: 'Advanced',
};

const longevityColor: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-red-100 text-red-600',
};

function nodeColor(node: ConceptNode): { bg: string; border: string; text: string } {
  switch (node.status) {
    case 'locked':      return { bg: '#f1f5f9', border: '#cbd5e1', text: '#94a3b8' };
    case 'available':   return { bg: '#e0f2fe', border: '#38bdf8', text: '#0369a1' };
    case 'in_progress': return { bg: '#fef9c3', border: '#facc15', text: '#854d0e' };
    case 'review_due':  return { bg: '#fff7ed', border: '#fb923c', text: '#9a3412' };
    case 'done':
      if ((node.confidence ?? 3) >= 4) return { bg: '#d1fae5', border: '#34d399', text: '#065f46' };
      if ((node.confidence ?? 3) <= 2) return { bg: '#fee2e2', border: '#f87171', text: '#991b1b' };
      return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
    default:            return { bg: '#f8fafc', border: '#e2e8f0', text: '#64748b' };
  }
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function computeLayout(nodes: ConceptNode[]): Map<string, { x: number; y: number }> {
  const byDepth: Record<string, ConceptNode[]> = {};
  for (const n of nodes) {
    (byDepth[n.depth_level] ??= []).push(n);
  }

  const positions = new globalThis.Map<string, { x: number; y: number }>();
  DEPTH_ORDER.forEach((depth, di) => {
    const group = (byDepth[depth] ?? []).sort((a, b) => a.position - b.position);
    const totalW = group.length * (NODE_W + H_GAP) - H_GAP;
    const startX = -totalW / 2;
    group.forEach((node, ni) => {
      positions.set(node.id, {
        x: startX + ni * (NODE_W + H_GAP),
        y: di * (NODE_H + V_GAP),
      });
    });
  });
  return positions;
}

// ─── Custom node component ────────────────────────────────────────────────────

type MapNodeData = {
  nodeInfo: ConceptNode;
  onSelect: (n: ConceptNode) => void;
};

function MapNode({ data }: NodeProps) {
  const d = data as MapNodeData;
  const { nodeInfo, onSelect } = d;
  const c = nodeColor(nodeInfo);

  return (
    <div
      onClick={() => onSelect(nodeInfo)}
      style={{ background: c.bg, border: `2px solid ${c.border}`, color: c.text, width: NODE_W, minHeight: NODE_H }}
      className="rounded-xl px-3 py-2 cursor-pointer transition-shadow hover:shadow-md select-none"
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-300 !border-0 !w-2 !h-2" />

      <p className="text-xs font-semibold leading-snug line-clamp-2" style={{ color: c.text }}>
        {nodeInfo.title}
      </p>

      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span className="text-[10px] font-medium opacity-70">
          {depthLabel[nodeInfo.depth_level]}
        </span>
        <span className="text-[10px] opacity-40">·</span>
        <span className="text-[10px] opacity-70">{nodeInfo.estimated_mins}m</span>
        {nodeInfo.longevity && (
          <>
            <span className="text-[10px] opacity-40">·</span>
            <span className={`text-[10px] px-1 rounded font-medium ${longevityColor[nodeInfo.longevity]}`}>
              {nodeInfo.longevity}
            </span>
          </>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-slate-300 !border-0 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { conceptNode: MapNode };

// ─── Transform data → React Flow ─────────────────────────────────────────────

function buildGraph(
  rawNodes: ConceptNode[],
  depthFilter: string | null,
  onSelect: (n: ConceptNode) => void
): { nodes: Node[]; edges: Edge[] } {
  const filtered = depthFilter
    ? rawNodes.filter(n => n.depth_level === depthFilter)
    : rawNodes;

  const filteredIds = new Set(filtered.map(n => n.id));
  const positions = computeLayout(filtered);

  const nodes: Node[] = filtered.map(n => ({
    id: n.id,
    type: 'conceptNode',
    position: positions.get(n.id) ?? { x: 0, y: 0 },
    data: { nodeInfo: n, onSelect } as MapNodeData,
    style: { width: NODE_W },
  }));

  const edges: Edge[] = [];
  for (const n of rawNodes) {
    for (const e of n.outgoing_edges) {
      if (!filteredIds.has(n.id) || !filteredIds.has(e.toNodeId)) continue;
      edges.push({
        id: e.id,
        source: n.id,
        target: e.toNodeId,
        type: 'smoothstep',
        animated: e.edgeType === 'hard_prerequisite',
        style: {
          stroke: e.edgeType === 'hard_prerequisite' ? '#0ea5e9' : '#cbd5e1',
          strokeWidth: e.edgeType === 'hard_prerequisite' ? 2 : 1,
          strokeDasharray: e.edgeType === 'soft_prerequisite' ? '4 3' : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: e.edgeType === 'hard_prerequisite' ? '#0ea5e9' : '#cbd5e1' },
      });
    }
  }

  return { nodes, edges };
}

// ─── Side panel ───────────────────────────────────────────────────────────────

const statusLabel: Record<string, string> = {
  locked: 'Locked', available: 'Available', in_progress: 'In progress',
  done: 'Done', review_due: 'Review due',
};
const aiLabel: Record<string, string> = {
  amplified: 'AI amplifies', replaced: 'AI replaces', unaffected: 'AI-neutral',
};

function SidePanel({ node, onClose }: { node: ConceptNode; onClose: () => void }) {
  const c = nodeColor(node);
  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white border-l border-slate-200 shadow-xl z-10 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          {depthLabel[node.depth_level]}
        </span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <h3 className="font-bold text-slate-900 text-base leading-snug">{node.title}</h3>
          <div className="flex items-center gap-2 mt-2">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
            >
              {statusLabel[node.status]}
            </span>
            {node.confidence && (
              <span className="text-xs text-slate-400">Confidence: {node.confidence}/5</span>
            )}
          </div>
        </div>

        {node.description && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">About</p>
            <p className="text-sm text-slate-600 leading-relaxed">{node.description}</p>
          </div>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Time estimate</span>
            <span className="font-medium text-slate-700">~{node.estimated_mins} min</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Longevity</span>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${longevityColor[node.longevity]}`}>
              {node.longevity}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">AI relationship</span>
            <span className="font-medium text-slate-700 text-xs">{aiLabel[node.ai_relationship] ?? node.ai_relationship}</span>
          </div>
        </div>

        {node.outgoing_edges.filter(e => e.edgeType === 'hard_prerequisite').length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
              Unlocks ({node.outgoing_edges.filter(e => e.edgeType === 'hard_prerequisite').length})
            </p>
            <p className="text-xs text-slate-500">Complete this node to unlock dependent concepts.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

const LEGEND = [
  { label: 'Locked',         bg: '#f1f5f9', border: '#cbd5e1' },
  { label: 'Available',      bg: '#e0f2fe', border: '#38bdf8' },
  { label: 'In progress',    bg: '#fef9c3', border: '#facc15' },
  { label: 'Done ✓',         bg: '#d1fae5', border: '#34d399' },
  { label: 'Low confidence', bg: '#fee2e2', border: '#f87171' },
  { label: 'Review due',     bg: '#fff7ed', border: '#fb923c' },
];

// ─── Inner map (inside ReactFlowProvider) ────────────────────────────────────

function MapInner({
  rawNodes,
  goals,
  selectedGoalId,
  onGoalChange,
  nodesLoading,
}: {
  rawNodes: ConceptNode[];
  goals: GoalSummary[];
  selectedGoalId: string;
  onGoalChange: (id: string) => void;
  nodesLoading: boolean;
}) {
  const [depthFilter, setDepthFilter] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<ConceptNode | null>(null);
  const { fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Rebuild graph whenever raw data or filter changes
  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(rawNodes, depthFilter, setSelectedNode);
    setNodes(n);
    setEdges(e);
  }, [rawNodes, depthFilter, setNodes, setEdges]);

  // Fit view after nodes are committed to DOM
  useEffect(() => {
    if (nodes.length > 0) fitView({ padding: 0.15, duration: 400 });
  }, [nodes.length, fitView]);

  const onFilterChange = useCallback((depth: string | null) => {
    setDepthFilter(depth);
    setSelectedNode(null);
  }, []);

  // Reset filter + panel when goal changes
  useEffect(() => {
    setDepthFilter(null);
    setSelectedNode(null);
  }, [selectedGoalId]);

  const depthCounts = DEPTH_ORDER.reduce((acc, d) => {
    acc[d] = rawNodes.filter(n => n.depth_level === d).length;
    return acc;
  }, {} as Record<string, number>);

  const selectedGoal = goals.find(g => g._id === selectedGoalId);
  const goalTitle = selectedGoal?.structured?.title ?? 'Knowledge Map';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white shrink-0 gap-3 flex-wrap">
        <div className="min-w-0">
          {goals.length > 1 ? (
            <select
              value={selectedGoalId}
              onChange={e => onGoalChange(e.target.value)}
              className="text-sm font-bold text-slate-900 border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 max-w-[220px] truncate"
            >
              {goals.map(g => (
                <option key={g._id} value={g._id}>
                  {g.structured?.title ?? 'Untitled goal'}
                  {g.status === 'active' ? ' ★' : ''}
                </option>
              ))}
            </select>
          ) : (
            <h1 className="font-bold text-slate-900 text-base truncate max-w-xs">{goalTitle}</h1>
          )}
          <p className="text-xs text-slate-400 mt-0.5">
            {nodesLoading
              ? 'Loading nodes...'
              : `${rawNodes.length} nodes · ${rawNodes.filter(n => n.status === 'done').length} done`}
          </p>
        </div>

        <div className="flex gap-1 flex-wrap justify-end">
          <button
            onClick={() => onFilterChange(null)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              !depthFilter ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            All
          </button>
          {DEPTH_ORDER.map(d => (
            depthCounts[d] > 0 && (
              <button
                key={d}
                onClick={() => onFilterChange(d)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  depthFilter === d ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {depthLabel[d]} <span className="opacity-60">({depthCounts[d]})</span>
              </button>
            )
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        {nodesLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-7 h-7 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
          </div>
        ) : rawNodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <p className="text-slate-500 font-medium text-sm">No nodes yet</p>
              <p className="text-slate-400 text-xs">Build study nodes on your goal page first.</p>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.2}
            maxZoom={2}
            onPaneClick={() => setSelectedNode(null)}
          >
            <Background color="#e2e8f0" gap={20} />
            <Controls />
          </ReactFlow>
        )}

        {selectedNode && (
          <SidePanel node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}

        {!nodesLoading && rawNodes.length > 0 && (
          <div className="absolute bottom-4 left-4 bg-white border border-slate-200 rounded-xl p-3 shadow-sm z-10">
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {LEGEND.map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded-sm border shrink-0"
                    style={{ background: l.bg, borderColor: l.border }}
                  />
                  <span className="text-[10px] text-slate-500">{l.label}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-0.5 bg-sky-400" />
                <span className="text-[10px] text-slate-400">Hard prerequisite</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-0.5 bg-slate-300" style={{ borderTop: '1px dashed #cbd5e1', background: 'none' }} />
                <span className="text-[10px] text-slate-400">Soft prerequisite</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function Map() {
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string>('');
  const [rawNodes, setRawNodes] = useState<ConceptNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [noGoal, setNoGoal] = useState(false);

  // Load goals on mount
  useEffect(() => {
    (async () => {
      try {
        const allGoals: GoalSummary[] = await getGoals();
        const confirmed = allGoals.filter(g => g.status === 'active' || g.status === 'completed');
        if (confirmed.length === 0) { setNoGoal(true); return; }
        setGoals(confirmed);
        // Default to the active goal, or first
        const active = confirmed.find(g => g.status === 'active');
        setSelectedGoalId((active ?? confirmed[0])._id);
      } catch {
        setNoGoal(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load nodes whenever selectedGoalId changes
  useEffect(() => {
    if (!selectedGoalId) return;
    setNodesLoading(true);
    setRawNodes([]);
    getGoalNodes(selectedGoalId)
      .then(setRawNodes)
      .catch(() => setRawNodes([]))
      .finally(() => setNodesLoading(false));
  }, [selectedGoalId]);

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className="w-7 h-7 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
    </div>
  );

  if (noGoal) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-2">
        <p className="text-slate-500 font-medium">No confirmed goals</p>
        <p className="text-slate-400 text-sm">Set and confirm a goal to see your knowledge map.</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 top-[49px]">
      <ReactFlowProvider>
        <MapInner
          rawNodes={rawNodes}
          goals={goals}
          selectedGoalId={selectedGoalId}
          onGoalChange={setSelectedGoalId}
          nodesLoading={nodesLoading}
        />
      </ReactFlowProvider>
    </div>
  );
}
