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

// ADR 323 — the pure half of the schema-driven `PropertyField`.
//
// Everything a field decides WITHOUT React lives here, so the node unit
// test (`scripts/object-model.test.mjs`) pins it: which widget a
// `ValueType` gets, how typed text becomes a value (and when it is
// refused — never coerced silently, ADR 323 rule 3), how a multi-object
// selection collapses to ONE state, and how "Bind to data…" names its
// target durably (ADR 558/559: a selector over a Name or an `x-paged:oid`
// label, never a session address).
//
// Types-only imports: node's type stripping runs this file as-is.

import type {
  ShellObjectOp,
  ShellObjectValue,
  ShellPropertySchema,
  ShellValueType,
} from "./object-model-types";

// ------------------------------------------------------------ widgets

export type FieldWidget =
  | "toggle"
  | "number"
  | "length"
  | "color"
  | "select"
  | "segments"
  | "text"
  | "bounds"
  | "transform"
  | "point"
  | "ref"
  | "list"
  | "json";

export interface FieldOption {
  value: string;
  label?: string;
}

/** Panel-side presentation over a schema row. It never changes the TYPE:
 *  enum-like core paths are still `text` until core publishes their
 *  members (ADR 132), so a panel may offer its known IDML strings as
 *  options — the field writes them as text, validated as text. */
export interface FieldPresentation {
  options?: readonly FieldOption[];
  /** `select` (default with options) or icon/label `segments`. */
  style?: "select" | "segments";
}

export function widgetFor(
  type: ShellValueType,
  presentation?: FieldPresentation,
): FieldWidget {
  const offered =
    type.kind === "enum" ||
    ((type.kind === "text" || type.kind === "ref") &&
      (presentation?.options?.length ?? 0) > 0);
  if (offered) return presentation?.style === "segments" ? "segments" : "select";
  switch (type.kind) {
    case "bool":
      return "toggle";
    case "number":
      return "number";
    case "length":
      return "length";
    case "color":
      return "color";
    case "text":
    case "asset":
      return "text";
    case "ref":
      return "ref";
    case "bounds":
      return "bounds";
    case "transform":
      return "transform";
    case "point":
      return "point";
    case "list":
      return "list";
    default:
      return "json";
  }
}

/** The options a select offers: an enum's members (labelled by the
 *  presentation when it names them), else the presentation's own. */
export function optionsFor(
  type: ShellValueType,
  presentation?: FieldPresentation,
): FieldOption[] {
  const given = presentation?.options ?? [];
  if (type.kind !== "enum") return given.map((o) => ({ value: o.value, label: o.label ?? o.value }));
  return type.members.map((m) => ({
    value: m,
    label: given.find((o) => o.value === m)?.label ?? m,
  }));
}

// ------------------------------------------------------ parse / format

/** Points per unit — the same table the SDK's `parseLength` uses. */
const PT_PER_UNIT: Record<string, number> = {
  pt: 1,
  px: 0.75,
  in: 72,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  pc: 12,
  p: 12,
};

export function parseLength(text: string): number | null {
  const m = /^\s*(-?\d+(?:\.\d+)?|-?\.\d+)\s*([a-z]*)\s*$/i.exec(text);
  if (!m) return null;
  const factor = m[2] ? PT_PER_UNIT[m[2].toLowerCase()] : 1;
  return factor === undefined ? null : Number(m[1]) * factor;
}

export type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

const NUMS = /[\s,;]+/;

function numbers(text: string, n: number | null, each: (t: string) => number | null): number[] | null {
  const trimmed = text.trim().replace(/^\[|\]$/g, "");
  const parts = trimmed === "" ? [] : trimmed.split(NUMS);
  if (n !== null && parts.length !== n) return null;
  const out: number[] = [];
  for (const p of parts) {
    const v = each(p);
    if (v === null || !Number.isFinite(v)) return null;
    out.push(v);
  }
  return out;
}

const plainNumber = (t: string): number | null => {
  const n = Number(t);
  return t.trim() !== "" && Number.isFinite(n) ? n : null;
};

function inRange(
  n: number,
  row: Pick<ShellPropertySchema, "range"> | undefined,
): string | null {
  const r = row?.range;
  if (r?.min !== undefined && n < r.min) return `${n} is below ${r.min}`;
  if (r?.max !== undefined && n > r.max) return `${n} is above ${r.max}`;
  return null;
}

/** Typed text → a value of `type`, or a refusal with a reason. */
export function parseInput(
  type: ShellValueType,
  text: string,
  row?: Pick<ShellPropertySchema, "range">,
): ParseResult {
  const no = (reason: string): ParseResult => ({ ok: false, reason });
  const t = text.trim();
  switch (type.kind) {
    case "bool":
      if (/^(true|yes|1|on)$/i.test(t)) return { ok: true, value: true };
      if (/^(false|no|0|off)$/i.test(t)) return { ok: true, value: false };
      return no(`"${text}" is not true or false`);
    case "number": {
      const n = plainNumber(t.replace(/\s*%$/, "").replace(/\s*°$/, ""));
      if (n === null) return no(`"${text}" is not a number`);
      if (type.integer && !Number.isInteger(n)) return no(`"${text}" is not a whole number`);
      const e = inRange(n, row);
      return e ? no(e) : { ok: true, value: n };
    }
    case "length": {
      const n = parseLength(t);
      if (n === null) return no(`"${text}" is not a length`);
      const e = inRange(n, row);
      return e ? no(e) : { ok: true, value: n };
    }
    case "enum":
      return type.members.includes(t)
        ? { ok: true, value: t }
        : no(`"${text}" is not one of ${type.members.join(", ")}`);
    case "bounds": {
      const v = numbers(t, 4, parseLength);
      return v ? { ok: true, value: v } : no("bounds are four lengths: top, left, bottom, right");
    }
    case "transform": {
      const v = numbers(t, 6, plainNumber);
      return v ? { ok: true, value: v } : no("a transform is six numbers: a b c d tx ty");
    }
    case "point": {
      const v = numbers(t, 2, parseLength);
      return v ? { ok: true, value: v } : no("a point is two lengths: x, y");
    }
    case "list": {
      const of = type.of;
      if (of.kind === "length" || of.kind === "number") {
        const v = numbers(t, null, of.kind === "length" ? parseLength : plainNumber);
        if (!v) return no(`"${text}" is not a list of ${of.kind === "length" ? "lengths" : "numbers"}`);
        if (type.maxItems !== undefined && v.length > type.maxItems) {
          return no(`at most ${type.maxItems} items`);
        }
        return { ok: true, value: v };
      }
      return parseJson(text);
    }
    case "map":
    case "struct":
      return parseJson(text);
    case "text":
      if (type.maxLength !== undefined && text.length > type.maxLength) {
        return no(`longer than ${type.maxLength} characters`);
      }
      return { ok: true, value: text };
    default:
      // color / ref / asset: a reference string, written as typed.
      return t === "" ? no("empty reference") : { ok: true, value: t };
  }
}

function parseJson(text: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: `"${text}" is not JSON` };
  }
}

const trim = (n: number): string => String(Math.round(n * 1000) / 1000);

/** A value → the text `parseInput` reads back to the same value. */
export function formatValue(type: ShellValueType, value: unknown): string {
  if (value === null || value === undefined) return "";
  switch (type.kind) {
    case "bool":
      return value ? "true" : "false";
    case "number":
    case "length":
      return typeof value === "number" ? trim(value) : String(value);
    case "bounds":
    case "point":
      return Array.isArray(value) ? value.map((n) => trim(Number(n))).join(", ") : String(value);
    case "transform":
      return Array.isArray(value) ? value.map((n) => trim(Number(n))).join(" ") : String(value);
    case "list":
      if (
        Array.isArray(value) &&
        (type.of.kind === "length" || type.of.kind === "number")
      ) {
        return value.map((n) => trim(Number(n))).join(", ");
      }
      return JSON.stringify(value);
    case "map":
    case "struct":
      return JSON.stringify(value);
    default:
      return String(value);
  }
}

// ------------------------------------------------ selection reduction

/** What one field shows for its whole target set. */
export type FieldState =
  | { state: "none" }
  | { state: "value"; value: unknown }
  | { state: "mixed" }
  | { state: "absent" }
  | { state: "refused"; code: string; reason: string };

const same = (a: unknown, b: unknown): boolean =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

/** Collapse one read per selected object into one state. Disagreement is
 *  `mixed` — never a picked winner; an object the path does not apply to
 *  beside one it does is also `mixed`; a refusal anywhere wins (the field
 *  must say WHY it cannot work). */
export function reduceValues(values: readonly ShellObjectValue[]): FieldState {
  if (values.length === 0) return { state: "none" };
  const refusal = values.find((v) => v.kind === "refused");
  if (refusal && refusal.kind === "refused") {
    return { state: "refused", code: refusal.code, reason: refusal.reason };
  }
  if (values.every((v) => v.kind === "absent")) return { state: "absent" };
  if (values.some((v) => v.kind !== "value")) return { state: "mixed" };
  const first = (values[0] as { value: unknown }).value;
  return values.every((v) => same((v as { value: unknown }).value, first))
    ? { state: "value", value: first }
    : { state: "mixed" };
}

/** One commit over the selection = ONE batch = one undo step. */
export function setOps(
  addresses: readonly string[],
  path: string,
  value: unknown,
): ShellObjectOp[] {
  return addresses.map((address) => ({ op: "set", address, path, value }));
}

// ------------------------------------------------- Bind to data… target

/** ADR 559 — a binding recipe lives as JSON under this label key on the
 *  element it targets; the badge looks for the path inside it. */
export const BIND_LABEL_KEY = "x-paged:bind";
/** ADR 559 §4 — the stable object id, minted on first reference, because
 *  InDesign renumbers every `Self` on save. */
export const OID_LABEL_KEY = "x-paged:oid";

/** A selector predicate value, quoted (ADR 131: `"…"` with `\` escapes). */
export function quoteSelectorValue(text: string): string {
  return `"${text.replace(/["\\]/g, (c) => `\\${c}`)}"`;
}

/** Does the element carry a binding for `path`? The recipe format is
 *  paged.data's (Wave 5); every recipe names its `"path"`, which is the
 *  one thing this probe relies on. */
export function boundProbeSelector(address: string, path: string): string {
  return `${address}[label.${BIND_LABEL_KEY}*=${quoteSelectorValue(`"path":"${path}"`)}]`;
}

/** The engine gates every `x-paged:` label value to `{ v, data }`. */
export function oidEnvelope(oid: string): string {
  return JSON.stringify({ v: 1, data: { oid } });
}

export function oidFromEnvelope(text: string | null | undefined): string | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { data?: { oid?: unknown } };
    return typeof parsed.data?.oid === "string" ? parsed.data.oid : null;
  } catch {
    return null;
  }
}

const PAGE_ITEM_KINDS = new Set([
  "textFrame",
  "rectangle",
  "oval",
  "polygon",
  "graphicLine",
  "group",
  "frame",
]);

/** The selector KIND word for an address's object (`rectangle:u1` → `frame`). */
export function selectorKindOf(address: string): string {
  const head = address.slice(0, Math.max(0, address.indexOf(":")));
  return PAGE_ITEM_KINDS.has(head) ? "frame" : head || "*";
}

export interface BindTargetDeps {
  objects: { query(selector: string): Promise<string[]> };
  /** The element's IDML `Name`, when core models one. */
  readName(address: string): Promise<string | null>;
  /** The element's existing `x-paged:oid`, if any. */
  readOid(address: string): Promise<string | null>;
  /** Write `x-paged:oid = envelope` on the element (one undo step). */
  writeOid(address: string, envelope: string): Promise<void>;
  mintOid(): string;
}

export interface BindTarget {
  selector: string;
  via: "name" | "oid" | "plugin";
  /** An oid label was written to make the selector durable. */
  wrote: boolean;
}

/**
 * The durable target of a binding on `address` (ADR 558 `TargetRef`):
 *   1. a plugin address IS its plugin-local stable key (ADR 559 §6);
 *   2. a `Name` — only when the registry resolves it to exactly this
 *      object (so it self-upgrades the day core models `Name`, and an
 *      ambiguous name is never used);
 *   3. otherwise an `x-paged:oid` label: reused, or minted and written
 *      when `write` (a dry run — the not-yet path — writes nothing).
 */
export async function resolveBindTarget(
  deps: BindTargetDeps,
  address: string,
  opts: { write: boolean },
): Promise<BindTarget> {
  if (address.startsWith("plugin:")) {
    return { selector: address, via: "plugin", wrote: false };
  }
  const kind = selectorKindOf(address);
  const name = await deps.readName(address);
  if (name) {
    const selector = `${kind}[name=${quoteSelectorValue(name)}]`;
    let hits: string[] = [];
    try {
      hits = await deps.objects.query(selector);
    } catch {
      hits = [];
    }
    if (hits.length === 1 && hits[0] === address) {
      return { selector, via: "name", wrote: false };
    }
  }
  const existing = await deps.readOid(address);
  const oid = existing ?? deps.mintOid();
  let wrote = false;
  if (!existing && opts.write) {
    await deps.writeOid(address, oidEnvelope(oid));
    wrote = true;
  }
  return {
    selector: `${kind}[label.${OID_LABEL_KEY}*=${quoteSelectorValue(`"oid":"${oid}"`)}]`,
    via: "oid",
    wrote,
  };
}

// ------------------------------------------- the bindProperty command

/** The command "Bind to data…" routes to. paged.data's universal binding
 *  (ADR 558) lands in Wave 5; until then the editor declares the args
 *  and shows a not-yet message when no bundle offers it. */
export const BIND_PROPERTY_COMMAND = "paged.data.bindProperty";
/** Ids the data plugin may register it under: the bare id above, its
 *  manifest-namespaced untyped twin, or a typed `objectModel` command. */
export const BIND_PROPERTY_COMMAND_IDS: readonly string[] = [
  BIND_PROPERTY_COMMAND,
  "media.paged.data.command.bindProperty",
  "media.paged.data.bindProperty",
];

/** `selector` — the durable target (ADR 558 `TargetRef::Selector`);
 *  `path` — the ADR 132 path; `schema` — the target's schema row as JSON
 *  (a `ValueType` cannot describe a `ValueType`, so the row travels as
 *  text and the data plugin parses it). */
export const BIND_PROPERTY_ARGS: ShellValueType = {
  kind: "struct",
  fields: {
    selector: { kind: "text" },
    path: { kind: "text" },
    schema: { kind: "text", multiline: true },
  },
};

/** A minimal structural check of command args against their declared
 *  type (the SDK's `validateValue` lives in plugin-sdk, which the shell
 *  does not depend on). `null` = conforms. */
export function checkArgs(type: ShellValueType, value: unknown, at = "args"): string | null {
  switch (type.kind) {
    case "struct": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return `${at} must be a record`;
      }
      const rec = value as Record<string, unknown>;
      for (const k of Object.keys(rec)) {
        if (!(k in type.fields)) return `${at} has an extra field "${k}"`;
      }
      for (const [k, t] of Object.entries(type.fields)) {
        if (!(k in rec)) return `${at}.${k} is missing`;
        const e = checkArgs(t, rec[k], `${at}.${k}`);
        if (e) return e;
      }
      return null;
    }
    case "list":
      if (!Array.isArray(value)) return `${at} must be a list`;
      for (const [i, item] of value.entries()) {
        const e = checkArgs(type.of, item, `${at}[${i}]`);
        if (e) return e;
      }
      return null;
    case "bool":
      return typeof value === "boolean" ? null : `${at} must be a boolean`;
    case "number":
    case "length":
      return typeof value === "number" && Number.isFinite(value) ? null : `${at} must be a number`;
    case "enum":
      return typeof value === "string" && type.members.includes(value)
        ? null
        : `${at} must be one of ${type.members.join(" | ")}`;
    case "text":
    case "color":
    case "ref":
    case "asset":
      return typeof value === "string" ? null : `${at} must be a string`;
    default:
      return null;
  }
}
