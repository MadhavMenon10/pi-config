# The workflow

The system has four moments. You only ever have to know which one you are in.

## 1. While reading — write badly, at length

Take notes in `Learning/Sources/` however you like: messy, longform,
half-sentences, quotes with page numbers, questions you could not answer. Do
not try to make them good. Compression is the machine's job, and notes written
for compression are worse notes for thinking.

Two things earn their keep here:

- **Page or section references.** They are what make a gap report say "redo
  §4.3 example 2" instead of "review the chapter".
- **Your confusions, written down as questions.** They are the highest-value
  input the system gets — they mark the edge of your understanding directly,
  without anyone having to probe for it.

## 2. After a section — `/cheatsheet`

```
/cheatsheet Chapter 4 — Differential Forms
```

Produces `Learning/Cheatsheets/<Title>.md`: the spine, the discriminators, the
formulas with a symbol glossary, one worked pattern, the traps — and a
`## Concepts` list of kebab-case ids that everything downstream refers to.

Read it once. If a line is wrong or a concept is missing, fix it now — you are
the only one who knows what you meant. Anything the agent could not confirm is
under `## Unverified`, phrased as a question rather than hedged into a
sentence, so you can tell at a glance which lines you can take at face value.

One cheatsheet is one exam-sized unit. If a chapter has two unrelated spines,
you get two cheatsheets, and that is correct: the schedule tracks them
separately because you will forget them separately.

## 3. After the chapter — `/checkpoint`

```
/checkpoint differential-forms
```

- Opens with **free recall** — an empty box and a question. Production, not
  recognition; this is the hardest and most useful minute of the session.
- Then graded multiple choice, one question at a time, in a picker. Options
  are shuffled, "I don't know" is always there, and the answer is not shown
  until you have committed.
- Wrong answers steer the next question *down* to what they rest on; right
  answers steer *up*. That is how it finds the edge instead of sampling
  uniformly.
- Ends with a score, what is solid, what is not, and where to go back to.

The schedule only moves when the checkpoint closes. If you abandon halfway,
nothing is scheduled — the answers are still in the ledger, but the topic stays
due, which is the honest outcome.

## 4. When it has been a while — `/recall`

You do not have to remember to do this. Every pi session, in any directory,
checks what is due and tells you:

```
⚠ 2 topic(s) overdue, worst by 11 days. Run /recall.
```

`/recall` takes the most overdue topics and, per topic:

- **Cold** (far past due, or never quizzed): three or four lines of spine
  first, from the cheatsheet, no new material. Then recall. Testing a blank
  wastes the session; refreshing first turns it into a real retrieval.
- **Warm**: nothing shown first. Straight into recall.

Then targeted questions weighted toward the concepts you have actually been
missing, and a `review_close` that pushes the topic out or pulls it back in.

## Between the four — `/gaps`

```
/gaps                 # everything
/gaps differential-forms
```

Reads the ledger, not the conversation, and ranks what is weak by what it
unblocks. Each gap names which *kind* it is — missing prerequisite, shaky
detail, terminology, procedure — because the fix differs, and ends in one
action with a location.

## What gets written where

| You write | The system writes |
|---|---|
| `Sources/` — longform notes | `Cheatsheets/` — compressed, with the schedule in frontmatter |
| `LEARNER.md` — what you already hold | `Sessions/` — every learning session, LaTeX rendered |
| corrections to any of it | `Gaps/` — current gap reports |
| | `Dashboard.md` — what is due, what is weak |
| | `.state/recall.jsonl` — append-only answer history |

The session log is created lazily: an ordinary coding session in pi never
touches the vault. The first quiz question opens one and backfills the
conversation so far, which is also how the maths ends up rendered — pi's
terminal LaTeX is fine, Obsidian's is better.

## Habits that make it work

- **Answer honestly.** "I don't know" is recorded as an unknown, not a wrong
  answer, and it aims the next question at the thing you are actually missing.
  Guessing right corrupts the schedule and you will pay for it in a month.
- **Do not skip the free recall.** It is the part that works.
- **Fix the cheatsheet when it is wrong.** It is the trusted artefact; a
  cheatsheet you half-believe costs more attention than no cheatsheet.
- **Let overdue mean overdue.** If a topic keeps failing, the honest reading is
  usually that the cheatsheet is wrong for you, not that you are bad at it.
  Rewrite it and start the schedule again.
