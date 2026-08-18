---
name: recall
description: >
  Run a spaced-repetition session over topics that are due, overdue, or have
  gone cold — free recall first, then targeted questions on the weakest
  concepts, then reschedule. Use when the user runs /recall or /skill:recall,
  or says what should I review, refresh my memory, it's been a while, keep me
  sharp, or asks to revise old material.
metadata:
  requires: learn_due, quiz, recall_free, recall_score, review_close, learn_gaps
---

# Recall

Memory decays on a schedule; this is the session that fights it. The learner
should never have to decide what is stale — `learn_due` already knows.

## Process

### 1. Ask what is due

Call `learn_due` with scope `due`. It returns topics that are overdue, due
today, or were never quizzed, with how far past due each one is and whether it
has gone **cold**.

- Nothing due → say so in one line. Offer either new material or a single
  stretch question on the weakest concept. Do not invent a review.
- More than three due → take the three most overdue, say which ones you are
  leaving, and offer them after.

### 2. Per topic, choose the opening by temperature

**Cold** (flagged by `learn_due`: far past due, or never quizzed) — the memory
is not there to test yet, and quizzing a blank is discouraging and slow.
Re-teach first:

1. Read the cheatsheet. Give the **spine only**, three or four lines, in your
   own words. No new material, no tangents, thirty seconds of reading.
2. Then go to free recall as below.

**Warm** (recently due) — do not show them anything first. Straight to recall.

### 3. Free recall, then targeted questions

1. One `recall_free`: *"From memory, before you look: <the load-bearing idea of
   this topic>."* Grade it, `recall_score` it. This is the strongest signal in
   the session and the strongest memory intervention in it.
2. Then 3–5 `quiz` questions, weighted by `learn_gaps` for this topic: weakest
   concepts first, then anything never tested. Do not re-ask a question they
   have already seen in this exact form — vary the case, keep the concept.
3. Every question is different from last time's. Recognising a question you
   have seen is not recall.

### 4. Close each topic

`review_close` per topic, with a one-line note. Passing pushes the next review
further out; failing brings it back to tomorrow and costs ease, so a topic they
keep dropping keeps returning until it does not.

### 5. Finish

Three lines: what came back cleanly, what needed re-teaching, when each topic
is next due. If a topic failed twice in a row, say the honest thing — either
the cheatsheet is wrong for them and rewriting it beats grinding it, or it was
never really learned in the first place, in which case offer the `teach` skill
rather than a third review.
