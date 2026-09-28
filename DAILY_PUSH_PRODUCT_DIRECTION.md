# Daily Push — Product Direction

> Status: reference plan. No implementation from this document has started.
> Last updated: September 2026
> Historical architecture and the original eight build phases: `DAILY_PUSH_REIMAGINATION.md`
> This file is the active product plan. When a phase here finishes, mark it in the phase table and in `CLAUDE.md`.

## Thesis

The tech landscape is shifting faster than ever. Daily Push replaces career uncertainty with daily clarity: helping ambitious engineers map high-leverage growth paths, build verifiable proof of their skills, and communicate their true value with confidence.

The product empowers engineers. Copy describes the work, the order, and the record. It does not describe fear, replacement, desperation, or a crisis to recover from.

Someone should be willing to pay because the record is useful: a path they trust, proof they can point to, and language that matches that proof.

## Decision

Mold the features that already exist. Do not build a new product beside them.

The study system (goal, map, daily session, retention) and the career system (roles, resume, applications, mock interviews) stay. They become one loop with one home object. Add new data only where that loop has a hole the current APIs cannot fill. That hole is named in Phase 4. Do not add AI features.

## Target model

One **direction** is the home object. It is a craft or role the engineer is building toward. In the current schema it is a `candidate_target_roles` row plus the linked goal, concept graph, and sprint.

| Surface | Promise | What the engineer sees |
|---|---|---|
| Today | Daily clarity | One session on the active direction. The screen names the concept, why it is next, the proof the session leaves, and the sentence that proof will support. |
| Path | High-leverage growth path | The concept graph and the plan as two views of the same direction. Confirm, correct, decompose, and pace live here. |
| Proof | Verifiable skill | Evidence claims and session artifacts for that direction. Readiness is a reading of this record. |
| Voice | Communicate true value | Resume narrative, interview practice, and optional job posts for that direction. A job post sharpens Voice. It does not start a second product. |

A direction is useful with no job post. When a post exists, it highlights which proof is thin for that post.

Account menu, not primary nav: direction library, settings, billing. Operator tools stay behind `isOperator`.

### Language

| Use | Retire from the product surface |
|---|---|
| Direction, path, proof, voice | Goal, sprint, upgrade plan, target role, career market, as primary names |
| Draft, Active, In review, Ready to show | Risk, crisis, recovery, “AI replaces” |
| “The free record holds one direction.” | Quota copy such as “10 AI checks” on the pricing page |
| Judgment-heavy, AI-assisted, foundational | Longevity badges framed as replacement threat |

Internal code, table names, and API paths can keep their current identifiers until Phase 5. User-facing strings change in Phase 1.

### The walk that every phase is judged against

1. Choose a direction.
2. Confirm the path.
3. Finish today’s session.
4. See the artifact on Proof.
5. See a sentence on Voice that cites that artifact.

A screen that needs a paragraph explaining how it relates to another screen is still a second product.

## Current shell

Primary nav in `daily-push/packages/frontend/src/App.tsx`: Today, Plan, Role, Practice, Progress.

Plan (`/plan`) and Role (`/role`) are redirects in `components/ActiveRedirects.tsx`. Plan opens the primary goal or `/goals/new`. Role opens the linked target role, else the newest saved role, else `/career-market/find-direction`.

Explore menu: Find a role, Check a resume, News, All plans, Saved roles.

Authenticated routes today:

| Route | Page |
|---|---|
| `/today` | `pages/Today.tsx` |
| `/plan` | Redirect to primary goal |
| `/goals`, `/goals/new`, `/goals/:id` | `Goals.tsx`, `GoalSetup.tsx`, `GoalDetail.tsx` |
| `/map` | `Map.tsx` |
| `/role` | Redirect to a target role |
| `/target-roles`, `/target-roles/:id` | `TargetRoles.tsx`, `TargetRoleWorkspace.tsx` |
| `/career-market`, `/career-market/find-direction`, `/career-market/roles/:roleId` | `CareerMarket.tsx`, `RoleMarketDetail.tsx` |
| `/resume`, `/resume/applications/:applicationId` | `Resume.tsx`, `ResumeApplication.tsx` |
| `/mock` | `MockInterview.tsx` |
| `/history` | `History.tsx` |
| `/news` | `News.tsx` |
| `/settings`, `/pricing` | `Settings.tsx`, `Pricing.tsx` |
| `/metrics`, `/operator/market` | Operator only |

Goal detail tabs: Overview, Concepts, Your work, Resources.

Target role tabs: Overview, Proof, Readiness report, Plan, Applications, The role.

## Feature disposition

Disposition means what happens to the user-facing feature. Backend modules stay until Phase 5 confirms nothing calls them.

| Current feature | Code | Disposition | Becomes |
|---|---|---|---|
| Landing | `pages/Landing.tsx` | Reshape | Thesis, one loop, one primary action. Job-switch guide cards fold into that story. |
| Auth, demo login | `routes/auth.ts`, `routes/demo.ts` | Keep | Unchanged. |
| Today session | `pages/Today.tsx`, `routes/today.ts`, `routes/sessions.ts` | Reshape | Same session, timer, confidence, review. Phase 3 adds the proof line and the voice line. |
| Time box, confidence 1–5, spaced repetition | `services/sessions.ts` | Keep | Quiet. Streak stays available on Progress. The flame badge leaves the global header in Phase 1. |
| Session task and artifact evaluation | `POST /sessions/:id/task`, `/artifact`, `/evaluate-artifact` | Keep | The artifact is the proof the session leaves. Phase 4 links it to a claim. |
| Goal intake | `routes/intake.ts`, `pages/GoalSetup.tsx` | Fold | “Name a direction,” then the same confirm step as every other entry. |
| Gap analysis, topic mapping, timeline | `services/intake.ts`, `services/decisionLayer.ts` | Keep | Shown on Path as the reason for the order. The decision layer stays internal. |
| Confirm and correct | `POST /goals/:id/confirm`, `/correct` | Keep | Path, before the graph is trusted. |
| Decompose, nodes, unlock, resources | `services/decomposition.ts`, Topic Engine | Keep | Path views. Topic Engine is unchanged. |
| Goal detail | `pages/GoalDetail.tsx` | Reshape | Path for the active direction. Overview, concepts, work, and resources become views, not a second app. |
| Map | `pages/Map.tsx` | Fold | A view on Path. “AI replaces” labels change in Phase 1. |
| Primary goal, archive, suggest next | `GET /goals/primary`, archive, `suggest-next` | Reshape | One active direction. Suggest-next no longer opens a new intake while a direction is active. The library lists other directions. |
| Sprints, rebaseline, plan health | `services/sprintPlanner.ts`, `goal_sprints` | Fold | Pace and scope of the direction’s path. “Sprint” leaves the nav and the pricing name. |
| Weekly check-in, weekly report, recovery | `routes/goalWeekly.ts`, `services/weeklyCheckins.ts`, `pages/History.tsx` | Reshape | “What became visible this week?” Pace adjustments stay. Risk and recovery headlines leave the copy. |
| Weekly email | `services/weeklyEmail.ts` | Keep | Same mail, new copy, still skips without `RESEND_API_KEY`. |
| History calendar and streak | `GET /sessions/calendar`, `/streak`, `pages/History.tsx` | Fold | Account → Progress. It is a record of the path, not a fifth product. |
| Milestones overlay on Today | `pages/Today.tsx` | Simplify | A single line on Path or Progress. Today stays the session. |
| Career market browse and role detail | `routes/market.ts`, `CareerMarket.tsx`, `RoleMarketDetail.tsx` | Fold | How an engineer picks a direction. Public browse can stay. It is not a peer of Today. |
| Role recommendations | `POST /market/recommend-roles` | Keep | The picker inside “choose a direction.” |
| Saved target roles | `routes/targetRoles.ts`, `TargetRoles.tsx` | Reshape | The direction library. |
| Target role workspace | `TargetRoleWorkspace.tsx` | Split | Proof, readiness, and “the role” expectations feed Proof and Path. Applications feed Voice. The six-tab page is retired as a destination in Phase 2. |
| Evidence claims and import resume | `/:id/evidence`, `candidate_evidence_claims` | Keep | Proof. |
| Readiness, reassess, market change | `/:id/readiness`, readiness history | Reshape | A reading of Proof. One score, tied to claims, not a competing percentage next to node completion. |
| Upgrade plan and build-plan | `/:id/create-upgrade-plan`, `create-goal`, `build-plan` | Fold | Creating or refreshing the direction’s path. Same confirm step. |
| Proof recommendations and publish | `/:id/proof-recommendations`, `proof-evidence/publish` | Fold | Actions on a Proof claim. |
| Resume snapshot, full report, tailored draft | `routes/resume.ts`, `pages/Resume.tsx` | Fold | Voice for the active direction. Public snapshot can stay as a way in. |
| Applications and status | `resume_applications`, `ResumeApplication.tsx` | Fold | Voice, under the direction. Status pipeline stays. |
| Gaps from an application | `POST /goals/:id/gaps/from-application` | Keep | A job post adds gaps onto the same path. |
| Mock interview | `routes/mockInterviews.ts`, `pages/MockInterview.tsx` | Fold | Voice practice for the active direction. |
| News feed | `routes/news.ts`, `pages/News.tsx` | Deprecate as a destination | A story may appear on the concept being studied. The Explore item and `/news` page go away in Phase 5. Routes can remain until nothing links them. |
| Settings | `routes/settings.ts` | Keep | Account. Daily minutes and days per week set the path’s pace. |
| Billing, entitlements, Stripe | `services/billingPlans.ts`, `routes/billing.ts` | Reshape | Phase 1 changes the story. Phase 5 folds Sprint into one paid plan. Entitlement keys stay so gates do not break mid-migration. |
| Product metrics, market health | `pages/ProductMetrics.tsx`, `OperatorMarketHealth.tsx` | Keep | Operator only. Out of the learner story. |
| Product analytics events | `routes/events.ts` | Keep | Internal. |
| Artifact export | `routes/goalArtifacts.ts` | Keep | Export of the Proof and Voice record. Paid. |

## What is new

Almost nothing is new capability.

| Addition | Phase | Why it is required |
|---|---|---|
| Four nav destinations and account placement for everything else | 1 | The shell is the product boundary. |
| Page composition: Path, Proof, Voice read the direction `ActiveRedirects` already resolves | 2 | Existing pages become views. |
| Today copy block: proof this session leaves, sentence it will support | 3 | The session already creates an artifact. The screen does not say so. |
| Link from a session artifact to a proof claim and to a voice line | 4 | Only if Phase 3 shows the APIs cannot express “this sentence cites this artifact.” A column or join, not a new product. |
| Direction library empty states in the new vocabulary | 2 | So the first run has one next action. |

Do not add: another coach, another score, a news product, a job board, a third billing tier, or a new decomposition engine.

## Phases

Work in order. Each phase is shippable. Routes and tables stay until a later phase deletes a door that nothing links to.

| Phase | Name | Status |
|---|---|---|
| 1 | Language and shell | `done` |
| 2 | Four surfaces over current APIs | `not_started` |
| 3 | Today states the loop | `not_started` |
| 4 | Artifact, claim, and voice line | `not_started` |
| 5 | Remove deprecated doors | `not_started` |

### Phase 1 — Language and shell

User-facing only. Behavior and APIs stay.

Changes:

- Primary nav becomes Today, Path, Proof, Voice. Path and Voice may still redirect with the existing helpers while Phase 2 builds the pages. Labels change now.
- Explore menu leaves the header. Find a role, Check a resume, News, All plans, and Saved roles are not peers of Today.
- Account menu holds Settings, Plans and billing, and Progress (current History). Direction library waits for Phase 2 if the page is not ready; until then Saved roles and All plans may live in the account menu under those temporary labels, not in Explore.
- Header subtitle “Career progress system” becomes a line that matches the thesis, in the same visual weight as the current subtitle.
- Streak flame leaves the global header. Streak data remains on Progress.
- Landing (`pages/Landing.tsx`) states the thesis and the loop: choose a direction, confirm a path, do one session, keep the proof, say it clearly. The three equal entry cards stop being the story.
- Pricing (`pages/Pricing.tsx` and the `features` / `description` strings in `services/billingPlans.ts`) describes one free record and one paid record: path, proof, and voice. Numeric AI-check caps leave the pricing page. Entitlement enforcement is unchanged.
- Copy pass on Map, Goal detail, Target role workspace, History, and Today: remove “AI replaces,” risk, crisis, and recovery wording. Use the status words in the language table.
- `Map.tsx` `aiLabel.replaced` and the matching label in `GoalDetail.tsx` become “AI-assisted” or the skill is shown without a threat tag.

Deprecated in the nav only (pages still routed):

- Explore entries as primary navigation.
- User-facing names Sprint, upgrade plan, and “AI replaces.”

New:

- Nav and account-menu structure in `App.tsx`.
- No new routes required if Path and Voice still alias `/plan` and a temporary composition route is deferred to Phase 2. If a label would point at the wrong page, add a thin route that renders the old page rather than sending the engineer to a second product.

Exit: a signed-in engineer sees four destinations and copy that matches the thesis. Every old URL still works.

Shipped:

- Nav in `App.tsx` is Today, Path, Proof, Voice. `/path` and `/plan` open the existing plan redirect. `/proof` and `/role` open the existing role redirect. `/voice` redirects to `/resume`. Progress, Saved roles, All plans, and Interview practice sit in the account menu. The Explore menu and the header streak badge are gone. The header subtitle is “Daily clarity.”
- Landing, login, and the public resume and direction headers use the thesis. Pricing shows Free and Pro, and hides Sprint unless that is the current plan. Feature bullets in `billingPlans.ts` describe the record. Entitlement numbers are unchanged.
- Map and goal labels use Judgment-heavy, AI-assisted, and Foundational. Today, History, Settings, and the role workspace use path and pace language on the strings Phase 1 called out. Goal setup, resume sprint buttons, and mock-interview plan gates still say Sprint until Phase 5.

### Phase 2 — Four surfaces over current APIs

Compose existing pages and endpoints. Do not rewrite intake, decomposition, resume parsing, or readiness scoring.

Direction resolution stays the logic in `RoleRedirect` and `PlanRedirect`: primary goal, its `targetRoleId` or linked role, else the newest active saved role.

| Surface | Renders | Sources |
|---|---|---|
| Path | Goal overview, concept list, map, pace | `GoalDetail.tsx` views, `Map.tsx`, sprint and plan-health payloads |
| Proof | Claims, session artifacts, readiness as a reading of those claims | Target role Proof and Readiness tabs, session artifacts |
| Voice | Resume narrative, tailored draft, applications, mock runs | `Resume.tsx`, `ResumeApplication.tsx`, `MockInterview.tsx`, role Applications tab |
| Direction library | Saved roles and their linked goals, one active | `TargetRoles.tsx`, `Goals.tsx` |

Changes:

- New routes `/path`, `/proof`, `/voice`, `/directions`. `/plan` redirects to `/path`. `/role` redirects to `/proof` for the active direction, with Voice one navigation step away. `/history` redirects to the account Progress page or stays as an alias.
- `TargetRoleWorkspace.tsx` stops being a six-tab destination. Its sections are split across Proof, Path, and Voice. Expectations (“The role”) sit on Path as context for why the graph exists.
- Creating a direction from a market profile, a resume, or free text always ends on Path confirm (`POST /goals/:id/confirm`). `GoalSetup.tsx`, `create-goal`, and `create-upgrade-plan` call that same confirm screen.
- Applications remain a list inside Voice, filtered to the active direction.
- Empty states name one next action: choose a direction, confirm the path, finish today’s session, add the artifact to Proof.

Folded, not deleted yet:

- `/goals/:id`, `/map`, `/target-roles/:id`, `/resume`, `/mock`, `/career-market` remain as URLs. Primary nav does not link them. In-app links point at Path, Proof, or Voice.

New:

- Four page modules that compose current components. Prefer wrapping the existing sections over pasting new business logic.
- Shared direction context so Path, Proof, Voice, and Today agree on the active pair of goal id and target role id.

Exit: the reference walk can be clicked using only Today, Path, Proof, and Voice, even if the voice sentence is still hand-written from the resume draft rather than linked to the artifact.

### Phase 3 — Today states the loop

`GET /today` already returns the goal, the next node, and the review node. The session APIs already create and evaluate an artifact.

Changes:

- The idle stage on Today names: direction title, concept, why it is next, the artifact the task asks for, and where that artifact will show up (Proof, then Voice).
- Review due stays one item, framed as keeping a concept sharp.
- Milestone celebration, suggested-next-goal cards, and any news module on Today leave this page. Completion returns to the session summary and a link to the new proof.
- Weekly check-in modal asks what became visible and whether the pace still fits. `recoveryPlan` actions can still adjust scope. The headline is pace, not failure.
- Progress (`History.tsx`) shows the calendar, completed concepts, and proof added. It drops the recovery banner’s crisis tone.

Deprecated on Today:

- Next-goal intake prompts while a direction is active.
- News as part of the daily screen.

New:

- Presentation fields only, filled from the session task (`taskType`, prompt) and the direction title. No new model call.

Exit: finishing a session tells the engineer what was added to Proof and what Voice can now say. The link may still be implicit until Phase 4.

### Phase 4 — Artifact, claim, and voice line

Build this only after Phase 3. If a finished artifact already appears on Proof and a resume or interview line can cite it with current fields, skip the schema work and record that in this file.

The hole to close: a voice line should point at a specific session artifact or evidence claim, and Proof should show that citation.

Likely shape, kept small:

- On the session artifact (migration `010_session_artifacts.sql` table) or on `candidate_evidence_claims` (`020_candidate_evidence_claims.sql`), store the other side’s id.
- Voice reads that link when rendering a resume bullet or a mock-interview note.
- No new evaluator. The existing artifact evaluation and evidence import remain the writers.

New:

- One migration, one read on Proof, one read on Voice.

Exit: the reference walk’s last step is a sentence that cites the artifact from the session just finished.

### Phase 5 — Remove deprecated doors

Do this after Phases 1–4 are the only linked path. Delete UI first, then unused route mounts, then tables only when a query confirms they are unread.

Remove or permanently redirect:

| Door | Action |
|---|---|
| Explore menu | Already gone in Phase 1. Delete leftover items. |
| `/news` page | Redirect to Today or Path. Keep `routes/news.ts` only if a concept panel still fetches one story. Otherwise unmount the router. |
| `/goals/new` as a standalone wizard | Redirect to the direction picker, then Path confirm. |
| Six-tab target role workspace as a page | Redirect `/target-roles/:id` to Proof or Path. |
| Sprint and upgrade plan as named products | User-facing strings gone. `goal_sprints` and upgrade-plan rows remain the path’s schedule. |
| Third billing plan “Sprint” | Fold its entitlements (`mock_interviews`, `artifacts.export`, `premium_sprints`, `gap_reports`) into the paid plan in `billingPlans.ts`. Existing Sprint subscribers map onto that paid plan. One paid public plan: path, proof, and voice. |
| Suggest-next that spawns intake | Remove the Today and goal-complete entry. A direction library action “Start another direction” remains. |
| Header flame streak | Already gone in Phase 1. |

Keep:

- Topic Engine and decomposition.
- Spaced repetition, sessions, artifacts, evidence, resume parser, readiness, Stripe, operator console, demo reset.
- Entitlement keys during the billing fold, even if the pricing page shows two plans.

Exit: the reference walk is the only learner journey. Old URLs redirect. Pricing shows Free and one paid plan.

## Billing through the phases

Enforcement stays on the current keys until Phase 5.

| Plan key | Phase 1 public story | Phase 5 |
|---|---|---|
| `free` | One direction, the path, the daily session, a short proof record | Same. Limits stay in code. The page does not list AI-check counts. |
| `pro` | The paid record: more directions, full proof, voice, export | The only paid plan. Absorbs Sprint capabilities. |
| `sprint` | Hidden from the public pricing story, still honored for current subscribers | Mapped to `pro` (or the renamed paid plan). Key may remain internally for a release. |

Free must be a complete loop for one direction. The paid plan deepens the record. It does not unlock the basic session.

## Files this plan expects to touch

Phase 1: `App.tsx`, `Landing.tsx`, `Pricing.tsx`, `billingPlans.ts`, `Map.tsx`, `GoalDetail.tsx`, `History.tsx`, `Today.tsx`, `TargetRoleWorkspace.tsx` (copy only).

Phase 2: new page modules under `pages/` for Path, Proof, Voice, and the direction library; `ActiveRedirects.tsx`; `App.tsx` routes. Reuse `GoalDetail.tsx`, `Map.tsx`, resume pages, and mock page as components.

Phase 3: `Today.tsx`, `WeeklyCheckinModal.tsx`, `History.tsx`.

Phase 4: a migration under `packages/backend/src/db/migrations/`, artifact or evidence service, Proof and Voice reads.

Phase 5: route table in `routes/index.ts`, `App.tsx`, `billingPlans.ts`, redirects for retired URLs.

Leave untouched unless a bug blocks the walk: `topic-engine/`, decision-layer matching thresholds, auth, demo seed, operator pages.

## Out of scope

- New LLM features, prompts, or coaches.
- Rebuilding Topic Engine or moving its graph into Daily Push.
- Migrating old MySQL data.
- A job board or application autopilot.
- Rewriting the visual system. Use `PageHeader` and `SurfaceCard`. Pricing should join that system when its copy changes, so the paid page matches the app.
