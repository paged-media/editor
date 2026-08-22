#!/usr/bin/env node
// The journal's own guard (ADR 025).
//
// THE GOLDEN REDACTION TEST IN THIS FILE IS THE PRIVACY CONTRACT. The claim
// the design makes to users is that document text, file paths, URIs and user
// prose are UNREPRESENTABLE in an exported bundle — not filtered, not
// scrubbed, structurally impossible. A claim like that is worth exactly as
// much as the test that pins it, so this runs in CI and a failure here is a
// privacy regression, not a style nit.
//
// Also guards the two properties the code registry must keep: no code may
// declare a `data` key that INVITES user content, and every registered code
// must have a policy that actually bounds it.
//
// Run: `node scripts/journal.test.mjs`  (root `test:journal` npm script.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// `packages/client` is consumed by vite, so its imports are extensionless in
// the house style. Node's type-stripping ESM loader wants a real specifier, so
// resolve `./foo` -> `./foo.ts` for this run only. Kept in the test rather
// than the source: the guard adapts to the code, not the other way round.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      const parent = context.parentURL
        ? dirname(fileURLToPath(context.parentURL))
        : process.cwd();
      const candidate = resolvePath(parent, `${specifier}.ts`);
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = pathToFileURL(
  resolvePath(here, "..", "packages", "client", "src", "journal"),
).href;
const { IDENT_RE, FORBIDDEN_KEYS, sanitizeData, errorIdent, identOf, siteHash } =
  await import(`${CLIENT}/entry.ts`);
const { JournalBuffer } = await import(`${CLIENT}/buffer.ts`);
const { CODES, policyFor } = await import(`${CLIENT}/codes.ts`);
const { emptyLedger, KNOWN_BLIND_SPOTS } = await import(`${CLIENT}/uncaptured.ts`);
const { buildJournalBundle, serializeJournalBundle, reduceUserAgent, roundToHour } =
  await import(`${CLIENT}/export.ts`);
const { createGuardedLoader } = await import(
  pathToFileURL(
    resolvePath(here, "..", "apps", "canvas", "src", "plugin-load-guard.ts"),
  ).href
);

// ─────────────────────────────────────────────────────────────────────
// The predicate
// ─────────────────────────────────────────────────────────────────────

test("IDENT_RE rejects everything a user could have typed", () => {
  const mustReject = [
    "the quick brown fox",                      // prose (spaces)
    "/Users/alice/Documents/secret.idml",       // absolute path
    "C:\\Users\\alice\\secret.idml",            // windows path
    "https://example.com/private?token=abc",    // URI
    "Helvetica Neue",                           // font family
    "alice@example.com",                        // email
    "Chapter 1: The Beginning",                 // document text
    "Ünïcödé",                                  // non-ascii
    "UPPERCASE",                                // capitals
    "",                                         // empty
    "a".repeat(65),                             // over length
  ];
  for (const value of mustReject) {
    assert.equal(IDENT_RE.test(value), false, `must reject: ${value}`);
  }
});

test("IDENT_RE accepts the identifiers we actually emit", () => {
  const mustAccept = [
    "paged.pen",
    "media.paged.draw",
    "overset_text_dropped",
    "chromium",
    "k3f9a2b",
    "chrome.140.macos",
    "load-document",
    "a",
  ];
  for (const value of mustAccept) {
    assert.equal(IDENT_RE.test(value), true, `must accept: ${value}`);
  }
});

test("sanitizeData drops unsafe values and COUNTS them", () => {
  const { data, rejected } = sanitizeData({
    tool: "paged.pen",
    updates: 200,
    ok: true,
    path: "/Users/alice/secret.idml",
    note: "the quick brown fox",
    nested: { a: 1 },
    nan: Number.NaN,
  });
  assert.deepEqual(data, { tool: "paged.pen", updates: 200, ok: true });
  assert.equal(rejected, 4, "path, note, nested and NaN must all be rejected");
});

test("sanitizeData drops rather than truncates", () => {
  // A truncated path is still a path; a half sentence is still user text.
  const { data } = sanitizeData({ p: "/Users/alice/x.idml" });
  assert.equal(data, undefined);
});

test("errorIdent carries the kind, never the message or stack", () => {
  const err = new TypeError("/Users/alice/secret.idml is not a function");
  const ident = errorIdent(err);
  assert.equal(ident, "typeerror");
  assert.equal(ident.includes("alice"), false);
});

test("identOf normalises camelCase machine ids, and only machine ids", () => {
  // Command ids in this app are camelCase (`paged.chrome.toggleAll`), and they
  // are code-authored constants, so lowercasing is lossless.
  assert.equal(identOf("paged.chrome.toggleAll"), "paged.chrome.toggleall");
  assert.equal(identOf("media.paged.draw.boolean.union"), "media.paged.draw.boolean.union");
  // But it is NOT a back door for user content.
  assert.equal(identOf("The Quick Brown Fox"), undefined);
  assert.equal(identOf("/Users/Alice/Secret.idml"), undefined);
});

test("siteHash groups repeats without carrying content", () => {
  const a = siteHash("failed to load /Users/alice/secret.idml");
  const b = siteHash("failed to load /Users/alice/secret.idml");
  const c = siteHash("something else entirely");
  assert.equal(a, b, "same message must group");
  assert.notEqual(a, c, "different messages must not collide here");
  assert.equal(IDENT_RE.test(a), true, "a site hash must itself be safe");
});

// ─────────────────────────────────────────────────────────────────────
// THE GOLDEN TEST — this is the privacy contract
// ─────────────────────────────────────────────────────────────────────

test("an exported bundle cannot contain user text or paths", () => {
  const SECRET_TEXT = "the quick brown fox";
  const SECRET_PATH = "/Users/alice/Documents/secret.idml";

  const buffer = new JournalBuffer({
    origin: "shell",
    now: (() => {
      let t = 0;
      return () => (t += 1);
    })(),
    wallNow: () => 1_755_870_000_000,
  });

  // Emit entries that TRY, in every way a caller plausibly might, to smuggle
  // user content into the journal.
  buffer.record({ code: "shell.command", data: { id: SECRET_TEXT } });
  buffer.record({ code: "shell.command", data: { id: SECRET_PATH } });
  buffer.record({
    code: "shell.window.error",
    severity: "error",
    data: { error: new Error(SECRET_PATH).message },
  });
  buffer.record({
    code: "plugin.log",
    data: { level: "warn", site: siteHash(`${SECRET_TEXT} ${SECRET_PATH}`) },
  });
  buffer.record({ code: "shell.gesture", data: { tool: "paged.pen", updates: 200 } });

  const json = serializeJournalBundle(
    buildJournalBundle({
      entries: buffer.entries(),
      uncaptured: buffer.getLedger(),
      app: { editorVersion: "0.0.0", protocol: 62 },
      env: { ua: reduceUserAgent("Mozilla/5.0 (Macintosh) Chrome/140.0 Safari/537"), viewport: { w: 1443, h: 907 } },
      clocks: { shellEpochMs: 0 },
      generatedAtMs: 1_755_870_000_000,
    }),
  );

  assert.equal(json.includes(SECRET_TEXT), false, "user text leaked into the bundle");
  assert.equal(json.includes(SECRET_PATH), false, "a file path leaked into the bundle");
  assert.equal(json.includes("alice"), false, "a user name leaked into the bundle");
  // The safe values DID survive — otherwise this test would pass vacuously.
  assert.equal(json.includes("paged.pen"), true);
  assert.equal(json.includes('"updates": 200'), true);
});

test("the bundle coarsens the wall clock and the viewport", () => {
  const bundle = buildJournalBundle({
    entries: [],
    uncaptured: emptyLedger(),
    app: { editorVersion: "0.0.0", protocol: 62 },
    env: { ua: "chrome.140.macos", viewport: { w: 1443, h: 907 } },
    clocks: { shellEpochMs: 0 },
    generatedAtMs: Date.UTC(2026, 7, 22, 14, 37, 42),
  });
  assert.equal(bundle.generatedAtHour, "2026-08-22T14:00Z");
  assert.deepEqual(bundle.env.viewport, { w: 1440, h: 910 });
});

test("reduceUserAgent keeps family+major+platform and nothing else", () => {
  const raw =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/140.0.7259.55 Safari/537.36";
  const reduced = reduceUserAgent(raw);
  assert.equal(reduced, "chrome.140.macos");
  assert.equal(IDENT_RE.test(reduced), true);
  assert.equal(reduced.includes("537"), false, "build numbers are fingerprints");
});

test("the bundle always carries the declared blind spots", () => {
  const bundle = buildJournalBundle({
    entries: [],
    uncaptured: emptyLedger(),
    app: { editorVersion: "0.0.0", protocol: 62 },
    env: { ua: "chrome.140.macos" },
    clocks: { shellEpochMs: 0 },
    generatedAtMs: 0,
  });
  assert.ok(bundle.blindSpots.length >= 8, "blind spots must not be silently emptied");
  for (const spot of bundle.blindSpots) {
    assert.ok(spot.id && spot.what && spot.why && spot.wouldCost);
  }
});

test("opt-in sections are absent unless asked for", () => {
  const base = {
    entries: [],
    uncaptured: emptyLedger(),
    app: { editorVersion: "0.0.0", protocol: 62 },
    env: { ua: "chrome.140.macos" },
    clocks: { shellEpochMs: 0 },
    generatedAtMs: 0,
  };
  const off = buildJournalBundle(base);
  assert.equal("crash" in off, false);
  assert.equal("documentShape" in off, false);

  const on = buildJournalBundle({
    ...base,
    includeCrash: { stacks: ["at foo"] },
    includeDocumentShape: { pages: 4 },
  });
  assert.deepEqual(on.crash, { stacks: ["at foo"] });
  assert.deepEqual(on.documentShape, { pages: 4 });
});

// ─────────────────────────────────────────────────────────────────────
// The registry
// ─────────────────────────────────────────────────────────────────────

test("no code declares a data key that invites user content", () => {
  for (const [code, spec] of Object.entries(CODES)) {
    for (const key of spec.data ?? []) {
      assert.equal(
        FORBIDDEN_KEYS.includes(key),
        false,
        `${code} declares forbidden data key "${key}" — that key name invites ` +
          `user content even though sanitizeData would reject the value`,
      );
    }
  }
});

test("every code has text and a bounded policy", () => {
  for (const [code, spec] of Object.entries(CODES)) {
    assert.ok(spec.text?.length > 0, `${code} has no text`);
    const p = spec.policy;
    assert.ok(
      p.mode === "always" ||
        (p.mode === "coalesce" && p.windowMs > 0) ||
        (p.mode === "sample" && p.every > 1) ||
        (p.mode === "aggregate" && p.windowMs > 0),
      `${code} has an unbounded or malformed policy`,
    );
  }
});

test("code ids follow the dotted area convention", () => {
  const areas = new Set(["engine", "worker", "client", "shell", "plugin", "journal"]);
  for (const code of Object.keys(CODES)) {
    const area = code.split(".")[0];
    assert.ok(areas.has(area), `${code} has unknown area "${area}"`);
    assert.equal(IDENT_RE.test(code), true, `${code} is not itself a safe identifier`);
  }
});

test("an unregistered code still records rather than vanishing", () => {
  // Losing a signal because someone forgot a registry entry would be the
  // silent-drop failure this whole subsystem exists to prevent.
  assert.deepEqual(policyFor("totally.unknown.code"), { mode: "always" });
});

// ─────────────────────────────────────────────────────────────────────
// The buffer
// ─────────────────────────────────────────────────────────────────────

function fixedBuffer(overrides = {}) {
  let t = 0;
  return new JournalBuffer({
    origin: "shell",
    now: () => t++,
    wallNow: () => 0,
    ...overrides,
  });
}

test("the ring is bounded and counts what it evicted", () => {
  const b = fixedBuffer({ capacity: 4 });
  for (let i = 0; i < 10; i += 1) b.record({ code: "shell.command", data: { id: `c${i}` } });
  assert.equal(b.entries().length, 4, "ring must not grow past capacity");
  assert.equal(b.getLedger().evicted, 6, "evictions must be counted, not silent");
  // Oldest-first, and it kept the NEWEST four.
  assert.deepEqual(b.entries().map((e) => e.data.id), ["c6", "c7", "c8", "c9"]);
});

test("debug is gated off by default, info and above always record", () => {
  const b = fixedBuffer();
  b.record({ code: "shell.command", severity: "debug" });
  b.record({ code: "shell.command", severity: "info" });
  b.record({ code: "shell.window.error", severity: "error" });
  assert.equal(b.entries().length, 2);
});

test("sample keeps 1 in N, stamps the rate, and counts the rest", () => {
  const b = fixedBuffer();
  for (let i = 0; i < 16; i += 1) b.record({ code: "plugin.mutate", data: { ok: true } });
  const kept = b.entries();
  assert.equal(kept.length, 2, "plugin.mutate samples every 8");
  assert.equal(kept[0].data.sampled, 8, "the survivor must say it was sampled");
  assert.equal(b.getLedger().collapsed, 14);
});

test("aggregate never records individually and rolls up on flush", () => {
  const b = fixedBuffer();
  for (let i = 0; i < 5; i += 1) {
    b.record({ code: "engine.dispatch", durMs: 10, data: { kind: "mutate" } });
  }
  assert.equal(b.entries().length, 0, "aggregate must not emit per event");
  b.flush();
  const [rollup] = b.entries();
  assert.equal(rollup.code, "engine.dispatch");
  assert.equal(rollup.data.n, 5);
  assert.equal(rollup.data.avgMs, 10);
  assert.equal(rollup.data.maxMs, 10);
});

test("coalesce folds identical entries and carries the count", () => {
  const b = fixedBuffer();
  for (let i = 0; i < 4; i += 1) {
    b.record({ code: "plugin.log", data: { level: "warn", site: "k3f9a2b" } });
  }
  const kept = b.entries();
  assert.equal(kept.length, 1, "identical log lines inside the window fold");
  assert.equal(kept[0].data.n, 4, "the count survives even though entries did not");
});

test("record never throws, whatever it is handed", () => {
  const b = fixedBuffer();
  const cyclic = {};
  cyclic.self = cyclic;
  assert.doesNotThrow(() => b.record({ code: "shell.command", data: cyclic }));
  assert.doesNotThrow(() => b.record({ code: "shell.command", data: { fn: () => {} } }));
});

test("a throwing subscriber cannot break recording", () => {
  const b = fixedBuffer();
  b.subscribe(() => {
    throw new Error("bad watcher");
  });
  assert.doesNotThrow(() => b.record({ code: "shell.command" }));
  assert.equal(b.entries().length, 1);
});

test("take() hands entries over exactly once", () => {
  const b = fixedBuffer();
  b.record({ code: "shell.command" });
  b.record({ code: "shell.command" });
  assert.equal(b.take().length, 2);
  assert.equal(b.take().length, 0, "a drained buffer must not re-deliver");
});

test("entry timestamps are relative, never wall clock", () => {
  const b = new JournalBuffer({
    origin: "shell",
    now: (() => {
      let t = 5_000;
      return () => (t += 10);
    })(),
    wallNow: () => 1_755_870_000_000,
  });
  b.record({ code: "shell.command" });
  const [e] = b.entries();
  assert.ok(e.t < 1_000, `t must be relative to the epoch, got ${e.t}`);
  assert.equal(b.epochWallMs, 1_755_870_000_000, "the wall clock lives on the buffer, once");
});

// ─────────────────────────────────────────────────────────────────────
// The bundle-activation guard (ADR 025 §4a)
// ─────────────────────────────────────────────────────────────────────
//
// The point of this guard is entirely in its FAILURE path: eight bundles load
// from one array literal over an unguarded `activate()`, so before it, a throw
// in bundle #3 silently prevented #4-#8 from loading. The success path proves
// itself on every boot; this is the half that would otherwise rot unnoticed.

function guardHarness(failing = new Set()) {
  const recorded = [];
  const problems = [];
  let t = 0;
  const load = createGuardedLoader({
    load: (bundle) => {
      if (failing.has(bundle.manifest.id)) {
        throw new TypeError(
          `Cannot read properties of undefined at /Users/alice/plugins/${bundle.manifest.id}.js`,
        );
      }
      return { id: bundle.manifest.id, active: true, dispose() {} };
    },
    record: (e) => recorded.push(e),
    publishProblem: (bundleId, key, diagnostics) =>
      problems.push({ bundleId, key, diagnostics }),
    now: () => (t += 5),
  });
  return { load, recorded, problems };
}

const EIGHT = [
  "media.paged.draw",
  "media.paged.web",
  "media.paged.data",
  "media.paged.sheet",
  "media.paged.image",
  "media.paged.publish",
  "media.paged.pdf",
  "media.paged.doc",
].map((id) => ({ manifest: { id } }));

test("a throwing bundle does not take the ones after it down", () => {
  // Break #3 (`media.paged.data`) — the exact scenario the array literal had.
  const h = guardHarness(new Set(["media.paged.data"]));
  const loaded = EIGHT.map(h.load).filter((l) => l !== null);

  assert.equal(loaded.length, 7, "seven bundles must survive one bad one");
  assert.equal(
    loaded.some((l) => l.id === "media.paged.data"),
    false,
    "the failed bundle must not be in the loaded list",
  );
  // Everything AFTER the failure still loaded — the actual regression guarded.
  for (const id of ["media.paged.sheet", "media.paged.image", "media.paged.pdf", "media.paged.doc"]) {
    assert.ok(loaded.some((l) => l.id === id), `${id} (after the failure) must still load`);
  }
});

test("the failure is attributed in the journal, not swallowed", () => {
  const h = guardHarness(new Set(["media.paged.data"]));
  EIGHT.map(h.load);

  const failures = h.recorded.filter((e) => e.data.ok === false);
  assert.equal(failures.length, 1, "exactly one failure recorded");
  assert.equal(failures[0].code, "plugin.activate");
  assert.equal(failures[0].severity, "error");
  assert.equal(failures[0].data.plugin, "media.paged.data", "the culprit is NAMED");
  assert.equal(failures[0].data.error, "typeerror");
  assert.equal(typeof failures[0].durMs, "number");

  // ...and the other seven are recorded as successes with timings.
  const ok = h.recorded.filter((e) => e.data.ok === true);
  assert.equal(ok.length, 7);
});

test("an activation failure never carries the throw's text into the journal", () => {
  // The injected error message embeds a plausible disk path, exactly as a real
  // bundler/module error would.
  const h = guardHarness(new Set(["media.paged.data"]));
  EIGHT.map(h.load);
  const json = JSON.stringify(h.recorded);
  assert.equal(json.includes("/Users/alice"), false, "a disk path leaked into the journal");
  assert.equal(json.includes("Cannot read properties"), false, "throw text leaked into the journal");
});

test("the failure also reaches the user-facing Problems panel", () => {
  const h = guardHarness(new Set(["media.paged.data"]));
  EIGHT.map(h.load);
  assert.equal(h.problems.length, 1);
  assert.equal(h.problems[0].bundleId, "media.paged.data");
  assert.equal(h.problems[0].key, "activation");
  assert.equal(h.problems[0].diagnostics[0].severity, "error");
  // The Problems panel is LOCAL UI, not an exported artifact, so the full
  // message is appropriate here — that asymmetry is deliberate.
  assert.ok(h.problems[0].diagnostics[0].message.includes("failed to activate"));
});

test("a malformed bundle (no manifest) is contained too", () => {
  const h = guardHarness();
  const loaded = [{ manifest: { id: "media.paged.draw" } }, {}, { manifest: { id: "media.paged.doc" } }]
    .map(h.load)
    .filter((l) => l !== null);
  assert.equal(loaded.length, 2, "reading a missing manifest must not escape the guard");
  const failure = h.recorded.find((e) => e.data.ok === false);
  assert.equal(failure.data.plugin, "unknown", "an unidentifiable bundle is named 'unknown', not crashed on");
});

test("all eight loading cleanly produces eight successes and no problems", () => {
  const h = guardHarness();
  const loaded = EIGHT.map(h.load).filter((l) => l !== null);
  assert.equal(loaded.length, 8);
  assert.equal(h.problems.length, 0);
  assert.equal(h.recorded.every((e) => e.data.ok === true), true);
});
