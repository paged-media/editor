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

// The Design mode's control bar — the second row, about the SELECTION
// (InDesign's Control panel idiom), on one line:
//
//   nothing selected  page ‹ n / N › · page size · Bleed · Preview
//   page items        kind · X Y W H · rotation · stroke · opacity ·
//                     align (2+) · arrange · group / ungroup · Preview
//   text caret/range  paragraph style · character style · font · size ·
//                     leading · alignment · Preview
//
// (A plugin's edit context replaces the bar with its own segment —
// ContextToolbar's job, unchanged.)
//
// The row used to repeat five of the rail's tools, the one place above
// the canvas where the selection's numbers belong. Every field reads and
// writes through the same doors the panels use — `host.objects`
// (`useObjectProperty`: one batch = one undo step, refusals reported)
// and the page-footprint hook behind the Object panel's Bounds row — so
// the bar and the panels cannot disagree.

import {
  useEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { viewportToDoc, type ElementId, type FontSummary } from "@paged-media/client";
import {
  navigateToPages,
  useCamera,
  useCanvasClient,
  useCollection,
  useContentSelection,
  useDocument,
  useObjectModel,
  useObjectProperty,
  useRegistries,
  useScreenMode,
  useSelection,
} from "@paged-media/shell";

import { ALIGN_COMMAND, type AlignKind } from "../align-plan";
import { usePagePosition } from "../panels/page-position";
import { layoutPages } from "../ui/layout";
import { Chip, Sep, ToolPill } from "./toolbars";

export function DesignControlBar() {
  const { elementSelection } = useSelection();
  const { contentSelection } = useContentSelection();
  const body = contentSelection ? (
    <TextControls />
  ) : elementSelection.length > 0 ? (
    <ObjectControls ids={elementSelection} />
  ) : (
    <DocumentControls />
  );
  return (
    <div
      data-control-bar={contentSelection ? "text" : elementSelection.length > 0 ? "object" : "document"}
      style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflowX: "auto", scrollbarWidth: "none" }}
    >
      {body}
      <Sep />
      <PreviewChip />
    </div>
  );
}

// ── nothing selected ───────────────────────────────────────────────

function DocumentControls() {
  const { handle } = useDocument();
  const { camera, viewportSize } = useCamera();
  const screenMode = useScreenMode();
  const sizes = handle?.pageSizesPt ?? [];
  if (!handle || sizes.length === 0) {
    return (
      <span className="pg-ui-xs" style={{ paddingLeft: 4, color: "var(--pg-muted-fg)" }}>
        No document — File ▸ New document… or drop an IDML file here
      </span>
    );
  }
  // The page under the middle of the viewport (pages stack vertically —
  // `layoutPages`, the same convention the navigator fits to).
  const rects = layoutPages(sizes);
  const [, cy] = viewportToDoc(camera, viewportSize[0] / 2, viewportSize[1] / 2);
  let current = 0;
  for (let i = 0; i < rects.length; i++) if (cy >= rects[i].y - 12) current = i;
  const go = (i: number) => navigateToPages([Math.max(0, Math.min(sizes.length - 1, i))]);
  const [w, h] = sizes[current];
  const bleedOn = screenMode.screenMode === "bleed";
  return (
    <>
      <Label>Page</Label>
      <ToolPill icon="ui-chevron-left" title="Previous page" disabled={current === 0} onClick={() => go(current - 1)} testId="page-prev" />
      <span className="pg-value" data-control-page style={{ ...valueText, minWidth: 54, textAlign: "center" }}>
        {current + 1} / {sizes.length}
      </span>
      <ToolPill icon="ui-chevron-right" title="Next page" disabled={current >= sizes.length - 1} onClick={() => go(current + 1)} testId="page-next" />
      <Sep />
      <span className="pg-value" title="Page size" style={{ ...valueText, color: "var(--pg-muted-fg)" }}>
        {fmt(w, 0)} × {fmt(h, 0)} pt
      </span>
      <Sep />
      <Chip
        icon="ui-page"
        on={bleedOn}
        testId="design-bleed"
        title={bleedOn ? "Back to normal view" : "Show the bleed area"}
        onClick={() => screenMode.setScreenMode(bleedOn ? "normal" : "bleed")}
      >
        Bleed
      </Chip>
    </>
  );
}

function PreviewChip() {
  const screenMode = useScreenMode();
  const previewOn = screenMode.screenMode === "preview";
  return (
    <Chip
      icon={previewOn ? "ui-eye-off" : "ui-eye"}
      on={previewOn}
      testId="preview-toggle"
      title={previewOn ? "Back to normal view (W)" : "Preview (W)"}
      onClick={() => screenMode.togglePreview()}
    >
      Preview
    </Chip>
  );
}

// ── page items ─────────────────────────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  rectangle: "Rectangle",
  oval: "Ellipse",
  polygon: "Polygon",
  graphicLine: "Line",
  textFrame: "Text frame",
  group: "Group",
  image: "Image",
};

function kindLabel(ids: readonly ElementId[]): string {
  if (ids.length > 1) return `${ids.length} objects`;
  const kind = (ids[0] as unknown as { kind?: string }).kind ?? "";
  return KIND_LABEL[kind] ?? (kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : "Object");
}

function ObjectControls({ ids }: { ids: readonly ElementId[] }) {
  const { box, edgeLeaf, moveBy, setEdges } = usePagePosition();
  const rotation = useObjectProperty({ path: "frameRotationAngle" });
  const stroke = useObjectProperty({ path: "frameStrokeWeight" });
  const opacity = useObjectProperty({ path: "frameOpacity" });
  const { commands } = useRegistries();
  const model = useObjectModel();
  const multi = ids.length >= 2;
  const isGroup = ids.length === 1 && (ids[0] as unknown as { kind?: string }).kind === "group";
  const run = (id: string, args?: unknown) => void commands.invoke(id, args as never).catch(() => {});
  const align = (kind: AlignKind) => {
    if (!model) return;
    run(ALIGN_COMMAND, { kind, targets: ids.map((id) => model.addressOf(id)) });
  };
  const resizeHint = "Rotated, sheared, grouped or multiple objects resize through Transform";
  return (
    <>
      <span className="pg-ui-xs" data-control-kind style={{ fontWeight: 600, color: "var(--pg-fg)", padding: "0 4px", whiteSpace: "nowrap" }}>
        {kindLabel(ids)}
      </span>
      <Sep />
      <NumField label="X" title="Left edge (pt)" value={box?.left ?? null} unit="pt"
        onCommit={box ? (x) => moveBy(x - box.left, 0) : null} onStep={(d) => moveBy(d, 0)} testId="x" />
      <NumField label="Y" title="Top edge (pt)" value={box?.top ?? null} unit="pt"
        onCommit={box ? (y) => moveBy(0, y - box.top) : null} onStep={(d) => moveBy(0, d)} testId="y" />
      <NumField label="W" title={edgeLeaf ? "Width (pt)" : resizeHint} value={box ? box.right - box.left : null} unit="pt" min={0.1}
        onCommit={box && edgeLeaf ? (w) => setEdges({ ...box, right: box.left + w }) : null} testId="w" />
      <NumField label="H" title={edgeLeaf ? "Height (pt)" : resizeHint} value={box ? box.bottom - box.top : null} unit="pt" min={0.1}
        onCommit={box && edgeLeaf ? (h) => setEdges({ ...box, bottom: box.top + h }) : null} testId="h" />
      <Sep />
      <PropertyNum label="∠" title="Rotation (degrees)" field={rotation} unit="°" testId="rotation" />
      <PropertyNum label="Stroke" title="Stroke weight (pt)" field={stroke} unit="pt" min={0} step={0.25} digits={2} testId="stroke" />
      <PropertyNum label="Opacity" title="Opacity (%)" field={opacity} unit="%" min={0} max={100} digits={0} testId="opacity" />
      <Sep />
      {multi && (
        <>
          {(
            [
              ["left", "ui-obj-align-left", "Align left"],
              ["centerH", "ui-obj-align-center-h", "Center horizontally"],
              ["right", "ui-obj-align-right", "Align right"],
              ["top", "ui-obj-align-top", "Align top"],
              ["centerV", "ui-obj-align-center-v", "Center vertically"],
              ["bottom", "ui-obj-align-bottom", "Align bottom"],
            ] as const
          ).map(([kind, icon, title]) => (
            <ToolPill key={kind} icon={icon} title={title} onClick={() => align(kind)} testId={`align-${kind}`} />
          ))}
          <Sep />
        </>
      )}
      <ToolPill icon="ui-arrange-front" title="Bring to front" onClick={() => run("paged.object.bringToFront")} testId="bring-front" />
      <ToolPill icon="ui-arrange-back" title="Send to back" onClick={() => run("paged.object.sendToBack")} testId="send-back" />
      {multi && <Chip testId="group" title="Group (⌘G)" onClick={() => run("paged.object.group")}>Group</Chip>}
      {isGroup && <Chip testId="ungroup" title="Ungroup (⇧⌘G)" onClick={() => run("paged.object.ungroup")}>Ungroup</Chip>}
    </>
  );
}

// ── text ───────────────────────────────────────────────────────────

const JUSTIFY: ReadonlyArray<readonly [string, string, string]> = [
  ["LeftAlign", "ui-align-left", "Align left"],
  ["CenterAlign", "ui-align-center", "Align center"],
  ["RightAlign", "ui-align-right", "Align right"],
  ["LeftJustified", "ui-align-justify", "Justify"],
];

function TextControls() {
  const paraStyle = useObjectProperty({ path: "appliedParagraphStyle", scope: "content" });
  const charStyle = useObjectProperty({ path: "appliedCharacterStyle", scope: "content" });
  const family = useObjectProperty({ path: "characterFontFamily", scope: "content" });
  const size = useObjectProperty({ path: "characterFontSize", scope: "content" });
  const leading = useObjectProperty({ path: "characterLeading", scope: "content" });
  const justify = useObjectProperty({ path: "paragraphJustification", scope: "content" });
  const paraStyles = useStyleRows("paragraphStyles");
  const charStyles = useStyleRows("characterStyles");
  const fonts = useCollection<FontSummary>("fonts") ?? [];
  const current = typeof justify.state === "object" && justify.state.state === "value" ? String(justify.state.value) : null;
  return (
    <>
      <PropertySelect title="Paragraph style" field={paraStyle} width={150} testId="paragraph-style"
        options={paraStyles.map((r) => [r.selfId, cleanStyleName(r.name)])} />
      <PropertySelect title="Character style" field={charStyle} width={130} testId="character-style"
        options={charStyles.map((r) => [r.selfId, cleanStyleName(r.name)])} />
      <Sep />
      <PropertySelect title="Font family" field={family} width={150} testId="font-family"
        options={fonts.map((f) => [f.family, f.family])} />
      <PropertyNum label="Size" title="Font size (pt)" field={size} unit="pt" min={0.1} step={0.5} testId="font-size" />
      <PropertyNum label="Lead" title="Leading (pt)" field={leading} unit="pt" min={0} step={0.5} testId="leading" placeholder="Auto" />
      <Sep />
      {JUSTIFY.map(([value, icon, title]) => (
        <ToolPill key={value} icon={icon} title={title} on={current === value}
          disabled={!justify.commit} onClick={() => void justify.commit?.(value)} testId={`justify-${value}`} />
      ))}
    </>
  );
}

interface StyleRow {
  selfId: string;
  name: string;
}

/** A style collection, re-read whenever the document changes. */
function useStyleRows(collection: "paragraphStyles" | "characterStyles"): StyleRow[] {
  const client = useCanvasClient();
  const [rows, setRows] = useState<StyleRow[]>([]);
  useEffect(() => {
    let live = true;
    const refresh = () =>
      void client
        .collection<StyleRow>(collection)
        .then((r) => live && setRows([...r]))
        .catch(() => live && setRows([]));
    refresh();
    const off = client.subscribe((msg) => {
      if (msg.kind === "documentLoaded" || msg.kind === "mutationApplied" || msg.kind === "undoApplied" || msg.kind === "redoApplied") refresh();
    });
    return () => {
      live = false;
      off();
    };
  }, [client, collection]);
  return rows;
}

/** `$ID/[No paragraph style]` → `[No paragraph style]`; `Body/Lead` keeps its group. */
function cleanStyleName(name: string): string {
  return name.replace(/^\$ID\//, "");
}

// ── fields ─────────────────────────────────────────────────────────

type Prop = ReturnType<typeof useObjectProperty>;

function readNumber(field: Prop): number | null | "mixed" {
  const s = field.state;
  if (s.state === "mixed") return "mixed";
  // Unset on a writable target reads as the schema's default (an
  // untouched frame's opacity is 100, not blank).
  if (s.state === "absent" && field.commit && typeof field.row?.default === "number") {
    return field.row.default;
  }
  if (s.state !== "value") return null;
  const v = s.value as unknown;
  // Inherited (the run sets nothing): the schema default when it has one.
  if (v === null && typeof field.row?.default === "number") return field.row.default;
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && typeof (v as { value?: unknown }).value === "number") return (v as { value: number }).value;
  return null;
}

function PropertyNum(p: {
  label: string;
  title: string;
  field: Prop;
  unit: string;
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
  testId: string;
  /** Shown when the value is inherited and has no default ("Auto"). */
  placeholder?: string;
}) {
  const commit = p.field.commit;
  return (
    <NumField
      label={p.label}
      title={p.field.error ? `${p.title} — ${p.field.error}` : p.title}
      value={readNumber(p.field)}
      unit={p.unit}
      min={p.min}
      max={p.max}
      step={p.step}
      digits={p.digits}
      onCommit={commit ? (n) => void commit(n) : null}
      testId={p.testId}
      fieldState={p.field.state.state}
      placeholder={p.placeholder}
    />
  );
}

/** A compact numeric field: label · value · unit on one line. Enter or
 *  blur commits, Escape reverts, ↑/↓ steps (⇧ ×10). Read-only (no
 *  commit) renders muted; a mixed selection shows an em-dash. */
function NumField(p: {
  label: string;
  title: string;
  value: number | null | "mixed";
  unit: string;
  onCommit: ((n: number) => void) | null;
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
  testId: string;
  /** The object-model read verdict, stamped for scripts and specs. */
  fieldState?: string;
  placeholder?: string;
  /** Relative write for a step (a move by `delta`), where an absolute
   *  commit would be computed against a position not yet re-read. */
  onStep?: (delta: number) => void;
}) {
  const digits = p.digits ?? 1;
  const shown = p.value === "mixed" ? "—" : p.value === null ? "" : fmt(p.value, digits);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  // Only TYPED text commits on blur — a step already wrote itself, and
  // re-committing it against a not-yet-re-read position would move twice.
  const [typed, setTyped] = useState(false);
  useEffect(() => {
    if (!editing) setText(shown);
  }, [shown, editing]);
  const clamp = (n: number) => Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, n));
  const commit = (raw: string) => {
    const n = Number(raw.replace(",", ".").replace(/[^\d.+-]/g, ""));
    if (!p.onCommit || raw.trim() === "" || !Number.isFinite(n)) {
      setText(shown);
      return;
    }
    const next = clamp(n);
    if (typeof p.value === "number" && Math.abs(next - p.value) < 1e-6) return;
    p.onCommit(next);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commit(text);
      setTyped(false);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      setTyped(false);
      setText(shown);
      (e.target as HTMLInputElement).blur();
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && typeof p.value === "number" && p.onCommit) {
      e.preventDefault();
      const step = (p.step ?? 1) * (e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? 1 : -1);
      // Step from what the field SHOWS: a second press can land before
      // the first one's re-read, and `p.value` would still be the old one.
      const shownNow = Number(text);
      const base = Number.isFinite(shownNow) && text.trim() !== "" ? shownNow : p.value;
      const next = clamp(base + step);
      // The field is focused, so it is not following `shown`; show the
      // stepped value now rather than when focus leaves.
      setText(fmt(next, digits));
      if (p.onStep) p.onStep(next - base);
      else p.onCommit(next);
    }
    e.stopPropagation(); // tool shortcuts must not fire while typing
  };
  const readOnly = !p.onCommit || p.value === null;
  return (
    <label title={p.title} data-control-field={p.testId} data-field-state={p.fieldState} style={{ ...fieldBox, opacity: p.value === null && !p.placeholder ? 0.45 : 1 }}>
      <span style={fieldLabel}>{p.label}</span>
      <input
        value={text}
        placeholder={p.placeholder}
        readOnly={readOnly && !p.placeholder}
        aria-label={p.title}
        onFocus={(e) => {
          setEditing(true);
          setTyped(false);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setEditing(false);
          if (typed) commit(text);
          setTyped(false);
        }}
        onChange={(e) => {
          setTyped(true);
          setText(e.target.value);
        }}
        onKeyDown={onKeyDown}
        style={{ ...fieldInput, color: readOnly ? "var(--pg-muted-fg)" : "var(--pg-fg)" }}
      />
      <span style={fieldUnit}>{p.unit}</span>
    </label>
  );
}

function PropertySelect(p: {
  title: string;
  field: Prop;
  options: ReadonlyArray<readonly [string, string]>;
  width: number;
  testId: string;
}) {
  const s = p.field.state;
  const value = s.state === "value" ? String(s.value ?? "") : "";
  const known = p.options.some(([v]) => v === value);
  return (
    <select
      title={p.field.error ? `${p.title} — ${p.field.error}` : p.title}
      aria-label={p.title}
      data-control-field={p.testId}
      value={s.state === "value" ? value : "__none__"}
      disabled={!p.field.commit}
      onChange={(e) => {
        if (e.target.value !== "__none__") void p.field.commit?.(e.target.value);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      style={{ ...selectBox, width: p.width }}
    >
      {s.state !== "value" && (
        <option value="__none__" disabled>
          {s.state === "mixed" ? "— mixed —" : p.title}
        </option>
      )}
      {p.options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
      {s.state === "value" && !known && value !== "" && <option value={value}>{cleanStyleName(value)}</option>}
    </select>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="pg-ui-xs" style={{ color: "var(--pg-muted-fg)", paddingLeft: 4 }}>
      {children}
    </span>
  );
}

function fmt(n: number, digits: number): string {
  const f = Number(n.toFixed(digits));
  return String(Object.is(f, -0) ? 0 : f);
}

const valueText: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  fontSize: 12,
  color: "var(--pg-fg)",
  whiteSpace: "nowrap",
};

const fieldBox: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  height: 28,
  padding: "0 7px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--chrome-divider)",
  background: "var(--pg-muted)",
  flexShrink: 0,
  cursor: "text",
};

const fieldLabel: CSSProperties = {
  fontSize: 11,
  color: "var(--pg-muted-fg)",
  whiteSpace: "nowrap",
};

const fieldInput: CSSProperties = {
  width: 46,
  border: "none",
  outline: "none",
  background: "transparent",
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  fontSize: 12,
  textAlign: "right",
  padding: 0,
};

const fieldUnit: CSSProperties = {
  fontSize: 10.5,
  color: "var(--pg-muted-fg)",
};

const selectBox: CSSProperties = {
  height: 28,
  padding: "0 6px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--chrome-divider)",
  background: "var(--pg-muted)",
  color: "var(--pg-fg)",
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  flexShrink: 0,
};
