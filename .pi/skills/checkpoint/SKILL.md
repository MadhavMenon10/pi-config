---
name: checkpoint
description: >
  Run an end-of-chapter checkpoint: graded questions through the quiz picker,
  free recall, a score, a knowledge-gap readout, and the next spaced review
  scheduled into the cheatsheet. Use when the user runs /checkpoint or
  /skill:checkpoint, or says quiz me, test me on this chapter, I've finished
  the chapter, check if I actually understood this, or examine me.
metadata:
  requires: quiz, recall_free, recall_score, review_close, learn_gaps
---

# Checkpoint

The learner has finished a chapter. Find out what actually stuck, tell them
the truth about it, and schedule the next look.

You absorb the logistics — what to ask, in what order, what it means, when it
comes back. They spend everything they have on the material.

## Hard rules

- **Every graded question goes through `quiz`.** Never write A/B/C/D as chat
  text. The picker grades, shuffles, and records; chat does not, and answering
  in chat lets them bluff themselves.
- One question per `quiz` call. Wait for the result before choosing the next.
- Never reveal the answer in the stem or in the option wording.
- Distractors are diagnostic: each wrong option is a specific misconception a
  real reader holds. If you cannot say which misconception an option catches,
  it is filler — replace it.
- Do not teach during the probe. Measure first, explain after.
- `review_close` at the end, or nothing gets scheduled and the session is lost.

## Process

### 1. Load

Resolve the topic to its cheatsheet (the argument may be a slug, a title, or a
chapter name). Read the cheatsheet and, if the questions need detail it does
not carry, the source note. Call `learn_gaps` for this topic — if there is
history, it tells you what was shaky last time, and those concepts get asked
first.

If no cheatsheet exists, say so and offer `/cheatsheet` instead. Do not quiz
from the source note alone: the concept ids are what make the results mean
anything later.

### 2. Open with free recall

One `recall_free` question before any multiple choice:

> Without looking: what does this chapter let you do, and what are the moving
> parts?

Production before recognition. Grade it, call `recall_score`, and use what is
missing to aim the rest of the checkpoint. If they produce nothing, say so
plainly and drop to the spine.

### 3. Probe, broad to narrow

6–12 `quiz` questions. Start with one question per concept in the cheatsheet's
`## Concepts` list — that is the coverage pass. Then binary-search: a wrong or
unsure answer means the next question moves *down* to whatever it rests on; a
right answer moves *up* to something that uses it.

Mix the kinds:

- **State it** — can they say what a thing is. Cheapest, use sparingly.
- **Apply it** — a small case they have to run the method on. The bulk.
- **Discriminate** — two neighbouring ideas, which one is this. Highest signal.
- **Transfer** — one case the chapter did not cover. Reserve for the end; this
  is what separates understanding from memorising.

An "I don't know" is a clean unknown, not a wrong answer. Never punish it, and
never ask the same question again straight after — go to the prerequisite.

### 4. Close

- `review_close` with the topic and a one-line note. It scores the session,
  applies the schedule, and writes the next review date into the cheatsheet.
- If anything came out weak, run the `gaps` skill for this topic.
- Then give them, in under ten lines:
  - the score and what it means,
  - what is solid — name it, so they stop worrying about it,
  - what is not, with **the exact place to go back to** (section, page,
    worked example), not "review the material",
  - one thing to do before the next review.

## When they are wrong

Do not explain everything they missed at the end. After a wrong answer on a
concept the chapter depends on, stop the probe and fix it: one reasoning step,
then re-ask a different question on the same concept. A checkpoint that only
measures is half a checkpoint.

If the miss turns out to rest on something further down — they are not missing
this idea, they are missing what it stands on — do not patch it inside the
checkpoint. Finish the measurement, then offer the `teach` skill on the
prerequisite: it will probe properly and plan the way up as a graph.
