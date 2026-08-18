import type { LearnConfig } from "./config.ts";
import { addDays, daysSince, today } from "./vault.ts";

export interface ReviewState {
  ease: number;
  interval: number;
  reps: number;
  lapses: number;
  lastQuizzed?: string;
  nextReview?: string;
  /** Exponentially weighted score in [0,1] across all past checkpoints. */
  mastery: number;
}

export interface ReviewUpdate extends ReviewState {
  passed: boolean;
  /** Days until the next review from today. */
  dueIn: number;
}

export function defaultState(config: LearnConfig): ReviewState {
  return {
    ease: config.scheduler.startingEase,
    interval: 0,
    reps: 0,
    lapses: 0,
    mastery: 0,
  };
}

export function stateFromFrontmatter(
  config: LearnConfig,
  frontmatter: Record<string, string>,
): ReviewState {
  const number = (key: string, fallback: number) => {
    const parsed = Number.parseFloat(frontmatter[key] ?? "");
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const base = defaultState(config);
  return {
    ease: number("ease", base.ease),
    interval: number("interval_days", base.interval),
    reps: number("reps", base.reps),
    lapses: number("lapses", base.lapses),
    mastery: number("mastery", base.mastery),
    lastQuizzed: frontmatter.last_quizzed,
    nextReview: frontmatter.next_review,
  };
}

export function stateToFrontmatter(state: ReviewState): Record<string, string | number> {
  return {
    ease: round(state.ease, 2),
    interval_days: state.interval,
    reps: state.reps,
    lapses: state.lapses,
    mastery: round(state.mastery, 2),
    last_quizzed: state.lastQuizzed ?? today(),
    next_review: state.nextReview ?? today(),
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * SM-2, with the session score standing in for the 0..5 recall grade. Passing
 * grows the interval by the ease factor; failing resets it to one day and
 * costs ease, so a topic you keep dropping keeps coming back.
 */
export function applyReview(
  config: LearnConfig,
  state: ReviewState,
  score: number,
): ReviewUpdate {
  const { scheduler } = config;
  const bounded = clamp(score, 0, 1);
  const quality = bounded * 5;
  const passed = bounded >= scheduler.passScore;

  const next: ReviewState = { ...state };
  next.mastery = state.reps === 0 ? bounded : round(0.6 * state.mastery + 0.4 * bounded, 4);

  if (passed) {
    next.reps = state.reps + 1;
    if (next.reps === 1) next.interval = scheduler.firstInterval;
    else if (next.reps === 2) next.interval = scheduler.secondInterval;
    else next.interval = Math.round(Math.max(1, state.interval) * state.ease);
  } else {
    next.reps = 0;
    next.lapses = state.lapses + 1;
    next.interval = scheduler.firstInterval;
  }

  const easeDelta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  next.ease = round(clamp(state.ease + easeDelta, scheduler.minEase, scheduler.maxEase), 2);
  next.interval = clamp(next.interval, 1, scheduler.maxInterval);
  next.lastQuizzed = today();
  next.nextReview = addDays(today(), next.interval);

  return { ...next, passed, dueIn: next.interval };
}

export type DueStatus = "overdue" | "due" | "upcoming" | "never";

export interface DueTopic {
  topic: string;
  title: string;
  path: string;
  status: DueStatus;
  /** Days past the due date (negative = days remaining). */
  overdueDays: number;
  /** Days since the last checkpoint, or null when never quizzed. */
  daysSinceQuiz: number | null;
  state: ReviewState;
  /** True when the gap since the last review is long enough to re-teach first. */
  cold: boolean;
}

export function classify(
  config: LearnConfig,
  topic: string,
  title: string,
  path: string,
  state: ReviewState,
  createdOrModified: string | null,
): DueTopic {
  const sinceQuiz = daysSince(state.lastQuizzed);
  const overdueDays = state.nextReview ? (daysSince(state.nextReview) ?? 0) : 0;

  let status: DueStatus;
  if (!state.lastQuizzed || !state.nextReview) {
    const age = daysSince(createdOrModified ?? undefined) ?? 0;
    status = age >= config.scheduler.unquizzedNudgeDays ? "never" : "upcoming";
  } else if (overdueDays > 0) status = "overdue";
  else if (overdueDays === 0) status = "due";
  else status = "upcoming";

  const cold =
    status === "overdue" &&
    state.interval > 0 &&
    overdueDays >= state.interval * (config.scheduler.coldFactor - 1);

  return {
    topic,
    title,
    path,
    status,
    overdueDays,
    daysSinceQuiz: sinceQuiz,
    state,
    cold: cold || status === "never",
  };
}
