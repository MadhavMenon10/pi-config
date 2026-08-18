---
name: cheatsheet
description: >
  Compress longform reading notes into a dense, Obsidian-ready cheatsheet with
  a machine-readable concept list, so the topic becomes quizzable and
  schedulable. Use when the user runs /cheatsheet or /skill:cheatsheet, or says
  compress these notes, make a cheatsheet, summarise this chapter, condense my
  notes, or turn my reading notes into something I can revise from.
metadata:
  reads: Learning/Sources
  writes: Learning/Cheatsheets
---

# Cheatsheet

Turn one longform source note into one cheatsheet. The cheatsheet is the unit
everything else runs on: `checkpoint` quizzes it, `recall` schedules it,
`learn_gaps` reports against its concept ids.

Read [references/compression.md](references/compression.md) before writing
anything. The template is [assets/cheatsheet.md](assets/cheatsheet.md).

## 1. Find the source

- An argument that names a note, a chapter, or a file → find it under
  `Learning/Sources/` (search the vault; do not ask if a `read` would answer).
- Pasted text or an open note → use that.
- Nothing to go on → ask which note, once, and stop.

Read `Learning/LEARNER.md` if it exists. It tells you what this person already
holds, so you can cut what is already theirs rather than restating it.

## 2. Decide the unit

One cheatsheet = one thing you would sit an exam on: a chapter, a section, a
self-contained topic. If the source spans two unrelated spines, make two
cheatsheets and say so. **Never** shrink text to fit — split instead.

## 3. Compress

Apply the keep/cut rules in `references/compression.md`. Target: **≤ 25 % of
the source's length**, and short enough to read in one sitting.

Every line must be traceable to the source. Where the source gives a location,
carry it (`p. 84`, `§3.2`). If you add something the source does not contain
— context, a connection, a correction — mark it `(added)` and run it past
`verify` first.

## 4. Write the note

Path: `Learning/Cheatsheets/<Title>.md`. Follow the template exactly; the
frontmatter and the `## Concepts` list are a contract with the tooling:

- `type: cheatsheet` and `topic: <slug>` — `topic` is the id used in the recall
  ledger. Kebab-case, stable, never renamed after the first quiz.
- `source:` — a wikilink back to the longform note. The cheatsheet is the
  compressed view, not a replacement; the source stays.
- `created:` — today, so an unquizzed cheatsheet starts showing up as due.
- Do not write `next_review`, `ease`, `interval_days`, `reps`, `lapses` or
  `mastery` by hand. `review_close` owns those.

`## Concepts` lists every idea worth testing separately, one per line, exactly:

```
- `concept-id` — one clause saying what it is
```

Between 4 and 12 for a chapter. These ids are what `quiz` records against and
what gap reports name, so make them the real joints of the topic, not headings.

## 5. Verify before you commit it

Run the `verify` skill over the claims that carry weight. Anything you could
not confirm goes under `## Unverified` with a specific question, not a hedge
buried in a sentence. A cheatsheet the learner has to second-guess costs more
than it saves — that is the whole point of engineering trust into the system.

## 6. Hand back

Report in three lines: where it is, the compression ratio, and the concept ids.
Then offer the next step — `/checkpoint <topic>` when they have finished the
chapter.
