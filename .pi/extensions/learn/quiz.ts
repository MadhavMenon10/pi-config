import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type LearnConfig, assertVault } from "./config.ts";
import { type RecallEntry, type RecallMode, appendRecall } from "./ledger.ts";
import type { SessionLog } from "./mdlog.ts";
import { findTopic } from "./topics.ts";
import { slugify } from "./vault.ts";

const DONT_KNOW = "I don't know";
const EXPLAIN = "Explain it in my own words instead";

/** Dialogs are modal — serialise them so parallel tool calls cannot collide. */
let dialogChain: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = dialogChain.then(task, task) as Promise<T>;
  dialogChain = run.catch(() => undefined);
  return run;
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function questionHeading(index: number | null, concept: string, mode: string): string {
  const label = index === null ? "Q" : `Q${index}`;
  return `#### ${label} · \`${concept}\` · ${mode}`;
}

export interface QuizDeps {
  config: LearnConfig;
  log: SessionLog;
  sessionId: () => string | undefined;
}

export function registerQuizTools(pi: ExtensionAPI, deps: QuizDeps): void {
  const { config, log } = deps;
  let asked = 0;

  pi.registerTool({
    name: "quiz",
    label: "Quiz",
    description: [
      "Ask the learner ONE graded multiple-choice question and wait for their answer.",
      "The harness shuffles the options, appends an 'I don't know' choice, grades the",
      "answer against `answer`, records it in the recall ledger, and returns what they",
      "picked. Never print A/B/C/D options in chat — always ask through this tool.",
      "Use 3 plausible options: distractors must be wrong for a reason worth knowing.",
    ].join(" "),
    promptSnippet: "Ask one graded multiple-choice question through the interactive picker",
    promptGuidelines: [
      "Use quiz for every graded question. Never write multiple-choice options as chat text.",
      "Call quiz once per question and wait for the result before asking the next one.",
    ],
    parameters: Type.Object({
      topic: Type.String({
        description: "Topic slug or cheatsheet title this question belongs to.",
      }),
      concept: Type.String({
        description: "Concept id from the cheatsheet's ## Concepts list, e.g. wedge-product.",
      }),
      question: Type.String({ description: "The question stem. LaTeX allowed ($...$)." }),
      options: Type.Array(Type.String(), {
        minItems: 2,
        maxItems: 5,
        description: "Answer choices, exactly one correct. Do not add 'I don't know' yourself.",
      }),
      answer: Type.Integer({
        minimum: 0,
        description: "0-based index into options of the correct choice.",
      }),
      mode: StringEnum(["probe", "lockin", "checkpoint", "review"] as const),
      explanation: Type.Optional(
        Type.String({ description: "One line shown after answering, outside probe mode." }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        throw new Error(
          "quiz needs an interactive session. Run pi in TUI mode, or ask the question in chat.",
        );
      }
      assertVault(config);
      if (params.answer < 0 || params.answer >= params.options.length) {
        throw new Error(
          `answer index ${params.answer} is outside options (0..${params.options.length - 1}).`,
        );
      }
      // Grading matches on the option text, so the options must be distinct and
      // must not collide with the two choices the picker appends itself.
      const trimmed = params.options.map((option: string) => option.trim());
      if (trimmed.some((option) => option === "")) {
        throw new Error("Options cannot be blank.");
      }
      if (new Set(trimmed).size !== trimmed.length) {
        throw new Error("Options must be distinct — two identical choices cannot be graded.");
      }
      if (trimmed.some((option) => option === DONT_KNOW || option === EXPLAIN)) {
        throw new Error(
          `"${DONT_KNOW}" and "${EXPLAIN}" are added by the picker — do not include them in options.`,
        );
      }

      const topicNote = findTopic(config, params.topic);
      const topic = topicNote?.topic ?? slugify(params.topic);
      const concept = slugify(params.concept) || "unassigned";
      const known = topicNote?.concepts.some((entry) => entry.id === concept) ?? true;
      const mode = params.mode as RecallMode;
      const reveal = mode !== "probe" || config.revealDuringProbe;

      log.ensure(topicNote?.title ?? params.topic);
      log.backfill(ctx.sessionManager.getEntries() as Array<{ type?: string; message?: unknown }>);

      const correctText = trimmed[params.answer];
      const shuffled = shuffle(trimmed);
      const choices = [...shuffled, DONT_KNOW, EXPLAIN];

      asked += 1;
      const index = asked;
      log.append(
        [
          questionHeading(index, concept, mode),
          "",
          params.question,
          "",
          ...shuffled.map((option) => `- ${option}`),
        ].join("\n"),
      );

      const started = Date.now();
      const picked = (await serialize(() => ctx.ui.select(params.question, choices))) as
        | string
        | undefined;
      const ms = Date.now() - started;

      if (picked === undefined) {
        log.append("_Skipped._");
        return {
          content: [
            {
              type: "text",
              text: "The learner dismissed the question. Ask what they want to do instead; do not score it.",
            },
          ],
          details: { skipped: true },
        };
      }

      if (picked === EXPLAIN) {
        const typed = (await serialize(() =>
          ctx.ui.input("Answer in your own words:", "explain your reasoning"),
        )) as string | undefined;
        const text = (typed ?? "").trim();
        log.append(`> [!quote] Your answer\n> ${text.split("\n").join("\n> ") || "(blank)"}`);
        return {
          content: [
            {
              type: "text",
              text: [
                `The learner chose to answer freely instead of picking an option.`,
                `Their answer: ${text || "(they typed nothing)"}`,
                `The correct option was: ${correctText}`,
                `Grade it, tell them where they were right and where they were off,`,
                `then log it with recall_score (topic "${topic}", concept "${concept}").`,
              ].join(" "),
            },
          ],
          details: { free: true, topic, concept, text, correct: correctText },
        };
      }

      const isDontKnow = picked === DONT_KNOW;
      const result: RecallEntry["result"] = isDontKnow
        ? "unsure"
        : picked === correctText
          ? "correct"
          : "incorrect";

      const entry: RecallEntry = {
        ts: new Date().toISOString(),
        topic,
        concept,
        mode,
        kind: "mcq",
        result,
        question: params.question,
        chosen: isDontKnow ? undefined : picked,
        answer: correctText,
        ms,
        session: deps.sessionId(),
      };
      appendRecall(config, entry);

      const seconds = Math.round(ms / 1000);
      if (reveal) {
        ctx.ui.notify(
          result === "correct" ? `Correct (${seconds}s)` : `Not quite — ${correctText}`,
          result === "correct" ? "info" : "warning",
        );
        log.append(
          [
            result === "correct"
              ? `**Your answer:** ${picked} — correct (${seconds}s)`
              : isDontKnow
                ? `**Your answer:** I don't know. Correct answer: ${correctText}`
                : `**Your answer:** ${picked} — not quite. Correct answer: ${correctText}`,
            params.explanation ? `\n${params.explanation}` : "",
          ]
            .join("\n")
            .trimEnd(),
        );
      } else {
        log.append(`**Your answer:** ${isDontKnow ? "I don't know" : picked} _(${seconds}s)_`);
      }

      const lines = [
        `Result: ${result}.`,
        isDontKnow
          ? "They said they don't know — treat this strand as unknown, not as a wrong guess."
          : `They picked: ${picked}. Correct answer: ${correctText}.`,
        `Time: ${seconds}s.`,
        `Logged to the recall ledger under topic "${topic}", concept "${concept}".`,
      ];
      if (!known) {
        lines.push(
          `Note: "${concept}" is not in the cheatsheet's ## Concepts list. Either use an existing concept id or add this one to the cheatsheet.`,
        );
      }
      if (!reveal) lines.push("Probe mode: the correct answer was not shown to them.");

      return { content: [{ type: "text", text: lines.join(" ") }], details: entry };
    },
  });

  pi.registerTool({
    name: "recall_free",
    label: "Free recall",
    description: [
      "Ask an open, no-options recall question and capture what the learner types from",
      "memory. Stronger than multiple choice: use it to open a review, and whenever you",
      "want to see whether they can produce the idea rather than recognise it.",
      "Grade the answer yourself afterwards and log it with recall_score.",
    ].join(" "),
    promptSnippet: "Ask an open free-recall question and capture the typed answer",
    promptGuidelines: [
      "Open every spaced review with recall_free before any multiple choice, so recall is production, not recognition.",
      "After recall_free, always grade the answer and call recall_score to record it.",
    ],
    parameters: Type.Object({
      topic: Type.String({ description: "Topic slug or cheatsheet title." }),
      concept: Type.String({ description: "Concept id being probed." }),
      prompt: Type.String({ description: "What to recall, e.g. 'State Stokes' theorem and say what each symbol is.'" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) throw new Error("recall_free needs an interactive session.");
      assertVault(config);

      const topicNote = findTopic(config, params.topic);
      const topic = topicNote?.topic ?? slugify(params.topic);
      const concept = slugify(params.concept) || "unassigned";

      log.ensure(topicNote?.title ?? params.topic);
      log.append([`#### Free recall · \`${concept}\``, "", params.prompt].join("\n"));

      const typed = (await serialize(() => ctx.ui.editor(params.prompt, ""))) as string | undefined;
      const text = (typed ?? "").trim();
      if (text === "") {
        log.append("_Blank — nothing recalled._");
        return {
          content: [
            {
              type: "text",
              text: `They produced nothing for "${concept}". Treat it as a blank: re-teach the idea in one step, then re-quiz. Log it with recall_score as incorrect.`,
            },
          ],
          details: { topic, concept, text: "" },
        };
      }

      log.append(`> [!quote] From memory\n> ${text.split("\n").join("\n> ")}`);
      return {
        content: [
          {
            type: "text",
            text: [
              `Free recall for topic "${topic}", concept "${concept}":`,
              text,
              "---",
              "Grade this: what is right, what is missing, what is wrong. Then call recall_score with correct | partial | incorrect.",
            ].join("\n"),
          },
        ],
        details: { topic, concept, text },
      };
    },
  });

  pi.registerTool({
    name: "recall_score",
    label: "Record recall",
    description: [
      "Record the grade for a free-recall answer (or a written answer the learner gave",
      "in chat) in the recall ledger. Multiple-choice answers asked through quiz are",
      "already recorded — do not log those twice.",
    ].join(" "),
    promptSnippet: "Record the grade for a free-recall or written answer",
    parameters: Type.Object({
      topic: Type.String(),
      concept: Type.String(),
      result: StringEnum(["correct", "partial", "incorrect", "unsure"] as const),
      mode: StringEnum(["probe", "lockin", "checkpoint", "review"] as const),
      question: Type.String({ description: "What was asked." }),
      note: Type.Optional(
        Type.String({ description: "One line: what was missing or wrong. Kept for gap analysis." }),
      ),
    }),

    async execute(_toolCallId, params) {
      assertVault(config);
      const topicNote = findTopic(config, params.topic);
      const entry: RecallEntry = {
        ts: new Date().toISOString(),
        topic: topicNote?.topic ?? slugify(params.topic),
        concept: slugify(params.concept) || "unassigned",
        mode: params.mode as RecallMode,
        kind: "free",
        result: params.result,
        question: params.question,
        note: params.note,
        session: deps.sessionId(),
      };
      appendRecall(config, entry);
      if (params.note) log.append(`> [!info] Graded ${params.result}\n> ${params.note}`);
      return {
        content: [
          { type: "text", text: `Recorded ${params.result} for ${entry.topic} / ${entry.concept}.` },
        ],
        details: entry,
      };
    },
  });
}
