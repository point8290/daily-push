import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  HStack,
  Select,
  Spinner,
  Stack,
  Text,
  VStack,
} from '@chakra-ui/react';
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
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';

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

const DEPTH_ORDER = ['surface', 'foundational', 'intermediate', 'advanced'] as const;

const NODE_W = 210;
const NODE_H = 72;
const H_GAP = 48;
const V_GAP = 100;

const depthLabel: Record<string, string> = {
  surface: 'Surface',
  foundational: 'Foundational',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const longevityColor: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-red-100 text-red-600',
};

function nodeColor(node: ConceptNode): { bg: string; border: string; text: string } {
  switch (node.status) {
    case 'locked':
      return { bg: '#f1f5f9', border: '#cbd5e1', text: '#94a3b8' };
    case 'available':
      return { bg: '#e0f2fe', border: '#38bdf8', text: '#0369a1' };
    case 'in_progress':
      return { bg: '#fef9c3', border: '#facc15', text: '#854d0e' };
    case 'review_due':
      return { bg: '#fff7ed', border: '#fb923c', text: '#9a3412' };
    case 'done':
      if ((node.confidence ?? 3) >= 4) return { bg: '#d1fae5', border: '#34d399', text: '#065f46' };
      if ((node.confidence ?? 3) <= 2) return { bg: '#fee2e2', border: '#f87171', text: '#991b1b' };
      return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
    default:
      return { bg: '#f8fafc', border: '#e2e8f0', text: '#64748b' };
  }
}

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

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium opacity-70">
          {depthLabel[nodeInfo.depth_level]}
        </span>
        <span className="text-[10px] opacity-40">.</span>
        <span className="text-[10px] opacity-70">{nodeInfo.estimated_mins}m</span>
        {nodeInfo.longevity ? (
          <>
            <span className="text-[10px] opacity-40">.</span>
            <span className={`rounded px-1 text-[10px] font-medium ${longevityColor[nodeInfo.longevity]}`}>
              {nodeInfo.longevity}
            </span>
          </>
        ) : null}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-slate-300 !border-0 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { conceptNode: MapNode };

function buildGraph(
  rawNodes: ConceptNode[],
  depthFilter: string | null,
  onSelect: (n: ConceptNode) => void,
): { nodes: Node[]; edges: Edge[] } {
  const filtered = depthFilter
    ? rawNodes.filter((n) => n.depth_level === depthFilter)
    : rawNodes;

  const filteredIds = new Set(filtered.map((n) => n.id));
  const positions = computeLayout(filtered);

  const nodes: Node[] = filtered.map((n) => ({
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
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: e.edgeType === 'hard_prerequisite' ? '#0ea5e9' : '#cbd5e1',
        },
      });
    }
  }

  return { nodes, edges };
}

const statusLabel: Record<string, string> = {
  locked: 'Locked',
  available: 'Available',
  in_progress: 'In progress',
  done: 'Done',
  review_due: 'Review due',
};

const aiLabel: Record<string, string> = {
  amplified: 'AI amplifies',
  replaced: 'AI replaces',
  unaffected: 'AI-neutral',
};

function SidePanel({ node, onClose }: { node: ConceptNode; onClose: () => void }) {
  const c = nodeColor(node);
  const unlockCount = node.outgoing_edges.filter((e) => e.edgeType === 'hard_prerequisite').length;

  return (
    <div className="absolute inset-y-4 right-4 z-10 w-[22rem]">
      <SurfaceCard h="full" overflow="hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {depthLabel[node.depth_level]}
          </span>
          <button onClick={onClose} className="text-lg leading-none text-slate-400 transition-colors hover:text-slate-600">
            x
          </button>
        </div>

        <div className="flex h-[calc(100%-73px)] flex-col overflow-y-auto p-5">
          <div>
            <h3 className="text-base font-bold leading-snug text-slate-900">{node.title}</h3>
            <div className="mt-2 flex items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
              >
                {statusLabel[node.status]}
              </span>
              {node.confidence ? (
                <span className="text-xs text-slate-400">Confidence: {node.confidence}/5</span>
              ) : null}
            </div>
          </div>

          {node.description ? (
            <div className="mt-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">About</p>
              <p className="text-sm leading-relaxed text-slate-600">{node.description}</p>
            </div>
          ) : null}

          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Time estimate</span>
              <span className="font-medium text-slate-700">~{node.estimated_mins} min</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Longevity</span>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${longevityColor[node.longevity]}`}>
                {node.longevity}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">AI relationship</span>
              <span className="text-right text-xs font-medium text-slate-700">
                {aiLabel[node.ai_relationship] ?? node.ai_relationship}
              </span>
            </div>
          </div>

          {unlockCount > 0 ? (
            <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-sky-700">
                Unlock effect
              </p>
              <p className="mt-2 text-sm leading-relaxed text-sky-900">
                Completing this node unlocks {unlockCount} downstream concept{unlockCount === 1 ? '' : 's'}.
              </p>
            </div>
          ) : null}
        </div>
      </SurfaceCard>
    </div>
  );
}

const LEGEND = [
  { label: 'Locked', bg: '#f1f5f9', border: '#cbd5e1' },
  { label: 'Available', bg: '#e0f2fe', border: '#38bdf8' },
  { label: 'In progress', bg: '#fef9c3', border: '#facc15' },
  { label: 'Done', bg: '#d1fae5', border: '#34d399' },
  { label: 'Low confidence', bg: '#fee2e2', border: '#f87171' },
  { label: 'Review due', bg: '#fff7ed', border: '#fb923c' },
];

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

  useEffect(() => {
    const graph = buildGraph(rawNodes, depthFilter, setSelectedNode);
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [rawNodes, depthFilter, setNodes, setEdges]);

  useEffect(() => {
    if (nodes.length > 0) fitView({ padding: 0.15, duration: 400 });
  }, [nodes.length, fitView]);

  const onFilterChange = useCallback((depth: string | null) => {
    setDepthFilter(depth);
    setSelectedNode(null);
  }, []);

  useEffect(() => {
    setDepthFilter(null);
    setSelectedNode(null);
  }, [selectedGoalId]);

  const depthCounts = DEPTH_ORDER.reduce((acc, d) => {
    acc[d] = rawNodes.filter((n) => n.depth_level === d).length;
    return acc;
  }, {} as Record<string, number>);

  const selectedGoal = goals.find((g) => g._id === selectedGoalId);
  const goalTitle = selectedGoal?.structured?.title ?? 'Knowledge map';
  const doneCount = rawNodes.filter((n) => n.status === 'done').length;
  const availableCount = rawNodes.filter((n) => n.status === 'available').length;

  return (
    <SurfaceCard p={0} overflow="hidden" h="full">
      <Stack h="full" spacing={0}>
        <Box px={{ base: 5, md: 6 }} py={{ base: 5, md: 6 }} borderBottom="1px solid" borderColor="blackAlpha.100">
          <Stack spacing={5}>
            <HStack justify="space-between" align={{ base: 'flex-start', xl: 'center' }} flexDir={{ base: 'column', xl: 'row' }} spacing={4}>
              <VStack align="flex-start" spacing={1}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                  Goal graph
                </Text>
                <Text fontSize="2xl" fontWeight="700" color="ink.900" letterSpacing="-0.04em" lineHeight="1.05">
                  {goalTitle}
                </Text>
                <Text fontSize="sm" color="ink.500">
                  {nodesLoading ? 'Loading concept nodes...' : `${rawNodes.length} nodes mapped across the learning path.`}
                </Text>
              </VStack>

              <HStack spacing={3} flexWrap="wrap">
                <Badge px={3} py={1.5} rounded="full" colorScheme="blue" fontSize="0.72rem">
                  {availableCount} available
                </Badge>
                <Badge px={3} py={1.5} rounded="full" colorScheme="green" fontSize="0.72rem">
                  {doneCount} done
                </Badge>
              </HStack>
            </HStack>

            <HStack justify="space-between" align={{ base: 'stretch', lg: 'center' }} flexDir={{ base: 'column', lg: 'row' }} spacing={4}>
              {goals.length > 1 ? (
                <Select
                  value={selectedGoalId}
                  onChange={(e) => onGoalChange(e.target.value)}
                  maxW={{ base: 'full', lg: '24rem' }}
                  bg="whiteAlpha.700"
                  borderColor="blackAlpha.200"
                >
                  {goals.map((goal) => (
                    <option key={goal._id} value={goal._id}>
                      {goal.structured?.title ?? 'Untitled goal'}{goal.status === 'active' ? ' *' : ''}
                    </option>
                  ))}
                </Select>
              ) : (
                <Text fontSize="sm" color="ink.500">
                  Active map selected automatically from your confirmed goals.
                </Text>
              )}

              <HStack spacing={2} flexWrap="wrap">
                <Button
                  size="sm"
                  variant={depthFilter === null ? 'solid' : 'ghost'}
                  colorScheme={depthFilter === null ? 'blue' : undefined}
                  onClick={() => onFilterChange(null)}
                >
                  All
                </Button>
                {DEPTH_ORDER.map((depth) => (
                  depthCounts[depth] > 0 ? (
                    <Button
                      key={depth}
                      size="sm"
                      variant={depthFilter === depth ? 'solid' : 'ghost'}
                      colorScheme={depthFilter === depth ? 'blue' : undefined}
                      onClick={() => onFilterChange(depth)}
                    >
                      {depthLabel[depth]} ({depthCounts[depth]})
                    </Button>
                  ) : null
                ))}
              </HStack>
            </HStack>
          </Stack>
        </Box>

        <Box position="relative" flex="1" minH="0">
          {nodesLoading ? (
            <VStack h="full" justify="center" spacing={4}>
              <Spinner size="lg" color="brand.500" thickness="3px" />
              <Text fontSize="sm" color="ink.500">Arranging your map...</Text>
            </VStack>
          ) : rawNodes.length === 0 ? (
            <Box px={6} py={10}>
              <EmptyState
                title="No concept nodes yet"
                description="Build study nodes from the goal page first, then come back here to explore dependencies, depth, and unlock paths."
                action={(
                  <Button as={RouterLink} to="/goals" colorScheme="blue">
                    Back to goals
                  </Button>
                )}
              />
            </Box>
          ) : (
            <>
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
                <Background color="#d9e2ef" gap={20} />
                <Controls />
              </ReactFlow>

              {selectedNode ? (
                <SidePanel node={selectedNode} onClose={() => setSelectedNode(null)} />
              ) : null}

              <Box position="absolute" bottom={4} left={4} zIndex={10}>
                <SurfaceCard px={4} py={3}>
                  <Stack spacing={3}>
                    <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                      Legend
                    </Text>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                      {LEGEND.map((item) => (
                        <div key={item.label} className="flex items-center gap-1.5">
                          <div
                            className="h-3 w-3 shrink-0 rounded-sm border"
                            style={{ background: item.bg, borderColor: item.border }}
                          />
                          <span className="text-[10px] text-slate-500">{item.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3 border-t border-slate-100 pt-2">
                      <div className="flex items-center gap-1.5">
                        <div className="h-0.5 w-6 bg-sky-400" />
                        <span className="text-[10px] text-slate-400">Hard prerequisite</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div
                          className="h-0.5 w-6 bg-slate-300"
                          style={{ borderTop: '1px dashed #cbd5e1', background: 'none' }}
                        />
                        <span className="text-[10px] text-slate-400">Soft prerequisite</span>
                      </div>
                    </div>
                  </Stack>
                </SurfaceCard>
              </Box>
            </>
          )}
        </Box>
      </Stack>
    </SurfaceCard>
  );
}

export default function Map() {
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string>('');
  const [rawNodes, setRawNodes] = useState<ConceptNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [noGoal, setNoGoal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const allGoals: GoalSummary[] = await getGoals();
        const confirmed = allGoals.filter((g) => g.status === 'active' || g.status === 'completed');
        if (confirmed.length === 0) {
          setNoGoal(true);
          return;
        }
        setGoals(confirmed);
        const active = confirmed.find((g) => g.status === 'active');
        setSelectedGoalId((active ?? confirmed[0])._id);
      } catch {
        setNoGoal(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedGoalId) return;
    setNodesLoading(true);
    setRawNodes([]);
    getGoalNodes(selectedGoalId)
      .then(setRawNodes)
      .catch(() => setRawNodes([]))
      .finally(() => setNodesLoading(false));
  }, [selectedGoalId]);

  if (loading) {
    return (
      <SurfaceCard p={{ base: 8, md: 12 }}>
        <VStack spacing={4} minH="55vh" justify="center">
          <Spinner size="lg" color="brand.500" thickness="3px" />
          <Text fontSize="sm" color="ink.500">Loading your knowledge map...</Text>
        </VStack>
      </SurfaceCard>
    );
  }

  if (noGoal) {
    return (
      <Stack spacing={6}>
        <PageHeader
          eyebrow="Map"
          title="Knowledge Map"
          description="Follow dependencies, see what is blocked, and understand how each concept unlocks the next step in your plan."
        />
        <EmptyState
          title="No confirmed goals yet"
          description="Confirm a goal first, then this workspace will turn into a live map of your learning graph."
          action={(
            <Button as={RouterLink} to="/goals" colorScheme="blue">
              Go to goals
            </Button>
          )}
        />
      </Stack>
    );
  }

  return (
    <Stack spacing={6}>
      <PageHeader
        eyebrow="Map"
        title="Knowledge Map"
        description="A dependency-aware view of your concept graph so you can spot the critical path, blocked work, and the highest-leverage next move."
      />

      <Box h={{ base: '72vh', xl: '78vh' }}>
        <ReactFlowProvider>
          <MapInner
            rawNodes={rawNodes}
            goals={goals}
            selectedGoalId={selectedGoalId}
            onGoalChange={setSelectedGoalId}
            nodesLoading={nodesLoading}
          />
        </ReactFlowProvider>
      </Box>
    </Stack>
  );
}
