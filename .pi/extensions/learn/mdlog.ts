import { existsSync } from "node:fs";
import { join } from "node:path";
import { type LearnConfig, folderPath } from "./config.ts";
import { appendToNote, normalizeMath, slugify, today, writeNote } from "./vault.ts";

/**
 * Mirrors a learning session into a Markdown note in the vault, so LaTeX,
 * mermaid, and images render in Obsidian instead of being terminal noise —
 * and so every session leaves an artefact you can come back to.
 *
 * The log is created lazily: an ordinary coding session never touches the
 * vault, but the first quiz or recall question opens one.
 */
export class SessionLog {
  private path: string | null = null;
  private opened = false;

  constructor(private readonly config: LearnConfig) {}

  getPath(): string | null {
    return this.path;
  }

  isOpen(): boolean {
    return this.path !== null;
  }

  /** Point the log at an explicit note (used by `/log`). */
  open(target: string, title?: string): string {
    const relative = target.endsWith(".md") ? target : `${target}.md`;
    const path = relative.startsWith("/")
      ? relative
      : join(folderPath(this.config, "sessions"), relative);
    this.path = path;
    if (!existsSync(path)) this.writeHeader(path, title ?? relative.replace(/\.md$/, ""));
    this.opened = true;
    return path;
  }

  /** Open the default session note if nothing is open yet. */
  ensure(title: string): string {
    if (this.path) return this.path;
    if (!this.config.autoLogSessions) return "";
    const name = `${today()} ${title}`.trim();
    return this.open(`${name}.md`, title);
  }

  private writeHeader(path: string, title: string): void {
    writeNote(
      path,
      [
        "---",
        "type: session",
        `date: ${today()}`,
        `title: ${JSON.stringify(title)}`,
        "tags:",
        "  - learning/session",
        "---",
        "",
        `# ${title}`,
        "",
      ].join("\n"),
    );
  }

  append(markdown: string): void {
    if (!this.path) return;
    appendToNote(this.path, `${normalizeMath(markdown).trimEnd()}\n\n`);
  }

  /** Copy the conversation so far, once, when the log opens mid-session. */
  backfill(entries: Array<{ type?: string; message?: unknown }>): void {
    if (!this.path || !this.opened) return;
    this.opened = false;
    const chunks: string[] = [];
    for (const entry of entries.slice(-24)) {
      if (entry.type !== "message") continue;
      const rendered = renderMessage(entry.message);
      if (rendered) chunks.push(rendered);
    }
    if (chunks.length > 0) this.append(chunks.join("\n\n"));
  }
}

export function textOf(message: unknown): string {
  const content = (message as { content?: unknown })?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => (part as { type?: string })?.type === "text")
    .map((part) => (part as { text?: string }).text ?? "")
    .join("\n")
    .trim();
}

export function renderMessage(message: unknown): string | null {
  const role = (message as { role?: string })?.role;
  if (role !== "user" && role !== "assistant") return null;
  const text = textOf(message);
  if (text === "") return null;
  if (role === "user") {
    return ["> [!question] You", ...text.split("\n").map((line) => `> ${line}`)].join("\n");
  }
  return text;
}

export function sessionTitleFor(topic: string): string {
  return slugify(topic).replace(/-/g, " ") || "session";
}
