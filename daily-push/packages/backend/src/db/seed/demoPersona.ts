/**
 * Hand-written content for the public demo account.
 *
 * Persona (fictional): Aarav Shah, a full-stack engineer in Ahmedabad with
 * about five and a half years of Node.js, React and AWS work, three weeks
 * into preparing for a senior full-stack role at a product company.
 *
 * Everything here is written once and checked into the repo so the demo is
 * reviewable, deterministic and costs no AI calls to rebuild. Companies and
 * people are invented.
 */

export const DEMO_PROFILE = {
  jobTitle: 'Full-Stack Engineer',
  roleType: 'engineer',
  seniorityLevel: 'mid',
  yearsTotal: 5,
  employmentStatus: 'employed',
  primaryStack: ['TypeScript', 'Node.js', 'React', 'PostgreSQL', 'MongoDB', 'AWS', 'Docker'],
  availableMinsDay: 75,
  availableDaysWeek: 6,
  timezone: 'Asia/Kolkata',
};

export const DEMO_OWN_WORDS =
  "I've shipped a lot of features in five years, but mostly from tickets someone else wrote. I want a senior full-stack role at a product company where I own a system end to end. My system design answers are weak, and I undersell my own projects in interviews.";

export const DEMO_RESUME_TEXT = `Aarav Shah
Full-Stack Engineer · Ahmedabad, India

SUMMARY
Full-stack engineer with 5.5 years building B2B SaaS on Node.js, TypeScript, React and PostgreSQL. Comfortable across API design, data modelling and AWS deployments. Looking for a senior role with end-to-end ownership.

EXPERIENCE
Software Engineer II — Fieldstack Labs (supply-chain SaaS), Ahmedabad · Aug 2023 – present
- Rebuilt the order-sync service from cron scripts to an SQS-driven worker; failed syncs dropped from ~40/day to under 5.
- Designed the multi-tenant permissions model (roles + resource scopes) used by 120+ customer accounts.
- Cut the slowest dashboard query from 9s to 700ms with a composite index and a rewritten aggregation.
- Mentor two junior engineers; run the weekly frontend review.

Software Engineer — Brightwave Systems, Jaipur · Feb 2021 – Jul 2023
- Built React + Node.js features for an inspection-scheduling product used by 30 field teams.
- Moved deployments from a single EC2 box to Docker on ECS with GitHub Actions; releases went from monthly to weekly.
- Wrote the PDF report generator that replaced a manual Excel process.

PROJECTS
- Ledgerline (side project): expense-splitting app, Next.js + Prisma + Postgres, ~400 monthly users.

SKILLS
TypeScript, Node.js, Express, React, Next.js, PostgreSQL, MongoDB, Redis, AWS (ECS, SQS, S3, RDS), Docker, GitHub Actions, Jest

EDUCATION
B.Tech, Computer Science — 2020`;

export const DEMO_RESUME_SUMMARY = {
  headline: 'Full-stack engineer, 5.5 years, Node.js/React/PostgreSQL on AWS',
  yearsExperience: 5.5,
  coreSkills: ['TypeScript', 'Node.js', 'React', 'Next.js', 'PostgreSQL', 'MongoDB', 'Redis', 'AWS', 'Docker', 'GitHub Actions'],
  strengths: [
    'Moves slow systems to queue-driven workers with measurable reliability gains',
    'Solid SQL performance work with real before/after numbers',
    'Has designed a multi-tenant permissions model used in production',
  ],
  evidenceAreas: ['API design', 'Data modelling', 'Query performance', 'AWS deployments', 'Mentoring'],
  gapsOrConcerns: [
    'No system design at scale beyond one service',
    'Little evidence of owning product decisions or metrics',
    'Observability and on-call ownership not shown',
  ],
  resumeSections: {
    summary:
      'Full-stack engineer with 5.5 years building B2B SaaS on Node.js, TypeScript, React and PostgreSQL.',
    skills: ['TypeScript', 'Node.js', 'Express', 'React', 'Next.js', 'PostgreSQL', 'MongoDB', 'Redis', 'AWS', 'Docker', 'GitHub Actions', 'Jest'],
    experience: [
      'Software Engineer II — Fieldstack Labs (Aug 2023 – present)',
      'Software Engineer — Brightwave Systems (Feb 2021 – Jul 2023)',
    ],
    projects: ['Ledgerline — expense-splitting app, Next.js + Prisma + Postgres'],
    education: ['B.Tech, Computer Science — 2020'],
    certifications: [],
  },
  experienceItems: [
    {
      company: 'Fieldstack Labs',
      role: 'Software Engineer II',
      dates: 'Aug 2023 – present',
      bullets: [
        'Rebuilt the order-sync service from cron scripts to an SQS-driven worker; failed syncs dropped from ~40/day to under 5.',
        'Designed the multi-tenant permissions model used by 120+ customer accounts.',
        'Cut the slowest dashboard query from 9s to 700ms with a composite index and a rewritten aggregation.',
        'Mentor two junior engineers; run the weekly frontend review.',
      ],
      technologies: ['Node.js', 'TypeScript', 'PostgreSQL', 'AWS SQS', 'React'],
      quantifiedOutcomes: ['failed syncs ~40/day → <5', 'query 9s → 700ms', '120+ customer accounts'],
    },
    {
      company: 'Brightwave Systems',
      role: 'Software Engineer',
      dates: 'Feb 2021 – Jul 2023',
      bullets: [
        'Built React + Node.js features for an inspection-scheduling product used by 30 field teams.',
        'Moved deployments to Docker on ECS with GitHub Actions; releases went from monthly to weekly.',
      ],
      technologies: ['React', 'Node.js', 'Docker', 'AWS ECS', 'GitHub Actions'],
      quantifiedOutcomes: ['releases monthly → weekly', '30 field teams'],
    },
  ],
  projectItems: [
    {
      name: 'Ledgerline',
      description: 'Expense-splitting app',
      techStack: ['Next.js', 'Prisma', 'PostgreSQL'],
      bullets: ['~400 monthly users'],
      links: [],
    },
  ],
};

export const DEMO_TARGET = {
  roleProfileId: 'role_full_stack_product_engineer',
  title: 'Senior Full-Stack Product Engineer',
  targetDateWeeksFromNow: 15,
  weeklyHours: 8,
};

export const DEMO_GOAL = {
  title: 'Senior full-stack role at a product company',
  successCriteria: 'An accepted offer for a senior full-stack role where I own a product area end to end.',
  statedWhy: 'Move from ticket-driven feature work to owning a system and its outcomes.',
  goalType: 'career',
  timeHorizon: 'short_term',
  urgency: 'high',
  emotionalDriver: 'growth',
};

export type DemoDepth = 'surface' | 'foundational' | 'intermediate' | 'advanced';

export interface DemoConcept {
  key: string;
  title: string;
  description: string;
  depth: DemoDepth;
  mins: number;
  requires?: string[];
}

export interface DemoGap {
  skillArea: string;
  category: string;
  current: string;
  required: string;
  priority: number;
  reason: string;
  identifiedBy: string;
  topic: { title: string; rationale: string; weeks: number };
  concepts: DemoConcept[];
}

export const DEMO_GAPS: DemoGap[] = [
  {
    skillArea: 'System design for product-scale services',
    category: 'engineering',
    current: 'familiar',
    required: 'proficient',
    priority: 1,
    reason: 'Every senior loop has a design round, and two mocks scored 2–3/5 here.',
    identifiedBy: 'system_inferred',
    topic: {
      title: 'Designing services that survive growth',
      rationale: 'You have built one queue-driven service; senior loops expect you to reason about a whole system and its trade-offs.',
      weeks: 4,
    },
    concepts: [
      { key: 'sd-reqs', title: 'Turning a vague prompt into requirements', description: 'Functional vs non-functional requirements, and the three questions to ask before drawing anything.', depth: 'surface', mins: 20 },
      { key: 'sd-estimates', title: 'Back-of-envelope capacity estimates', description: 'QPS, storage and bandwidth from user numbers, and when an estimate changes the design.', depth: 'foundational', mins: 35, requires: ['sd-reqs'] },
      { key: 'sd-caching', title: 'Caching layers and invalidation', description: 'Read-through vs write-through, TTLs, and what goes wrong when caches go stale.', depth: 'foundational', mins: 40, requires: ['sd-reqs'] },
      { key: 'sd-queues', title: 'Queues, retries and idempotency', description: 'At-least-once delivery, idempotency keys, dead-letter queues.', depth: 'intermediate', mins: 45, requires: ['sd-estimates'] },
      { key: 'sd-sharding', title: 'Partitioning data as it grows', description: 'Choosing a partition key, hot partitions, and resharding without downtime.', depth: 'intermediate', mins: 50, requires: ['sd-estimates', 'sd-caching'] },
      { key: 'sd-consistency', title: 'Consistency trade-offs you can explain', description: 'Strong vs eventual consistency in product terms, and where each is acceptable.', depth: 'intermediate', mins: 45, requires: ['sd-caching'] },
      { key: 'sd-case-feed', title: 'Case study: notifications at 10x load', description: 'Walk a full design end to end: fan-out, rate limits, delivery guarantees.', depth: 'advanced', mins: 60, requires: ['sd-queues', 'sd-sharding'] },
    ],
  },
  {
    skillArea: 'Owning product outcomes, not just tickets',
    category: 'leadership',
    current: 'aware',
    required: 'proficient',
    priority: 2,
    reason: 'Product companies hire seniors who shape what gets built and can show impact in numbers.',
    identifiedBy: 'system_inferred',
    topic: {
      title: 'Product thinking for engineers',
      rationale: 'Your resume shows delivery; senior product roles want to see you choosing and measuring what matters.',
      weeks: 2,
    },
    concepts: [
      { key: 'pt-metrics', title: 'Picking a metric a feature should move', description: 'Leading vs lagging metrics, and writing one before building.', depth: 'surface', mins: 20 },
      { key: 'pt-scope', title: 'Cutting scope without cutting value', description: 'Slicing a feature into a version you can ship in a week.', depth: 'foundational', mins: 30, requires: ['pt-metrics'] },
      { key: 'pt-rfc', title: 'Writing a one-page technical proposal', description: 'Problem, options, decision, risks — in a page someone will read.', depth: 'foundational', mins: 40, requires: ['pt-scope'] },
      { key: 'pt-tradeoff-talk', title: 'Explaining trade-offs to non-engineers', description: 'Cost, time and risk in words a PM or founder can decide on.', depth: 'intermediate', mins: 30, requires: ['pt-rfc'] },
      { key: 'pt-impact', title: 'Measuring impact after launch', description: 'Before/after, cohorts, and saying honestly when something did not work.', depth: 'intermediate', mins: 35, requires: ['pt-metrics'] },
    ],
  },
  {
    skillArea: 'Production observability and on-call',
    category: 'engineering',
    current: 'aware',
    required: 'proficient',
    priority: 3,
    reason: 'Seniors are expected to find and fix production issues fast; your resume does not show it yet.',
    identifiedBy: 'system_inferred',
    topic: {
      title: 'Seeing what production is doing',
      rationale: 'You deploy to AWS but nothing shows how you would debug an incident at 2 a.m.',
      weeks: 2,
    },
    concepts: [
      { key: 'ob-logs', title: 'Structured logs you can search', description: 'Request IDs, log levels, and what to log at service boundaries.', depth: 'surface', mins: 20 },
      { key: 'ob-metrics', title: 'The four golden signals', description: 'Latency, traffic, errors, saturation, and one dashboard per service.', depth: 'foundational', mins: 30, requires: ['ob-logs'] },
      { key: 'ob-tracing', title: 'Tracing a request across services', description: 'Spans, context propagation, and finding the slow hop.', depth: 'intermediate', mins: 40, requires: ['ob-metrics'] },
      { key: 'ob-alerts', title: 'Alerts that are worth waking up for', description: 'SLOs, error budgets, and deleting noisy alerts.', depth: 'intermediate', mins: 35, requires: ['ob-metrics'] },
      { key: 'ob-incident', title: 'Running and writing up an incident', description: 'Roles, timeline, blameless post-mortem.', depth: 'advanced', mins: 40, requires: ['ob-alerts'] },
    ],
  },
  {
    skillArea: 'Telling project stories in interviews',
    category: 'soft_skills',
    current: 'familiar',
    required: 'proficient',
    priority: 4,
    reason: 'Your work is strong but you describe it as "we did"; interviewers need your decisions and numbers.',
    identifiedBy: 'system_inferred',
    topic: {
      title: 'Your projects as interview stories',
      rationale: 'The order-sync and permissions work are senior-level stories once you frame your decisions.',
      weeks: 2,
    },
    concepts: [
      { key: 'st-pick', title: 'Choosing your three best stories', description: 'Ownership, conflict, failure — one story each, from your own work.', depth: 'surface', mins: 15 },
      { key: 'st-star', title: 'STAR without sounding rehearsed', description: 'Situation and task in two sentences; spend the time on action and result.', depth: 'foundational', mins: 25, requires: ['st-pick'] },
      { key: 'st-numbers', title: 'Putting numbers on your results', description: 'Latency, error rates, time saved — and what to say when you have no number.', depth: 'foundational', mins: 25, requires: ['st-star'] },
      { key: 'st-deepdive', title: 'Surviving a project deep dive', description: 'Answering "why not X?" for every design choice you made.', depth: 'intermediate', mins: 40, requires: ['st-numbers'] },
    ],
  },
  {
    skillArea: 'Frontend performance on large React apps',
    category: 'engineering',
    current: 'familiar',
    required: 'proficient',
    priority: 5,
    reason: 'Full-stack product roles check frontend depth; the Northwind job post asks for it directly.',
    identifiedBy: 'resume_parse',
    topic: {
      title: 'Fast React at product scale',
      rationale: 'Added from your resume check against the Northwind Commerce job post.',
      weeks: 2,
    },
    concepts: [
      { key: 'fe-render', title: 'Why React re-renders', description: 'State, props, context, and reading the profiler.', depth: 'foundational', mins: 30 },
      { key: 'fe-split', title: 'Code splitting and bundle budgets', description: 'Route-level splitting and keeping the first load small.', depth: 'intermediate', mins: 35, requires: ['fe-render'] },
      { key: 'fe-vitals', title: 'Core Web Vitals in practice', description: 'LCP, INP, CLS and what usually breaks them.', depth: 'intermediate', mins: 35, requires: ['fe-render'] },
    ],
  },
];

/**
 * Study history, oldest first. `day` is days before today (negative).
 * Written the way a busy person studies: gaps on weekends, a travel break,
 * some weak scores.
 */
export interface DemoSession {
  day: number;
  hour: number;
  concept: string;
  mins: number;
  confidence: number;
  score: number | null;
  work: string;
  feedback: string;
  strengths: string[];
  improvements: string[];
}

export const DEMO_SESSIONS: DemoSession[] = [
  {
    day: -20, hour: 21, concept: 'sd-reqs', mins: 22, confidence: 4, score: 4,
    work: 'Prompt: design a URL shortener. Questions I would ask first: how many new links per day (sets write QPS), do links expire, do we need analytics per click, custom aliases or not. Non-functional: redirects must be fast (<50ms p95) and never lose a link; analytics can lag. That second point changes the design — redirects need a cache and analytics can go through a queue. Before this I would have started drawing boxes.',
    feedback: 'Good separation of the read path from the analytics path, and you tied a requirement to a design decision.',
    strengths: ['Linked each question to what it changes'], improvements: ['Put a number on "fast" before the interviewer asks'],
  },
  {
    day: -19, hour: 22, concept: 'pt-metrics', mins: 18, confidence: 3, score: 3,
    work: 'For the bulk-order upload feature at work the metric would be "orders created per active account per week". Leading metric: % of uploads that pass validation first time. I realised we never measured anything after launch, we just closed the ticket.',
    feedback: 'Reasonable metric. The leading metric is good; explain why it predicts the lagging one.',
    strengths: ['Honest about the current gap'], improvements: ['Connect leading to lagging metric', 'Say what number would count as success'],
  },
  {
    day: -17, hour: 7, concept: 'ob-logs', mins: 25, confidence: 4, score: 4,
    work: 'Our order-sync worker logs plain strings. Plan: add a requestId from the SQS message attributes to every log line, log JSON with level, tenantId, orderId and durationMs at the start and end of each job, and never log full payloads (PII). With that I could answer "why did tenant 42 not sync at 3pm" with one query instead of grepping.',
    feedback: 'Concrete and tied to your own service. The PII point is the kind of detail seniors mention.',
    strengths: ['Specific fields', 'Real question it answers'], improvements: ['Mention log retention and cost'],
  },
  {
    day: -16, hour: 21, concept: 'sd-estimates', mins: 40, confidence: 2, score: 2,
    work: '10M users, say 10% daily active, each creates 1 link. 1M writes/day = ~12/s. Reads maybe 100x so 1200/s. Storage 1M * 500 bytes = 500MB a day. I am not sure how to go from this to number of servers.',
    feedback: 'The arithmetic is right, but the estimate stops before it changes a decision. Say what 1,200 reads/s means: one Postgres replica handles it, a cache is a latency choice not a necessity.',
    strengths: ['Correct orders of magnitude'], improvements: ['Finish the estimate with a design decision', 'State peak vs average'],
  },
  {
    day: -15, hour: 22, concept: 'sd-estimates', mins: 30, confidence: 4, score: 4,
    work: 'Redo: peak is ~3x average, so ~3,600 reads/s. A single Postgres primary with one read replica handles that for simple key lookups; I would still put Redis in front because p95 redirect latency matters more than load. Writes at ~40/s peak are nothing. Storage: ~180GB/year, fine on one node for 2 years, so sharding is not a day-one problem. That last sentence is the useful part.',
    feedback: 'Much better. Each number now leads to a decision, including the decision not to shard.',
    strengths: ['Peak vs average', 'Deciding what not to build'], improvements: [],
  },
  {
    day: -13, hour: 20, concept: 'st-pick', mins: 15, confidence: 4, score: 4,
    work: 'Ownership: order-sync rewrite (cron → SQS worker, failures 40/day → <5). Conflict: pushed back on building per-customer permission hacks and proposed the roles + scopes model. Failure: shipped the PDF generator without load testing, it timed out for big reports on day one and I had to add pagination over a weekend.',
    feedback: 'Three distinct, real stories. The failure story is strong because the fix is specific.',
    strengths: ['Real stories with outcomes'], improvements: ['Note what you would do differently in the failure story'],
  },
  {
    day: -12, hour: 21, concept: 'sd-caching', mins: 38, confidence: 3, score: 3,
    work: 'For the dashboard at work: read-through cache in Redis keyed by tenantId+dateRange, TTL 5 min. Invalidation is the hard part — when an order changes, the tenant\'s cached summaries are wrong. Option: delete keys by tenant prefix on write. Risk: thundering herd when many users reload after invalidation.',
    feedback: 'Good that you named the herd problem. Say how you would prevent it (request coalescing or a short lock).',
    strengths: ['Knows where caching breaks'], improvements: ['Offer a fix for the herd', 'Is 5 minutes stale acceptable to users?'],
  },
  {
    day: -9, hour: 7, concept: 'ob-metrics', mins: 28, confidence: 4, score: 5,
    work: 'Golden signals for order-sync: latency = time from order created to synced (p50/p95), traffic = jobs/min, errors = failed jobs/min by reason, saturation = SQS queue age of oldest message. The last one is the best early warning — queue age climbs before errors do. One dashboard with these four, per region.',
    feedback: 'Excellent choice of saturation signal for a queue worker. This is exactly how a senior would frame it.',
    strengths: ['Oldest-message age as saturation', 'Signals tied to the real service'], improvements: [],
  },
  {
    day: -8, hour: 22, concept: 'st-star', mins: 25, confidence: 3, score: 3,
    work: 'Order sync story. S: syncs were failing ~40 times a day. T: I was asked to make it reliable. A: We moved it to SQS and added retries. R: failures went under 5 a day.',
    feedback: 'Structure is right, but "we moved it" hides your decisions. Say what you chose (SQS over a cron retry loop), why, and what you rejected.',
    strengths: ['Clear result'], improvements: ['Use "I" for your decisions', 'Name the alternative you rejected'],
  },
  {
    day: -7, hour: 21, concept: 'pt-scope', mins: 30, confidence: 4, score: 4,
    work: 'Bulk upload v1 in a week: CSV only (no Excel), validate and show errors inline, create orders synchronously up to 500 rows, email the user if it is bigger. Cut: templates, column mapping UI, partial retries. The value is "no more typing 200 orders by hand", which v1 fully delivers.',
    feedback: 'Clean cut that keeps the core value. The 500-row limit is a smart way to avoid building a job system in week one.',
    strengths: ['Named what was cut and why'], improvements: ['Say how you will know v1 worked'],
  },
  {
    day: -5, hour: 20, concept: 'st-numbers', mins: 22, confidence: 4, score: 4,
    work: 'Numbers I have: sync failures 40/day → <5, dashboard query 9s → 700ms, releases monthly → weekly, 120+ accounts on the permissions model. Where I have no number (mentoring), I can say "both juniors now ship features without review changes most weeks".',
    feedback: 'Good list, and a sensible way to describe impact without a hard metric.',
    strengths: ['Before/after framing'], improvements: [],
  },
  {
    day: -4, hour: 7, concept: 'st-deepdive', mins: 40, confidence: 4, score: 4,
    work: 'Deep dive prep on the permissions model. Likely "why not X?" questions: why not per-customer feature flags (unmaintainable, 60+ flags already), why not full attribute-based rules (support could not debug them), why cache role lookups for 60s (permission checks were 30% of API latency), how did you migrate (shadow mode for two weeks, compared old vs new decisions, switched at zero mismatches for three days).',
    feedback: 'Strong. Every choice has a reason and a rejected alternative, and the shadow-mode rollout is a senior-level detail.',
    strengths: ['Rejected alternatives with reasons', 'Rollout plan'], improvements: ['Have one number for how many support tickets it removed'],
  },
  {
    day: -3, hour: 22, concept: 'sd-consistency', mins: 42, confidence: 3, score: 3,
    work: 'Order status must be strongly consistent for the customer who placed it (they refresh and must see it). The ops dashboard totals can be eventually consistent, a minute behind is fine. So: read-your-writes for the customer (read from primary for 30s after a write), replicas for dashboards.',
    feedback: 'Correct and product-framed. Add how you would detect replica lag becoming a problem.',
    strengths: ['Read-your-writes applied to a real screen'], improvements: ['Monitoring replica lag'],
  },
  {
    day: -2, hour: 7, concept: 'fe-render', mins: 30, confidence: 2, score: null,
    work: 'The orders table re-renders every row when one filter changes. I think it is because the filter object is recreated each render and passed through context. Not sure yet how to fix without memoising everything.',
    feedback: '',
    strengths: [], improvements: [],
  },
  {
    day: -1, hour: 21, concept: 'pt-rfc', mins: 38, confidence: 4, score: 4,
    work: 'One-pager: "Move PDF reports to a background job". Problem: large reports time out (30s gateway limit) for ~8% of requests. Options: raise timeout (hides it), paginate (worse UX), background job + email/download link. Decision: background job on the existing SQS worker. Risk: users expect instant PDFs — show progress and keep small reports synchronous.',
    feedback: 'Tight and decision-oriented. Keeping small reports synchronous is a good product call.',
    strengths: ['Options with honest downsides', 'Uses existing infrastructure'], improvements: ['Add how you will measure success'],
  },
];

/** Concepts that were done and are now due for review. */
export const DEMO_REVIEW_DUE = ['sd-reqs', 'ob-logs'];

export interface DemoMock {
  day: number;
  mode: 'system_design' | 'behavioral' | 'project_deep_dive';
  focus: string;
  overall: number;
  verdict: 'needs_work' | 'solid' | 'strong';
  summary: string;
  scores: Array<{ dimension: 'structure' | 'depth' | 'communication' | 'ownership'; score: number; feedback: string }>;
  strengths: string[];
  improvements: string[];
  retryPlan: string[];
  turns: Array<{ role: 'interviewer' | 'candidate'; content: string }>;
  planUpdate: { gapSkillArea: string; weak: boolean; strong: boolean };
}

export const DEMO_MOCKS: DemoMock[] = [
  {
    day: -14,
    mode: 'system_design',
    focus: 'Rate limiting for a public API',
    overall: 2,
    verdict: 'needs_work',
    summary: 'Jumped to Redis before clarifying limits, and could not size the solution.',
    scores: [
      { dimension: 'structure', score: 2, feedback: 'Started with the solution; no requirements pass.' },
      { dimension: 'depth', score: 2, feedback: 'Token bucket named but not explained; no numbers.' },
      { dimension: 'communication', score: 3, feedback: 'Clear speaker, but skipped trade-offs.' },
      { dimension: 'ownership', score: 3, feedback: 'Mentioned operating it, briefly.' },
    ],
    strengths: ['Knew the common algorithms by name'],
    improvements: ['Ask about limits per user vs per key first', 'Estimate request volume before choosing storage'],
    retryPlan: ['Do the capacity estimates concept', 'Redo this prompt in a week'],
    turns: [
      { role: 'interviewer', content: 'Design a rate limiter for our public API. Where would you start?' },
      { role: 'candidate', content: 'I would use Redis with a token bucket per API key, and return 429 when the bucket is empty.' },
      { role: 'interviewer', content: 'How many requests per second are we talking about, and what happens if Redis is slow?' },
      { role: 'candidate', content: 'Probably a few thousand. If Redis is slow I guess requests would be slow too. We could add a local cache.' },
    ],
    planUpdate: { gapSkillArea: 'System design for product-scale services', weak: true, strong: false },
  },
  {
    day: -6,
    mode: 'behavioral',
    focus: 'Ownership and conflict',
    overall: 3,
    verdict: 'solid',
    summary: 'Good stories, but told as "we"; results were there, decisions were not.',
    scores: [
      { dimension: 'structure', score: 4, feedback: 'Clear STAR shape.' },
      { dimension: 'depth', score: 3, feedback: 'Could go deeper on the alternatives you rejected.' },
      { dimension: 'communication', score: 3, feedback: 'Too much "we".' },
      { dimension: 'ownership', score: 3, feedback: 'Your specific calls were hard to hear.' },
    ],
    strengths: ['Real numbers in the order-sync story'],
    improvements: ['Say "I decided" for your decisions', 'Name one thing you would do differently'],
    retryPlan: ['Rewrite the order-sync story with your decisions', 'Practice the failure story out loud'],
    turns: [
      { role: 'interviewer', content: 'Tell me about a time you took ownership of a reliability problem.' },
      { role: 'candidate', content: 'Our order sync was failing about forty times a day. We moved it from cron to SQS with retries and a dead-letter queue, and failures dropped under five a day.' },
      { role: 'interviewer', content: 'What was your part specifically, and what else did you consider?' },
      { role: 'candidate', content: 'I proposed SQS. We looked at just adding retries to the cron job but it would still overlap runs.' },
    ],
    planUpdate: { gapSkillArea: 'Telling project stories in interviews', weak: false, strong: false },
  },
  {
    day: -2,
    mode: 'project_deep_dive',
    focus: 'The multi-tenant permissions model',
    overall: 4,
    verdict: 'strong',
    summary: 'Clear design rationale and honest trade-offs; handled "why not ABAC?" well.',
    scores: [
      { dimension: 'structure', score: 4, feedback: 'Problem → options → decision, in order.' },
      { dimension: 'depth', score: 4, feedback: 'Explained scope checks and caching of role lookups.' },
      { dimension: 'communication', score: 4, feedback: 'Used "I" for decisions this time.' },
      { dimension: 'ownership', score: 5, feedback: 'Talked about migration and support, not just design.' },
    ],
    strengths: ['Explained why roles + scopes beat per-customer flags', 'Covered the migration plan'],
    improvements: ['Mention how you tested permission changes safely'],
    retryPlan: ['Keep this story as your main deep dive'],
    turns: [
      { role: 'interviewer', content: 'Walk me through the permissions model you designed.' },
      { role: 'candidate', content: 'Customers kept asking for one-off rules, and we were adding if-statements per tenant. I proposed roles plus resource scopes: a role grants actions, a scope limits which warehouses or teams they apply to. I rejected full attribute-based rules because support could not reason about them.' },
      { role: 'interviewer', content: 'How did you roll it out to 120 accounts without breaking anyone?' },
      { role: 'candidate', content: 'I wrote a migration that mapped every existing flag to a role, ran it in shadow mode for two weeks comparing decisions, and only switched when the mismatch rate hit zero for three days.' },
    ],
    planUpdate: { gapSkillArea: 'Telling project stories in interviews', weak: false, strong: true },
  },
];

export interface DemoApplication {
  title: string;
  company: string;
  status: 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn';
  daysAgo: number;
  appliedDaysAgo: number | null;
  jd: string;
  fitScore: number;
  strengths: string[];
  missingSkills: Array<{ name: string; reason: string; priority: 'high' | 'medium' | 'low' }>;
  missingProof: Array<{ area: string; evidenceNeeded: string; reason: string }>;
  interviewRisks: string[];
}

export const DEMO_APPLICATIONS: DemoApplication[] = [
  {
    title: 'Senior Full-Stack Engineer at Northwind Commerce',
    company: 'Northwind Commerce',
    status: 'interviewing',
    daysAgo: 18,
    appliedDaysAgo: 12,
    jd: `Senior Full-Stack Engineer — Northwind Commerce (Bengaluru / remote India)
We build checkout and order management for 2,000+ D2C brands.
You will own a product area end to end: design, build, ship and measure.
Must have: 5+ years with TypeScript, React and Node.js; PostgreSQL; experience designing services that handle growth; production ownership (monitoring, on-call).
Nice to have: frontend performance work on large React apps, AWS, experience mentoring.
You will write short design docs, work directly with a PM, and track the metrics your features move.`,
    fitScore: 64,
    strengths: ['TypeScript/React/Node.js depth', 'PostgreSQL performance work with numbers', 'AWS and queue-based services'],
    missingSkills: [
      { name: 'Frontend performance on large React apps', reason: 'Listed as nice-to-have; nothing on the resume shows it.', priority: 'medium' },
      { name: 'Production monitoring and on-call', reason: 'Must-have; resume shows deployments but not operating them.', priority: 'high' },
    ],
    missingProof: [
      { area: 'Owning a product area', evidenceNeeded: 'One example where you chose what to build and measured it.', reason: 'The role is explicit about end-to-end ownership.' },
    ],
    interviewRisks: ['Design round on growth', 'Questions about on-call experience'],
  },
  {
    title: 'Senior Software Engineer (Full Stack) at Ledgerly',
    company: 'Ledgerly',
    status: 'saved',
    daysAgo: 4,
    appliedDaysAgo: null,
    jd: `Senior Software Engineer, Full Stack — Ledgerly (Ahmedabad, hybrid)
Ledgerly makes accounting software for small businesses in India.
Stack: Node.js, React, PostgreSQL, Redis, AWS.
Must have: 5+ years full-stack; strong SQL; API design; writing technical proposals.
You will lead features from proposal to launch and help grow two junior engineers.`,
    fitScore: 71,
    strengths: ['Strong SQL and API design', 'Mentoring juniors', 'Same stack'],
    missingSkills: [
      { name: 'Writing technical proposals', reason: 'Must-have; no design docs mentioned.', priority: 'high' },
    ],
    missingProof: [
      { area: 'Leading a feature from proposal to launch', evidenceNeeded: 'A short write-up of one feature you proposed and shipped.', reason: 'The role leads features end to end.' },
    ],
    interviewRisks: ['Being asked to walk through a design doc you wrote'],
  },
];

export interface DemoCheckin {
  weeksAgo: number;
  confidence: number;
  momentum: number;
  wins: string[];
  blockers: string[];
  notes: string | null;
}

export const DEMO_CHECKINS: DemoCheckin[] = [
  {
    weeksAgo: 2,
    confidence: 3,
    momentum: 4,
    wins: ['Five sessions done', 'Picked my three interview stories'],
    blockers: ['Estimates still feel like guessing'],
    notes: 'Mornings before work are working better than nights.',
  },
  {
    weeksAgo: 1,
    confidence: 3,
    momentum: 2,
    wins: ['Scope-cutting exercise was actually useful at work'],
    blockers: ['Release week at work, lost three days', 'Travelled for a wedding on the weekend'],
    notes: 'Behind on the plan. Reduced weekly hours from 10 to 8.',
  },
];
