/**
 * Eval runner — execute against all ground-truth fixtures and report scores.
 *
 * Usage:
 *   npx tsx evals/runner.ts
 *   npx tsx evals/runner.ts --fixture node-event-loop    # run a single fixture
 *   npx tsx evals/runner.ts --provider openai --model gpt-4o
 */

import 'dotenv/config';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { TopicEngine } from '../packages/core/src/engine/TopicEngine';
import { score, type GroundTruth } from './scorer';
import type { RouterConfig } from '../packages/core/src/llm/types';

const GROUND_TRUTH_DIR = path.join(__dirname, 'ground-truth');

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag: string): string | undefined => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
};

const fixtureFilter = getArg('--fixture');
const provider = getArg('--provider') ?? 'anthropic';
const model = getArg('--model') ?? 'claude-opus-4-6';
const skipValidation = args.includes('--skip-validation');
const skipCritique = args.includes('--skip-critique');
const skipTopology = args.includes('--skip-topology');

// ── Router config ─────────────────────────────────────────────────────────────
const routerOverrides: Partial<RouterConfig> = {
  decomposition: { provider: provider as never, model },
};

// ── Load fixtures ─────────────────────────────────────────────────────────────
async function loadFixtures(): Promise<GroundTruth[]> {
  const files = await readdir(GROUND_TRUTH_DIR);
  const jsonFiles = files.filter(
    (f) => f.endsWith('.json') && (!fixtureFilter || f.startsWith(fixtureFilter))
  );

  const fixtures = await Promise.all(
    jsonFiles.map(async (f) => {
      const raw = await readFile(path.join(GROUND_TRUTH_DIR, f), 'utf-8');
      return JSON.parse(raw) as GroundTruth;
    })
  );

  return fixtures;
}

// ── Run ───────────────────────────────────────────────────────────────────────
async function main() {
  const fixtures = await loadFixtures();
  if (fixtures.length === 0) {
    console.error(`No fixtures found${fixtureFilter ? ` matching "${fixtureFilter}"` : ''}`);
    process.exit(1);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Topic Engine — Eval Runner`);
  console.log(`  Provider: ${provider} / ${model}`);
  console.log(`  Fixtures: ${fixtures.length}`);
  console.log(`${'═'.repeat(60)}\n`);

  const engine = new TopicEngine(routerOverrides);
  const results: Array<{ fixture: GroundTruth; scoreBreakdown: ReturnType<typeof score>; durationMs: number }> = [];

  for (const fixture of fixtures) {
    process.stdout.write(`▶ ${fixture.id} ... `);

    const t = Date.now();
    try {
      const result = await engine.run({
        topic: fixture.topic,
        userInput: fixture.userInput,
        skipValidation,
        skipCritique,
        skipTopology,
      });
      const durationMs = Date.now() - t;

      const breakdown = score(result, fixture);
      results.push({ fixture, scoreBreakdown: breakdown, durationMs });

      const statusIcon = breakdown.passed ? '✓' : '✗';
      console.log(`${statusIcon}  ${breakdown.total}/100  (${(durationMs / 1000).toFixed(1)}s)`);

      if (breakdown.failures.length > 0) {
        for (const f of breakdown.failures) {
          console.log(`   ⚠  ${f}`);
        }
      }

      // Log detail
      console.log(
        `   nodes=${result.graph.nodes.length} edges=${result.graph.edges.length}` +
        ` warnings=${result.warnings.length}`
      );
      if (result.critiqueRounds.length > 0) {
        const rounds = result.critiqueRounds
          .map((r) => `round${r.roundNumber}:${r.quality}(${r.operationsApplied}ops)`)
          .join(' ');
        console.log(`   critique: ${rounds}`);
      }
      if (result.analytics) {
        const { criticalPathMins, fastTrack, thoroughTrack, communities } = result.analytics;
        console.log(
          `   topology: criticalPath=${criticalPathMins}min` +
          ` fast=${fastTrack.totalMins}min(${fastTrack.nodes.length}n)` +
          ` thorough=${thoroughTrack.totalMins}min(${thoroughTrack.nodes.length}n)` +
          ` communities=${communities.length}`
        );
      }
      console.log(`   timings: ${JSON.stringify(result.timings)}`);

    } catch (err) {
      const durationMs = Date.now() - t;
      console.log(`✗  ERROR (${(durationMs / 1000).toFixed(1)}s)`);
      console.error(`   ${String(err)}`);
      results.push({
        fixture,
        scoreBreakdown: {
          total: 0, intentScore: 0, nodeScore: 0, edgeTypeScore: 0,
          graphScore: 0, validationScore: 0, passed: false,
          failures: [String(err)],
        },
        durationMs,
      });
    }

    console.log();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.scoreBreakdown.passed).length;
  const avgScore = Math.round(
    results.reduce((s, r) => s + r.scoreBreakdown.total, 0) / results.length
  );

  console.log('═'.repeat(60));
  console.log(`  Results: ${passed}/${results.length} passed   avg score: ${avgScore}/100`);
  console.log('═'.repeat(60));

  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
