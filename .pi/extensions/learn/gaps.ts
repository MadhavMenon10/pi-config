import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type LearnConfig, folderPath } from "./config.ts";
import { conceptStats, entriesForTopic, readLedger } from "./ledger.ts";
import { findTopic, loadTopics } from "./topics.ts";
import { daysSince } from "./vault.ts";

export function registerGapTools(pi: ExtensionAPI, config: LearnConfig): void {
  pi.registerTool({
    name: "learn_gaps",
    label: "Knowledge gaps",
    description: [
      "Aggregate the recall ledger into per-concept accuracy for one topic or across all",
      "topics: how often each concept was answered right, how often the learner said",
      "'I don't know', when it was last tested, and every question they got wrong.",
      "Use this as the evidence for a gap report — do not guess at what is weak.",
    ].join(" "),
    promptSnippet: "Aggregate answer history into per-concept accuracy and misses",
    promptGuidelines: [
      "Base every claim about a knowledge gap on learn_gaps output, never on impressions from the conversation.",
    ],
    parameters: Type.Object({
      topic: Type.Optional(
        Type.String({ description: "Topic slug or title. Omit for every topic." }),
      ),
      scope: StringEnum(["weak", "all"] as const),
    }),

    async execute(_toolCallId, params) {
      const ledger = readLedger(config);
      if (ledger.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "The recall ledger is empty — nothing has been quizzed yet. Run a checkpoint before reporting gaps.",
            },
          ],
          details: { concepts: [] },
        };
      }

      const topicNote = params.topic ? findTopic(config, params.topic) : null;
      if (params.topic && !topicNote) {
        throw new Error(`No cheatsheet matches "${params.topic}".`);
      }

      const entries = topicNote ? entriesForTopic(ledger, topicNote.topic) : ledger;
      if (entries.length === 0) {
        return {
          content: [
            { type: "text", text: `No answers recorded for "${topicNote?.topic}" yet.` },
          ],
          details: { concepts: [] },
        };
      }

      const stats = conceptStats(entries);
      const selected = params.scope === "all" ? stats : stats.filter((entry) => entry.weakness > 0.3);

      // Untested concepts are gaps too: declared on a cheatsheet, never asked.
      const declared = topicNote ? topicNote.concepts : loadTopics(config).flatMap((t) => t.concepts);
      const tested = new Set(stats.map((entry) => entry.concept));
      const untested = declared.filter((concept) => !tested.has(concept.id));

      const misses = entries
        .filter((entry) => entry.result === "incorrect" || entry.result === "unsure")
        .slice(-25)
        .map(
          (entry) =>
            `- [${entry.ts.slice(0, 10)}] \`${entry.concept}\` ${entry.result}: ${entry.question}` +
            (entry.chosen ? ` → picked "${entry.chosen}", answer was "${entry.answer}"` : "") +
            (entry.note ? ` (${entry.note})` : ""),
        );

      const rows = selected.map((entry) => {
        const age = daysSince(entry.lastSeen);
        return `- \`${entry.concept}\`: ${Math.round(entry.accuracy * 100)}% over ${entry.attempts} attempts (${entry.correct} right, ${entry.partial} partial, ${entry.unsure} unsure), last tested ${entry.lastSeen}${age === null ? "" : ` (${age}d ago)`}`;
      });

      const text = [
        topicNote ? `Topic: ${topicNote.topic} ("${topicNote.title}")` : "All topics",
        "",
        rows.length > 0 ? "Concept accuracy:" : "No concept is below the weakness bar.",
        ...rows,
        untested.length > 0
          ? `\nDeclared but never tested: ${untested.map((concept) => `\`${concept.id}\``).join(", ")}`
          : "",
        misses.length > 0 ? "\nRecent misses:" : "",
        ...misses,
        `\nWrite the report to ${config.root}/${config.folders.gaps}/.`,
      ]
        .filter((line) => line !== "")
        .join("\n");

      return {
        content: [{ type: "text", text }],
        details: {
          topic: topicNote?.topic,
          concepts: selected,
          untested,
          gapsFolder: folderPath(config, "gaps"),
        },
      };
    },
  });
}
