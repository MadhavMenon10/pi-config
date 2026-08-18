---
name: gaps
description: >
  Turn answer history into a ranked knowledge-gap report — what is weak, why it
  is weak, and the exact next thing to read or practise. Use when the user runs
  /gaps or /skill:gaps, or asks what am I weak at, where are my gaps, what
  should I study next, or why do I keep getting this wrong.
metadata:
  requires: learn_gaps
  writes: Learning/Gaps
---

# Gaps

A gap report is only useful if it ends in an action. "Review integration" is
not an action. "Redo example 3.4 without looking at the solution, then explain
why the sign flips" is.

## Rules

- Evidence comes from `learn_gaps`, never from your impression of the
  conversation. If it is not in the ledger, it is not a finding.
- A concept with one attempt is not a gap, it is a data point. Say so.
- Rank by cost, not by score: a weak concept that three other concepts depend
  on outranks a weak leaf.
- Never pad the list. Three real gaps beat eleven observations.

## Process

1. Call `learn_gaps` (a topic if the user named one, otherwise all topics).
2. For each weak concept, diagnose which kind of gap it is — the fix differs:

   | Kind | What it looks like | Fix |
   |---|---|---|
   | Missing prerequisite | Wrong on this *and* on what it rests on | Go down a level, learn that first |
   | Shaky detail | Right on the idea, wrong on a condition, sign, or edge case | One targeted drill |
   | Terminology | Right reasoning, wrong name, or mixes two names | A discriminator line on the cheatsheet |
   | Procedure | Knows what it means, cannot execute it | Worked examples, timed |
   | Never tested | On the cheatsheet, no attempts | Just quiz it — unknown, not weak |

3. Where several gaps sit on one chain, say so and name the root. Fixing the
   root usually clears the rest; grinding the leaves does not.
4. Write the report to `Learning/Gaps/<Topic>.md`, overwriting the previous one
   (the ledger is the history; the report is the current picture):

```markdown
---
type: gap-report
topic: <slug>
updated: <YYYY-MM-DD>
tags:
  - learning/gaps
---

# Gaps — <Title>

> [!warning] Start here
> <the single highest-value thing to do next, in one sentence>

## 1. `<concept-id>` — <kind of gap>

- **Evidence:** 1/4 correct, 2 "I don't know", last tested <date>
- **What is actually missing:** <the specific thing, not the topic name>
- **Do this:** <one concrete action with a location>

## Solid

<concepts at or above the bar — name them, so effort stops going here>

## Untested

<declared on the cheatsheet, never asked>
```

5. Report back in three lines and offer to act on the top gap now:
   - **shaky detail, terminology, procedure** → run the drill immediately.
   - **missing prerequisite** → offer the `teach` skill on that prerequisite.
     A drill on a step whose foundation is missing is wasted effort; the
     teaching loop will probe, plan it as a graph, and build up to it.

   Do not restate the file into chat — it is in the vault, linked from the
   dashboard.
