# Topic Engine — Implementation Plan

> Last updated: 2026-04-12
> Sources: discussion.txt, furtherdiscussion.txt, furtherdiscussion2.txt + full codebase read

---

## Baseline: What's Already Built

The synchronous pipeline (Phase 1 + 2) is complete and evals pass at **85/100, 3/3 fixtures**.

| File | What it does |
|---|---|
| `llm/types.ts` | LLMProvider interface, PipelineRole, RouterConfig |
| `llm/structured.ts` | generateStructured() — Zod + retry + fence-strip |
| `llm/router.ts` | LLMRouter, per-role provider config, runtime swap |
| `llm/providers/` | Anthropic (+ extended thinking), OpenAI, Ollama |
| `engine/types.ts` | ConceptNode, ConceptEdge, ConceptGraph, GraphAnalytics |
| `engine/pipeline.ts` | 6-step orchestrator with timings |
| `engine/TopicEngine.ts` | Public facade — new TopicEngine().run() |
| `engine/steps/intentCapture.ts` | Step 1 — Haiku, parses level/goal/gap |
| `engine/steps/prerequisiteInference.ts` | Step 2 — Opus + extended thinking, raw graph |
| `engine/steps/boundaryDetection.ts` | Step 3 — classifies core/optional/out_of_scope |
| `engine/steps/critiqueAndPatch.ts` | Step 4 — rubric critique + surgical patch, max 2 rounds |
| `engine/validators/` | 6 validators (cycle, orphan, depth, time, transitive, granularity) |
| `engine/topology/` | L7: Brandes centrality, Louvain communities, Dijkstra paths |
| `evals/` | Runner + scorer + 3 ground-truth fixtures |

### Known Issues (to fix in Phase 0)
- Cycle edge priority wrong: `soft_prerequisite` before `leads_to` (should be reversed)
- `disconnected_subgraph` is a ViolationType in the spec but has no detector
- Validators use ad-hoc report types — not unified `Violation[]`
- Cycle repair only removes — no merge/reclassify/bridge strategies
- Depth inversion demotes edge (wrong) — should adjust node depth
- Granularity uses word-count heuristic — should use regex patterns
- Orphan just removes — should emit llm_rewrite and set requiresLLM flag
- ~1.7 LLM-produced cycles per run still reach the validator (catch before, not after)

---

## Phase 0 — Validator Rewrite
*No new infrastructure. Pure TypeScript. Fixes all spec gaps.*

### 0.1 Add Violation type system to `engine/types.ts`
```typescript
type ViolationType = 'cycle' | 'orphaned_node' | 'depth_inversion' |
  'time_implausibility' | 'redundant_edge' | 'disconnected_subgraph' | 'granularity_violation'

type RepairAction =
  | { strategy: 'remove_edge';      edgeId: string }
  | { strategy: 'remove_node';      nodeId: string }
  | { strategy: 'adjust_depth';     nodeId: string; newDepth: DepthLevel }
  | { strategy: 'adjust_time';      nodeId: string; newMins: number }
  | { strategy: 'add_edge';         from: string; to: string; type: EdgeType }
  | { strategy: 'merge_nodes';      nodeIdA: string; nodeIdB: string }
  | { strategy: 'reclassify_edge';  edgeId: string; newType: EdgeType }
  | { strategy: 'llm_rewrite';      prompt: string; targetNodeIds: string[] }
  | { strategy: 'flag';             reason: string }

interface Violation {
  type: ViolationType
  severity: 'error' | 'warning' | 'info'
  affectedNodeIds: string[]
  affectedEdgeIds: string[]
  description: string
  repair: RepairAction
}

interface StructuralValidationResult {
  valid: boolean
  violations: Violation[]
  repairedGraph: ConceptGraph
  requiresLLM: boolean
  warnings: string[]   // backward compat — derived from violations
  stats: { cyclesRepaired, orphansRemoved, depthInversionsFixed,
           timingsPatched, transitiveEdgesRemoved, granularityWarnings,
           disconnectedFixed }
}
```

### 0.2 Cycle detector — 4-strategy repair tree
Priority (weakest first): `confusable=1, leads_to=2, soft_prerequisite=3, hard_prerequisite=4`

Decision tree:
```
Both edges hard_prerequisite?
  → same depthLevel + combined estimatedMins ≤ 60  → merge_nodes (algorithmic)
  → one edge weaker type                            → reclassify_edge to leads_to (algorithmic)
  → 2-node cycle, both hard                         → llm_rewrite bridge node (deferred)
  → fallback                                        → remove_edge weakest
```

### 0.3 Orphan detector
Emit `llm_rewrite` violation with reconnect prompt. Apply `remove_node` as immediate fallback. Set `requiresLLM = true`.

### 0.4 Depth inversion checker
Repair: `adjust_depth` on `fromId` node to `shallowerThan(toId.depthLevel)`. Do NOT demote edge type.

### 0.5 Granularity checker — regex patterns
```typescript
tooNarrow: {
  maxMins: 8,
  syntaxPattern: /[\[\](){}\.#@]|`[^`]+`|\b\w+\(\)/,
}
tooBroad: {
  minMins: 150,
  broadTitlePattern: /^(javascript|python|react|node\.?js|css|html|sql|databases?|networking|algorithms?)$/i,
}
```
Emit `llm_rewrite` violations (split/merge prompts).

### 0.6 Add `disconnectedSubgraphChecker.ts`
Algorithm: reverse graph → BFS from root → nodes not reached = disconnected subgraph.
Root = node with no outbound hard/soft prerequisite edges (the target topic).
Repair: `llm_rewrite` with reconnect prompt.

### 0.7 StructuralValidator class (replaces validateGraph function)
1. Run all 7 detectors on original graph
2. Apply algorithmic repairs (remove_edge, remove_node, adjust_depth, adjust_time, merge_nodes, reclassify_edge)
3. Collect llm_rewrite/flag violations → requiresLLM
4. **Re-run cycle + disconnected checks** after repairs (repairs can create new violations)
5. Return StructuralValidationResult

### 0.8 Post-generation self-check in `prerequisiteInference.ts`
After LLM generates raw graph, run one cheap verification pass:
- Ask same model (no thinking): "scan these edges, list any (A→B + B→A) pairs"
- Remove flagged reverse edges before returning
- Target: reduce LLM cycle output from ~1.7 → ~0 before validator even runs
- Cost: ~5% of main decomp call (input-heavy, output-light)

---

## Phase 1 — Confidence Scoring (L4)
*No new infrastructure. Pure TypeScript. Adds self-awareness to every node/edge.*

### Multi-dimensional confidence types
```typescript
interface NodeConfidence {
  existence: number     // does this concept belong in this graph?
  depthLevel: number    // is the depth classification right?
  boundary: number      // is core/optional/out_of_scope right?
  timeEstimate: number  // is estimatedMins plausible?
  overall: number       // weighted combination
  effective: number     // overall × weakest hard prereq propagation
}

interface EdgeConfidence {
  existence: number   // does this relationship exist?
  type: number        // is hard/soft/confusable/leads_to right?
  direction: number   // is fromId→toId correct (not reversed)?
  overall: number
}
```

### Efficient consensus (1 full + 2 verification passes)
- 1 full decomposition (already done in pipeline)
- 2 cheap verification passes: ask yes/no/uncertain per node/edge
- Temperature: 0.5 (full), 0 (verify A), 0.3 (verify B)
- Cost: ~1.2× vs 3× for 3 full runs
- Match: semantic (fuzzy title), not string comparison

### Signal combination
```
overall = multiRun × 0.40 + library × 0.30 + critique × 0.20 + resource × 0.10
```
- Library defaults to 0.50 until L2 built
- Resource defaults to 0.50 until L5 built
- Critique signal: `1.0 - weightedPenalty` from existing CritiqueRound[]

### Confidence propagation
```
effective = base × 0.7 + base × weakest_hard_prereq_effective × 0.3
```
Topological traversal (reuse L7 sort). Nodes with no hard prereqs: `effective = overall`.

### Thresholds
- ≥ 0.80 → high (fast track eligible, feeds library)
- ≥ 0.55 → medium (thorough track, adds as candidate)
- ≥ 0.35 → low (flagged, excluded from fast track)
- < 0.20 → discard (remove from graph)

### DisagreementRecord (surfaced to API consumer)
```typescript
interface DisagreementRecord {
  conceptTitle: string
  disagreementType: 'existence' | 'depth_level' | 'boundary' | 'edge_direction' | 'edge_type'
  runAPosition: string
  runBPosition: string
}
```

---

## Phase 2 — Storage Foundation
*New infrastructure. Unlocks L2, L5, L6. Nothing persists across runs today.*

### Docker Compose
- `postgres` with pgvector extension
- `redis` for BullMQ + LLM cache

### Migrations (6 files in `packages/db/migrations/`)
1. `concept_nodes` — id, topic_id, canonical_title, description, depth_level, boundary_type, estimated_mins, confidence_overall, confidence_effective, `embedding vector(1536)`
2. `concept_edges` — from_id, to_id, edge_type, confidence, `belief_by_level JSONB`, confirmations, contradictions, status
3. `concept_library` — canonical_title UNIQUE, alt_titles TEXT[], description, depth_level, `embedding vector(1536)`, status (candidate/confirmed/contested), topics_seen TEXT[], decomps_seen INT
4. `library_edges` — from_concept_id, to_concept_id, edge_type, confirmations, contradictions, status, UNIQUE constraint on (from, to, type)
5. `user_behavior_events` — user_id, node_id, event_type, context JSONB, outcome JSONB, learner_level, weight
6. `node_resources` — node_id, url, type, coverage_score, depth_match, quality_score, validated_at

### Indexes
- IVFFlat on `concept_nodes(embedding)` and `concept_library(embedding)`, vector_cosine_ops, lists=100
- B-tree on edges(from_id), edges(to_id), events(node_id)

---

## Phase 3 — Semantic Memory (L2)
*Requires Phase 2.*

### Key specs from discussion
- Embed: `title + ' ' + description` (not title alone)
- Similarity thresholds: ≥ 0.92 = merge, 0.80–0.92 = flag for review
- Normalize before embedding: lowercase → strip articles → strip parenthetical → strip special chars
- Code-specific override: preserve `async/await`, `O(n)`, `TCP/IP`
- Library write-back condition: `confidence ≥ 0.80` for confirmNode, `≥ 0.55` for addCandidate
- Promotion: `minDecomps: 3 AND minConfirmations: 5`
- `classifyEdgeStatus()`: confirmed ≥ 0.85, probable ≥ 0.60, contested ≥ 0.40, likely_wrong < 0.40
- Cross-topic importance score: `topicsAsPrerequisite×2 + confirmedPrerequisiteOf.length×3 + decomps_seen`

---

## Phase 4 — LLM Response Cache
*Requires Phase 2 (Redis).*

- Key: `sha256(model + systemPrompt + firstUserMessage)`
- TTL: 30 days
- Cache: decomposition, boundary detection, verification passes
- Bypass: critique, patch (want fresh evaluation each run)

---

## Phase 5 — Async Infrastructure
*Requires Phase 2.*

### BullMQ queues
- `resource:discovery` — 1 job per non-out_of_scope node after pipeline completes
- `outcome:observer` — delayed 48h, 1 job per skip event
- `library:update` — write-back batch, threshold-gated
- `graph:recompute` — triggered when edge beliefs cross reclassification threshold

---

## Phase 6 — Resource Signals (L5)
*Requires Phase 5.*

### Per-type update thresholds
```typescript
const UPDATE_THRESHOLDS = {
  edge_confirmation:        0.0,   // always apply (confidence boost)
  depth_correction:         0.70,  // 70%+ resources agree
  missing_edge:             0.65,
  boundary_reconsideration: 0.60,
  missing_prerequisite:     0.75,  // high bar — structural change
  node_definition_suspect:  0.0,   // always flag, never auto-fix
}
```

### Content extraction: first 3000 chars matters most
- HTML: readability strip → main content
- YouTube: transcript API → fallback to title + description
- GitHub: README.md only
- arXiv: abstract only

---

## Phase 7 — User Behavior (L6)
*Requires Phase 5.*

### 5 event patterns with exact deltas
| Pattern | Signal | confidenceDelta |
|---|---|---|
| skip → success at dependent | hard prereq challenged | −0.06 |
| skip → failure at dependent | hard prereq confirmed | +0.09 |
| stuck despite all prereqs | missing prereq (graph gap) | flag for investigation |
| complete in < 40% estimated time | time overestimate | update time |
| revisit after completion | missing leads_to edge | candidate edge (needs N=12) |

### Bayesian updater
```
belief += 0.08 × weight × (signal − belief)
classifyEdge: ≥0.75 → hard, ≥0.45 → soft, ≥0.20 → leads_to, else → remove
```

### Minimum evidence thresholds
```typescript
edge_type_reclassification: 12
time_estimate_update:       8
missing_prerequisite_flag:  5
remove_prerequisite_edge:   20
```

### Per-learner-level beliefs
`concept_edges.belief_by_level JSONB`: `{ beginner: {belief, sampleCount}, intermediate: {...}, advanced: {...} }`

### Missing prereq investigation pipeline
1. Check L5 resource signals first (often already has candidates)
2. If no candidates → LLM call with behavior context: "N users stuck, had completed [these nodes]"

---

## Phase 8 — API Layer
*Requires Phases 1–3.*

- `POST /topics/decompose` → full pipeline, returns RunResult
- `GET /topics/:id` → persisted graph
- `GET /topics/:id/paths?mode=fast|thorough`
- `POST /topics/:id/progress` → user progress, triggers gap analysis
- `POST /topics/decompose/stream` → SSE: emit event per pipeline stage

---

## Phase 9 — Polish
- Google/Gemini provider (typed but not implemented)
- 5 more eval fixtures: TCP/IP, Transformer architecture, SQL query planning, Git internals, OAuth 2.0
- Validator LLM fallbacks: orphan reconnect, granularity split/merge (wire `requiresLLM` into pipeline)

---

## Dependency Order

```
Phase 0  ──── no deps (fix existing code)
Phase 1  ──── no deps (parallel with 0)
Phase 2  ──── no deps (new infra, parallel with 0+1)
Phase 3  ──── requires 2
Phase 4  ──── requires 2
Phase 5  ──── requires 2
Phase 6  ──── requires 5
Phase 7  ──── requires 5
Phase 8  ──── requires 1, 2, 3
Phase 9  ──── parallel with anything
```

**Fastest path to production sync API:** 0 → 1 → 2 → 3 → 4 → 8
**Async learning loop:** 5 → 6 → 7

---

## Eval History

| Run | Pass Rate | Avg Score | Avg Cycles | Avg Time |
|---|---|---|---|---|
| Phase 1 initial | 0/3 | 59/100 | 11.3/run | ~140s |
| After prompt fixes | 3/3 | 85/100 | 1.7/run | ~74s |
| Phase 2 target | 3/3 | 90+/100 | ~0/run | ~90s |

Phase 2 improvements expected: critique drops remaining cycles semantically, topology adds path quality score.
