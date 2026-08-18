import { existsSync } from "node:fs";
import { basename, relative } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { folderPath, learnPath, loadConfig, vaultExists } from "./config.ts";
import { summarizeDue, writeDashboard } from "./dashboard.ts";
import { registerGapTools } from "./gaps.ts";
import { conceptStats, readLedger } from "./ledger.ts";
import { SessionLog, renderMessage } from "./mdlog.ts";
import { registerQuizTools } from "./quiz.ts";
import { registerReview } from "./review.ts";
import { actionable, dueTopics } from "./topics.ts";
import { ensureDir, writeNote } from "./vault.ts";

const learnerTemplate = () => `---
type: learner-profile
updated: ${new Date().toISOString().slice(0, 10)}
---

# Learner profile

What the teaching system should assume about me, so it stops re-teaching what I
already hold and stops starting above my head. Keep it short and keep it true.

## Solid ground

- <fields, courses, or books I have genuinely worked through>

## Shaky

- <things I have seen but would not trust myself on>

## Notation and conventions

- <the notation I think in, and any conventions I want used>

## How I learn best

- <e.g. concrete example before the general statement; derivations, not results>

## Current goal

- <what I am working towards right now, and by when>
`;

/**
 * Obsidian learning workflow for pi.
 *
 *   quiz / recall_free / recall_score  — graded questions, answered in a picker
 *   learn_due / review_close           — spaced repetition over cheatsheets
 *   learn_gaps                         — per-concept accuracy from the ledger
 *   /due  /log  /learn                 — commands
 *
 * Configure the vault in .pi/learn.json. See docs/workflow.md.
 */
export default function (pi: ExtensionAPI) {
  const config = loadConfig(process.cwd());
  const log = new SessionLog(config);
  let sessionStart = new Date().toISOString();
  let sessionId: string | undefined;
  let hinted = false;

  const deps = {
    config,
    log,
    sessionId: () => sessionId,
    // Read lazily: /new mid-run starts a fresh session, and review_close must
    // score that session's answers, not the whole process lifetime.
    sessionStart: () => sessionStart,
  };

  registerQuizTools(pi, deps);
  registerReview(pi, deps);
  registerGapTools(pi, config);

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    const file = ctx.sessionManager.getSessionFile();
    sessionId = file ? basename(file) : undefined;
    sessionStart = new Date().toISOString();

    if (!config.configured) {
      if (!hinted && ctx.hasUI) {
        hinted = true;
        ctx.ui.notify(
          "learn: no .pi/learn.json — copy .pi/learn.example.json and set your vault path.",
          "info",
        );
      }
      return;
    }

    // Never create a vault that is not there: a wrong path should be reported,
    // not silently materialised as a new folder tree.
    if (!vaultExists(config)) {
      if (!hinted && ctx.hasUI) {
        hinted = true;
        ctx.ui.notify(`learn: vault not found at ${config.vault} — fix "vault" in learn.json.`, "warning");
      }
      return;
    }

    const topics = dueTopics(config);
    const live = actionable(topics);
    if (config.dashboardOnStart) {
      try {
        writeDashboard(config);
      } catch (error) {
        console.error(`[learn] dashboard: ${(error as Error).message}`);
      }
    }
    if (!ctx.hasUI || live.length === 0) return;

    const overdue = live.filter((entry) => entry.status === "overdue");
    ctx.ui.setWidget("learn", [
      `  review: ${summarizeDue(topics)} — /recall`,
      ...live.slice(0, 5).map((entry) => `    ${entry.title}${entry.cold ? " (cold)" : ""}`),
    ]);
    if (overdue.length > 0) {
      const worst = Math.max(...overdue.map((entry) => entry.overdueDays));
      ctx.ui.notify(`${overdue.length} topic(s) overdue, worst by ${worst} days. Run /recall.`, "warning");
    }
  });

  // Mirror the conversation into the Obsidian session note once one is open.
  pi.on("message_end", async (event) => {
    if (!log.isOpen()) return;
    const rendered = renderMessage((event as { message?: unknown }).message);
    if (rendered) log.append(rendered);
  });

  pi.registerCommand("log", {
    description: "Mirror this session into an Obsidian note (default: today's session note)",
    handler: async (args: string, ctx: ExtensionContext) => {
      const target = args.trim();
      const path = target === "" ? log.ensure("session") : log.open(target);
      if (path === "") {
        ctx.ui.notify("learn: autoLogSessions is off in learn.json", "warning");
        return;
      }
      log.backfill(ctx.sessionManager.getEntries() as Array<{ type?: string; message?: unknown }>);
      ctx.ui.notify(`Logging to ${relative(config.vault, path)}`, "info");
    },
  });

  pi.registerCommand("learn", {
    description: "Show learning system status: vault, due topics, weakest concepts",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const topics = dueTopics(config);
      const weak = conceptStats(readLedger(config))
        .filter((entry) => entry.attempts >= 2 && entry.weakness > 0.3)
        .slice(0, 5);
      ctx.ui.setWidget("learn", [
        `  vault    ${config.vault}${config.configured ? "" : "  (defaulted — no learn.json)"}`,
        `  topics   ${topics.length} cheatsheet(s), ${summarizeDue(topics)}`,
        `  log      ${log.getPath() ? relative(config.vault, log.getPath() as string) : "not started"}`,
        ...(weak.length > 0
          ? [`  weakest  ${weak.map((entry) => `${entry.concept} ${Math.round(entry.accuracy * 100)}%`).join(", ")}`]
          : []),
      ]);
    },
  });

  pi.registerCommand("learn-init", {
    description: "Create the learning folder structure in the configured vault",
    handler: async (_args: string, ctx: ExtensionContext) => {
      if (!vaultExists(config)) {
        ctx.ui.notify(
          `learn: vault not found at ${config.vault}. Set "vault" in .pi/learn.json first.`,
          "error",
        );
        return;
      }
      for (const kind of ["sources", "cheatsheets", "maps", "sessions", "gaps"] as const) {
        ensureDir(folderPath(config, kind));
      }
      const learner = learnPath(config, "LEARNER.md");
      if (!existsSync(learner)) writeNote(learner, learnerTemplate());
      const path = writeDashboard(config);
      ctx.ui.notify(
        `Learning folders ready under ${config.vault}/${config.root}. Dashboard: ${relative(config.vault, path)}`,
        "info",
      );
    },
  });
}
