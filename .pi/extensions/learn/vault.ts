import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface Note {
  path: string;
  /** Scalar frontmatter values, unquoted. Nested/list values are skipped. */
  frontmatter: Record<string, string>;
  /** Raw frontmatter lines, preserved verbatim so unmanaged keys survive. */
  frontmatterLines: string[];
  body: string;
  hasFrontmatter: boolean;
}

const SCALAR_LINE = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/;

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/** Quote only when a bare scalar would be ambiguous YAML. */
export function yamlScalar(value: string | number): string {
  if (typeof value === "number") return String(value);
  const text = String(value);
  if (text === "") return '""';
  if (text.startsWith("[[")) return JSON.stringify(text); // Obsidian wikilink
  if (/^[\[{]/.test(text)) return text; // already a flow list/map
  if (/[:#]|^[-?*&!|>%@`]|^\s|\s$/.test(text)) return JSON.stringify(text);
  return text;
}

export function parseNote(path: string, text: string): Note {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") {
    return { path, frontmatter: {}, frontmatterLines: [], body: text, hasFrontmatter: false };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return { path, frontmatter: {}, frontmatterLines: [], body: text, hasFrontmatter: false };
  }

  const frontmatterLines = lines.slice(1, end);
  const frontmatter: Record<string, string> = {};
  for (const line of frontmatterLines) {
    const match = SCALAR_LINE.exec(line);
    if (!match) continue; // nested block, list item, comment
    const value = match[2].trim();
    if (value === "") continue; // key with a nested block below it
    frontmatter[match[1]] = unquote(value);
  }

  return {
    path,
    frontmatter,
    frontmatterLines,
    body: lines.slice(end + 1).join("\n"),
    hasFrontmatter: true,
  };
}

export function readNote(path: string): Note | null {
  if (!existsSync(path)) return null;
  try {
    return parseNote(path, readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function serializeNote(note: Note): string {
  const body = note.body.startsWith("\n") ? note.body.slice(1) : note.body;
  return ["---", ...note.frontmatterLines, "---", "", body].join("\n");
}

/**
 * Upsert scalar frontmatter keys, leaving every other line (including nested
 * blocks such as `tags:` lists) exactly as it was. Managed keys must be
 * scalars — a key that owns a nested block is appended to rather than
 * rewritten, so keep scheduling fields flat.
 */
export function updateFrontmatter(
  path: string,
  updates: Record<string, string | number | undefined>,
): Note {
  const existing = readNote(path);
  const note: Note = existing ?? {
    path,
    frontmatter: {},
    frontmatterLines: [],
    body: "",
    hasFrontmatter: false,
  };

  const lines = [...note.frontmatterLines];
  for (const [key, raw] of Object.entries(updates)) {
    if (raw === undefined) continue;
    const line = `${key}: ${yamlScalar(raw)}`;
    const index = lines.findIndex((candidate) => {
      const match = SCALAR_LINE.exec(candidate);
      return match?.[1] === key;
    });
    if (index === -1) lines.push(line);
    else lines[index] = line;
    note.frontmatter[key] = String(raw);
  }

  note.frontmatterLines = lines;
  note.hasFrontmatter = true;
  ensureDir(dirname(path));
  writeFileSync(path, serializeNote(note), "utf8");
  return note;
}

export function writeNote(path: string, contents: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, contents, "utf8");
}

export function appendToNote(path: string, contents: string): void {
  ensureDir(dirname(path));
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const separator = current === "" || current.endsWith("\n") ? "" : "\n";
  writeFileSync(path, current + separator + contents, "utf8");
}

/** Every Markdown file under `dir`, recursively. Missing dir → []. */
export function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) out.push(full);
    }
  };
  try {
    walk(dir);
  } catch {
    return out;
  }
  return out.sort();
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `isoDate` until today. Negative = in the future. */
export function daysSince(isoDate: string | undefined): number | null {
  if (!isoDate) return null;
  const then = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  const now = Date.parse(`${today()}T00:00:00Z`);
  return Math.round((now - then) / 86_400_000);
}

export function fileMtime(path: string): string | null {
  try {
    return statSync(path).mtime.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/**
 * Obsidian renders `$...$` / `$$...$$`, not `\( ... \)` / `\[ ... \]`.
 * Normalise so logged transcripts render as maths instead of literal slashes.
 */
export function normalizeMath(text: string): string {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, inner) => `$$${inner}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, inner) => `$${inner}$`);
}
