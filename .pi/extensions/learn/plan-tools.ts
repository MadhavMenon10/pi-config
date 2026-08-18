import { relative } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type LearnConfig, assertVault } from "./config.ts";
import type { SessionLog } from "./mdlog.ts";
import {
  NODE_STATUSES,
  type Plan,
  type PlanNode,
  nextTeachable,
  progressLine,
  promoteReachable,
  readPlan,
  renderMermaid,
  validatePlan,
  writePlan,
} from "./plan.ts";
import { findTopic } from "./topics.ts";
import { slugify } from "./vault.ts";

export interface PlanDeps {
  config: LearnConfig;
  log: SessionLog;
}

function issuesToError(prefix: string, errors: string[]): Error {
  return new Error(
    `${prefix}\n- ${errors.join("\n- ")}\nFix the graph and call the tool again; nothing was written.`,
  );
}

function summarize(config: LearnConfig, plan: Plan, path: string, warnings: string[]): string {
  const next = nextTeachable(plan);
  return [
    `Plan written to ${relative(config.vault, path)} (${progressLine(plan)}).`,
    next
      ? `Next teachable node: \`${next.id}\` — ${next.label}.`
      : "Every node is locked or already known.",
    warnings.length > 0 ? `Warnings:\n- ${warnings.join("\n- ")}` : "",
    "Show the learner the graph and pause before teaching.",
  ]
    .filter((line) => line !== "")
    .join(" ");
}

export function registerPlanTools(pi: ExtensionAPI, deps: PlanDeps): void {
  const { config, log } = deps;

  pi.registerTool({
    name: "learn_plan",
    label: "Plan",
    description: [
      "Write the teaching plan as a dependency graph and render it as a mermaid diagram",
      "in the vault. Each node is ONE reasoning step, not a chapter, and says what the",
      "learner can do once it lands. The graph is validated: every dependency must name a",
      "real node, cycles are rejected, and at least one node must be teachable from what",
      "they already hold. Call this after probing and before teaching anything.",
    ].join(" "),
    promptSnippet: "Write and validate the teaching plan as a mermaid dependency graph",
    promptGuidelines: [
      "Call learn_plan after probing and before teaching. Show the graph and pause; do not teach from an unwritten plan.",
      "Nodes in learn_plan are single reasoning steps, and every node's dependencies must already be in the graph.",
    ],
    parameters: Type.Object({
      topic: Type.String({ description: "Topic slug this plan belongs to." }),
      title: Type.Optional(Type.String({ description: "Human title. Defaults to the topic." })),
      goal: Type.String({ description: "What the learner will be able to do at the end. One sentence." }),
      nodes: Type.Array(
        Type.Object({
          id: Type.String({ description: "Kebab-case id, e.g. wedge-product." }),
          label: Type.String({ description: "What this step gives them. One clause." }),
          status: StringEnum(NODE_STATUSES as unknown as readonly string[]),
          rests_on: Type.Array(Type.String(), {
            description: "Ids this step rests on. Must already be nodes in this plan.",
          }),
        }),
        { minItems: 1, maxItems: 24 },
      ),
    }),

    async execute(_toolCallId, params) {
      assertVault(config);
      const known = findTopic(config, params.topic);
      const topic = known?.topic ?? slugify(params.topic);
      const nodes: PlanNode[] = params.nodes.map(
        (node: { id: string; label: string; status: string; rests_on: string[] }) => ({
          id: slugify(node.id),
          label: node.label.trim(),
          status: node.status as PlanNode["status"],
          deps: node.rests_on.map((dep: string) => slugify(dep)),
        }),
      );

      const existing = readPlan(config, topic, params.title ?? known?.title);
      const plan: Plan = {
        topic,
        title: params.title ?? known?.title ?? params.topic,
        goal: params.goal,
        nodes,
        tail: existing?.tail ?? "",
      };

      const issues = validatePlan(plan);
      if (issues.errors.length > 0) {
        throw issuesToError("The plan does not hold together:", issues.errors);
      }

      const promoted = promoteReachable(plan);
      const path = writePlan(config, promoted);
      log.ensure(promoted.title);
      log.append([`### Plan — ${promoted.title}`, "", `**Goal:** ${promoted.goal}`, "", renderMermaid(promoted)].join("\n"));

      return {
        content: [{ type: "text", text: summarize(config, promoted, path, issues.warnings) }],
        details: { path, topic, nodes: promoted.nodes },
      };
    },
  });

  pi.registerTool({
    name: "learn_plan_update",
    label: "Update plan",
    description: [
      "Move the teaching plan on: mark a node locked after its quiz passes, mark the one",
      "you are on as teaching, or insert a prerequisite when a lock-in quiz fails. The",
      "graph, the diagram and the progress count are rewritten from the result, and",
      "anything that has become reachable is promoted automatically.",
    ].join(" "),
    promptSnippet: "Mark a plan node taught, or insert a prerequisite after a failed quiz",
    promptGuidelines: [
      "After every lock-in quiz, call learn_plan_update: locked on a pass, insert_prerequisite on a fail.",
    ],
    parameters: Type.Object({
      topic: Type.String(),
      node: Type.String({
        description: "The node to update, or the node that needs a prerequisite inserted before it.",
      }),
      action: StringEnum(["set_status", "insert_prerequisite"] as const),
      status: Type.Optional(StringEnum(NODE_STATUSES as unknown as readonly string[])),
      prerequisite_id: Type.Optional(Type.String({ description: "Kebab-case id for the new step." })),
      prerequisite_label: Type.Optional(
        Type.String({ description: "What the new step gives them. One clause." }),
      ),
    }),

    async execute(_toolCallId, params) {
      assertVault(config);
      const known = findTopic(config, params.topic);
      const topic = known?.topic ?? slugify(params.topic);
      const plan = readPlan(config, topic, known?.title);
      if (!plan) {
        throw new Error(`No plan found for "${params.topic}". Call learn_plan first.`);
      }

      const nodeId = slugify(params.node);
      const target = plan.nodes.find((node) => node.id === nodeId);
      if (!target) {
        throw new Error(
          `\`${nodeId}\` is not in the plan. Nodes: ${plan.nodes.map((n) => n.id).join(", ")}.`,
        );
      }

      if (params.action === "set_status") {
        if (!params.status) throw new Error("set_status needs a status.");
        target.status = params.status as PlanNode["status"];
        // Only one node is ever being taught.
        if (target.status === "teaching") {
          for (const node of plan.nodes) {
            if (node.id !== target.id && node.status === "teaching") node.status = "edge";
          }
        }
      } else {
        const id = slugify(params.prerequisite_id ?? "");
        if (id === "" || !params.prerequisite_label) {
          throw new Error("insert_prerequisite needs prerequisite_id and prerequisite_label.");
        }
        if (plan.nodes.some((node) => node.id === id)) {
          throw new Error(`\`${id}\` is already in the plan.`);
        }
        // The new step slots in between the failed node and whatever it rested on.
        plan.nodes.push({ id, label: params.prerequisite_label.trim(), status: "teaching", deps: [...target.deps] });
        target.deps = [id];
        target.status = "edge";
      }

      const issues = validatePlan(plan);
      if (issues.errors.length > 0) {
        throw issuesToError("That change breaks the plan:", issues.errors);
      }

      const promoted = promoteReachable(plan);
      const path = writePlan(config, promoted);
      const next = nextTeachable(promoted);

      log.append(
        params.action === "set_status"
          ? `_Plan: \`${nodeId}\` → ${target.status} (${progressLine(promoted)})._`
          : `_Plan: inserted \`${slugify(params.prerequisite_id ?? "")}\` before \`${nodeId}\`._`,
      );

      return {
        content: [
          {
            type: "text",
            text: [
              `Plan updated (${progressLine(promoted)}), written to ${relative(config.vault, path)}.`,
              next ? `Next: \`${next.id}\` — ${next.label}.` : "Nothing left to teach in this plan.",
              issues.warnings.length > 0 ? `Warnings: ${issues.warnings.join("; ")}` : "",
            ]
              .filter((line) => line !== "")
              .join(" "),
          },
        ],
        details: { path, next, nodes: promoted.nodes },
      };
    },
  });
}
