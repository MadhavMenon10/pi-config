# pi-config

Pi configuration for an Obsidian-based learning workflow: reading notes →
cheatsheets → graded checkpoints → spaced recall → knowledge-gap reports.

## Layout

| Path | What it is |
|---|---|
| `.pi/extensions/learn/` | The extension: `quiz`, `recall_free`, `recall_score`, `learn_plan`, `learn_plan_update`, `learn_due`, `review_close`, `learn_gaps`, and the `/due` `/log` `/learn` `/learn-init` commands |
| `.pi/skills/` | `teach`, `cheatsheet`, `checkpoint`, `recall`, `gaps`, `verify` |
| `.pi/prompts/` | Short aliases: `/teach` `/plan` `/cheatsheet` `/checkpoint` `/recall` `/gaps` |
| `.pi/learn.example.json` | Config template. The real one is `.pi/learn.json` (gitignored) or `~/.pi/agent/learn.json` |
| `docs/` | `workflow.md` (how to use it), `design.md` (why it is like this) |

## Working on this repo

- `npm test` runs `.pi/extensions/learn/selftest.ts` with node's type stripping.
  No pi runtime, no npm install. Add a case there for anything that touches
  frontmatter, the ledger, or the schedule — those are the parts whose failure
  modes are silent.
- Extension modules import `@earendil-works/pi-coding-agent` (types only),
  `typebox`, and `@earendil-works/pi-ai`; pi provides them at runtime. Keep the
  pure modules — `config`, `vault`, `ledger`, `scheduler`, `topics`,
  `dashboard`, `plan` — free of those imports so the self-test stays
  dependency-free. Tool registration lives beside them in `*-tools.ts`.
- Relative imports carry the `.ts` extension. Keep it that way.

## Invariants worth not breaking

- `updateFrontmatter` must leave unmanaged frontmatter keys and nested lists
  untouched. It edits a user's vault.
- The scheduling fields (`ease`, `interval_days`, `reps`, `lapses`,
  `last_quizzed`, `next_review`, `mastery`) are owned by `review_close`. Nothing
  else writes them, including skills.
- Grading and scheduling stay in code. The model chooses questions; it does not
  decide whether a review passed.
- Concept ids in a cheatsheet's `## Concepts` list are the join key between
  cheatsheets, the ledger, and gap reports. Renaming one orphans its history.
- `validatePlan` is a gate, not a linter: a plan with a dangling dependency, a
  cycle, or no entry point in held ground must be rejected and nothing written.
  Weakening it turns the DAG back into decoration.
- A plan note's `## Nodes` table is the state and the learner may edit it; the
  mermaid block is regenerated from the table, never the reverse. Content below
  the table is preserved verbatim.
- Never write outside the configured vault's learning root, and never write at
  all when the vault path does not exist.
