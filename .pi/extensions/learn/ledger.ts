import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { type LearnConfig, ledgerPath } from "./config.ts";
import { appendToNote, ensureDir } from "./vault.ts";

export type RecallMode = "probe" | "lockin" | "checkpoint" | "review";
export type RecallResult = "correct" | "partial" | "incorrect" | "unsure";

export interface RecallEntry {
  /** ISO timestamp. */
  ts: string;
  /** Topic slug — matches the cheatsheet's `topic` frontmatter. */
  topic: string;
  /** Concept id from the cheatsheet's `## Concepts` list. */
  concept: string;
  mode: RecallMode;
  kind: "mcq" | "free";
  result: RecallResult;
  question: string;
  chosen?: string;
  answer?: string;
  /** Free-recall text, or the grader's one-line note. */
  note?: string;
  /** Milliseconds spent on the question. */
  ms?: number;
  session?: string;
}

export interface ConceptStats {
  concept: string;
  attempts: number;
  correct: number;
  partial: number;
  unsure: number;
  lastSeen: string;
  lastResult: RecallResult;
  /** Recency-weighted accuracy in [0,1]. */
  accuracy: number;
  /** 0 = solid, 1 = never got it right. */
  weakness: number;
}

const RESULT_CREDIT: Record<RecallResult, number> = {
  correct: 1,
  partial: 0.5,
  incorrect: 0,
  unsure: 0,
};

/** How many of the most recent attempts dominate the accuracy estimate. */
const RECENCY_WINDOW = 6;

export function appendRecall(config: LearnConfig, entry: RecallEntry): void {
  const path = ledgerPath(config);
  ensureDir(dirname(path));
  appendToNote(path, `${JSON.stringify(entry)}\n`);
}

export function readLedger(config: LearnConfig): RecallEntry[] {
  const path = ledgerPath(config);
  if (!existsSync(path)) return [];
  const out: RecallEntry[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const parsed = JSON.parse(trimmed) as RecallEntry;
      if (parsed && typeof parsed.topic === "string") out.push(parsed);
    } catch {
      // Skip a torn line rather than losing the whole history.
    }
  }
  return out;
}

export function entriesForTopic(entries: RecallEntry[], topic: string): RecallEntry[] {
  return entries.filter((entry) => entry.topic === topic);
}

/**
 * Per-concept mastery. Recent attempts count more than old ones, so a concept
 * you have since fixed stops being reported as a gap.
 */
export function conceptStats(entries: RecallEntry[]): ConceptStats[] {
  const byConcept = new Map<string, RecallEntry[]>();
  for (const entry of entries) {
    const key = entry.concept || "(unassigned)";
    const bucket = byConcept.get(key);
    if (bucket) bucket.push(entry);
    else byConcept.set(key, [entry]);
  }

  const stats: ConceptStats[] = [];
  for (const [concept, all] of byConcept) {
    const ordered = [...all].sort((a, b) => a.ts.localeCompare(b.ts));
    const recent = ordered.slice(-RECENCY_WINDOW);

    let weighted = 0;
    let weightTotal = 0;
    recent.forEach((entry, index) => {
      // Linear ramp: oldest in the window counts 1, newest counts RECENCY_WINDOW.
      const weight = index + 1;
      weighted += RESULT_CREDIT[entry.result] * weight;
      weightTotal += weight;
    });
    const accuracy = weightTotal === 0 ? 0 : weighted / weightTotal;
    const unsure = ordered.filter((entry) => entry.result === "unsure").length;

    stats.push({
      concept,
      attempts: ordered.length,
      correct: ordered.filter((entry) => entry.result === "correct").length,
      partial: ordered.filter((entry) => entry.result === "partial").length,
      unsure,
      lastSeen: ordered[ordered.length - 1].ts.slice(0, 10),
      lastResult: ordered[ordered.length - 1].result,
      accuracy,
      weakness: Math.min(1, 1 - accuracy + 0.15 * (unsure / ordered.length)),
    });
  }

  return stats.sort((a, b) => b.weakness - a.weakness || a.concept.localeCompare(b.concept));
}

/** Fraction of credit earned across a set of answers. */
export function scoreOf(entries: RecallEntry[]): number {
  if (entries.length === 0) return 0;
  const total = entries.reduce((sum, entry) => sum + RESULT_CREDIT[entry.result], 0);
  return total / entries.length;
}

export function topics(entries: RecallEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.topic))].sort();
}
