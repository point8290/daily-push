# Daily Push — Reimagination Planning Document

> Last updated: April 2026  
> Status: Planning phase — no implementation started  
> Self-learning architecture: Decided

---

## Table of Contents

1. [Vision](#1-vision)
2. [The Problem](#2-the-problem)
3. [User Archetypes](#3-user-archetypes)
4. [The AI Displacement Context](#4-the-ai-displacement-context)
5. [Skills With Longevity](#5-skills-with-longevity)
6. [The Core Mental Model](#6-the-core-mental-model)
7. [System Architecture](#7-system-architecture)
8. [Data Schema](#8-data-schema)
9. [Assessment Flow](#9-assessment-flow)
10. [Feature Modules](#10-feature-modules)
11. [UI Structure](#11-ui-structure)
12. [Build Sequence](#12-build-sequence)
13. [Goal Library](#13-goal-library)
14. [Open Decisions](#14-open-decisions)
15. [Self-Learning Architecture](#15-self-learning-architecture)

---

## 1. Vision

> **Daily Push — Become the engineer AI makes powerful, not the one it replaces.**

A personal upskilling operating system. You tell it your goal. It builds the map,
schedules the journey, checks your understanding, and keeps you moving —
one focused session at a time.

### Three Pillars

| Pillar | What it does |
|--------|-------------|
| **Know** | Maps what you need to learn and in what order (Topic Engine) |
| **Do** | Delivers one focused session per day, tracks completion |
| **Retain** | Surfaces forgotten concepts, tests understanding, connects learning to real work |

### The One Core Insight

> Most learning tools treat knowledge as a list.
> Daily Push treats it as a graph.

---

## 2. The Problem

The journey from "I want to learn X" to "I can use X confidently"
has 7 distinct friction points. Most tools solve 1–2. Daily Push solves all 7.

| # | Friction | Core Issue |
|---|---------|-----------|
| 1 | What should I learn? | Don't know what they don't know |
| 2 | I don't have time to plan | Curriculum building is exhausting |
| 3 | I don't know what to study today | Daily decision causes enough friction to not start |
| 4 | I can't stay consistent | Motivation dies by day 10 |
| 5 | I read it but didn't retain it | Passive reading isn't learning |
| 6 | I don't know if I understand it | No signal between "read" and "can use" |
| 7 | I learned it but can't apply it | Theory ≠ application |

### What Psychology Says

**Goals operate at multiple levels simultaneously (Kruglanski):**
```
Why level (identity)     "I want to be respected as an expert"
    ↓
What level (outcome)     "Get a senior engineering job"
    ↓
How level (process)      "Study system design for 3 months"
    ↓
Now level (action)       "Read this article today"
```

Most tools only operate at **how** and **now**. Daily Push connects all four.

**Self-Determination Theory (Deci & Ryan) — what drives sustained learning:**

| Need | What it means | What kills it |
|------|--------------|---------------|
| Autonomy | I chose this, it's mine | Being told exactly what to do |
| Competence | I'm getting better | Too hard or too easy |
| Relatedness | This connects to something I care about | Learning in a vacuum |

**The Gap Between Stated and Real Goals:**

| Stated goal | Real goal underneath |
|-------------|---------------------|
| "Get a senior SWE job" | "Feel like I'm not falling behind my peers" |
| "Learn system design" | "Stop feeling stupid in architecture meetings" |
| "Build a side project" | "Prove to myself I can ship something" |
| "Stay relevant with AI" | "I'm scared of being replaced" |

**Goal Stages:**
```
Aspiration → Intention → Planning → Action → Maintenance → Crisis → Resolution
```
Most tools are built for Stage 4 (Action).
Daily Push must handle Stage 6 (Crisis) — where people need the most help.

---

## 3. User Archetypes

### Archetype 1 — The Promotion Seeker
"I want to go from mid to senior, or senior to staff"
- Needs: System design fluency, technical leadership, depth
- One-year outcome: Promoted or confident enough to negotiate

### Archetype 2 — The Job Switcher
"I want to get into a better company — FAANG, growth-stage startup"
- Needs: Interview readiness, DSA, system design, portfolio
- One-year outcome: Offer from target company

### Archetype 3 — The Builder
"I want to ship my own product / side project / startup"
- Needs: Full-stack confidence, AI/LLM integration, shipping speed
- One-year outcome: Something live with users

### Archetype 4 — The Specializer
"I want to become the go-to person for X"
- Needs: Deep expertise, public signal, connecting theory to practice
- One-year outcome: Known as the person who owns X

### Archetype 5 — The Displaced Developer (NEW — AI context)
"I was laid off. I need to prove I'm worth hiring in an AI world"
- Needs: Skills AI can't replace, ability to direct AI, speed, confidence
- One-year outcome: Employed in a role that has longevity

### Archetype 6 — The Survivor
"My company cut 30% of engineering. I'm next if I don't adapt"
- Needs: AI-native workflows, deeper skills, visibility
- One-year outcome: Indispensable, not replaceable

### Archetype 7 — The Career Switcher
"My role is shrinking. I need to pivot."
- Needs: Realistic transition path, leverage existing knowledge
- One-year outcome: Employed in a role with longevity

### Archetype 8 — The Non-Technical Professional
"I'm a PM/ops lead. I need AI and technical literacy"
- Needs: AI literacy, credibility with engineers, practical skills
- One-year outcome: Can lead teams that use AI effectively

---

## 4. The AI Displacement Context

This isn't abstract. It's the defining context for this product.

```
Junior devs         → being replaced by AI-assisted senior devs
Mid-level devs      → productivity expected to 10x, headcount shrinking
Senior devs         → safe if they direct AI, at risk if they just write code
Non-technical roles → massive displacement
```

### What Skills Actually Have Longevity

**High longevity — AI amplifies these:**
- Systems thinking
- Architecture decisions and tradeoffs
- Debugging mental models
- Security fundamentals (AI generates insecure code)
- Evaluation and judgment (knowing when AI output is wrong)
- Communication — translating technical to non-technical

**Medium longevity — shrinking window:**
- Algorithm knowledge
- Framework depth
- Specific language syntax

**Low longevity — teach only as foundation:**
- Writing boilerplate
- Basic CRUD
- Manual testing
- Documentation first drafts

---

## 5. Skills With Longevity

### Certain demand (safe to build profiles for now)
- AI/LLM integration — every product team needs this
- System design at scale — timeless at senior+
- DSA for interviews — FAANG hiring will resume
- TypeScript mastery — most people use it superficially
- Observability & reliability — moving into every SWE role

### Emerging demand (will grow)
- AI agents & tool use
- Vector databases & RAG
- Edge computing depth
- Developer productivity tooling
- Security fundamentals for SWEs

---

## 6. The Core Mental Model

### Goal ≠ Topic

The goal is an outcome, not a syllabus. The user never picks topics.
The system infers them.

```
Goal (outcome)          "Get a senior SWE job at a product company"
    ↓
Skills required         System design, DSA, Node.js depth, TypeScript
    ↓
Knowledge gaps          Required skills vs. what user already knows
    ↓
Learning topics         Only the gaps, in dependency order
    ↓
Concept nodes           The actual study sessions (Topic Engine)
```

### Two Systems, Two Roles

| System | Job |
|--------|-----|
| **Claude (in Daily Push)** | Goal intake → skill profiling → gap analysis → topic list |
| **Topic Engine** | Topic → prerequisite graph → concept nodes → resources |

Claude understands goals and humans.
Topic Engine understands learning structure.
Neither does the other's job.

### Everything is Unstructured → Structured

```
UNSTRUCTURED (user gives)          STRUCTURED (system builds)
─────────────────────────          ──────────────────────────
Free text goal               →     Classified goal type
Resume / work history        →     Skill inventory
Self-description             →     Experience level
Vague timeline ("soon")      →     Target date + milestones
Scattered interests          →     Prioritized skill gaps
"I know a bit of X"          →     Assessed proficiency level
Life constraints             →     Available schedule
Fear / aspiration            →     Emotional driver + framing
```

**Core principle:**
```
raw     = append only, never modified, source of truth for what was said
structured = always rebuildable from raw, system-owned, user-visible
```

---

## 7. System Architecture

### The Split

```
PostgreSQL                          MongoDB
──────────────────────────          ──────────────────────────
users                               user_raw_inputs
user_profiles_structured            user_profiles_raw
user_skills                         goals (full document)
user_resume
concept_nodes
concept_edges
learning_topics (ref only)
study_sessions
spaced_repetition_queue
news_items
news_interests
daily_digests
```

### Why This Split

| Reason | Explanation |
|--------|-------------|
| Goals evolve unpredictably | New fields without migrations |
| Goals are read as a whole | One document fetch vs. 6 JOINs |
| Nested arrays fit naturally | milestones, adjustments, reflections embedded |
| Sessions need relational queries | "All sessions this week" — SQL is better |
| Nodes need graph traversal | Edges + prerequisite logic — SQL handles this |

### Service Topology

```
Browser
    ↓
Daily Push API (Express, port 3001)
    ├── MongoDB  (goals, raw inputs, profiles, knowledge stores)
    ├── PostgreSQL (sessions, nodes, edges, users, user_similarity_index)
    └── Topic Engine API (port 3000)
            ├── PostgreSQL (topic engine schema)
            └── Redis (BullMQ queues, LLM cache)
```

### The 3-Layer Decision Model

The system avoids calling an LLM whenever possible.
Every decision passes through these layers top to bottom — LLM is only reached if layers 1+2 can't answer.

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3 — LLM Layer                                        │
│  Called only in 5 specific situations (see Section 15)      │
│  Result always saved back to the knowledge layer            │
├─────────────────────────────────────────────────────────────┤
│  Layer 2 — Decision Layer                                   │
│  Rules + pattern matching — no LLM                          │
│  "Find closest goal_profile with confidence > threshold"    │
│  "Which questions has this user already answered?"          │
│  "Is this concept difficulty calibrated for this profile?"  │
├─────────────────────────────────────────────────────────────┤
│  Layer 1 — Knowledge Layer  (MongoDB + PostgreSQL)          │
│  Accumulated data from all past users and sessions          │
│  goal_profiles  skill_assessment_bank  path_outcomes        │
│  concept_difficulty_map  user_similarity_index              │
└─────────────────────────────────────────────────────────────┘
```

**Confidence thresholds — when each layer acts:**

| Confidence | Action |
|-----------|--------|
| > 0.85 | Use template directly, no LLM needed |
| 0.65 – 0.85 | Use template, confirm with user before finalising |
| 0.40 – 0.65 | Use template as starting point, ask one clarifying question |
| < 0.40 | Call LLM — save result to knowledge layer for next time |

---

## 8. Data Schema

### PostgreSQL Tables

#### users
```sql
users
  id                UUID PK
  email             VARCHAR UNIQUE
  password_hash     VARCHAR
  name              VARCHAR
  created_at        TIMESTAMP
  last_active_at    TIMESTAMP
```

#### user_profiles_structured
```sql
user_profiles_structured
  id                UUID PK
  user_id           FK → users
  -- Identity
  current_role      VARCHAR
  role_type         ENUM  engineer|analyst|pm|designer|other
  seniority_level   ENUM  junior|mid|senior|staff|lead
  years_total       SMALLINT
  employment_status ENUM  employed|unemployed|freelance|student
  primary_stack     JSON  array
  -- Derived from raw inputs
  derived_from      JSON  array of raw input IDs (MongoDB ObjectIds)
  derived_at        TIMESTAMP
  derived_by        VARCHAR  model name
  -- Preferences
  available_mins_day  SMALLINT
  available_days_week TINYINT
  timezone          VARCHAR
  digest_time       TIME
  updated_at        TIMESTAMP
```

#### user_skills
```sql
user_skills
  id                UUID PK
  user_id           FK → users
  skill_name        VARCHAR
  skill_category    ENUM  engineering|tools|soft_skills|domain|ai_native
  self_assessed_level ENUM  none|aware|familiar|proficient|expert
  verified          BOOLEAN  default false
  source            ENUM  self_reported|resume_parsed|quiz_verified
  created_at        TIMESTAMP
```

#### user_resume
```sql
user_resume
  id                UUID PK
  user_id           FK → users
  raw_text          TEXT
  parsed_data       JSON
  parsed_at         TIMESTAMP
  source            ENUM  upload|linkedin_paste|manual
```

#### concept_nodes
```sql
concept_nodes
  id                UUID PK
  user_id           FK → users
  goal_id           VARCHAR  (MongoDB ObjectId)
  learning_topic_id VARCHAR  (MongoDB ObjectId)
  topic_engine_node_id  UUID
  -- Content
  title             VARCHAR
  description       TEXT
  depth_level       ENUM  surface|foundational|intermediate|advanced
  boundary_type     ENUM  core|optional_depth
  node_type         ENUM  concept|skill|milestone
  estimated_mins    SMALLINT
  -- Longevity metadata
  longevity         ENUM  high|medium|low
  ai_relationship   ENUM  amplified|replaced|unaffected
  -- Resources
  resources         JSON
  -- State
  status            ENUM  locked|available|in_progress|done|review_due
  confidence        TINYINT  1-5 nullable
  last_studied_at   TIMESTAMP nullable
  next_review_at    TIMESTAMP nullable
  position          SMALLINT
  created_at        TIMESTAMP
```

#### concept_edges
```sql
concept_edges
  id                UUID PK
  goal_id           VARCHAR  (MongoDB ObjectId)
  learning_topic_id VARCHAR  (MongoDB ObjectId)
  from_node_id      FK → concept_nodes
  to_node_id        FK → concept_nodes
  edge_type         ENUM  hard_prerequisite|soft_prerequisite|leads_to
```

#### study_sessions
```sql
study_sessions
  id                UUID PK
  user_id           FK → users
  node_id           FK → concept_nodes
  session_type      ENUM  new|review|revisit
  started_at        TIMESTAMP
  completed_at      TIMESTAMP nullable
  duration_mins     SMALLINT
  confidence_before TINYINT  1-5
  confidence_after  TINYINT  1-5
  notes             TEXT nullable
```

#### spaced_repetition_queue
```sql
spaced_repetition_queue
  id                UUID PK
  node_id           FK → concept_nodes
  due_at            TIMESTAMP
  interval_days     SMALLINT  1→3→7→14→30
  repetition_count  SMALLINT
  last_confidence   TINYINT  1-5
```

**Spaced repetition interval logic:**
```
confidence 1-2  →  reset to 1 day
confidence 3    →  same interval
confidence 4    →  next interval
confidence 5    →  skip one interval
```

---

### MongoDB Collections

#### user_raw_inputs
```js
{
  _id: ObjectId,
  userId: "uuid",
  inputs: [
    {
      _id: ObjectId,
      type: "text|resume|voice|form_answer|linkedin|github|conversation",
      source: "onboarding_chat|goal_intake|correction|...",
      content: "...verbatim...",
      capturedAt: ISODate,
      processed: false
    }
  ]
}
```

#### user_profiles_raw
```js
{
  _id: ObjectId,
  userId: "uuid",
  selfDescription: "...verbatim...",
  resumeText: "...raw paste or OCR...",
  conversationHistory: [
    { role: "assistant", text: "..." },
    { role: "user", text: "..." }
  ],
  answers: [
    { question: "...", answer: "..." }
  ],
  lastUpdatedAt: ISODate
}
```

#### goals
```js
{
  _id: ObjectId,
  userId: "uuid",

  // What the user said — verbatim
  raw: {
    input: "...",
    capturedAt: ISODate,
    source: "onboarding_chat"
  },

  // What the system derived
  structured: {
    title: "...",
    goalType: "career|project|skill|transition|survival|certification|identity",
    timeHorizon: "immediate|short_term|medium_term|long_term|ongoing",
    successType: "binary|threshold|continuous|milestone",
    urgency: "exploring|planning|urgent|crisis",
    emotionalDriver: "growth|avoidance|social|validation|financial|curiosity",
    statedWhy: "...user's exact words...",
    successCriteria: "...",
    targetDate: ISODate,
    targetDateFlexibility: "fixed|flexible|none",
    estimatedCompletion: ISODate,
    confidenceLevel: 4,
    derivedBy: "claude-opus-4-6",
    derivedAt: ISODate
  },

  // Who they were at goal creation
  context: {
    roleAtCreation: "...",
    experienceAtCreation: 3,
    employmentStatus: "employed|unemployed|freelance|student",
    urgency: "exploring|planning|urgent|crisis",
    externalPressures: [],
    availableMinsDay: 30,
    availableDaysWeek: 5,
    hardConstraints: [],
    skillsSnapshot: [
      { skill: "TypeScript", level: "familiar" }
    ]
  },

  // Assessment — questions asked + verbatim answers
  assessment: {
    completedAt: ISODate,
    questions: [
      {
        sequence: 1,
        skillArea: "...",
        questionText: "...",
        answerText: "...",
        answerValue: "none|aware|familiar|proficient|expert",
        followUpTo: null
      }
    ]
  },

  // Skill gaps — each has raw (what user said) + structured (what system derived)
  skillGaps: [
    {
      _id: ObjectId,
      raw: "...what user said about this skill...",
      structured: {
        skillArea: "System Design",
        skillCategory: "technical|tools|soft|domain|ai_native",
        currentLevel: "none|aware|familiar|proficient|expert",
        requiredLevel: "aware|familiar|proficient|expert",
        priority: 1,
        priorityReason: "...",
        longevity: "high|medium|low",
        aiRelationship: "amplified|replaced|unaffected",
        status: "pending|in_progress|completed|skipped",
        identifiedBy: "assessment|resume_parse|system_inferred|user_added"
      },
      userConfirmed: false
    }
  ],

  // Learning topics — gap → Topic Engine
  learningTopics: [
    {
      _id: ObjectId,
      skillGapId: ObjectId,
      raw: null,
      structured: {
        title: "System Design Fundamentals",
        rationale: "...",
        topicEngineId: "uuid",
        decompositionStatus: "pending|in_progress|completed|failed",
        priority: 1,
        estimatedWeeks: 6,
        actualWeeks: null,
        status: "pending|active|completed|skipped",
        position: 1
      },
      createdAt: ISODate,
      completedAt: null
    }
  ],

  // Milestones — auto-generated checkpoints
  milestones: [
    {
      _id: ObjectId,
      raw: null,
      structured: {
        title: "Foundational layer complete",
        milestoneType: "knowledge|skill|external|behavioral",
        triggerType: "automatic|manual",
        triggerCondition: { layerComplete: "foundational" },
        sequence: 1,
        isCritical: true
      },
      achievedAt: null,
      celebrationShown: false
    }
  ],

  // Adjustments — append-only log, never deleted
  adjustments: [
    {
      _id: ObjectId,
      trigger: "user_input|system|milestone",
      rawInput: "...what user said that triggered this...",
      structured: {
        adjustmentType: "timeline_extended|timeline_shortened|scope_reduced|scope_expanded|paused|resumed|reframed|pace_changed",
        previousValue: {},
        newValue: {},
        recalculatedCompletion: ISODate
      },
      initiatedBy: "user|system",
      systemMessage: "...",
      createdAt: ISODate
    }
  ],

  // Reflections — periodic check-ins
  reflections: [
    {
      _id: ObjectId,
      trigger: "weekly|milestone|crisis|completion",
      raw: {
        prompt: "...",
        response: "..."
      },
      structured: {
        momentumRating: 4,
        relevanceRating: 5,
        sentiment: "positive|neutral|struggling|at_risk",
        keySignal: "...",
        recommendedAction: "continue|adjust_pace|reframe|intervention"
      },
      createdAt: ISODate
    }
  ],

  // State
  status: "drafting|assessing|planning|active|paused|achieved|abandoned",
  stage: "aspiration|intention|planning|action|maintenance|crisis",
  isPrimary: true,
  metadata: {},

  createdAt: ISODate,
  updatedAt: ISODate,
  achievedAt: null,
  abandonedAt: null,
  abandonedReason: null
}
```

### MongoDB Indexes
```js
db.goals.createIndex({ userId: 1, status: 1 })
db.goals.createIndex({ userId: 1, isPrimary: 1 })
db.goals.createIndex({ goalType: 1, status: 1 })
db.goals.createIndex({ "milestones.achievedAt": 1 })
db.goals.createIndex({ "reflections.createdAt": 1 })
db.goals.createIndex({ "learningTopics.topicEngineId": 1 })
db.goals.createIndex({ "skillGaps.status": 1, "skillGaps.priority": 1 })
```

---

## 9. Assessment Flow

### Philosophy
```
Not a form. Not a quiz. A conversation.
The system asks only what it doesn't already know.
The user never answers the same thing twice.
```

### Three Stages

```
Stage 1 — Listen        User talks, system collects raw input
Stage 2 — Clarify       System asks only what's still unclear (max 5 questions)
Stage 3 — Reflect back  System shows what it understood, user corrects
```

### Stage 1 — Listen
Single open prompt:
> "Tell me what you're trying to achieve — your situation, where you are now,
> and what success looks like to you. Don't worry about being precise. Just talk."

Everything → saved verbatim to `user_raw_inputs`.

### Stage 2 — Clarify
After first input, Claude identifies what's still missing and asks targeted follow-ups.

**What the system tries to extract:**
```
Current role/situation        Often there
Experience level              Sometimes there
The goal outcome              Usually vague
Timeline / urgency            Often missing
Available time                Almost always missing
What they already know        Partially there
What they've tried before     Sometimes there
Why now / emotional driver    Rarely explicit, often implied
```

**Clarification rules:**
- Never ask more than 5 questions total
- Never ask what was already answered
- Never ask for precision the user doesn't have
- Always acknowledge emotional content before asking
- Stop asking when you have enough to build a plan

### Stage 3 — Reflect Back
System presents what it understood as a narrative (not a form). User confirms or corrects.
Corrections → saved as new raw input → Claude re-derives → updated plan shown.

### Processing Pipeline
```
All raw inputs
    ↓
Decision Layer — Profile Extraction
  → Try: find matching user_profiles in knowledge layer
  → Fallback: Claude Profile Extraction prompt → save to knowledge layer
    ↓ → user_profiles_structured

Decision Layer — Goal Classification
  → Try: match goal_profiles bank (confidence threshold)
  → Fallback: Claude Goal Classification prompt → save to goal_profiles
    ↓ → goals.structured

Decision Layer — Gap Analysis
  → Try: lookup skill gaps from goal profile template
  → Fallback: Claude Gap Analysis prompt → update goal_profiles template
    ↓ → goals.skillGaps

Decision Layer — Topic Mapping
  → Try: reuse topic sequence from goal_profiles.typicalTopicSequence
  → Fallback: Claude Topic Mapping prompt → update typicalTopicSequence
    ↓ → goals.learningTopics

Timeline Calculator                 → estimatedCompletion
    ↓
Reflect back to user
    ↓
User confirms (or corrects → raw input → re-derive from Decision Layer)
    ↓
Topic Engine called per topic (async)
    ↓
Concept nodes + edges stored in PostgreSQL
    ↓
Unlock logic run
    ↓
Map ready, first session set
```

### The 4 Processing Roles (Decision Layer → LLM Fallback)

Each of the 4 steps below first queries the knowledge layer.
LLM is only called when the knowledge layer doesn't have a confident answer.
Every LLM result is written back — the system gets smarter over time.

**Step 1 — Profile Extraction**
Decision layer reads all raw inputs → matches similar past users in `user_similarity_index`
→ borrows profile structure from closest matches.
LLM fallback: full extraction prompt. Flags uncertain fields with `derivationConfidence`.

**Step 2 — Goal Classification**
Decision layer matches raw goal text → `goal_profiles` bank → checks confidence.
LLM fallback: reads raw goal statements + profile → outputs goalType, urgency, emotionalDriver,
successCriteria, targetDate, confidenceLevel.
`emotionalDriver` and `confidenceLevel` are always inferred, never asked directly.

**Step 3 — Gap Analysis**
Decision layer reads `goal_profiles.requiredSkillAreas` for matched goal type
→ subtracts user's current skills → outputs gaps.
LLM fallback: reads structured goal + profile → outputs prioritized skill gaps.
Max 6 gaps. Each tagged with longevity + AI relationship.

**Step 4 — Topic Mapping**
Decision layer reads `goal_profiles.typicalTopicSequence` for matched goal type
→ filters to user's actual gaps → reorders by dependency.
LLM fallback: reads ordered skill gaps + profile → outputs learning topics.
Title specific to user context. Rationale explains why for this user.
Max 5 topics. Enforces dependency ordering.

### Edge Cases
```
User gives almost nothing         → Ask 3 clarifying questions first
User gives contradictory info     → Flag in derivationConfidence, surface in reflect-back
User has no clear timeline        → Show estimated completion at current pace, ask if it fits
User's goal is unrealistic        → Don't validate — show realistic timeline honestly
User is in crisis (just laid off) → Acknowledge first, then fastest path framing
```

---

## 10. Feature Modules

### Module 1 — Goal Setup
- Free-text intake → assessment conversation → plan confirmation
- Timeline calculator: at X mins/day, done in Y weeks
- Background decomposition via Topic Engine

### Module 2 — Visual Knowledge Map
Node colors:
- Gray = locked
- Blue = available
- Yellow = in progress
- Green = done (confident)
- Orange = review due
- Red = done but low confidence

### Module 3 — Daily Session
- One concept per day, right-sized by time-box (15/30/60 mins)
- Completion → confidence rating 1-5 (mandatory)
- Rating 1-2 → re-queues with spaced repetition
- Rating 4-5 → unlocks dependent nodes

### Module 4 — Spaced Repetition
- Intervals: 1d → 3d → 7d → 14d → 30d
- Daily session = 1 new + 1 review (never overwhelming)
- Low re-rate resets interval, high extends it

### Module 5 — Progress & Milestones
- Overall % + estimated days remaining
- Layer completion detection
- Milestone triggers → celebration UI
- Weekly email summary

### Module 6 — News Integration
- News items tagged with concept IDs
- Reading a news item about a studied concept bumps SR interval
- Feed filtered to: studied concepts + next concepts in graph

### Module 7 — Understanding Check (v2)
- Optional free-text answer after completing a concept
- Topic Engine `answer_eval` role scores it
- Score feeds confidence rating

---

## 11. UI Structure

| Page | Purpose | Replaces |
|------|---------|---------|
| **Today** | One session + review + streak + goal progress | Dashboard |
| **Map** | Visual prerequisite graph for active goal | Roadmap (partial) |
| **Goals** | Goal list + creation wizard | Roadmap + Courses |
| **History** | Sessions, streaks, calendar | History |
| **News** | Feed linked to current learning | News |
| **Settings** | Email, digest time, interests | Settings |

### Today Page Layout
```
Good morning, [name]
Day 23 · 🔥 14 day streak

TODAY
[Concept title]
[Topic] · [X mins]
Unlocks: [next concept]
Why now: [one line rationale]
[15m] [30m] [60m] → [Start Session]

REVIEW DUE (1)
[Concept] · 5 min recall

YOUR GOAL
[Title]
[Progress bar] 52% · ~6 weeks left
```

### Goal Creation Wizard
```
Step 1: What's your goal?        (free text + suggestions)
Step 2: Tell us about yourself   (conversational intake)
Step 3: Here's your plan         (reflect back — narrative)
Step 4: Confirm                  (adjust pace, target date)
```

---

## 12. Build Sequence

Each phase is independently shippable and testable.
Later phases build on earlier ones — do not reorder.

```
Phase 0   Infrastructure & Auth           ~1 week
Phase 1   Goal Intake                     ~2 weeks
Phase 2   Gap Analysis & Plan             ~1 week
Phase 3   Decomposition & Node Graph      ~1 week
Phase 4   Core Learning Loop              ~1 week
Phase 5   Visual Knowledge Map            ~1 week
Phase 6   Retention & Progress            ~1 week
Phase 7   Self-Learning Foundation        ~2 weeks
Phase 8   Advanced Intelligence           ~1 week
                                         ─────────
                                          ~11 weeks total
```

---

### Phase 0 — Infrastructure & Auth (~1 week)

Goal: New database setup + working auth. No business logic yet.

- [ ] Tear down old schema — clean break (no migrations)
- [ ] PostgreSQL: create all new tables (`users`, `user_profiles_structured`, `user_skills`, `user_resume`, `concept_nodes`, `concept_edges`, `study_sessions`, `spaced_repetition_queue`)
- [ ] MongoDB: connect driver, create collections (`user_raw_inputs`, `user_profiles_raw`, `goals`)
- [ ] JWT-based auth — register, login, me endpoint
- [ ] Express router skeleton for all new route namespaces
- [ ] `.env` updated for both databases + Topic Engine URL
- [ ] Health check endpoint (`GET /health`) verifying both DB connections

**Milestone:** `POST /auth/register` → `POST /auth/login` → `GET /auth/me` works end to end.

---

### Phase 1 — Goal Intake (~2 weeks)

Goal: User can describe their goal in free text. System saves raw + structures it.

**Backend**
- [ ] `POST /intake/raw` — save verbatim input to `user_raw_inputs`
- [ ] `POST /intake/profile` — Claude: Profile Extraction → `user_profiles_structured`
- [ ] `POST /intake/classify` — Claude: Goal Classification → `goals.structured`
- [ ] `GET /goals/:id` — return full goal document

**Frontend — Goal Creation Wizard**
- [ ] Step 1: "What's your goal?" — free text + 5 quick-pick suggestions from Goal Library
- [ ] Step 2: "Tell us about yourself" — conversational follow-up, max 5 clarifying questions
- [ ] Raw inputs sent to backend as user types/submits each step
- [ ] Loading state while system processes (profile + classification running)

**Milestone:** User completes wizard steps 1–2. Backend stores raw input and structured goal in MongoDB. Goal document visible via API.

---

### Phase 2 — Gap Analysis & Plan (~1 week)

Goal: System derives what the user needs to learn and shows them the plan.

**Backend**
- [ ] `POST /goals/:id/analyze` — Claude: Gap Analysis → `goals.skillGaps`
- [ ] `POST /goals/:id/map` — Claude: Topic Mapping → `goals.learningTopics`
- [ ] Timeline calculator: at X mins/day → estimated completion date
- [ ] `PATCH /goals/:id` — user corrections saved as new raw input, re-derive triggered

**Frontend — Goal Creation Wizard (continued)**
- [ ] Step 3: "Here's your plan" — narrative reflect-back (not a form)
  - Show inferred goal type, urgency, emotional driver
  - Show skill gaps with longevity tags
  - Show learning topic sequence with rationale per topic
  - Show estimated completion at current pace
- [ ] Step 4: Confirm — adjust daily mins, target date
- [ ] Correction flow: user says "that's wrong" → edits inline → system re-derives
- [ ] Goals page — list all goals, status badges, progress summary

**Milestone:** Full wizard completed. Goal has structured gaps + learning topics. Estimated timeline shown.

---

### Phase 3 — Decomposition & Node Graph (~1 week)

Goal: Each learning topic becomes a prerequisite graph of concept nodes.

**Backend**
- [ ] `POST /goals/:id/decompose` — async: calls Topic Engine per `learningTopics` entry
- [ ] Save returned nodes → `concept_nodes`, edges → `concept_edges`
- [ ] Node unlock logic: mark nodes as `available` when all hard prerequisites are `done`
- [ ] `GET /goals/:id/nodes` — return all nodes with status + edges
- [ ] Handle Topic Engine failure gracefully — fallback to Claude flat generation

**Frontend**
- [ ] Goals page: show decomposition status per topic (pending / in progress / complete)
- [ ] Basic list view of nodes grouped by depth level (surface → foundational → intermediate → advanced)
- [ ] Node status visible (locked / available / done)

**Milestone:** Decomposition runs end to end. Nodes stored in PostgreSQL. Unlock logic fires correctly on completion.

---

### Phase 4 — Core Learning Loop (~1 week)

Goal: User can do one session per day and mark it complete with confidence.

**Backend**
- [ ] `GET /today` — return: next available node + any review due
- [ ] `POST /sessions` — create session record (started_at, node_id, session_type)
- [ ] `PATCH /sessions/:id/complete` — save confidence_after, duration_mins, notes
- [ ] On complete: update node status, run SR interval logic, unlock dependents, detect milestones
- [ ] SR interval logic: confidence 1-2 → 1d reset, 3 → same, 4 → next, 5 → skip one
- [ ] `GET /sessions/streak` — current streak + last active date

**Frontend — Today Page**
- [ ] Node card: title, topic, depth level, estimated mins, "Why now" rationale
- [ ] Time-box selector: 15 / 30 / 60 mins → Start Session
- [ ] On complete: mandatory confidence slider 1–5 with labels
- [ ] Review card (if due): compact recall prompt
- [ ] Goal progress bar + days remaining estimate
- [ ] Streak counter

**Milestone:** User can complete a session, rate confidence, see streak update, and watch next node unlock.

---

### Phase 5 — Visual Knowledge Map (~1 week)

Goal: User sees their full learning graph — what's done, what's next, what's locked.

**Frontend — Map Page**
- [ ] React Flow integration — render `concept_nodes` + `concept_edges`
- [ ] Node colors: gray (locked), blue (available), yellow (in-progress), green (done confident), orange (review due), red (done low confidence)
- [ ] Click node → side panel: title, description, resources, status, confidence history
- [ ] Layer filter sidebar: toggle surface / foundational / intermediate / advanced
- [ ] Progress rings per topic showing % complete
- [ ] Longevity badge per node (high / medium / low)
- [ ] Zoom + pan, fit to screen button

**Milestone:** Map renders correctly for a user with at least one decomposed topic. Node click opens detail panel. Layer filter works.

---

### Phase 6 — Retention & Progress (~1 week)

Goal: The system keeps the user coming back and shows meaningful progress.

**Backend**
- [ ] SR scheduler: daily job to compute `next_review_at` per queue entry
- [ ] Milestone detection on session complete (layer complete, % thresholds, goal achieved)
- [ ] `GET /sessions/calendar` — heatmap data (days × session count)
- [ ] Weekly summary email (Resend) — sessions, nodes done, streak, next up
- [ ] Streak forgiveness: miss one day → no reset (configurable grace window)

**Frontend**
- [ ] History page: streak heatmap, sessions list, total time studied
- [ ] Milestone celebration overlay (trigger once per milestone)
- [ ] Progress module on Today page: overall %, estimated weeks remaining, next milestone
- [ ] Settings page: daily mins, digest time, email toggle, timezone

**Milestone:** User receives weekly email. Milestone fires on layer completion. Streak forgiveness works.

---

### Phase 7 — Self-Learning Foundation (~2 weeks)

Goal: Replace LLM calls with the knowledge layer wherever confidence is high enough.

**Backend — Knowledge Layer seeding**
- [ ] Create MongoDB `goal_profiles` collection
- [ ] Seed 10 entries from Goal Library (Section 13) with signals, requiredSkillAreas, assessmentQuestions, typicalTopicSequence, timelineData
- [ ] Create `skill_assessment_bank` collection — seed common skill areas (System Design, DSA, Node.js, React, AI/LLM, etc.)
- [ ] Create `path_outcomes` collection — write listener: on goal achieved/abandoned, save snapshot

**Backend — Decision Layer**
- [ ] `matchGoalProfile(rawInput, userProfile)` — fuzzy signal matching + confidence score
- [ ] `buildAssessmentQuestions(goalType, userProfile)` — query bank, filter already-answered
- [ ] `inferSkillGaps(goalProfile, userSkills)` — required − current, ranked
- [ ] `estimateTimeline(goalProfile, minsPerDay)` — interpolate from timelineData
- [ ] Route each intake step through confidence threshold logic:
  - > 0.85 → use template directly, skip LLM
  - 0.65–0.85 → use template, confirm with user
  - 0.40–0.65 → use template as start, ask one clarifying question
  - < 0.40 → call LLM, save result to `goal_profiles`
- [ ] Every LLM result written back to knowledge layer

**Backend — Difficulty Calibration**
- [ ] Create `concept_difficulty_map` collection
- [ ] Write listener: on session complete, update map entry for this node + user profile group

**Milestone:** New user with goal matching a seeded profile completes intake without a single LLM call. LLM still fires for unrecognised goal types and result is saved.

---

### Phase 8 — Advanced Intelligence (~1 week)

Goal: The system connects learning to the real world and improves understanding checks.

**Backend**
- [ ] News ↔ concept linking: tag news items with matching `concept_node` IDs on fetch
- [ ] Reading a news item on a studied concept: bump SR interval by one step
- [ ] `POST /sessions/:id/check` — save free-text understanding answer, call Topic Engine `answer_eval`, return score
- [ ] Score feeds into confidence_after if user skips the manual slider
- [ ] `user_similarity_index` table: compute + store pgvector feature vector on profile creation
- [ ] Periodic reflection prompts: weekly check-in (momentum rating, relevance rating)
- [ ] Goal completion flow: celebration screen + "what's next?" suggestion from goal_profiles

**Frontend**
- [ ] News page: feed filtered to studied + upcoming concepts, longevity-tagged
- [ ] Understanding check: optional text field on session complete ("explain it back")
- [ ] Reflection prompt: weekly modal (can dismiss), feeds `goals.reflections`
- [ ] Goal completion screen with suggested next goals

**Milestone:** News feed shows items linked to current learning topic. Understanding check scores a response. Reflection data stored in MongoDB goal document.

---

## 13. Goal Library

Pre-built profiles for common goals:

| Goal | Archetype | Est. Duration | Core Skills |
|------|-----------|---------------|-------------|
| Get a senior backend SWE job | Job Switcher | 16–24 weeks | System design, DSA, Node.js depth, AI tooling |
| Get a senior fullstack job | Job Switcher | 16–24 weeks | System design, DSA, React depth, backend basics |
| Crack FAANG system design | Job Switcher / Promotion | 12–16 weeks | Distributed systems, databases, caching, queues |
| Get promoted to senior | Promotion Seeker | 20–28 weeks | System design, leadership signals, domain depth |
| Build and ship an AI product | Builder | 10–16 weeks | LLM APIs, RAG, agents, deployment |
| Become an AI/LLM engineer | Specializer | 14–20 weeks | LLM fundamentals, RAG, agents, evals, fine-tuning |
| Master system design | Specializer | 10–14 weeks | All system design pillars |
| Go from backend to fullstack | Transition | 12–18 weeks | React, state management, CSS, frontend tooling |
| Survive AI-era engineering | Survivor | 8–12 weeks | AI-native workflows, high-leverage skills, judgment |
| Pivot from QA to engineering | Career Switcher | 16–20 weeks | Programming fundamentals, APIs, testing automation |

---

## 14. Open Decisions

### Decided
- [x] MongoDB for goals — unstructured inputs, flexible schema
- [x] MongoDB for 5 knowledge stores — goal_profiles, skill_assessment_bank, path_outcomes, concept_difficulty_map (see Section 15)
- [x] PostgreSQL for sessions/nodes/edges — relational queries
- [x] PostgreSQL for user_similarity_index (pgvector feature vectors)
- [x] One active goal at a time (simplest scheduling)
- [x] React Flow for graph visualization
- [x] Clean break from old data model (no migration)
- [x] Claude handles gap analysis, Topic Engine handles decomposition
- [x] User never fills forms — always free text → structured by system
- [x] Raw input is append-only, never modified
- [x] 3-layer self-learning architecture — Knowledge → Decision → LLM (only 5 triggers)
- [x] Confidence threshold model — >0.85 direct, 0.65–0.85 confirm, 0.40–0.65 clarify, <0.40 LLM
- [x] Hybrid LLM routing — Anthropic for complex roles, Ollama (qwen2.5:3b) for scoring

### Still Open
- [ ] Auth strategy — JWT vs session, or use an auth library (Auth.js, Clerk)?
- [ ] Resume parsing — build in-house (Claude) or use a service?
- [ ] How to handle goals that span multiple Topic Engine topics on the map — one unified graph or per-topic subgraphs?
- [ ] Notification strategy — email only, or browser push, or both?
- [ ] What happens when Topic Engine decomposition fails — fallback to Claude flat generation?
- [ ] Mobile — responsive web only, or native app later?

---

---

## 15. Self-Learning Architecture

### The Core Principle

> The system should get smarter with every user that passes through it.
> LLMs are expensive, slow, and non-deterministic. The system only calls one
> when it genuinely doesn't know — and always saves the result.

Over time, the knowledge layer accumulates enough signal that the LLM is called
less and less for repeat goal patterns, while still handling anything novel correctly.

---

### Layer 1 — Knowledge Layer (MongoDB + PostgreSQL)

Five stores that accumulate structured knowledge from every user interaction.

#### `goal_profiles` (MongoDB)
Accumulated templates for each goal archetype. Grows richer over time.

```js
{
  _id: ObjectId,
  goalType: "career",
  signals: [
    "get a senior", "promoted", "staff engineer", "faang"
  ],
  requiredSkillAreas: [
    { skill: "System Design", level: "proficient", priority: 1 },
    { skill: "DSA", level: "familiar", priority: 2 },
    { skill: "AI Tooling", level: "aware", priority: 3 }
  ],
  assessmentQuestions: [
    {
      skillArea: "System Design",
      question: "Walk me through how you'd design a URL shortener",
      scoringRules: { none: ["never done", "no idea"], proficient: ["cache", "hashing", "load balancer"] }
    }
  ],
  typicalTopicSequence: [
    "System Design Fundamentals",
    "Distributed Systems",
    "DSA Patterns",
    "Node.js Depth"
  ],
  timelineData: {
    medianWeeks: 20,
    p25Weeks: 14,
    p75Weeks: 28,
    atMinsPerDay: { 30: 28, 60: 20, 90: 14 }
  },
  sampleCount: 142,          // users this profile was built from
  lastUpdatedAt: ISODate
}
```

#### `skill_assessment_bank` (MongoDB)
Reusable questions per skill area with scoring rules.
When a new skill area is encountered, Claude generates a question set → saved here.

```js
{
  _id: ObjectId,
  skillArea: "System Design",
  level: "familiar",
  questions: [
    {
      text: "Have you designed any system that needed to handle > 1k requests/sec?",
      format: "open_text",
      scoringRules: {
        none:       ["no", "haven't"],
        aware:      ["read about", "studied"],
        familiar:   ["once", "simple version"],
        proficient: ["in production", "scaled", "load balanced"],
        expert:     ["multiple times", "led the design", "benchmarked"]
      },
      usageCount: 87,
      avgScoreCorrelation: 0.74  // how well this question's score predicts actual progress
    }
  ],
  createdAt: ISODate,
  updatedAt: ISODate
}
```

#### `path_outcomes` (MongoDB)
Completed paths — what worked, what didn't, where people got stuck.

```js
{
  _id: ObjectId,
  goalProfileId: ObjectId,
  userId: "uuid",             // anonymised reference only
  topicSequence: ["System Design Fundamentals", "DSA Patterns"],
  outcome: "goal_achieved|abandoned|paused",
  completionWeeks: 18,
  stuckPoints: [
    {
      topicTitle: "Distributed Systems",
      nodeTitle: "Consensus Algorithms",
      avgConfidenceAtStuck: 1.8,
      dropoutRate: 0.31
    }
  ],
  profileSnapshot: {
    seniority: "mid",
    availableMinsDay: 45,
    primaryStack: ["Node.js", "React"]
  },
  createdAt: ISODate
}
```

#### `concept_difficulty_map` (MongoDB)
Per-concept difficulty calibrated by actual user performance.

```js
{
  _id: ObjectId,
  topicEngineNodeId: "uuid",
  nodeTitle: "Consensus Algorithms",
  avgConfidence: 2.3,
  avgSessionsToConfident: 4.1,
  dropoutRate: 0.28,
  commonMisconceptions: [
    "Confuses Paxos with Raft",
    "Doesn't connect to CAP theorem"
  ],
  difficultyByProfile: [
    { seniority: "mid", availableMins: 30, avgConfidence: 1.9 },
    { seniority: "senior", availableMins: 60, avgConfidence: 2.8 }
  ],
  lastUpdatedAt: ISODate
}
```

#### `user_similarity_index` (PostgreSQL — pgvector)
Feature vectors for each user. Enables "find users like this one."

```sql
user_similarity_index
  id            UUID PK
  user_id       FK → users
  features      vector(64)   -- pgvector embedding
  feature_meta  JSON         -- what was encoded (seniority, stack, goal type, etc.)
  created_at    TIMESTAMP
  updated_at    TIMESTAMP
```

---

### Layer 2 — Decision Layer

Pure code — no LLM calls. Reads from the knowledge layer, applies rules.

**Decision functions:**

```
matchGoalProfile(rawInput, userProfile)
  → query goal_profiles where signals overlap
  → return best match + confidence score

buildAssessmentQuestions(goalType, userProfile)
  → query skill_assessment_bank for required skill areas
  → filter out questions already answered in this session
  → return max 5 questions, ordered by information value

inferSkillGaps(goalProfile, userSkills)
  → requiredSkillAreas − userSkills
  → rank by priority, tag with longevity

estimateTimeline(goalProfile, availableMinsDay)
  → interpolate from timelineData at user's daily minutes
  → add buffer for high-dropout nodes in path_outcomes

findSimilarUsers(userFeatureVector)
  → pgvector cosine similarity query on user_similarity_index
  → return top 5 similar users + their outcomes
```

---

### Layer 3 — LLM Layer

**Called in exactly 5 situations. Every result saved back to Layer 1.**

| Trigger | What the LLM does | Where it saves |
|---------|------------------|---------------|
| 1. New goal type (no profile match > 0.40 confidence) | Classify goal, extract required skills, generate question set | Creates new `goal_profiles` entry |
| 2. New skill area not in assessment bank | Generate 3–5 assessment questions with scoring rules | Appends to `skill_assessment_bank` |
| 3. Profile mismatch from known patterns (user correct, pattern wrong) | Re-derive structured profile from raw inputs | Updates `goal_profiles` signals + requiredSkillAreas |
| 4. User explicit correction ("that's wrong, actually I...") | Re-run affected derivation step only | Updates `goals.structured` or `goals.skillGaps` |
| 5. Personalised messaging (progress summaries, milestone text, reflection prompts) | Generate copy for this specific user | Cached per user for the session |

---

### Self-Improving Feedback Loops

The system continuously improves through 4 feedback loops.
No manual curation required — it learns from user behaviour.

```
Loop 1 — Goal Profile Refinement
  When: goal achieved or abandoned
  Signal: was the inferred goal type correct? Did the topic sequence work?
  Update: goal_profiles.typicalTopicSequence, timelineData

Loop 2 — Difficulty Calibration
  When: user rates confidence after each session
  Signal: was the estimated difficulty accurate for this profile?
  Update: concept_difficulty_map per user profile group

Loop 3 — Question Quality
  When: assessment question answered → correlate with eventual progress
  Signal: did this question's score predict actual performance?
  Update: skill_assessment_bank avgScoreCorrelation, prune low-correlation questions

Loop 4 — Path Optimization
  When: user gets stuck or drops out
  Signal: which node caused the drop? Was sequence optimal?
  Update: path_outcomes.stuckPoints → informs future topic ordering
```

---

### Why Not Just Call Claude Every Time?

| Concern | Impact |
|---------|--------|
| Latency | Goal intake with 4 LLM calls = 15–30 seconds. Decision layer = < 200ms |
| Cost | At scale, 4 LLM calls per signup is unsustainable |
| Consistency | LLMs are non-deterministic — same input, slightly different plan |
| Improvement | An LLM called every time learns nothing. A knowledge layer improves forever |

The goal is: **LLM as teacher, not oracle.**
Claude teaches the system once. The system applies what it learned to thousands of users.

---

*This document is the source of truth for the Daily Push reimagination.*
*Update it as decisions are made. Never delete history — use strikethrough and add new entries.*
