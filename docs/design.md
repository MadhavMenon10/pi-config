# Design notes

Why things are the way they are, mostly so future changes do not quietly undo
the reasons.

## The vault is the database

The schedule lives in each cheatsheet's frontmatter; the answer history is one
append-only JSONL file. No index, no sqlite, no sync layer.

This costs a little performance (every due-check re-reads the cheatsheets) and
buys three things worth more: the state is legible in Obsidian and queryable
with Dataview, it survives this tooling being deleted, and it merges sanely
when the vault syncs across machines. An append-only ledger is the only shape
that does not lose data when two devices write on the same day.

`updateFrontmatter` rewrites managed scalar keys line by line and leaves
everything else — including nested `tags:` lists — byte-identical. The
self-test pins this, because the failure mode is silently eating a user's
frontmatter.

## Quizzing goes through a tool, not through chat

A multiple-choice question printed as chat text is one you can answer after
seeing the options, argue with, or half-answer. The `quiz` tool takes the
question, the options and the key, shuffles the options, appends "I don't
know", blocks on a picker, grades deterministically and records the result.

Consequences that matter:

- The model cannot leak the answer by ordering (it does this constantly).
- The model cannot mark you right after the fact because you sounded confident.
- "I don't know" is a distinct signal from a wrong answer, so an unknown
  strand and a misconception get different treatment.
- Every answer lands in the ledger whether or not the session finishes.

## Scoring is code, judgement is the model's

The model decides what to ask, what an answer reveals, and what to teach next.
It does not decide whether the schedule advances. `review_close` reads what
actually happened from the ledger, applies SM-2, and writes the result.

The split is deliberate: an LLM asked "how did that go?" at the end of a
friendly session grades generously, and a spaced repetition schedule built on
generous grading decays into nothing.

## Concept ids are a contract

The `## Concepts` list in a cheatsheet is machine-readable on purpose. It is
the join key between three otherwise disconnected things: what the cheatsheet
covers, what the ledger records, and what a gap report names. Without it, "you
are weak at differential forms" is the best a report can do, which is not
actionable. With it, the report can say `wedge-product`, cite four attempts,
and point at a section.

Ids are frozen once quizzed. Renaming one orphans its history.

## Cold topics get re-taught first

Standard spaced repetition tests you and lets the failure be the lesson. That
works for atomic flashcards and fails for chapter-sized topics: three weeks
past due, you have not forgotten one fact, you have lost the spine, and being
asked six questions you cannot answer is slow and demoralising.

So `learn_due` marks a topic **cold** once it is well past its own interval,
and `/recall` re-teaches the spine — cheatsheet only, no new material — before
testing. The retrieval that follows is a real one.

## The plan is validated, not just drawn

`learn_plan` could have been a prompt instruction — "write a mermaid graph
before teaching". It is a tool that rejects bad graphs instead, because the
diagram is not really the point.

A dependency graph is a claim with structure: these are the steps, this is what
each rests on, this is where a person holding *that* can start. It is checkable
in a way prose is not, and the checks — dangling dependencies, cycles, no entry
point in held ground — are exactly the failures produced by a model that is
pattern-matching its way through a subject rather than reasoning about it.
Improvisation cannot pass, because improvisation is not having settled the
order yet.

`promoteReachable` is in code for the same reason. After each node locks, what
becomes reachable is derived from the graph, not re-asserted by the model, so
the plan cannot drift from what was actually taught.

The node table is parsed back out of the note, so the learner can edit it:
marking something `known` in Obsidian is a valid way to say "skip this, I have
it". The mermaid block is regenerated from the table, never the reverse.

## Recency-weighted concept accuracy

`conceptStats` weights the last six attempts on a linear ramp rather than
taking a lifetime average. A concept you got wrong three times in March and
right four times since should not still be reported as your weakest. The gap
report is meant to describe the present.

## Nothing is written until you learn something

The extension loads in every pi session, including ordinary coding ones. It
writes to the vault only when a learning tool is called, only under the
configured `Learning/` root, and never at all if the configured vault path does
not exist — a wrong path is reported, not materialised as a new folder tree.

## What is deliberately not here

- **No flashcard decks.** Questions are generated fresh from the cheatsheet
  each time. Fixed cards get memorised as cards; the point is to be able to
  answer a question you have not seen.
- **No auto-generated notes.** Compression is automated; the longform note is
  yours. Notes you did not write are notes you did not think through.
- **No cloud sync, no server.** The vault already syncs however you sync it.
