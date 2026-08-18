/**
 * Self-test for the parts of the learning system that must be deterministic:
 * config loading, frontmatter round-tripping, the recall ledger, the spaced
 * repetition schedule, and the dashboard.
 *
 *   node --experimental-strip-types .pi/extensions/learn/selftest.ts
 *
 * Only pure modules are exercised, so it needs no pi runtime and no npm install.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { renderDashboard, summarizeDue } from "./dashboard.ts";
import { appendRecall, conceptStats, readLedger, scoreOf } from "./ledger.ts";
import { applyReview, stateFromFrontmatter, stateToFrontmatter } from "./scheduler.ts";
import { dueTopics, findTopic } from "./topics.ts";
import { addDays, readNote, today, updateFrontmatter } from "./vault.ts";

const vault = mkdtempSync(join(tmpdir(), "learn-selftest-"));
mkdirSync(join(vault, "Learning", "Cheatsheets"), { recursive: true });
writeFileSync(join(vault, "learn.json"), JSON.stringify({ vault, root: "Learning" }));
process.env.LEARN_CONFIG = join(vault, "learn.json");
process.env.LEARN_VAULT = vault;

const sheet = join(vault, "Learning", "Cheatsheets", "Differential Forms.md");
writeFileSync(
  sheet,
  `---
type: cheatsheet
topic: differential-forms
source: "[[Sources/Differential Forms]]"
created: ${addDays(today(), -30)}
last_quizzed: ${addDays(today(), -20)}
next_review: ${addDays(today(), -12)}
ease: 2.5
interval_days: 4
reps: 2
lapses: 0
mastery: 0.6
tags:
  - learning/cheatsheet
  - math
---

# Differential Forms

## Concepts

- \`covector\` — a linear machine that eats a vector and returns a number
- \`wedge-product\` — antisymmetric bilinear product of forms
- \`exterior-derivative\` — d, generalising grad, curl and div
`,
);
writeFileSync(
  join(vault, "Learning", "Cheatsheets", "Fresh Topic.md"),
  `---\ntype: cheatsheet\ntopic: fresh-topic\ncreated: ${addDays(today(), -9)}\n---\n\n# Fresh Topic\n\n## Concepts\n\n- \`alpha\` — first idea\n`,
);

const config = loadConfig(vault);
assert.equal(config.configured, true, "learn.json should be picked up");
assert.equal(config.vault, vault);

const topic = findTopic(config, "Differential Forms");
assert.ok(topic, "cheatsheet lookup by title");
assert.equal(topic.topic, "differential-forms");
assert.deepEqual(
  topic.concepts.map((concept) => concept.id),
  ["covector", "wedge-product", "exterior-derivative"],
);
assert.ok(findTopic(config, "differential-forms"), "lookup by slug");

const due = dueTopics(config);
const overdue = due.find((entry) => entry.topic === "differential-forms");
assert.equal(overdue?.status, "overdue");
assert.equal(overdue?.overdueDays, 12);
assert.equal(overdue?.cold, true, "12 days past a 4 day interval is cold");
assert.equal(due.find((entry) => entry.topic === "fresh-topic")?.status, "never");
assert.match(summarizeDue(due), /overdue/);

for (const [concept, result] of [
  ["covector", "correct"],
  ["wedge-product", "incorrect"],
  ["wedge-product", "unsure"],
  ["exterior-derivative", "correct"],
  ["covector", "correct"],
] as const) {
  appendRecall(config, {
    ts: new Date().toISOString(),
    topic: "differential-forms",
    concept,
    mode: "checkpoint",
    kind: "mcq",
    result,
    question: `question about ${concept}`,
  });
}

const ledger = readLedger(config);
assert.equal(ledger.length, 5);
assert.equal(Number(scoreOf(ledger).toFixed(2)), 0.6);

const stats = conceptStats(ledger);
assert.equal(stats[0].concept, "wedge-product", "weakest concept sorts first");
assert.equal(stats[0].accuracy, 0);
assert.equal(stats.find((entry) => entry.concept === "covector")?.accuracy, 1);

const state = stateFromFrontmatter(config, readNote(sheet)!.frontmatter);
assert.equal(state.interval, 4);
assert.equal(state.ease, 2.5);

const failed = applyReview(config, state, 0.6);
assert.equal(failed.passed, false, "0.6 is below the 0.7 pass mark");
assert.equal(failed.interval, 1, "a failed review comes back tomorrow");
assert.equal(failed.lapses, 1);
assert.ok(failed.ease < state.ease, "failing costs ease");

const passed = applyReview(config, state, 0.9);
assert.equal(passed.passed, true);
assert.equal(passed.interval, Math.round(4 * 2.5), "passing multiplies by ease");
assert.equal(passed.nextReview, addDays(today(), passed.interval));

const capped = applyReview(config, { ...state, interval: 500, reps: 9 }, 1);
assert.equal(capped.interval, config.scheduler.maxInterval, "intervals stay capped");

updateFrontmatter(sheet, { topic: "differential-forms", ...stateToFrontmatter(passed) });
const after = readNote(sheet)!;
assert.equal(after.frontmatter.next_review, passed.nextReview);
assert.equal(after.frontmatter.source, "[[Sources/Differential Forms]]", "unmanaged keys survive");
assert.ok(
  after.frontmatterLines.some((line) => line.trim() === "- math"),
  "nested tag lists survive",
);
assert.ok(after.body.includes("wedge-product"), "body survives");

const dashboard = renderDashboard(config);
assert.ok(dashboard.includes("[[Learning/Cheatsheets/Differential Forms|Differential Forms]]"));
assert.ok(dashboard.includes("## Never quizzed"));
assert.ok(dashboard.includes("`wedge-product`"), "weak concepts are listed");

console.log(`ok — learning system self-test passed (${vault})`);
