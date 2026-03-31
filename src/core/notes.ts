import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export type NoteRecord = {
  slug: string;
  title: string;
  tags: string[];
  body: string;
};

function normalizeSlug(value: string): string {
  const slug = value.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(slug)) {
    throw new Error(`Invalid note slug: ${value}`);
  }
  return slug;
}

function resolveNotePath(notesDir: string, slugInput: string): string {
  const notesRoot = path.resolve(notesDir);
  const slug = normalizeSlug(slugInput);
  const notePath = path.resolve(notesRoot, `${slug}.md`);
  const relative = path.relative(notesRoot, notePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Resolved note path escapes notes directory");
  }

  return notePath;
}

function parseNote(slug: string, raw: string): NoteRecord {
  const parsed = matter(raw);
  const title =
    typeof parsed.data.title === "string" && parsed.data.title.trim().length > 0
      ? parsed.data.title.trim()
      : slug;

  const tags = Array.isArray(parsed.data.tags)
    ? parsed.data.tags.filter((value): value is string => typeof value === "string")
    : [];

  return {
    slug,
    title,
    tags,
    body: parsed.content.trim()
  };
}

export async function loadAllNotes(notesDir: string): Promise<NoteRecord[]> {
  const root = path.resolve(notesDir);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .sort((left, right) => left.name.localeCompare(right.name));

  const notes = await Promise.all(
    files.map(async (file) => {
      const slug = file.name.replace(/\.md$/i, "");
      const fullPath = path.join(root, file.name);
      const raw = await fs.readFile(fullPath, "utf8");
      return parseNote(slug, raw);
    })
  );

  return notes;
}

export async function readNoteBySlug(notesDir: string, slugInput: string): Promise<NoteRecord> {
  const slug = normalizeSlug(slugInput);
  const fullPath = resolveNotePath(notesDir, slug);
  const raw = await fs.readFile(fullPath, "utf8");
  return parseNote(slug, raw);
}

export async function searchNotes(notesDir: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }

  const notes = await loadAllNotes(notesDir);

  return notes
    .map((note) => {
      let score = 0;

      if (note.slug.toLowerCase().includes(q)) score += 5;
      if (note.title.toLowerCase().includes(q)) score += 4;
      if (note.tags.some((tag) => tag.toLowerCase().includes(q))) score += 3;
      if (note.body.toLowerCase().includes(q)) score += 1;

      return {
        note,
        score
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.note.slug.localeCompare(right.note.slug))
    .slice(0, 10)
    .map(({ note }) => ({
      slug: note.slug,
      title: note.title,
      tags: note.tags,
      preview: note.body.slice(0, 240)
    }));
}

