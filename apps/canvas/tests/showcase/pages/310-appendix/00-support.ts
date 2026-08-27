/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// Shared vocabulary for the appendix chapter (310) — the three
// compilers that make the closing pages TRUE rather than typed:
//
//   · the LIMITS compiler — reads every `marginNote(` call back out of
//     the page-module sources at build time (a paren-walking extractor,
//     not a hand copy), resolves each note's folio through the chapter
//     specs + the ANNUAL_PLAN, dedupes near-identical notes, and
//     classifies each as ◪ (demonstrated to a recorded limit) or □
//     (not modelled by declaration) from the note's own wording;
//
//   · the INDEX resolver — parses the document's own IDML export for
//     `<PageReference>` markers and walks each marker's story to its
//     frame and its frame to its page through the spreads' transforms,
//     so the printed index is derived from the artifact, not the plan;
//
//   · `listParts` — the container part listing the colophon counts.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

import { readZipText, zipEntries } from "../../../e2e/harness/read-zip";
import { ANNUAL_PLAN } from "../../names-annual";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** `tests/showcase` */
const SHOWCASE = pathResolve(__dirname, "..", "..");
const PAGES_DIR = join(SHOWCASE, "pages");
const CHAPTERS_DIR = join(SHOWCASE, "chapters");

// ── folios ───────────────────────────────────────────────────────────

/** 1-based physical page → the folio label the live sections produce:
 *  front matter i–x, body 1–116 (physical − 10), appendix A·1–A·8. */
export function folioOf(physical: number): string {
  if (physical <= 10) {
    const roman = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
    return roman[physical - 1];
  }
  if (physical <= 126) return String(physical - 10);
  return `A·${physical - 126}`;
}

// ── the limits compiler ──────────────────────────────────────────────

export interface Limit {
  /** ◪ recorded limit · □ not modelled by declaration. */
  glyph: "◪" | "□";
  /** The note text, pointer stripped, whitespace collapsed. */
  text: string;
  /** Folio labels whose margins carry it, in book order. */
  folios: string[];
  /** 1-based physical pages behind `folios` (for sorting). */
  physicals: number[];
}

/** The wordings that mark a DECLARED absence — the □ class. Kept as a
 *  visible list so the classification is checkable, not vibes. */
const NOT_MODELLED = [
  /not modelled/i,
  /no wire op/i,
  /no create op/i,
  /no generate-?TOC op/i,
  /not on the wire/i,
  /inexpressible/i,
  /no door/i,
  /nothing populates/i,
  /no editor command or panel/i,
  /IDML has no/i,
  /core has no/i,
  /no such op/i,
];

/**
 * Compile the limits ledger from the sources. Reads every
 * `pages/**\/*.ts`, extracts each `marginNote(` call with a
 * paren-walking scanner (string-aware, so a `)` inside a note does not
 * end the call), resolves the page argument — `p(NNN)` directly,
 * `ctx.pageIndexes[k]` and bare identifiers through the module's
 * declared pages in its chapter spec — then dedupes and classifies.
 */
export function compileLimits(): Limit[] {
  const modulePages = parseModulePages();
  const raw: Array<{ text: string; physicals: number[] }> = [];

  for (const file of listPageModules()) {
    const src = readFileSync(file, "utf8");
    const rel = file.slice(PAGES_DIR.length + 1); // e.g. 220-ledger/05-chain.ts
    const chapterDir = rel.includes("/") ? rel.split("/")[0] : null;
    const declared = modulePages.get(rel.replace(/\.ts$/, ""));
    for (const call of extractCalls(src, "marginNote(")) {
      const args = splitTopLevel(call);
      if (args.length < 3) continue;
      // A real call always passes the PageContext first; a mention of
      // `marginNote(` in a doc comment (this chapter's own, for one)
      // does not, and must not become a ledger entry.
      if (args[0].trim() !== "ctx") continue;
      const text = literalText(args.slice(2).join(","));
      if (!text) continue;
      const physicals = resolvePages(args[1], declared, chapterDir);
      raw.push({ text: tidy(text), physicals });
    }
  }

  // Dedupe: exact-normalised first, then near-identical by token
  // overlap (Jaccard ≥ 0.6) — the same seam recorded by two studios
  // in two wordings collapses to one entry carrying both folios.
  const merged: Array<{ text: string; physicals: Set<number>; norm: Set<string> }> = [];
  for (const note of raw) {
    const norm = tokens(note.text);
    const hit = merged.find(
      (m) => jaccard(m.norm, norm) >= 0.6,
    );
    if (hit) {
      for (const ph of note.physicals) hit.physicals.add(ph);
    } else {
      merged.push({
        text: note.text,
        physicals: new Set(note.physicals),
        norm,
      });
    }
  }

  const limits: Limit[] = merged.map((m) => {
    const physicals = [...m.physicals].sort((a, b) => a - b);
    return {
      glyph: NOT_MODELLED.some((re) => re.test(m.text)) ? "□" : "◪",
      text: m.text,
      folios: physicals.map(folioOf),
      physicals,
    };
  });
  limits.sort((a, b) => (a.physicals[0] ?? 999) - (b.physicals[0] ?? 999));
  return limits;
}

function listPageModules(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".ts")) out.push(full);
    }
  };
  walk(PAGES_DIR);
  return out.sort();
}

/** `pages/<dir>/<module>` (no extension) → declared 1-based pages,
 *  parsed from the chapter specs' import + module declarations. */
function parseModulePages(): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const spec of readdirSync(CHAPTERS_DIR)) {
    if (!spec.endsWith(".spec.ts")) continue;
    const src = readFileSync(join(CHAPTERS_DIR, spec), "utf8");
    const imports = new Map<string, string>();
    for (const m of src.matchAll(
      /import \{ build as (\w+) \} from "\.\.\/pages\/([^"]+)"/g,
    )) {
      imports.set(m[1], m[2]);
    }
    for (const m of src.matchAll(
      /\{\s*id:\s*"[^"]+",\s*pages:\s*\[([^\]]*)\],\s*build:\s*(\w+)/g,
    )) {
      const path = imports.get(m[2]);
      if (!path) continue;
      const pages = [...m[1].matchAll(/p\((\d+)\)/g)].map((x) => Number(x[1]));
      if (pages.length > 0) out.set(path, pages);
    }
  }
  return out;
}

/** Every argument list of `<callee>…)` in `src`, paren-matched and
 *  string-aware. Returns the text inside the outer parens. */
function extractCalls(src: string, callee: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf(callee, from);
    if (at < 0) return out;
    let i = at + callee.length - 1; // the "("
    let depth = 0;
    let str: string | null = null;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (str) {
        if (c === "\\") i += 1;
        else if (c === str) str = null;
      } else if (c === '"' || c === "'" || c === "`") str = c;
      else if (c === "(") depth += 1;
      else if (c === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(at + callee.length, i));
    from = i;
  }
}

/** Split an argument string at top-level commas (string/paren aware). */
function splitTopLevel(argText: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let str: string | null = null;
  let start = 0;
  for (let i = 0; i < argText.length; i += 1) {
    const c = argText[i];
    if (str) {
      if (c === "\\") i += 1;
      else if (c === str) str = null;
    } else if (c === '"' || c === "'" || c === "`") str = c;
    else if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(argText.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = argText.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

/** Concatenate the string-literal pieces of an expression; `${…}`
 *  interpolations become an ellipsis. Null when no literal appears. */
function literalText(expr: string): string | null {
  let out = "";
  let found = false;
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === '"' || c === "'" || c === "`") {
      found = true;
      const quote = c;
      i += 1;
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === "\\") {
          out += expr[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (quote === "`" && expr[i] === "$" && expr[i + 1] === "{") {
          out += "…";
          let d = 1;
          i += 2;
          while (i < expr.length && d > 0) {
            if (expr[i] === "{") d += 1;
            else if (expr[i] === "}") d -= 1;
            i += 1;
          }
          continue;
        }
        out += expr[i];
        i += 1;
      }
      i += 1;
    } else {
      i += 1;
    }
  }
  return found ? out : null;
}

function resolvePages(
  pageExpr: string,
  declared: number[] | undefined,
  chapterDir: string | null,
): number[] {
  const direct = /^p\((\d+)\)$/.exec(pageExpr.trim());
  if (direct) return [Number(direct[1])];
  const indexed = /pageIndexes\[(\d+)\]/.exec(pageExpr);
  if (indexed && declared) {
    const hit = declared[Number(indexed[1])];
    if (hit !== undefined) return [hit];
  }
  if (declared) return declared;
  // Last resort: the whole chapter's range from the plan.
  if (chapterDir) {
    const plan = ANNUAL_PLAN.find(
      (c) => c.id === chapterDir || c.id.endsWith(`-${chapterDir}`),
    );
    if (plan) return plan.pages;
  }
  return [];
}

function tidy(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s*→ Appendix A\.?\s*$/i, "")
    .replace(/\s+$/, "")
    .replace(/[.\s]+$/, "")
    .trim();
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / (a.size + b.size - inter);
}

// ── the index resolver ───────────────────────────────────────────────

export interface TopicRefs {
  /** `Topic/…` self id, as `AppliedTopic` carries it. */
  topicId: string;
  name: string;
  /** 1-based physical pages whose stories carry a marker. */
  physicals: number[];
}

/**
 * Resolve every `<PageReference>` in an exported IDML package to the
 * physical page whose frame hosts it. Story → frame via `ParentStory`;
 * frame → page by comparing the frame's ItemTransform tx with the
 * pages' — a frame belongs to the page whose spread-space origin is
 * the greatest one at or below its own (verso −540, recto 0 in this
 * fixture's facing-page geometry). Physical numbers come from walking
 * the designmap's spread order, so no page NAME is trusted.
 */
export function resolveIndexRefs(idml: Buffer): TopicRefs[] {
  const designmap = readZipText(idml, "designmap.xml") ?? "";
  const spreadSrcs = [...designmap.matchAll(/src="(Spreads\/[^"]+)"/g)].map(
    (m) => m[1],
  );

  // story self id → 1-based physical page of its (first) frame.
  const storyPage = new Map<string, number>();
  let physical = 0;
  for (const src of spreadSrcs) {
    const xml = readZipText(idml, src);
    if (!xml) continue;
    const pages: Array<{ tx: number; physical: number }> = [];
    for (const m of xml.matchAll(/<Page [^>]*ItemTransform="([^"]+)"/g)) {
      const tx = Number(m[1].trim().split(/\s+/)[4] ?? 0);
      pages.push({ tx, physical: 0 });
    }
    pages.sort((a, b) => a.tx - b.tx);
    for (const pg of pages) {
      physical += 1;
      pg.physical = physical;
    }
    for (const m of xml.matchAll(
      /<TextFrame [^>]*ParentStory="([^"]+)"[^>]*ItemTransform="([^"]+)"/g,
    )) {
      const story = m[1];
      const tx = Number(m[2].trim().split(/\s+/)[4] ?? 0);
      let best = pages[0];
      for (const pg of pages) if (pg.tx <= tx + 1e-6) best = pg;
      if (best && !storyPage.has(story)) storyPage.set(story, best.physical);
    }
  }

  // markers per topic, joined through the story map.
  const topics = new Map<string, TopicRefs>();
  for (const entry of zipEntries(idml)) {
    if (!entry.name.startsWith("Stories/")) continue;
    const xml = readZipText(idml, entry.name) ?? "";
    const storySelf = /<Story [^>]*Self="([^"]+)"/.exec(xml)?.[1];
    if (!storySelf) continue;
    const page = storyPage.get(storySelf);
    for (const m of xml.matchAll(
      /<PageReference [^>]*AppliedTopic="([^"]+)"[^>]*TopicName="([^"]+)"/g,
    )) {
      const t = topics.get(m[1]) ?? {
        topicId: m[1],
        name: m[2],
        physicals: [],
      };
      if (page !== undefined && !t.physicals.includes(page)) {
        t.physicals.push(page);
      }
      topics.set(m[1], t);
    }
  }
  for (const t of topics.values()) t.physicals.sort((a, b) => a - b);
  return [...topics.values()];
}

// ── the container listing (colophon) ─────────────────────────────────

/** The `.paged` container parts under `prefix` — the `listPagedParts`
 *  wire door (same as the press chapter's copy; chapters keep their
 *  support layers self-contained by convention). */
export async function listParts(page: Page, prefix: string): Promise<string[]> {
  return page.evaluate(async (prefix) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            send: (m: unknown) => Promise<{
              kind: string;
              payload: { paths?: string[] };
            }>;
          };
        };
      }
    ).__canvas;
    const reply = await c.client.send({
      kind: "listPagedParts",
      payload: { prefix },
    });
    return reply.kind === "pagedPartList" ? (reply.payload.paths ?? []) : [];
  }, prefix);
}
