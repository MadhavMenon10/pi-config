import { basename } from "node:path";
import { type LearnConfig, folderPath } from "./config.ts";
import { type Note, readNote, slugify, today, writeNote } from "./vault.ts";

export type NodeStatus = "known" | "edge" | "unknown" | "teaching" | "locked";

export const NODE_STATUSES: readonly NodeStatus[] = [
  "known",
  "edge",
  "unknown",
  "teaching",
  "locked",
] as const;

export interface PlanNode {
  id: string;
  /** What the learner can do once this node lands. One clause. */
  label: string;
  status: NodeStatus;
  /** Ids this node rests on. */
  deps: string[];
}

export interface Plan {
  topic: string;
  title: string;
  goal: string;
  nodes: PlanNode[];
  /** Anything the learner wrote below the generated table, preserved verbatim. */
  tail: string;
}

export interface PlanIssues {
  errors: string[];
  warnings: string[];
}

const STATUS_ORDER: Record<NodeStatus, number> = {
  teaching: 0,
  edge: 1,
  unknown: 2,
  locked: 3,
  known: 4,
};

export function planPath(config: LearnConfig, topic: string, title?: string): string {
  return folderPath(config, "maps", `${title ?? topic}.md`);
}

export function isStatus(value: string): value is NodeStatus {
  return (NODE_STATUSES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ parsing */

const CODE_ID = /`([a-z0-9][a-z0-9-]*)`/g;

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function idsIn(text: string): string[] {
  return [...text.matchAll(CODE_ID)].map((match) => match[1]);
}

/** Read the node table back out of a plan note, so the learner can edit it. */
export function parsePlan(note: Note, fallbackTitle: string): Plan {
  const lines = note.body.split("\n");
  const start = lines.findIndex((line) => /^#{1,6}\s+nodes\b/i.test(line.trim()));
  const nodes: PlanNode[] = [];
  let end = lines.length;

  if (start !== -1) {
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "") continue;
      if (!line.startsWith("|")) {
        if (nodes.length > 0 || /^#{1,6}\s/.test(line)) {
          end = i;
          break;
        }
        continue;
      }
      if (/^\|[\s:|-]+\|$/.test(line)) continue; // separator row
      const parts = cells(line);
      if (parts.length < 3) continue;
      const id = idsIn(parts[0])[0];
      if (!id) continue; // header row, or a row without an id
      const status = parts[2].toLowerCase().replace(/[^a-z]/g, "");
      nodes.push({
        id,
        label: parts[1],
        status: isStatus(status) ? status : "unknown",
        deps: idsIn(parts[3] ?? ""),
      });
      end = i + 1;
    }
  }

  return {
    topic: note.frontmatter.topic || slugify(fallbackTitle),
    title: note.frontmatter.title || fallbackTitle,
    goal: note.frontmatter.goal || "",
    nodes,
    tail: lines.slice(end).join("\n").trim(),
  };
}

export function readPlan(config: LearnConfig, topic: string, title?: string): Plan | null {
  const path = planPath(config, topic, title);
  const note = readNote(path);
  if (!note) return null;
  return parsePlan(note, basename(path, ".md"));
}

/* -------------------------------------------------------------- validation */

/**
 * The plan is where the model is forced to finish its reasoning instead of
 * winging it, so the graph is checked rather than trusted: every dependency
 * must name a real node, the graph must be acyclic, and there must be a place
 * to actually start.
 */
export function validatePlan(plan: Plan): PlanIssues {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map<string, PlanNode>();

  for (const node of plan.nodes) {
    if (byId.has(node.id)) errors.push(`Duplicate node id \`${node.id}\`.`);
    byId.set(node.id, node);
    if (node.label.trim() === "") errors.push(`Node \`${node.id}\` has no description.`);
  }
  if (plan.nodes.length === 0) errors.push("A plan needs at least one node.");

  for (const node of plan.nodes) {
    for (const dep of node.deps) {
      if (dep === node.id) errors.push(`Node \`${node.id}\` depends on itself.`);
      else if (!byId.has(dep)) {
        errors.push(`Node \`${node.id}\` rests on \`${dep}\`, which is not in the plan.`);
      }
    }
  }

  // Kahn's algorithm: whatever cannot be ordered is in a cycle.
  const indegree = new Map<string, number>();
  for (const node of plan.nodes) {
    indegree.set(node.id, node.deps.filter((dep) => byId.has(dep) && dep !== node.id).length);
  }
  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
  const ordered: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    ordered.push(id);
    for (const node of plan.nodes) {
      if (!node.deps.includes(id)) continue;
      const next = (indegree.get(node.id) ?? 0) - 1;
      indegree.set(node.id, next);
      if (next === 0) queue.push(node.id);
    }
  }
  if (ordered.length < plan.nodes.length) {
    const stuck = plan.nodes.filter((node) => !ordered.includes(node.id)).map((node) => node.id);
    errors.push(`These nodes form a cycle: ${stuck.map((id) => `\`${id}\``).join(", ")}.`);
  }

  const teachable = plan.nodes.filter(
    (node) =>
      node.status !== "known" &&
      node.status !== "locked" &&
      node.deps.every((dep) => {
        const target = byId.get(dep);
        return target?.status === "known" || target?.status === "locked";
      }),
  );
  if (errors.length === 0 && teachable.length === 0 && plan.nodes.some((n) => n.status !== "locked" && n.status !== "known")) {
    errors.push(
      "Nothing is teachable yet: every remaining node rests on something not yet held. Start the path from what they already know.",
    );
  }

  // "Do not start in `unknown` with no ramp": the first step should rest on
  // ground they already hold, not be a cold open.
  if (errors.length === 0 && teachable.length > 0 && teachable.every((node) => node.status === "unknown")) {
    warnings.push(
      `The path starts at ${teachable.map((node) => `\`${node.id}\``).join(", ")}, which is marked \`unknown\` and rests on nothing held. Probe deeper or add a ramp from what they already know.`,
    );
  }
  if (plan.nodes.filter((node) => node.status === "known").length === 0) {
    warnings.push(
      "No node is marked `known`. A plan that starts from nothing usually means the probe was too shallow.",
    );
  }
  if (plan.nodes.length > 14) {
    warnings.push(
      `${plan.nodes.length} nodes is a syllabus, not a session. Consider cutting to the path that reaches the goal.`,
    );
  }
  const teachingCount = plan.nodes.filter((node) => node.status === "teaching").length;
  if (teachingCount > 1) warnings.push("More than one node is marked `teaching`. Teach one at a time.");

  return { errors, warnings };
}

/* -------------------------------------------------------------- rendering */

const STATUS_LABEL: Record<NodeStatus, string> = {
  known: "known",
  edge: "edge",
  unknown: "unknown",
  teaching: "teaching",
  locked: "locked",
};

const STATUS_MARK: Record<NodeStatus, string> = {
  known: "",
  edge: "",
  unknown: "",
  teaching: "▶ ",
  locked: "✓ ",
};

function mermaidLabel(node: PlanNode): string {
  const label = node.label.replace(/["`]/g, "").trim();
  return `${STATUS_MARK[node.status]}${node.id}<br/>${label}`;
}

export function renderMermaid(plan: Plan): string {
  const alias = new Map(plan.nodes.map((node, index) => [node.id, `n${index}`]));
  const lines = ["```mermaid", "flowchart TD"];

  for (const node of plan.nodes) {
    lines.push(`  ${alias.get(node.id)}["${mermaidLabel(node)}"]:::${node.status}`);
  }
  for (const node of plan.nodes) {
    for (const dep of node.deps) {
      const from = alias.get(dep);
      if (from) lines.push(`  ${from} --> ${alias.get(node.id)}`);
    }
  }

  // Solid fills with explicit text colour so the graph reads in both themes.
  lines.push(
    "  classDef known fill:#455a64,color:#ffffff,stroke:#263238",
    "  classDef edge fill:#f9a825,color:#000000,stroke:#f57f17,stroke-width:2px",
    "  classDef unknown fill:#90a4ae,color:#000000,stroke:#607d8b,stroke-dasharray: 4 3",
    "  classDef teaching fill:#1565c0,color:#ffffff,stroke:#0d47a1,stroke-width:3px",
    "  classDef locked fill:#2e7d32,color:#ffffff,stroke:#1b5e20",
    "```",
  );
  return lines.join("\n");
}

export function renderPlan(plan: Plan): string {
  const ordered = [...plan.nodes].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.id.localeCompare(b.id),
  );

  const rows = ordered.map(
    (node) =>
      `| \`${node.id}\` | ${node.label} | ${STATUS_LABEL[node.status]} | ${
        node.deps.length === 0 ? "—" : node.deps.map((dep) => `\`${dep}\``).join(", ")
      } |`,
  );

  return [
    "---",
    "type: plan",
    `topic: ${plan.topic}`,
    `title: ${JSON.stringify(plan.title)}`,
    `goal: ${JSON.stringify(plan.goal)}`,
    `updated: ${today()}`,
    "tags:",
    "  - learning/plan",
    "---",
    "",
    `# Plan — ${plan.title}`,
    "",
    "> [!abstract] Goal",
    `> ${plan.goal}`,
    "",
    renderMermaid(plan),
    "",
    "Blue is where we are. Amber is reachable now. Grey rests on something not yet held.",
    "Green has been taught and quizzed. Slate you already had.",
    "",
    "## Nodes",
    "",
    "| Node | What it gives you | Status | Rests on |",
    "|---|---|---|---|",
    ...rows,
    "",
    plan.tail,
    "",
  ].join("\n");
}

export function writePlan(config: LearnConfig, plan: Plan): string {
  const path = planPath(config, plan.topic, plan.title);
  writeNote(path, renderPlan(plan));
  return path;
}

/* ---------------------------------------------------------------- mutation */

/**
 * Anything still `unknown` whose prerequisites are all held is now reachable.
 * Keeping this in code means the graph cannot drift from what was taught.
 */
export function promoteReachable(plan: Plan): Plan {
  const held = new Set(
    plan.nodes.filter((node) => node.status === "known" || node.status === "locked").map((n) => n.id),
  );
  return {
    ...plan,
    nodes: plan.nodes.map((node) =>
      node.status === "unknown" && node.deps.every((dep) => held.has(dep))
        ? { ...node, status: "edge" }
        : node,
    ),
  };
}

export function nextTeachable(plan: Plan): PlanNode | null {
  const held = new Set(
    plan.nodes.filter((node) => node.status === "known" || node.status === "locked").map((n) => n.id),
  );
  return (
    plan.nodes.find((node) => node.status === "teaching") ??
    plan.nodes.find((node) => node.status === "edge" && node.deps.every((dep) => held.has(dep))) ??
    null
  );
}

export function progressLine(plan: Plan): string {
  const total = plan.nodes.filter((node) => node.status !== "known").length;
  const done = plan.nodes.filter((node) => node.status === "locked").length;
  return `${done}/${total} nodes locked`;
}
