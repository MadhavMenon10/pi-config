import { relative } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type LearnConfig, assertVault } from "./config.ts";
import { describeDue, summarizeDue, writeDashboard } from "./dashboard.ts";
import { conceptStats, entriesForTopic, readLedger, scoreOf } from "./ledger.ts";
import type { SessionLog } from "./mdlog.ts";
import { applyReview, stateFromFrontmatter, stateToFrontmatter } from "./scheduler.ts";
import { actionable, dueTopics, findTopic } from "./topics.ts";
import { updateFrontmatter } from "./vault.ts";

export interface ReviewDeps {
  config: LearnConfig;
  log: SessionLog;
  sessionId: () => string | undefined;
  sessionStart: () => string;
}

export function registerReview(pi: ExtensionAPI, deps: ReviewDeps): void {
  const { config, log } = deps;

  pi.registerTool({
    name: "learn_due",
    label: "Due topics",
    description: [
      "List topics whose spaced review is due, overdue, or never done, with how long it",
      "has been and how solid they were last time. Call this at the start of a review",
      "session, and whenever the learner asks what they should study.",
    ].join(" "),
    promptSnippet: "List topics whose spaced review is due or overdue",
    promptGuidelines: [
      "Call learn_due before starting a spaced review so you review what is actually cold, not what is convenient.",
    ],
    parameters: Type.Object({
      scope: StringEnum(["due", "all"] as const),
    }),

    async execute(_toolCallId, params) {
      const all = dueTopics(config);
      const list = params.scope === "all" ? all : actionable(all);
      if (list.length === 0) {
        return {
          content: [
            {
              type: "text",
              text:
                all.length === 0
                  ? `No cheatsheets found in ${config.root}/${config.folders.cheatsheets}. Make one with the cheatsheet skill first.`
                  : "Nothing is due. Say so, and offer either new material or a stretch question on the weakest concept.",
            },
          ],
          details: { topics: [] },
        };
      }

      const lines = list.map((entry) => {
        const bits = [
          `${entry.topic} ("${entry.title}") — ${describeDue(entry)}`,
          `interval ${entry.state.interval}d`,
          `ease ${entry.state.ease}`,
          `mastery ${Math.round(entry.state.mastery * 100)}%`,
        ];
        if (entry.cold) bits.push("COLD: re-teach the spine before quizzing");
        return `- ${bits.join(", ")}`;
      });

      const weak = conceptStats(readLedger(config))
        .filter((entry) => entry.attempts >= 2 && entry.weakness > 0.3)
        .slice(0, 8)
        .map((entry) => `${entry.concept} (${Math.round(entry.accuracy * 100)}%)`);

      return {
        content: [
          {
            type: "text",
            text: [
              lines.join("\n"),
              weak.length > 0 ? `\nWeakest concepts overall: ${weak.join(", ")}.` : "",
            ]
              .join("\n")
              .trim(),
          },
        ],
        details: { topics: list },
      };
    },
  });

  pi.registerTool({
    name: "review_close",
    label: "Close review",
    description: [
      "Close out a checkpoint or review for one topic. Scores every answer recorded for",
      "that topic during this session, applies the spaced-repetition schedule, and writes",
      "the result into the cheatsheet's frontmatter. Call this once per topic at the end",
      "of a checkpoint or review — the schedule does not advance until you do.",
    ].join(" "),
    promptSnippet: "Score this session's answers for a topic and schedule the next review",
    promptGuidelines: [
      "Call review_close once per topic before ending a checkpoint or review session, otherwise nothing is rescheduled.",
    ],
    parameters: Type.Object({
      topic: Type.String({ description: "Topic slug or cheatsheet title." }),
      note: Type.Optional(
        Type.String({ description: "One line for the session log: what locked, what did not." }),
      ),
    }),

    async execute(_toolCallId, params) {
      assertVault(config);
      const topicNote = findTopic(config, params.topic);
      if (!topicNote) {
        throw new Error(
          `No cheatsheet found for "${params.topic}" in ${config.root}/${config.folders.cheatsheets}. Create one before closing a review.`,
        );
      }

      const answers = entriesForTopic(readLedger(config), topicNote.topic).filter(
        (entry) => entry.ts >= deps.sessionStart(),
      );
      if (answers.length === 0) {
        throw new Error(
          `No answers recorded for "${topicNote.topic}" in this session. Ask questions with quiz or recall_free first.`,
        );
      }

      const score = scoreOf(answers);
      const state = stateFromFrontmatter(config, topicNote.note.frontmatter);
      const updated = applyReview(config, state, score);
      updateFrontmatter(topicNote.path, {
        topic: topicNote.topic,
        ...stateToFrontmatter(updated),
      });

      const missed = conceptStats(answers)
        .filter((entry) => entry.weakness > 0.3)
        .map((entry) => entry.concept);

      log.append(
        [
          `### Review closed — ${topicNote.title}`,
          "",
          `- Score: **${Math.round(score * 100)}%** over ${answers.length} answers`,
          `- Next review: **${updated.nextReview}** (in ${updated.dueIn}d)`,
          missed.length > 0 ? `- Still shaky: ${missed.map((id) => `\`${id}\``).join(", ")}` : "- Nothing flagged as shaky",
          params.note ? `\n${params.note}` : "",
        ]
          .join("\n")
          .trimEnd(),
      );
      writeDashboard(config);

      return {
        content: [
          {
            type: "text",
            text: [
              `Scored ${Math.round(score * 100)}% over ${answers.length} answers (${updated.passed ? "pass" : "fail"}).`,
              `Next review ${updated.nextReview}, interval ${updated.dueIn}d, ease ${updated.ease}.`,
              missed.length > 0
                ? `Still weak: ${missed.join(", ")}. Tell them exactly what to reread or practise for these.`
                : "No concept fell below the bar.",
            ].join(" "),
          },
        ],
        details: { topic: topicNote.topic, score, ...updated, weak: missed },
      };
    },
  });

  pi.registerCommand("due", {
    description: "Show topics due for review and refresh the learning dashboard",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const topics = dueTopics(config);
      const live = actionable(topics);
      const path = writeDashboard(config);
      if (live.length === 0) {
        ctx.ui.notify(`Nothing due. Dashboard refreshed: ${relative(config.vault, path)}`, "info");
        return;
      }
      ctx.ui.notify(summarizeDue(topics), live.some((e) => e.status === "overdue") ? "warning" : "info");
      ctx.ui.setWidget(
        "learn",
        live.slice(0, 8).map((entry) => `  ${entry.title} — ${describeDue(entry)}`),
      );
    },
  });
}
