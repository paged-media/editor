#!/usr/bin/env node
// The editor's object-model seam (ADR 323, Wave 2b): the pure halves of
// the schema-driven `PropertyField`, the "Bind to data…" target resolver,
// the declared command args, and the `editor.*` object automation.
//
// The React component and the live registry are covered by the Playwright
// spec `tests/object-model.spec.ts`; everything here is the logic those
// lean on, run without a browser.
//
// Run: `node --experimental-strip-types scripts/object-model.test.mjs`
// (root `test:object-model` npm script).

import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// House style is extensionless imports (vite); node's type-stripping loader
// wants a real specifier. Same hook as `journal.test.mjs`.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
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
const shell = (p) =>
  pathToFileURL(resolvePath(here, "..", "packages", "shell", "src", p)).href;

const M = await import(shell("catalog/property-field-model.ts"));
const A = await import(shell("demo/object-automation.ts"));

// ───────────────────────────────────────────── widgets per ValueType

test("every ValueType kind maps to a widget", () => {
  const cases = [
    [{ kind: "bool" }, "toggle"],
    [{ kind: "number", unit: "percent" }, "number"],
    [{ kind: "length" }, "length"],
    [{ kind: "color" }, "color"],
    [{ kind: "enum", members: ["a", "b"] }, "select"],
    [{ kind: "text" }, "text"],
    [{ kind: "bounds" }, "bounds"],
    [{ kind: "transform" }, "transform"],
    [{ kind: "ref", to: "style:object" }, "ref"],
    [{ kind: "list", of: { kind: "length" } }, "list"],
    [{ kind: "point" }, "point"],
    [{ kind: "struct", fields: {} }, "json"],
  ];
  for (const [type, widget] of cases) {
    assert.equal(M.widgetFor(type), widget, JSON.stringify(type));
  }
});

test("a text row with presentation options renders as a select; enum members win", () => {
  assert.equal(M.widgetFor({ kind: "text" }, { options: [{ value: "x" }] }), "select");
  assert.equal(M.widgetFor({ kind: "text" }, { options: [{ value: "x" }], style: "segments" }), "segments");
  assert.deepEqual(
    M.optionsFor({ kind: "enum", members: ["Solid", "Dashed"] }, undefined).map((o) => o.value),
    ["Solid", "Dashed"],
  );
});

// ───────────────────────────────────────────── parse + format

test("parseInput coerces text against the type, never silently", () => {
  assert.deepEqual(M.parseInput({ kind: "length" }, "1in"), { ok: true, value: 72 });
  assert.deepEqual(M.parseInput({ kind: "length" }, "12"), { ok: true, value: 12 });
  assert.equal(M.parseInput({ kind: "length" }, "wide").ok, false);
  assert.deepEqual(M.parseInput({ kind: "number", integer: true }, "3"), { ok: true, value: 3 });
  assert.equal(M.parseInput({ kind: "number", integer: true }, "3.5").ok, false);
  assert.deepEqual(M.parseInput({ kind: "number", unit: "percent" }, "40%"), { ok: true, value: 40 });
  assert.deepEqual(M.parseInput({ kind: "bool" }, "yes"), { ok: true, value: true });
  assert.deepEqual(M.parseInput({ kind: "bounds" }, "0, 0, 100, 50"), {
    ok: true,
    value: [0, 0, 100, 50],
  });
  assert.equal(M.parseInput({ kind: "bounds" }, "0, 0, 100").ok, false);
  assert.deepEqual(M.parseInput({ kind: "transform" }, "1 0 0 1 10 20"), {
    ok: true,
    value: [1, 0, 0, 1, 10, 20],
  });
  assert.deepEqual(M.parseInput({ kind: "list", of: { kind: "length" } }, "4, 2mm"), {
    ok: true,
    value: [4, 2 * (72 / 25.4)],
  });
  assert.equal(M.parseInput({ kind: "enum", members: ["a"] }, "b").ok, false);
  assert.deepEqual(M.parseInput({ kind: "text" }, " keep "), { ok: true, value: " keep " });
});

test("parseInput checks the row's range", () => {
  const r = M.parseInput({ kind: "number", unit: "percent" }, "140", { range: { min: 0, max: 100 } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /100/);
});

test("formatValue round-trips through parseInput", () => {
  const types = [
    [{ kind: "length" }, 12.5],
    [{ kind: "bounds" }, [1, 2, 3, 4]],
    [{ kind: "transform" }, [1, 0, 0, 1, 5, 6]],
    [{ kind: "list", of: { kind: "number" } }, [1, 2]],
    [{ kind: "bool" }, false],
  ];
  for (const [type, value] of types) {
    const text = M.formatValue(type, value);
    assert.deepEqual(M.parseInput(type, text), { ok: true, value }, `${text}`);
  }
  assert.equal(M.formatValue({ kind: "text" }, null), "");
});

// ───────────────────────────────────────────── reduce over a selection

test("reduceValues: one state per field, never a picked winner", () => {
  const v = (value) => ({ kind: "value", value });
  assert.deepEqual(M.reduceValues([]), { state: "none" });
  assert.deepEqual(M.reduceValues([v(2), v(2)]), { state: "value", value: 2 });
  assert.deepEqual(M.reduceValues([v([1, 2]), v([1, 2])]), { state: "value", value: [1, 2] });
  assert.deepEqual(M.reduceValues([v(2), v(3)]), { state: "mixed" });
  assert.deepEqual(M.reduceValues([v(2), { kind: "mixed" }]), { state: "mixed" });
  assert.deepEqual(M.reduceValues([{ kind: "absent" }, { kind: "absent" }]), { state: "absent" });
  // An object the path does not apply to beside one it does: mixed, not the one value.
  assert.deepEqual(M.reduceValues([v(2), { kind: "absent" }]), { state: "mixed" });
  const r = M.reduceValues([{ kind: "refused", code: "unmapped", reason: "no wire form" }]);
  assert.equal(r.state, "refused");
  assert.equal(r.code, "unmapped");
});

test("setOps writes every selected address in ONE batch", () => {
  assert.deepEqual(M.setOps(["rectangle:a", "oval:b"], "frameStrokeWeight", 3), [
    { op: "set", address: "rectangle:a", path: "frameStrokeWeight", value: 3 },
    { op: "set", address: "oval:b", path: "frameStrokeWeight", value: 3 },
  ]);
});

test("the binding badge selector looks for the path inside x-paged:bind", () => {
  assert.equal(
    M.boundProbeSelector("rectangle:u1", "frameStrokeWeight"),
    'rectangle:u1[label.x-paged:bind*="\\"path\\":\\"frameStrokeWeight\\""]',
  );
});

// ───────────────────────────────────────────── Bind to data… target

function fakeObjects(answers) {
  const calls = [];
  return {
    calls,
    async query(selector) {
      calls.push(selector);
      return answers[selector] ?? [];
    },
  };
}

test("bind target: a Name that resolves to exactly this object is the selector", async () => {
  const objects = fakeObjects({ 'frame[name="Hero"]': ["rectangle:u1"] });
  const r = await M.resolveBindTarget(
    {
      objects,
      readName: async () => "Hero",
      readOid: async () => null,
      writeOid: async () => assert.fail("must not mint when the name works"),
      mintOid: () => "x",
    },
    "rectangle:u1",
    { write: true },
  );
  assert.deepEqual(r, { selector: 'frame[name="Hero"]', via: "name", wrote: false });
});

test("bind target: an ambiguous or unmodelled Name falls back to an x-paged:oid label", async () => {
  const objects = fakeObjects({ 'frame[name="Hero"]': ["rectangle:u1", "rectangle:u2"] });
  const written = [];
  const r = await M.resolveBindTarget(
    {
      objects,
      readName: async () => "Hero",
      readOid: async () => null,
      writeOid: async (address, envelope) => written.push([address, envelope]),
      mintOid: () => "0f3c",
    },
    "rectangle:u1",
    { write: true },
  );
  assert.deepEqual(r, {
    selector: 'frame[label.x-paged:oid*="\\"oid\\":\\"0f3c\\""]',
    via: "oid",
    wrote: true,
  });
  // The engine gates label values to the `{v, data}` envelope.
  assert.deepEqual(written, [["rectangle:u1", '{"v":1,"data":{"oid":"0f3c"}}']]);
});

test("bind target: an existing oid is reused, and nothing is written without write:true", async () => {
  const objects = fakeObjects({});
  const r = await M.resolveBindTarget(
    {
      objects,
      readName: async () => null,
      readOid: async () => "abc",
      writeOid: async () => assert.fail("never rewrite an existing oid"),
      mintOid: () => "new",
    },
    "oval:u9",
    { write: true },
  );
  assert.equal(r.selector, 'frame[label.x-paged:oid*="\\"oid\\":\\"abc\\""]');
  assert.equal(r.wrote, false);
  const dry = await M.resolveBindTarget(
    {
      objects,
      readName: async () => null,
      readOid: async () => null,
      writeOid: async () => assert.fail("dry run writes nothing"),
      mintOid: () => "fresh",
    },
    "oval:u9",
    { write: false },
  );
  assert.equal(dry.wrote, false);
  assert.match(dry.selector, /fresh/);
});

test("bind target: a plugin address is its own durable key (ADR 559 §6)", async () => {
  const r = await M.resolveBindTarget(
    {
      objects: fakeObjects({}),
      readName: async () => assert.fail(),
      readOid: async () => assert.fail(),
      writeOid: async () => assert.fail(),
      mintOid: () => "x",
    },
    "plugin:media.paged.image/layer/L7",
    { write: true },
  );
  assert.deepEqual(r, { selector: "plugin:media.paged.image/layer/L7", via: "plugin", wrote: false });
});

test("the bindProperty args are declared and checked", () => {
  assert.equal(M.BIND_PROPERTY_COMMAND, "paged.data.bindProperty");
  const good = { selector: 'frame[name="a"]', path: "frameStrokeWeight", schema: "{}" };
  assert.equal(M.checkArgs(M.BIND_PROPERTY_ARGS, good), null);
  assert.match(M.checkArgs(M.BIND_PROPERTY_ARGS, { ...good, path: 3 }), /path/);
  assert.match(M.checkArgs(M.BIND_PROPERTY_ARGS, { selector: "x" }), /missing/);
  assert.match(M.checkArgs(M.BIND_PROPERTY_ARGS, { ...good, extra: 1 }), /extra/);
});

// ───────────────────────────────────────────── editor.* automation

function fakeRegistry() {
  const log = [];
  return {
    log,
    async query(selector) {
      log.push(["query", selector]);
      return ["rectangle:u1"];
    },
    async get(address, path) {
      log.push(["get", address, path]);
      if (path === "nope") return { kind: "refused", code: "unknownPath", reason: "no nope" };
      return { kind: "value", value: 4 };
    },
    async set(address, path, value) {
      log.push(["set", address, path, value]);
      if (value === "bad") return { applied: false, undoSteps: 0, code: "invalidValue", reason: "bad value" };
      return { applied: true, undoSteps: 1 };
    },
    async batch(ops) {
      log.push(["batch", ops.length]);
      return { applied: false, undoSteps: 0, code: "readOnly", reason: "ro", index: 1 };
    },
    async schema(a) {
      log.push(["schema", a]);
      return [{ path: "frameStrokeWeight", type: { kind: "length" } }];
    },
  };
}

test("editor.* object calls go straight to host.objects", async () => {
  const objects = fakeRegistry();
  const api = A.buildObjectAutomation(() => objects);
  assert.deepEqual(await api.query("frame"), ["rectangle:u1"]);
  assert.deepEqual(await api.get("rectangle:u1", "frameStrokeWeight"), { kind: "value", value: 4 });
  assert.deepEqual(await api.set("rectangle:u1", "frameStrokeWeight", 2), { applied: true, undoSteps: 1 });
  assert.equal((await api.schema("rectangle:u1"))[0].path, "frameStrokeWeight");
});

test("editor.* surfaces refusals as errors carrying the code; batch returns its result", async () => {
  const api = A.buildObjectAutomation(() => fakeRegistry());
  await assert.rejects(api.get("rectangle:u1", "nope"), (e) => e.code === "unknownPath" && /no nope/.test(e.message));
  await assert.rejects(api.set("rectangle:u1", "frameStrokeWeight", "bad"), (e) => e.code === "invalidValue");
  const r = await api.batch([{ op: "set", address: "a", path: "p", value: 1 }]);
  assert.equal(r.applied, false);
  assert.equal(r.index, 1);
});

test("editor.* without a registry refuses with a code", async () => {
  const api = A.buildObjectAutomation(() => null);
  await assert.rejects(api.query("frame"), (e) => e.code === "unavailable");
});

// ───────────────────────────────────────────── declared command args

const { createCommandRegistry } = await import(shell("registries/command.ts"));

test("the command registry declares bindProperty's args before any plugin registers it", () => {
  const reg = createCommandRegistry(() => null);
  assert.deepEqual(reg.argsOf("paged.data.bindProperty"), M.BIND_PROPERTY_ARGS);
  assert.equal(reg.get("paged.data.bindProperty"), undefined);
  assert.equal(reg.argsOf("paged.view.zoomIn"), undefined);
});

test("invoke refuses a payload that does not match the declared args, before the handler runs", async () => {
  const reg = createCommandRegistry(() => null);
  const seen = [];
  reg.register({ id: "paged.data.bindProperty", title: "Bind", handler: (_p, payload) => seen.push(payload) });
  await assert.rejects(reg.invoke("paged.data.bindProperty", { selector: "x" }), /invalidValue/);
  assert.equal(seen.length, 0);
  const ok = { selector: "frame", path: "frameStrokeWeight", schema: "{}" };
  await reg.invoke("paged.data.bindProperty", ok);
  assert.deepEqual(seen, [ok]);
});

test("a contribution's own args are checked too; untyped commands still take anything", async () => {
  const reg = createCommandRegistry(() => null);
  reg.register({ id: "acme.typed", title: "T", args: { kind: "struct", fields: { n: { kind: "number" } } }, handler: (_p, a) => a });
  reg.register({ id: "acme.untyped", title: "U", handler: (_p, a) => a });
  await assert.rejects(reg.invoke("acme.typed", { n: "1" }), /invalidValue: acme.typed/);
  assert.deepEqual(await reg.invoke("acme.typed", { n: 1 }), { n: 1 });
  assert.equal(await reg.invoke("acme.untyped", "anything"), "anything");
});

// ───────────────────────────────────────────── panel migration

const { asPropertyFields, PAGED_INPUT_PROPERTY } = await import(shell("catalog/property-field-migrate.ts"));

test("asPropertyFields rewrites selection-bound leaves into schema-driven fields", () => {
  const sel = (path, scope) => ({ value: { kind: "selectionProperty", path, ...(scope ? { scope } : {}) } });
  const panel = {
    catalogId: "paged.layout.section",
    props: { title: "Stroke" },
    bindings: {},
    children: [
      { catalogId: "paged.input.length", props: { label: "Weight", icon: "ui-size" }, bindings: sel("frameStrokeWeight", "element") },
      { catalogId: "paged.input.toggle-group", props: { label: "Cap", options: [{ value: "ButtEndCap", label: "-" }] }, bindings: sel("frameStrokeEndCap") },
      { catalogId: "paged.input.select", props: { label: "Type", options: [] }, bindings: sel("frameStrokeType") },
      { catalogId: "paged.input.numeric-scrub", props: { seam: true, placeholder: "dash" }, bindings: {} },
      { catalogId: "paged.input.select", props: { label: "Start", seam: true }, bindings: sel("frameStrokeStartArrowhead") },
    ],
  };
  const out = asPropertyFields(panel);
  assert.equal(out.catalogId, "paged.layout.section");
  const [w, cap, type, dash, start] = out.children;
  assert.equal(w.catalogId, PAGED_INPUT_PROPERTY);
  assert.deepEqual(w.props, { label: "Weight", icon: "ui-size", path: "frameStrokeWeight", scope: "element" });
  assert.deepEqual(w.bindings, {});
  assert.equal(cap.props.style, "segments");
  assert.equal(cap.props.options.length, 1);
  assert.equal(type.props.style, "select");
  assert.deepEqual(dash, panel.children[3], "seams stay as they are");
  assert.deepEqual(start, panel.children[4], "a seamed binding stays seamed");
});

// ───────────────────────────────────────────── the shared registry

// The app's module-scope registry (`apps/canvas/src/object-model.ts`) is
// what `main.tsx` injects into every bundle host. Prove it routes: a
// bundle host built with it reports `objects.shared@1`, a kind the bundle
// contributes is visible through the APP's registry (and so to every
// panel field), and its command is invokable from there.
const APP = pathToFileURL(resolvePath(here, "..", "apps", "canvas", "src", "object-model.ts")).href;
const { objectRegistry, editorObjectModel } = await import(APP);
const { createBundleHost } = await import(
  pathToFileURL(resolvePath(here, "..", "apps", "canvas", "node_modules", "@paged-media", "plugin-sdk", "dist", "index.js")).href
);

test("the app registry is shared: a bundle's kinds and commands appear in it", async () => {
  const manifest = {
    id: "acme.om",
    name: "om test",
    version: "0.0.0",
    apiVersion: "^0.2.0",
    capabilities: { document: { read: "broad", write: "broad" } },
    contributes: {
      objectModel: {
        kinds: [{ kind: "thing", title: "Thing", schema: [{ path: "size", type: { kind: "length" } }] }],
        commands: [{ id: "acme.om.ping", title: "Ping", args: { kind: "struct", fields: { n: { kind: "number" } } } }],
      },
    },
  };
  // A bare editor: the host probes optional members at construction.
  const handle = createBundleHost(() => ({}), manifest, { objects: objectRegistry });
  assert.equal(handle.host.supports("objects.shared@1"), true);
  const reg = handle.host.contribute.objectModel({
    kinds: [
      {
        kind: "thing",
        title: "Thing",
        schema: [{ path: "size", type: { kind: "length" } }],
        hostOf: () => null,
        list: () => ["plugin:acme.om/thing/a"],
        get: () => ({ kind: "value", value: 7 }),
      },
    ],
    commands: [{ id: "acme.om.ping", title: "Ping", args: { kind: "struct", fields: { n: { kind: "number" } } }, handler: (_c, a) => a.n + 1 }],
  });
  const kinds = await editorObjectModel.objects.kinds();
  assert.ok(kinds.some((k) => k.kind === "plugin:acme.om/thing"), JSON.stringify(kinds.map((k) => k.kind)));
  assert.deepEqual(await editorObjectModel.objects.get("plugin:acme.om/thing/a", "size"), { kind: "value", value: 7 });
  assert.equal(await editorObjectModel.objects.invoke("acme.om.ping", { n: 1 }), 2);
  assert.equal((await editorObjectModel.objects.schema("plugin:acme.om/thing/a"))[0].path, "size");
  reg.dispose();
  handle.dispose();
});

test("the app model maps selections to canonical addresses and flags inferred core rows", () => {
  assert.equal(editorObjectModel.addressOf({ kind: "rectangle", id: "u12" }), "rectangle:u12");
  assert.equal(
    editorObjectModel.addressOf({ kind: "storyRange", id: { story_id: "u9", start: 0, end: 4 } }),
    "storyRange:u9@0..4",
  );
  assert.equal(editorObjectModel.isInferred({ path: "layerVisible", type: { kind: "bool" } }), true);
  assert.equal(editorObjectModel.isInferred({ path: "frameStrokeWeight", type: { kind: "length" } }), false);
  assert.equal(editorObjectModel.isInferred({ addressKind: "plugin:x/y", path: "layerVisible", type: { kind: "bool" } }), false);
  assert.equal(editorObjectModel.wireOf("frameStrokeWeight"), "length");
  assert.equal(editorObjectModel.wireOf("framePath"), null);
});
