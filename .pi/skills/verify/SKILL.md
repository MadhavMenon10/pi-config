---
name: verify
description: >
  Fact-check claims before they go into a cheatsheet or a lesson, and mark
  what could not be confirmed. Use when the user runs /verify or /skill:verify,
  before writing a cheatsheet, when asked is this right, check this, or is that
  actually true, and whenever you are about to teach a claim you are unsure of.
---

# Verify

Trust in this system is not earned over years — it is engineered. Two reasons
it matters, and the second is the one people forget:

1. Wrong information is worse than no information.
2. A learner who half-trusts the source hedges, and hedging costs the
   attention that should be going into the material. A cheatsheet you have to
   second-guess is more expensive than no cheatsheet.

## Sort the claims first

Not everything needs checking. Sort, then spend effort where it changes:

- **Definitional** — true by convention within the source's framework. Check it
  matches *the source's* convention, since conventions differ between books.
  Flag it when the source's convention is not the common one.
- **Derivable** — follows from something already on the sheet. Check it by
  deriving it, not by searching.
- **Empirical or numeric** — dates, constants, measurements, results. These get
  checked against a source. Highest hallucination risk on this list.
- **Attributed** — "X proved", "the Y theorem", "according to Z". Check the
  attribution, not just the statement. Misattribution is the most common
  quiet error, and the most embarrassing to carry for a year.

## Check

- Use whatever search or fetch capability this session has. If it has none, say
  so rather than pretending to have checked.
- Two independent sources for anything empirical that matters. One source is a
  claim; two agreeing is evidence.
- **Never invent a citation.** No plausible-looking page numbers, no
  half-remembered paper titles. A wrong citation is worse than none, because it
  looks checkable and is not.
- When the source note and an outside source disagree, do not silently pick.
  Say both, and say which the topic will use.

## Report

Per claim, one of:

- **Confirmed** — with where.
- **Confirmed with a caveat** — holds under a condition the source left out.
  Name the condition; this is usually the most valuable output of a check.
- **Could not confirm** — with the specific question that would settle it.
- **Wrong** — with the correction and where the error came from.

Anything not confirmed goes into the cheatsheet's `## Unverified` section as a
question, never as a softened sentence in the body. The reader must be able to
tell at a glance which lines they can take at face value. That is the whole
purpose of the section.
