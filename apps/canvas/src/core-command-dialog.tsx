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

// ADR 323 §4 — the typed core command form. Every core op that is a typed
// command (`host.objects.invoke("core.<op>", args)`, plugin-sdk
// core-commands) can be run from the UI through ONE dialog whose fields
// are generated from the command's ARGS SCHEMA (`host.objects.commands()`):
// text / number / bool / enum / ref / point / list, and an opaque record
// as JSON. Nothing about an op is hand-written here — the targeted entry
// points (Insert ▸ Field, the Path section, the Pages / Masters / Text
// Variables / style panels, …) only open it on an op with a prefill.
//
//   · arguments that name the selection or the caret are prefilled from
//     the live editor (`elementId` / `targetId` = the first selected item,
//     `otherId` / `maskId` = the second, `elementIds` = all of them,
//     `storyId` / `offset` / `start` / `end` = the text caret);
//   · Run = ONE `host.objects.invoke` = one batch = one undo step; a
//     refusal stays in the dialog with its code, never a guessed write.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";

import { addressOfElement, objectModelEditor, objectRegistry } from "./object-model";

type Args = Record<string, unknown>;

/** The plugin-api `ValueType` slice a command's args use. */
type ArgType = {
  kind: string;
  optional?: boolean;
  to?: string;
  members?: readonly string[];
  of?: ArgType;
  fields?: Record<string, ArgType>;
  shape?: string;
};

interface CommandInfo {
  id: string;
  title: string;
  owner: string;
  args: ArgType;
}

export const CORE_COMMAND_PREFIX = "core.";

interface Pending {
  seq: number;
  /** The op (`insertField`), or null: pick any typed core command. */
  op: string | null;
  prefill: Args;
  title?: string;
  /** Called with the invoke result once the command ran. */
  onDone?: (result: unknown) => void;
}

let pending: Pending | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/** Open the form on a typed core command (`op` without the `core.`
 *  prefix), or on the command picker when `op` is null. */
export function openCoreCommand(
  op: string | null,
  prefill: Args = {},
  opts: { title?: string; onDone?: (result: unknown) => void } = {},
): void {
  pending = { seq: ++seq, op, prefill, title: opts.title, onDone: opts.onDone };
  emit();
}

function close(): void {
  pending = null;
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const current = () => pending;

/** Run a typed core command directly (a panel button whose args are all
 *  known): ONE invoke = one undo step. Throws the refusal. */
export function invokeCoreCommand(op: string, args: Args): Promise<unknown> {
  return objectRegistry.invoke(`${CORE_COMMAND_PREFIX}${op}`, args);
}

// ------------------------------------------------------------ context

interface Ctx {
  items: string[];
  caret: { storyId: string; start: number; end: number } | null;
}

function liveContext(): Ctx {
  const editor = objectModelEditor() as unknown as {
    selection?: { elementSelection?: unknown[] };
    contentSelection?: {
      contentSelection?: Ctx["caret"];
      contentSelectionRef?: { current: Ctx["caret"] };
    };
  } | null;
  const items: string[] = [];
  for (const id of editor?.selection?.elementSelection ?? []) {
    try {
      items.push(addressOfElement(id as never));
    } catch {
      /* an id the grammar cannot spell: not prefilled */
    }
  }
  const cs = editor?.contentSelection;
  const caret = cs?.contentSelection ?? cs?.contentSelectionRef?.current ?? null;
  return { items, caret };
}

/** Prefill the arguments that name the selection or the caret. */
export function contextPrefill(fields: Record<string, ArgType>, ctx: Ctx): Args {
  const out: Args = {};
  for (const [name, t] of Object.entries(fields)) {
    if (t.kind === "ref" && t.to === "item") {
      const at = name === "otherId" || name === "maskId" ? 1 : 0;
      if (ctx.items[at]) out[name] = ctx.items[at];
    } else if (t.kind === "list" && t.of?.kind === "ref" && t.of.to === "item") {
      if (ctx.items.length) out[name] = [...ctx.items];
    } else if (t.kind === "ref" && t.to === "story" && ctx.caret) {
      out[name] = `story:${ctx.caret.storyId}`;
    } else if (t.kind === "number" && ctx.caret) {
      if (name === "offset" || name === "start") out[name] = ctx.caret.start;
      else if (name === "end") out[name] = ctx.caret.end;
    }
  }
  return out;
}

// ------------------------------------------------------------ values

const isOpaque = (t: ArgType) => t.kind === "struct" || t.kind === "map";

/** A typed value → the form's text. */
function toText(t: ArgType, v: unknown): string {
  if (v === undefined || v === null) return "";
  if (t.kind === "point" && Array.isArray(v)) return v.join(", ");
  if (t.kind === "list" && Array.isArray(v) && t.of && !isOpaque(t.of)) return v.map(String).join(", ");
  if (isOpaque(t) || t.kind === "list" || typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** The form's text → the typed value (undefined = not given). */
export function fromText(t: ArgType, text: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  const s = text.trim();
  if (s === "") return { ok: true, value: undefined };
  switch (t.kind) {
    case "number": {
      const n = Number(s);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, reason: `"${s}" is not a number` };
    }
    case "bool":
      return { ok: true, value: s === "true" };
    case "point": {
      const p = s.split(/[\s,]+/).map(Number);
      return p.length === 2 && p.every(Number.isFinite)
        ? { ok: true, value: p }
        : { ok: false, reason: `"${s}" is not a point (x, y)` };
    }
    case "list": {
      if (t.of && !isOpaque(t.of) && !s.startsWith("[")) {
        const parts = s.split(t.of.kind === "text" ? /\s*,\s*/ : /[\s,]+/).filter(Boolean);
        const out: unknown[] = [];
        for (const p of parts) {
          const r = fromText(t.of, p);
          if (!r.ok) return r;
          out.push(r.value);
        }
        return { ok: true, value: out };
      }
      break;
    }
    case "text":
    case "ref":
    case "enum":
      return { ok: true, value: s };
    default:
      break;
  }
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    // An opaque record also takes a bare word (`pageNumber`).
    return /^[A-Za-z][A-Za-z0-9]*$/.test(s) ? { ok: true, value: s } : { ok: false, reason: `"${s}" is not JSON` };
  }
}

/** The address list a ref field picks from. */
const queryKindOf = (to: string): string => (to === "item" ? "frame" : to);

// -------------------------------------------------------------- dialog

export function CoreCommandDialog() {
  const p = useSyncExternalStore(subscribe, current, current);
  return p ? <CommandForm key={p.seq} pending={p} /> : null;
}

function CommandForm({ pending: p }: { pending: Pending }) {
  const [commands, setCommands] = useState<CommandInfo[] | null>(null);
  const [op, setOp] = useState<string | null>(p.op);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void objectRegistry.commands().then((list) => {
      if (cancelled) return;
      setCommands(
        (list as unknown as CommandInfo[]).filter((c) => c.owner === "core" && c.id.startsWith(CORE_COMMAND_PREFIX)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const info = useMemo(
    () => (op ? (commands?.find((c) => c.id === `${CORE_COMMAND_PREFIX}${op}`) ?? null) : null),
    [commands, op],
  );
  const fields = useMemo(
    () => Object.entries(info?.args.fields ?? {}).filter(([name]) => name !== "handle"),
    [info],
  );

  // Seed the form: the selection / caret, then the entry's own prefill.
  useEffect(() => {
    if (!info) return;
    const seedFields = Object.fromEntries(fields);
    const seed = { ...contextPrefill(seedFields, liveContext()), ...(op === p.op ? p.prefill : {}) };
    setTexts(Object.fromEntries(fields.map(([name, t]) => [name, toText(t, seed[name])])));
    setError(null);
    // The address lists the ref fields pick from.
    let cancelled = false;
    const refs = fields.filter(([, t]) => t.kind === "ref" || (t.kind === "list" && t.of?.kind === "ref"));
    void Promise.all(
      refs.map(async ([name, t]) => {
        const to = (t.kind === "ref" ? t.to : t.of?.to) ?? "";
        try {
          return [name, (await objectRegistry.query(queryKindOf(to), { limit: 200 })) as string[]] as const;
        } catch {
          return [name, [] as string[]] as const;
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setOptions(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [info]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = async (): Promise<void> => {
    if (!op || !info) return;
    const args: Args = {};
    for (const [name, t] of fields) {
      const r = fromText(t, texts[name] ?? "");
      if (!r.ok) {
        setError(`${name}: ${r.reason}`);
        return;
      }
      if (r.value === undefined) {
        if (!t.optional) {
          setError(`${name} is required`);
          return;
        }
        continue;
      }
      args[name] = r.value;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await invokeCoreCommand(op, args);
      p.onDone?.(result);
      close();
    } catch (e) {
      const err = e as { code?: string; message?: string };
      setError(`${err.code ? `${err.code}: ` : ""}${err.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-core-command-backdrop=""
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      style={backdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="core-command-title"
        data-core-command-dialog={op ?? ""}
        data-ready={info ? "true" : "false"}
        style={card}
      >
        <h2 id="core-command-title" style={{ margin: "0 0 4px", fontSize: 15 }}>
          {p.title ?? info?.title ?? "Run command"}
        </h2>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted-fg, #9a9a9a)" }}>
          {op ? (
            <code data-core-command-id="" style={mono}>
              {CORE_COMMAND_PREFIX}
              {op}
            </code>
          ) : (
            "Pick a core command. Its arguments are generated from its schema."
          )}
        </p>
        {p.op === null && (
          <label style={labelStyle}>
            Command
            <select
              data-core-command-picker=""
              value={op ?? ""}
              onChange={(e) => setOp(e.target.value || null)}
              style={input}
            >
              <option value="">—</option>
              {(commands ?? []).map((c) => (
                <option key={c.id} value={c.id.slice(CORE_COMMAND_PREFIX.length)}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {fields.map(([name, t]) => (
          <ArgField
            key={name}
            name={name}
            type={t}
            text={texts[name] ?? ""}
            options={options[name]}
            onChange={(v) => setTexts((prev) => ({ ...prev, [name]: v }))}
          />
        ))}
        {error && (
          <p data-core-command-error="" role="alert" style={{ margin: "8px 0", fontSize: 12, color: "var(--pg-danger, #ff6b6b)" }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button type="button" data-core-command-cancel="" onClick={close} style={btn(false)}>
            Cancel
          </button>
          <button
            type="button"
            data-core-command-run=""
            disabled={!info || busy}
            onClick={() => void run()}
            style={btn(true, !info || busy)}
          >
            Run
          </button>
        </div>
      </div>
    </div>
  );
}

function ArgField({
  name,
  type: t,
  text,
  options,
  onChange,
}: {
  name: string;
  type: ArgType;
  text: string;
  options?: string[];
  onChange(v: string): void;
}) {
  const hint =
    t.kind === "ref"
      ? `${t.to} address`
      : t.kind === "point"
        ? "x, y (pt)"
        : t.kind === "list"
          ? t.of && !isOpaque(t.of)
            ? `${t.of.kind === "ref" ? `${t.of.to} addresses` : t.of.kind}, comma-separated`
            : "JSON list"
          : isOpaque(t)
            ? `${t.shape ?? "record"} (JSON)`
            : t.kind;
  const listId = options?.length ? `core-command-${name}-options` : undefined;
  let control;
  if (t.kind === "bool" || t.kind === "enum") {
    const members = t.kind === "bool" ? ["true", "false"] : [...(t.members ?? [])];
    control = (
      <select data-core-command-arg={name} value={text} onChange={(e) => onChange(e.target.value)} style={input}>
        <option value="">{t.optional ? "(not set)" : "—"}</option>
        {members.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    );
  } else if (isOpaque(t) || (t.kind === "list" && (!t.of || isOpaque(t.of)))) {
    control = (
      <textarea
        data-core-command-arg={name}
        value={text}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...input, ...mono, height: "auto" }}
      />
    );
  } else {
    control = (
      <>
        <input
          data-core-command-arg={name}
          value={text}
          list={listId}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...input, ...(t.kind === "ref" || t.kind === "list" ? mono : {}) }}
        />
        {listId && (
          <datalist id={listId}>
            {options!.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        )}
      </>
    );
  }
  return (
    <label style={labelStyle} data-core-command-field={name}>
      <span>
        {name}
        {t.optional ? "" : " *"}{" "}
        <span style={{ color: "var(--muted-fg, #9a9a9a)", fontSize: 11 }}>— {hint}</span>
      </span>
      {control}
    </label>
  );
}

const backdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "grid",
  placeItems: "center",
  background: "rgba(0,0,0,0.6)",
  font: "13px/1.5 var(--font-sans, system-ui, sans-serif)",
};
const card: CSSProperties = {
  width: "min(480px, 92vw)",
  maxHeight: "82vh",
  overflow: "auto",
  padding: 20,
  borderRadius: "var(--radius-lg, 10px)",
  border: "1px solid var(--border, #2a2a2a)",
  background: "var(--elevated, var(--background, #161616))",
  color: "var(--fg, #e7e7e7)",
  boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
};
const mono: CSSProperties = { font: "12px var(--font-mono, monospace)" };
const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  margin: "0 0 8px",
  fontSize: 12,
};
const input: CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 7,
  border: "1px solid var(--border, #2a2a2a)",
  background: "var(--background, #111)",
  color: "var(--fg, #e7e7e7)",
  boxSizing: "border-box",
};
function btn(primary: boolean, disabled = false): CSSProperties {
  return {
    padding: "7px 14px",
    borderRadius: 7,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    border: "1px solid var(--border, #2a2a2a)",
    background: primary ? "var(--pg-primary, #4f7cff)" : "transparent",
    color: primary ? "var(--pg-primary-fg, #fff)" : "var(--fg, #e7e7e7)",
  };
}

// -------------------------------------------------------------- button

/**
 * A panel's in-place door onto one typed core command: with `args` it
 * runs `core.<op>` directly (one invoke = one undo step; a refusal shows
 * on the button as `data-command-error`); without, it opens the form on
 * the op with `prefill`.
 */
export function CoreCommandButton({
  op,
  label,
  args,
  prefill,
  title,
  disabled,
  testId,
  onDone,
}: {
  op: string;
  label: string;
  args?: Args;
  prefill?: Args;
  title?: string;
  disabled?: boolean;
  testId?: string;
  onDone?: (result: unknown) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const click = async (): Promise<void> => {
    if (!args) {
      openCoreCommand(op, prefill ?? {}, { title: title ?? label, onDone });
      return;
    }
    setBusy(true);
    try {
      const r = await invokeCoreCommand(op, args);
      setError(null);
      onDone?.(r);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      setError(`${err.code ? `${err.code}: ` : ""}${err.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      data-core-command-button={op}
      data-cockpit-action={testId}
      data-command-error={error ?? undefined}
      title={error ?? title ?? `${CORE_COMMAND_PREFIX}${op}`}
      disabled={disabled || busy}
      onClick={() => void click()}
      className="inline-flex h-[28px] items-center justify-center rounded-[7px] border px-[10px] text-[12px]"
      style={{
        borderColor: error ? "var(--pg-danger, #ff6b6b)" : "var(--chrome-divider, var(--border))",
        background: "transparent",
        color: "var(--pg-fg)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

/** A new master's arguments: a fresh Self id and the document's page
 *  size (core needs a positive master page size). */
export function newMasterPrefill(pageSizePt: readonly [number, number] | null | undefined): Args {
  return {
    master: `u${Date.now().toString(36)}`,
    name: "B-Master",
    ...(pageSizePt ? { widthPt: pageSizePt[0], heightPt: pageSizePt[1] } : { widthPt: 612, heightPt: 792 }),
  };
}
