import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

/**
 * Configuration for the learning system. Everything is optional; the defaults
 * assume the Obsidian vault is the current working directory.
 *
 * Looked up in this order (first hit wins):
 *   1. $LEARN_CONFIG              (explicit path to a JSON file)
 *   2. <cwd>/.pi/learn.json       (project)
 *   3. ~/.pi/agent/learn.json     (global)
 *
 * $LEARN_VAULT always overrides the `vault` field.
 */
export interface LearnConfig {
  /** Absolute path to the Obsidian vault. */
  vault: string;
  /** Folder inside the vault that holds everything this system writes. */
  root: string;
  folders: {
    sources: string;
    cheatsheets: string;
    maps: string;
    sessions: string;
    gaps: string;
  };
  /** Where the append-only recall ledger lives, relative to `root`. */
  stateDir: string;
  /** Dashboard note, relative to `root`. */
  dashboard: string;
  scheduler: {
    /** Interval (days) after the first successful checkpoint. */
    firstInterval: number;
    /** Interval (days) after the second successful checkpoint. */
    secondInterval: number;
    /** Starting ease factor (SM-2). */
    startingEase: number;
    minEase: number;
    maxEase: number;
    /** Never schedule further out than this. */
    maxInterval: number;
    /** Score (0..1) at or above which a review counts as a pass. */
    passScore: number;
    /**
     * A topic is "cold" once it is this many times past its interval — cold
     * topics get a re-teach before they get quizzed.
     */
    coldFactor: number;
    /** Topics never quizzed are nudged after this many days. */
    unquizzedNudgeDays: number;
  };
  /** Reveal correct/incorrect in the picker during the probe phase. */
  revealDuringProbe: boolean;
  /** Rewrite the dashboard note whenever a session starts. */
  dashboardOnStart: boolean;
  /** Mirror learning sessions into <root>/<sessions> as Markdown. */
  autoLogSessions: boolean;
  /** True when an actual learn.json was found (vs. pure defaults). */
  configured: boolean;
  /** Path of the config file that was loaded, for diagnostics. */
  sourcePath?: string;
}

const DEFAULTS: LearnConfig = {
  vault: "",
  root: "Learning",
  folders: {
    sources: "Sources",
    cheatsheets: "Cheatsheets",
    maps: "Maps",
    sessions: "Sessions",
    gaps: "Gaps",
  },
  stateDir: ".state",
  dashboard: "Dashboard.md",
  scheduler: {
    firstInterval: 1,
    secondInterval: 3,
    startingEase: 2.5,
    minEase: 1.3,
    maxEase: 2.8,
    maxInterval: 180,
    passScore: 0.7,
    coldFactor: 2,
    unquizzedNudgeDays: 3,
  },
  revealDuringProbe: false,
  dashboardOnStart: true,
  autoLogSessions: true,
  configured: false,
};

function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Shallow-by-section merge: only keys present in `patch` override defaults. */
function merge<T>(base: T, patch: unknown): T {
  if (!isRecord(patch)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    out[key] = isRecord(current) && isRecord(value) ? merge(current, value) : value;
  }
  return out as T;
}

function candidatePaths(cwd: string): string[] {
  const paths: string[] = [];
  if (process.env.LEARN_CONFIG) paths.push(expandHome(process.env.LEARN_CONFIG));
  paths.push(join(cwd, ".pi", "learn.json"));
  paths.push(join(homedir(), ".pi", "agent", "learn.json"));
  return paths;
}

export function loadConfig(cwd: string): LearnConfig {
  let config: LearnConfig = { ...DEFAULTS, vault: cwd };

  for (const path of candidatePaths(cwd)) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      config = merge(config, parsed);
      config.configured = true;
      config.sourcePath = path;
    } catch (error) {
      // A broken config should not take the whole agent down.
      console.error(`[learn] could not parse ${path}: ${(error as Error).message}`);
    }
    break;
  }

  if (process.env.LEARN_VAULT) config.vault = process.env.LEARN_VAULT;

  const vault = expandHome(config.vault || cwd);
  config.vault = isAbsolute(vault) ? vault : resolve(cwd, vault);
  return config;
}

/** Absolute path inside the vault's learning root. */
export function learnPath(config: LearnConfig, ...segments: string[]): string {
  return join(config.vault, config.root, ...segments);
}

export function folderPath(
  config: LearnConfig,
  kind: keyof LearnConfig["folders"],
  ...segments: string[]
): string {
  return learnPath(config, config.folders[kind], ...segments);
}

export function ledgerPath(config: LearnConfig): string {
  return learnPath(config, config.stateDir, "recall.jsonl");
}

export function dashboardPath(config: LearnConfig): string {
  return learnPath(config, config.dashboard);
}

/** True when the configured vault actually exists on disk. */
export function vaultExists(config: LearnConfig): boolean {
  return existsSync(config.vault);
}

/** Guard for anything that writes: refuse to conjure a vault at a wrong path. */
export function assertVault(config: LearnConfig): void {
  if (!vaultExists(config)) {
    throw new Error(
      `Obsidian vault not found at ${config.vault}. Copy .pi/learn.example.json to .pi/learn.json and set "vault" (or set $LEARN_VAULT).`,
    );
  }
}
