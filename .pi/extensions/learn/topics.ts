import { basename } from "node:path";
import { type LearnConfig, folderPath } from "./config.ts";
import { type DueTopic, classify, stateFromFrontmatter } from "./scheduler.ts";
import { type Note, fileMtime, listMarkdown, readNote, slugify } from "./vault.ts";

export interface Concept {
  id: string;
  description: string;
}

export interface TopicNote {
  /** Stable slug used everywhere in the ledger. */
  topic: string;
  title: string;
  path: string;
  note: Note;
  concepts: Concept[];
}

const CONCEPT_LINE = /^[-*]\s+`([a-z0-9][a-z0-9-]*)`\s*(?:[—:-]\s*(.*))?$/;

/** Concept ids declared under a `## Concepts` heading in a cheatsheet. */
export function parseConcepts(body: string): Concept[] {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => /^#{1,6}\s+concepts\b/i.test(line.trim()));
  if (start === -1) return [];

  const concepts: Concept[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#{1,6}\s/.test(line)) break; // next heading ends the section
    const match = CONCEPT_LINE.exec(line);
    if (match) concepts.push({ id: match[1], description: (match[2] ?? "").trim() });
  }
  return concepts;
}

function titleOf(note: Note, path: string): string {
  if (note.frontmatter.title) return note.frontmatter.title;
  const heading = note.body.split("\n").find((line) => /^#\s+/.test(line.trim()));
  if (heading) return heading.replace(/^#\s+/, "").trim();
  return basename(path, ".md");
}

export function loadTopics(config: LearnConfig): TopicNote[] {
  const out: TopicNote[] = [];
  for (const path of listMarkdown(folderPath(config, "cheatsheets"))) {
    const note = readNote(path);
    if (!note) continue;
    const title = titleOf(note, path);
    out.push({
      topic: note.frontmatter.topic || slugify(basename(path, ".md")),
      title,
      path,
      note,
      concepts: parseConcepts(note.body),
    });
  }
  return out;
}

export function findTopic(config: LearnConfig, query: string): TopicNote | null {
  const wanted = slugify(query);
  if (wanted === "") return null;
  const all = loadTopics(config);
  return (
    all.find((entry) => entry.topic === wanted) ??
    all.find((entry) => slugify(entry.title) === wanted) ??
    all.find((entry) => slugify(basename(entry.path, ".md")) === wanted) ??
    all.find((entry) => entry.topic.includes(wanted) || slugify(entry.title).includes(wanted)) ??
    null
  );
}

export function dueTopics(config: LearnConfig): DueTopic[] {
  return loadTopics(config)
    .map((entry) =>
      classify(
        config,
        entry.topic,
        entry.title,
        entry.path,
        stateFromFrontmatter(config, entry.note.frontmatter),
        entry.note.frontmatter.created ?? fileMtime(entry.path),
      ),
    )
    .sort((a, b) => b.overdueDays - a.overdueDays || a.title.localeCompare(b.title));
}

export function actionable(topics: DueTopic[]): DueTopic[] {
  return topics.filter(
    (entry) => entry.status === "overdue" || entry.status === "due" || entry.status === "never",
  );
}
