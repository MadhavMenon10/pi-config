# What survives compression

The cheatsheet is not a summary. A summary tells you what the chapter was
about; a cheatsheet is what you would want in front of you when you have to
*use* the material and cannot look anything up.

## Keep

1. **Load-bearing definitions.** Anything other items depend on. One line each,
   in the form that makes the dependency visible.
2. **The one-line why.** For every mechanism, the reason it works. A mechanism
   without its why is a fact you will lose in a week.
3. **Discriminators.** What separates two things that are easy to confuse.
   Highest value per word on the whole sheet — put them in a table.
4. **Formulas, with a symbol glossary.** A formula whose symbols you cannot
   name is not knowledge.
5. **One canonical worked pattern.** The shortest example that exercises the
   method end to end. One, not three.
6. **Traps.** Where this specific material breaks people: sign errors, order of
   quantifiers, an assumption that silently stops holding.
7. **Numbers that are load-bearing.** Constants and thresholds you actually
   reason with. Not every number in the chapter.

## Cut

- Motivation prose you have already internalised by reading it.
- Second and third examples of the same pattern.
- Anything you could re-derive in under ten seconds from something you kept.
- History, anecdote, and attribution — unless the story *is* the mnemonic.
- Hedging. Either it holds, it holds under stated conditions, or it is
  unverified and says so.
- Restating a heading as a sentence.

## Shape

Ordered so the sheet reads top-down as the topic's dependency order, not the
book's chapter order:

- `## Spine` — at most 7 lines. The claims everything else hangs off. If the
  spine needs more than 7, the cheatsheet covers two topics.
- `## Discriminators` — table: thing | thing | what actually separates them.
- `## Formulas` — expression, then what each symbol is, then when it applies.
- `## Worked pattern` — the canonical example, steps only.
- `## Traps` — one line each, phrased as the mistake, not the rule.
- `## Concepts` — the machine-readable list. Required.
- `## Unverified` — open questions and unconfirmed claims. Omit if empty.

Drop any section with nothing real to put in it. An empty heading is noise.

## Density rules

- Fragments over sentences. No "It is important to note that".
- Maths in `$...$` / `$$...$$` so Obsidian renders it.
- One idea per line. If a line has two clauses joined by "and", it is two lines
  or it is one idea badly stated.
- A line you cannot imagine being quizzed on does not belong on the sheet.

## Ratio

Target ≤ 25 % of source length; a chapter's spine usually lands near 10 %.
If you cannot get under the target without losing something load-bearing, the
unit is too big: split it and say which split you chose.
