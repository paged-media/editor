#!/usr/bin/env node
/**
 * The programmable-SDK catalog for `@paged-media/client`, DERIVED.
 *
 * WHY THIS EXISTS.
 *
 *   The capability-parity survey asked which surfaces can reach the
 *   engine's 117 mutations and 62 wire kinds. One answer was awkward:
 *   "the SDK" reaches almost none of them — but the SDK it measured was
 *   `@paged-media/idml-viewer`, which is READ-ONLY by ratified design
 *   ("sibling, not a shrunk app": no paged-mutate, no paged-script, no
 *   paged-canvas). Growing it into a write surface would undo that
 *   decision, and it does not need undoing, because the full-capability
 *   SDK already exists — this package. It just was not published, not
 *   catalogued, and therefore not answerable.
 *
 *   `core/web/idml-viewer/api-catalog.json` already solved the shape of
 *   this problem for the viewer: one JSON file beside the API, the docs
 *   site renders from it, and a test fails when an export is missing
 *   from it. This is that, with one change of principle.
 *
 * THE CHANGE OF PRINCIPLE: DERIVED, NOT LISTED.
 *
 *   The viewer's catalog is hand-written and a test checks it is
 *   complete. That works at 47 members maintained by the person who
 *   wrote them. This package has ~60 methods on one class plus five
 *   barrels, and a hand list of that size rots — the way the CLI's
 *   unreached-kinds list would have rotted if it were not scraped from
 *   serde's own error message.
 *
 *   So the catalog is GENERATED from the source: names, signatures and
 *   summaries all come from the declarations and their doc comments.
 *   `--check` regenerates and compares. A new public method appears in
 *   the catalog by existing; it cannot appear WITHOUT A SUMMARY,
 *   because an undocumented public member fails the run.
 *
 * ANTI-FAIL-OPEN.
 *
 *   A parser that silently matches nothing would let this gate pass on
 *   an empty catalog forever, which is the failure mode of every gate
 *   built out of regexes. Floors below (`FLOORS`) make that fatal: too
 *   few members, no wire kinds, or an unknown source module and the run
 *   dies rather than shrugging.
 *
 *   Usage:  node scripts/client-api-catalog.mjs           # write
 *           node scripts/client-api-catalog.mjs --check   # gate
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const ROOT = new URL("..", import.meta.url).pathname;
const PKG_DIR = resolve(ROOT, "packages/client");
const TARGET = resolve(PKG_DIR, "api-catalog.json");

/**
 * Human titles for the modules the barrel re-exports from. A module
 * with no entry here is a FAILURE, not an "other" bucket: an
 * uncategorised group is how a catalog starts drifting from the docs
 * page it feeds.
 */
const GROUPS = [
  {
    key: "client",
    file: "src/client.ts",
    title: "CanvasClient",
    summary:
      "The engine session: one Worker, one wasm core, typed request/reply over the v62 wire. Everything the editor UI can do to a document, a program can do here.",
  },
  {
    key: "protocol",
    file: "src/protocol.ts",
    title: "Wire protocol",
    summary:
      "The message vocabulary itself, re-exported from the tsify-generated types in @paged-media/canvas-wasm. Types only, plus the protocol number the client speaks.",
  },
  {
    key: "camera",
    file: "src/sab/camera.ts",
    title: "Camera (shared memory)",
    summary:
      "The view transform, in a SharedArrayBuffer the render worker reads without a message round trip.",
  },
  {
    key: "gesture",
    file: "src/sab/gesture.ts",
    title: "Gestures (shared memory)",
    summary:
      "Pointer deltas for a live drag, written into shared memory at input rate rather than posted per move.",
  },
  {
    key: "journal",
    file: "src/journal/",
    title: "Journal (flight recorder)",
    summary:
      "ADR 025 — the local record of what happened, with redaction rules, a code registry and an exportable bundle.",
  },
];

/**
 * Worker-shell envelopes that STAND FOR a wire kind.
 *
 * `this.send(...)` is not the only way a message reaches
 * `WorkerCore::dispatch`. A few payloads are too big for the JSON
 * envelope, so the shell takes them on its own port and the worker
 * translates them into the wire kind on the other side. Scraping only
 * `send` call sites therefore UNDERCOUNTS this surface — it read 47
 * and missed the single most consequential capability the client has,
 * which is loading a document at all.
 *
 * Each entry needs a reason, and each envelope must still appear in
 * the source: a mapping nobody can find any more is a lie the gate
 * would otherwise keep telling.
 */
const SHELL_ENVELOPES = [
  {
    envelope: "loadDocumentBinary",
    kind: "loadDocument",
    why: "a multi-MB IDML pays ~8x through Array.from -> JSON.stringify -> serde_json, and above ~80 MB it trips a Vec::with_capacity overflow on wasm32; the shell transfers the ArrayBuffer instead and the worker sends loadDocument",
  },
];

const FLOORS = {
  clientMembers: 50,
  wireKinds: 40,
  exports: 50,
};

// ---------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------

/** The doc comment immediately above `line`, unwrapped to one string. */
function docAbove(lines, i) {
  let end = i - 1;
  while (end >= 0 && lines[end].trim() === "") end--;
  if (end < 0 || !lines[end].trim().endsWith("*/")) return null;
  let start = end;
  while (start >= 0 && !lines[start].trim().startsWith("/**")) {
    if (lines[start].trim().startsWith("/*") && start !== end) return null;
    start--;
  }
  if (start < 0) return null;
  const body = lines
    .slice(start, end + 1)
    .join("\n")
    .replace(/^\s*\/\*\*/, "")
    .replace(/\*\/\s*$/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\*ary?/, "").replace(/^\s*\*\s?/, "").trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return body || null;
}

/**
 * First sentence of a doc comment — the summary a reference page shows
 * in a list. Abbreviations that end in a period would split it wrongly,
 * so only a period followed by a space and a capital (or end of text)
 * counts.
 */
function firstSentence(doc) {
  const m = doc.match(/^(.*?[.!?])(\s+[A-Z(`]|$)/s);
  return (m ? m[1] : doc).trim();
}

/** Collapse a possibly multi-line declaration into one signature. */
function signatureAt(lines, i) {
  let sig = "";
  for (let j = i; j < lines.length && j < i + 40; j++) {
    sig += (sig ? " " : "") + lines[j].trim();
    const opens = (sig.match(/\(/g) ?? []).length;
    const closes = (sig.match(/\)/g) ?? []).length;
    if (opens === closes && /[{;]\s*$/.test(sig)) break;
    if (opens === 0 && closes === 0 && /[;=]\s*$/.test(sig)) break;
  }
  return sig
    .replace(/\s*\{\s*$/, "")
    .replace(/\s*;\s*$/, "")
    .replace(/\s*=\s*.*$/, "")
    .replace(/^(public|readonly)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Public members of `export class CanvasClient`. */
function clientMembers(src) {
  const lines = src.split("\n");
  const open = lines.findIndex((l) => /^export class CanvasClient\s*\{/.test(l));
  if (open < 0) die("CanvasClient class not found — the parser is looking at the wrong file");
  const out = [];
  for (let i = open + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\}/.test(line)) break;
    // Members sit at exactly two spaces of indent; anything deeper is a
    // body, anything shallower has left the class.
    const m = line.match(/^ {2}(?! )(.*)$/);
    if (!m) continue;
    const text = m[1];
    if (/^(private|protected|\/\/|\/\*|\*)/.test(text)) continue;
    const decl = text.match(
      /^(?:readonly\s+)?(?:static\s+)?(?:async\s+)?(?:(get|set)\s+)?([A-Za-z_$][\w$]*)\s*[(<:]/,
    );
    if (!decl) continue;
    const name = decl[2];
    if (name === "constructor" || name === "if" || name === "return") continue;
    const doc = docAbove(lines, i);
    const sig = signatureAt(lines, i);
    const kind = decl[1] ? "property" : /\(/.test(sig.slice(name.length)) ? "method" : "property";
    out.push({
      name: `CanvasClient.${name}`,
      kind,
      signature: sig,
      summary: doc ? firstSentence(doc) : null,
      doc,
    });
  }
  return out;
}

/** Names a barrel/module exports, as identifiers. */
function exportedNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const raw of m[1].split(",")) {
      const id = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop().trim();
      if (id && !id.startsWith("./") && !id.includes('"')) names.add(id);
    }
  }
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:const|function|class|interface|type)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  return [...names];
}

/** Which module each barrel export comes from, per `export { … } from "x"`. */
function exportOrigins(indexSrc) {
  const origin = new Map();
  for (const m of indexSrc.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    for (const raw of m[1].split(",")) {
      const id = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop().trim();
      if (id) origin.set(id, m[2]);
    }
  }
  for (const m of indexSrc.matchAll(/export\s+\*\s+from\s*"([^"]+)"/g)) {
    origin.set(`*${m[1]}`, m[1]);
  }
  return origin;
}

/**
 * The wire kinds this client NAMES — its column of the parity matrix.
 *
 * Scraped from `this.send({ kind: "…" })` call sites specifically, NOT
 * from every `kind:` in the file: the worker shell takes its own
 * envelope (`{ kind: "channel" }`, `{ kind: "gestureSab" }`) on the
 * same postMessage port, and counting those would inflate this column
 * with messages that never reach `WorkerCore::dispatch`. The first
 * scrape did exactly that and read 59 where the wire has 62 kinds —
 * a number close enough to the truth to be believed.
 */
function wireKinds(src) {
  const kinds = new Set();
  for (const m of src.matchAll(/this\.send\(\s*\{\s*kind:\s*"([a-z][A-Za-z0-9]*)"/g)) {
    kinds.add(m[1]);
  }
  for (const { envelope, kind } of SHELL_ENVELOPES) {
    if (!src.includes(`kind: "${envelope}"`)) {
      die(`SHELL_ENVELOPES maps ${envelope} -> ${kind}, but no such envelope is posted any more — delete the entry or fix it`);
    }
    kinds.add(kind);
  }
  return [...kinds].sort();
}

function die(msg) {
  console.error(`client-api-catalog: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------

const read = (rel) => readFileSync(resolve(PKG_DIR, rel), "utf8");

const clientSrc = read("src/client.ts");
const indexSrc = read("src/index.ts");
const protocolSrc = read("src/protocol.ts");

const members = clientMembers(clientSrc);
const undocumented = members.filter((m) => !m.summary).map((m) => m.name);
const kinds = wireKinds(clientSrc);
const origins = exportOrigins(indexSrc);
const barrelExports = exportedNames(indexSrc);

// Members of the non-client groups: the barrel's own re-exports, keyed
// by the module they came from.
const groupFor = (mod) => {
  if (!mod) return null;
  const g = GROUPS.find((g) => mod.startsWith(`./${g.file.replace(/^src\//, "").replace(/\.ts$/, "")}`)
    || mod.startsWith(`./${g.file.replace(/^src\//, "")}`)
    || (g.key === "journal" && mod.startsWith("./journal"))
    || (g.key === "client" && mod === "./client")
    || (g.key === "protocol" && mod === "./protocol"));
  return g ? g.key : null;
};

const groups = GROUPS.map((g) => ({ ...g, members: [] }));
const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));

for (const m of members) byKey.client.members.push(m);

for (const id of barrelExports) {
  const mod = origins.get(id);
  const key = groupFor(mod);
  if (!key) die(`export ${id} comes from ${mod ?? "nowhere the parser could see"} — add a group for it in GROUPS`);
  if (key === "client" && (id === "CanvasClient")) continue; // documented by its members
  byKey[key].members.push({
    name: id,
    kind: /^[A-Z]/.test(id) && !/^[A-Z_]+$/.test(id) ? "type" : "value",
    signature: id,
    summary: null,
  });
}

// `export * from "./protocol"` — the wire type barrel. Names come from
// the module itself, so the catalog lists what a consumer can import.
if (origins.has("*./protocol")) {
  for (const id of exportedNames(protocolSrc)) {
    if (byKey.protocol.members.some((m) => m.name === id)) continue;
    byKey.protocol.members.push({
      name: id,
      kind: id === "PROTOCOL_VERSION" ? "value" : "type",
      signature: id,
      summary: null,
    });
  }
}

const protocolVersion = Number(protocolSrc.match(/PROTOCOL_VERSION\s*=\s*(\d+)/)?.[1] ?? 0);

const catalog = {
  $comment:
    "GENERATED by scripts/client-api-catalog.mjs from packages/client/src — do not hand-edit. " +
    "The programmable SDK's public surface: names, signatures and summaries come from the declarations " +
    "and their doc comments, so a new public method is catalogued by existing and an undocumented one " +
    "fails the gate. `wireKinds` is this surface's column of the capability x surface matrix.",
  package: "@paged-media/client",
  protocol: protocolVersion,
  counts: {
    clientMembers: members.length,
    wireKinds: kinds.length,
    exports: barrelExports.length,
  },
  wireKinds: kinds,
  wireKindsVia: Object.fromEntries(SHELL_ENVELOPES.map((e) => [e.kind, e])),
  groups: groups.map((g) => ({
    key: g.key,
    title: g.title,
    summary: g.summary,
    members: g.members.map(({ doc, ...rest }) => rest),
  })),
};

// ---------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------

const problems = [];
if (undocumented.length) {
  problems.push(
    `undocumented public members (a public method without a doc comment cannot ship): ${undocumented.join(", ")}`,
  );
}
for (const [what, floor] of Object.entries(FLOORS)) {
  if (catalog.counts[what] < floor) {
    problems.push(
      `only ${catalog.counts[what]} ${what} — the floor is ${floor}. Either the surface shrank drastically or the parser stopped matching; both are failures.`,
    );
  }
}
if (!catalog.protocol) problems.push("no PROTOCOL_VERSION found in src/protocol.ts");

if (problems.length) {
  for (const p of problems) console.error(`client-api-catalog: ${p}`);
  process.exit(1);
}

const rendered = `${JSON.stringify(catalog, null, 2)}\n`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(TARGET, "utf8");
  } catch {
    die(`${TARGET} is missing — run: node scripts/client-api-catalog.mjs`);
  }
  if (current !== rendered) {
    die("api-catalog.json is stale — regenerate: node scripts/client-api-catalog.mjs");
  }
  console.log(
    `client-api-catalog: OK — ${catalog.counts.clientMembers} members, ${catalog.counts.wireKinds} wire kinds, protocol ${catalog.protocol}`,
  );
} else {
  writeFileSync(TARGET, rendered);
  console.log(
    `client-api-catalog: wrote ${TARGET} — ${catalog.counts.clientMembers} members, ${catalog.counts.wireKinds} wire kinds`,
  );
}
