// W2.12 (2026-06-07) — Anchored Object panel. LIVE on the W1.16
// anchored-object surface (protocol v35): a frame anchored into a
// text story carries an `<AnchoredObjectSetting>`, which the canvas
// read-side surfaces as ten `anchored*` PropertyEntries on the
// element snapshot. This panel detects an anchored selection (by the
// presence of those entries), reads back the live values, and drives
// the position controls.
//
// Paths (all element scope, `setElementProperty`):
//   anchoredPosition              Value::Text  — InlinePosition / AboveLine / Anchored
//   anchorPoint                   Value::Text  — 9-cell anchor (TopLeftAnchor …)
//   anchoredXOffset               Value::Length (pt)
//   anchoredYOffset               Value::Length (pt)
//   anchoredHorizontalReference   Value::Text  — AnchorLocation / ColumnEdge / TextFrame / PageMargin / PageEdge
//   anchoredVerticalReference     Value::Text  — LineBaseline (the W1.16 line-ref metric) / LineAscent / TextFrame / …
//   anchoredHorizontalAlignment   Value::Text  — LeftAlign / CenterAlign / RightAlign
//   anchoredVerticalAlignment     Value::Text  — TopAlign / CenterAlign / BottomAlign
//   anchoredSpineRelative         Value::Bool
//   anchoredLockPosition          Value::Bool
//
// Custom-position controls (X/Y offsets, reference points, alignment)
// only apply when AnchoredPosition = `Anchored`; in inline / above-line
// modes InDesign hides them, so the panel disables them honestly.
//
// For a NON-anchored selection (or nothing selected) the panel states
// it honestly — no fake enable. Detection: a non-anchored frame's
// snapshot carries NONE of the `anchored*` entries (verified on the
// `anchored.idml` fixture: an ordinary page frame returns []).

import { useEffect, useState } from "react";

import { Icon, useCanvasClient, useSelection } from "@paged-media/shell";
import { KitSelect, LengthInput } from "@paged-media/ui";
import type {
  ElementId,
  ElementProperties,
  PropertyPath,
  Value,
} from "@paged-media/client";

import { ConceptShell, Kicker, Row } from "./concept-kit";

// ── IDML enum option tables ──────────────────────────────────────
// The selects carry the RAW IDML strings the read-side returns, so
// they reflect + round-trip. The fixtures exercise a subset; the full
// InDesign enum sets are listed so an arbitrary document's value
// always has a matching option.

const POSITION_OPTIONS: Array<[string, string]> = [
  ["InlinePosition", "Inline"],
  ["AboveLine", "Above line"],
  ["Anchored", "Custom (anchored)"],
];

const ANCHOR_POINT_OPTIONS: Array<[string, string]> = [
  ["TopLeftAnchor", "Top left"],
  ["TopCenterAnchor", "Top center"],
  ["TopRightAnchor", "Top right"],
  ["LeftCenterAnchor", "Left center"],
  ["CenterAnchor", "Center"],
  ["RightCenterAnchor", "Right center"],
  ["BottomLeftAnchor", "Bottom left"],
  ["BottomCenterAnchor", "Bottom center"],
  ["BottomRightAnchor", "Bottom right"],
];

const H_REFERENCE_OPTIONS: Array<[string, string]> = [
  ["AnchorLocation", "Anchor location"],
  ["ColumnEdge", "Column edge"],
  ["TextFrame", "Text frame"],
  ["PageMargin", "Page margin"],
  ["PageEdge", "Page edge"],
];

// VerticalReferencePoint — the W1.16 line-ref metric options. The
// renderer resolves these against real line-ref metrics.
const V_REFERENCE_OPTIONS: Array<[string, string]> = [
  ["LineBaseline", "Line baseline"],
  ["LineAscent", "Line ascent"],
  ["LineXheight", "Line x-height"],
  ["TopOfLeading", "Top of leading"],
  ["EmBoxBottom", "Em-box bottom"],
  ["ColumnEdge", "Column edge"],
  ["TextFrame", "Text frame"],
  ["PageMargin", "Page margin"],
  ["PageEdge", "Page edge"],
  ["AnchorLocation", "Anchor location"],
];

const H_ALIGN_OPTIONS: Array<[string, string]> = [
  ["LeftAlign", "Left"],
  ["CenterAlign", "Center"],
  ["RightAlign", "Right"],
];

const V_ALIGN_OPTIONS: Array<[string, string]> = [
  ["TopAlign", "Top"],
  ["CenterAlign", "Center"],
  ["BottomAlign", "Bottom"],
];

const ANCHORED_PATHS: PropertyPath[] = [
  "anchoredPosition",
  "anchorPoint",
  "anchoredXOffset",
  "anchoredYOffset",
  "anchoredHorizontalReference",
  "anchoredVerticalReference",
  "anchoredHorizontalAlignment",
  "anchoredVerticalAlignment",
  "anchoredSpineRelative",
  "anchoredLockPosition",
];

interface AnchoredSnapshot {
  /** True when the selected element carries an AnchoredObjectSetting. */
  anchored: boolean;
  values: Partial<Record<PropertyPath, Value>>;
  /** The single element id (for commits) — null when 0 / >1 selected. */
  id: ElementId | null;
  kind: string | null;
  loading: boolean;
}

/** Read the lone selected element's property snapshot and project the
 *  anchored facts. Re-fetches on every Operation-log push so the
 *  panel stays live with gestures / undo / other panels. */
function useAnchored(): AnchoredSnapshot {
  const client = useCanvasClient();
  const { elementSelection } = useSelection();
  const single = elementSelection.length === 1 ? elementSelection[0] : null;
  const [props, setProps] = useState<ElementProperties | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!single) {
      setProps(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const refetch = () => {
      client
        .elementProperties(single)
        .then((p) => {
          if (!cancelled) {
            setProps(p);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setProps(null);
            setLoading(false);
          }
        });
    };
    refetch();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        refetch();
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [client, single ? JSON.stringify(single) : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const values: Partial<Record<PropertyPath, Value>> = {};
  let anchored = false;
  if (props) {
    for (const entry of props.entries) {
      if (ANCHORED_PATHS.includes(entry.path) && entry.value) {
        values[entry.path] = entry.value;
        anchored = true;
      }
    }
  }
  return { anchored, values, id: single, kind: props?.kind ?? null, loading };
}

function unwrapText(v: Value | undefined): string {
  return v && v.type === "text" ? v.value : "";
}
function unwrapLength(v: Value | undefined): number | null {
  return v && v.type === "length" ? (v.value ?? 0) : null;
}
function unwrapBool(v: Value | undefined): boolean {
  return v && v.type === "bool" ? v.value : false;
}

/** Kit select bound to one `Value::Text` anchored path. */
function EnumRow({
  label,
  testId,
  options,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  testId: string;
  options: Array<[string, string]>;
  value: string;
  disabled?: boolean;
  onCommit: (next: string) => void;
}) {
  return (
    <Row label={label}>
      <KitSelect
        data-anchored-select={testId}
        value={value}
        disabled={disabled}
        onChange={(e) => onCommit(e.target.value)}
      >
        {/* An unset / unknown value still needs a slot so the native
            select shows it rather than silently snapping to option 0. */}
        {value === "" && <option value="">—</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </KitSelect>
    </Row>
  );
}

/** A small toggle pill bound to one `Value::Bool` anchored path. */
function BoolRow({
  label,
  testId,
  on,
  icon,
  disabled,
  onCommit,
}: {
  label: string;
  testId: string;
  on: boolean;
  icon?: string;
  disabled?: boolean;
  onCommit: (next: boolean) => void;
}) {
  return (
    <Row label={label}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        data-anchored-toggle={testId}
        disabled={disabled}
        onClick={() => onCommit(!on)}
        className="relative h-[17px] w-[30px] rounded-full border-0 disabled:opacity-45"
        style={{
          background: on ? "var(--pg-primary)" : "var(--chrome-divider)",
        }}
      >
        {icon && (
          <Icon
            name={icon}
            size={10}
            className="pointer-events-none absolute left-[3px] top-1/2 -translate-y-1/2"
            style={{ color: on ? "white" : "var(--pg-muted-fg)" }}
          />
        )}
        <span
          className="absolute top-[2px] h-[13px] w-[13px] rounded-full bg-white shadow"
          style={{ left: on ? 15 : 2 }}
        />
      </button>
    </Row>
  );
}

export function AnchoredPanel() {
  const client = useCanvasClient();
  const { anchored, values, id, kind, loading } = useAnchored();

  const setText = (path: PropertyPath, value: string) => {
    if (!id) return;
    void client
      .mutate({
        op: "setElementProperty",
        args: { elementId: id, path, value: { type: "text", value } as Value },
      })
      .catch(() => {});
  };
  const setLength = (path: PropertyPath, value: number) => {
    if (!id) return;
    void client
      .mutate({
        op: "setElementProperty",
        args: {
          elementId: id,
          path,
          value: { type: "length", value } as Value,
        },
      })
      .catch(() => {});
  };
  const setBool = (path: PropertyPath, value: boolean) => {
    if (!id) return;
    void client
      .mutate({
        op: "setElementProperty",
        args: { elementId: id, path, value: { type: "bool", value } as Value },
      })
      .catch(() => {});
  };

  const position = unwrapText(values.anchoredPosition);
  // Custom-position controls only matter when the object is in the
  // `Anchored` (custom) position; inline / above-line ignore them, so
  // disable them honestly there.
  const custom = position === "Anchored";

  return (
    <ConceptShell
      testId="anchored-panel"
      live
      target="Position mode, X/Y offsets, anchor + reference points (incl. the W1.16 line-ref metrics), alignment, spine-relative and lock are live for an anchored object; a non-anchored selection states it honestly."
    >
      {/* Honest status header — anchored vs not. */}
      <div
        data-anchored-status={
          loading
            ? "loading"
            : !id
              ? "none"
              : anchored
                ? "anchored"
                : "not-anchored"
        }
        className="flex items-center gap-[7px] rounded-[7px] border border-input bg-background px-2.5 py-2"
      >
        <Icon
          name="ui-pin"
          size={14}
          style={{
            color: anchored ? "var(--pg-primary)" : "var(--pg-muted-fg)",
            flexShrink: 0,
          }}
        />
        <span className="text-[12px]" style={{ color: "var(--pg-fg)" }}>
          {loading
            ? "Reading selection…"
            : !id
              ? "Select a single object."
              : anchored
                ? `Anchored ${kind ?? "object"}`
                : `${kind ?? "Object"} is not anchored`}
        </span>
      </div>

      {!anchored ? (
        <div
          className="text-xs text-muted-foreground"
          data-anchored-empty
        >
          {id
            ? "This object lives on the page, not anchored into text. Anchor it by cutting and pasting it into a text story (the InDesign inline / anchored flow)."
            : "Select an object anchored into a text story to edit its anchored position."}
        </div>
      ) : (
        <>
          <Kicker>Position</Kicker>
          <EnumRow
            label="Mode"
            testId="position"
            options={POSITION_OPTIONS}
            value={position}
            onCommit={(v) => setText("anchoredPosition", v)}
          />
          <BoolRow
            label="Spine relative"
            testId="spine-relative"
            on={unwrapBool(values.anchoredSpineRelative)}
            onCommit={(v) => setBool("anchoredSpineRelative", v)}
          />
          <BoolRow
            label="Lock position"
            testId="lock-position"
            icon="ui-lock"
            on={unwrapBool(values.anchoredLockPosition)}
            onCommit={(v) => setBool("anchoredLockPosition", v)}
          />

          <Kicker>Custom position</Kicker>
          {!custom && (
            <div
              className="text-[10.5px] italic opacity-70"
              style={{ color: "var(--pg-muted-fg)" }}
              data-anchored-custom-hint
            >
              Switch the mode to Custom (anchored) to edit the offset and
              reference points.
            </div>
          )}
          <Row label="X offset">
            <span data-anchored-num="x-offset" className="block w-full">
              <LengthInput
                aria-label="x-offset"
                valuePt={unwrapLength(values.anchoredXOffset)}
                disabled={!custom}
                onChangePt={() => {}}
                onCommitPt={(n) => setLength("anchoredXOffset", n)}
              />
            </span>
          </Row>
          <Row label="Y offset">
            <span data-anchored-num="y-offset" className="block w-full">
              <LengthInput
                aria-label="y-offset"
                valuePt={unwrapLength(values.anchoredYOffset)}
                disabled={!custom}
                onChangePt={() => {}}
                onCommitPt={(n) => setLength("anchoredYOffset", n)}
              />
            </span>
          </Row>
          <EnumRow
            label="Anchor point"
            testId="anchor-point"
            options={ANCHOR_POINT_OPTIONS}
            value={unwrapText(values.anchorPoint)}
            disabled={!custom}
            onCommit={(v) => setText("anchorPoint", v)}
          />
          <EnumRow
            label="H reference"
            testId="h-reference"
            options={H_REFERENCE_OPTIONS}
            value={unwrapText(values.anchoredHorizontalReference)}
            disabled={!custom}
            onCommit={(v) => setText("anchoredHorizontalReference", v)}
          />
          <EnumRow
            label="V reference"
            testId="v-reference"
            options={V_REFERENCE_OPTIONS}
            value={unwrapText(values.anchoredVerticalReference)}
            disabled={!custom}
            onCommit={(v) => setText("anchoredVerticalReference", v)}
          />
          <EnumRow
            label="H align"
            testId="h-align"
            options={H_ALIGN_OPTIONS}
            value={unwrapText(values.anchoredHorizontalAlignment)}
            disabled={!custom}
            onCommit={(v) => setText("anchoredHorizontalAlignment", v)}
          />
          <EnumRow
            label="V align"
            testId="v-align"
            options={V_ALIGN_OPTIONS}
            value={unwrapText(values.anchoredVerticalAlignment)}
            disabled={!custom}
            onCommit={(v) => setText("anchoredVerticalAlignment", v)}
          />
        </>
      )}
    </ConceptShell>
  );
}
