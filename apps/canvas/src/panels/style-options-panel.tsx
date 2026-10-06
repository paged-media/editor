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

// ADR 323 — Style Options: the paragraph, character, object, cell and
// table style DEFINITIONS as schema-driven forms. The target is a style
// address, `style:<family>/<self id>`; every field is a `PropertyField`
// on it, so an edit is a `set` on that address (core's `Set` resolves a
// style path to `setStyleProperty`), one edit = one undo step, and every
// field offers "Bind to data…".
//
// The sections mirror InDesign's Style Options dialog. They only LAY OUT
// paths; each field's type, range and widget come from the style's
// schema rows, and rows the schema adds for the family that no section
// names appear under "More". "Next style" and the bullet / numbering /
// region cell styles are refs picked from the style collections.
//
// The style panels open it on their applied style ("Style Options…").

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  CockpitBtn,
  CockpitPanelHeader,
  CockpitRow,
  PropertyField,
  cockpitActions,
  displayName,
  useCollection,
} from "@paged-media/shell";
import { formatAddress } from "@paged-media/plugin-sdk";
import type { CollectionName } from "@paged-media/client";

import { SchemaSections, type SectionSpec } from "./schema-sections";

export type StyleFamily = "paragraph" | "character" | "object" | "cell" | "table";

export const STYLE_OPTIONS_PANEL = "paged.style-options";

const FAMILIES: ReadonlyArray<{ family: StyleFamily; title: string; collection: CollectionName }> = [
  { family: "paragraph", title: "Paragraph", collection: "paragraphStyles" },
  { family: "character", title: "Character", collection: "characterStyles" },
  { family: "object", title: "Object", collection: "objectStyles" },
  { family: "cell", title: "Cell", collection: "cellStyles" },
  { family: "table", title: "Table", collection: "tableStyles" },
];

// ------------------------------------------------------------ layout

const CHARACTER_SECTIONS: readonly SectionSpec[] = [
  {
    title: "Basic Character Formats",
    fields: [
      { path: "characterFontFamily", label: "Font family" },
      { path: "characterFontStyle", label: "Font style" },
      { path: "characterFontSize", label: "Size" },
      { path: "characterLeading", label: "Leading" },
      { path: "characterKerningMethod", label: "Kerning" },
      { path: "characterTracking", label: "Tracking" },
      { path: "characterCase", label: "Case" },
      { path: "characterPosition", label: "Position" },
      { path: "characterUnderline", label: "Underline" },
      { path: "characterStrikethru", label: "Strikethrough" },
      { path: "characterLigatures", label: "Ligatures" },
    ],
  },
  {
    title: "Advanced Character Formats",
    fields: [{ path: "characterBaselineShift", label: "Baseline shift" }],
  },
  {
    title: "Character Color",
    fields: [{ path: "characterFillColor", label: "Fill", collection: "swatches" }],
  },
];

const PARAGRAPH_SECTIONS: readonly SectionSpec[] = [
  {
    title: "General",
    fields: [{ path: "paragraphStyleNextStyle", label: "Next style", collection: "paragraphStyles" }],
  },
  {
    title: "Indents and Spacing",
    fields: [
      { path: "paragraphJustification", label: "Alignment" },
      { path: "paragraphLeftIndent", label: "Left indent" },
      { path: "paragraphRightIndent", label: "Right indent" },
      { path: "paragraphFirstLineIndent", label: "First line" },
      { path: "paragraphSpaceBefore", label: "Space before" },
      { path: "paragraphSpaceAfter", label: "Space after" },
    ],
  },
  {
    title: "Tabs",
    fields: [{ path: "paragraphTabStops", label: "Tab stops" }],
  },
  {
    title: "Keep Options",
    fields: [
      { path: "paragraphKeepWithNext", label: "Keep with next" },
      { path: "paragraphKeepLinesTogether", label: "Keep lines" },
      { path: "paragraphKeepAllLinesTogether", label: "All lines" },
      { path: "paragraphKeepFirstLines", label: "First lines" },
      { path: "paragraphKeepLastLines", label: "Last lines" },
      { path: "paragraphStartParagraph", label: "Start" },
    ],
  },
  {
    title: "Hyphenation",
    fields: [
      { path: "paragraphHyphenation", label: "Hyphenate" },
      { path: "paragraphHyphenationZone", label: "Zone" },
    ],
  },
  {
    title: "Justification",
    fields: [{ path: "paragraphComposer", label: "Composer" }],
  },
  {
    title: "Span Columns",
    fields: [
      { path: "paragraphSpanColumnType", label: "Layout" },
      { path: "paragraphSpanSplitColumnCount", label: "Columns" },
      { path: "paragraphSpanColumnMinSpaceBefore", label: "Space before" },
      { path: "paragraphSpanColumnMinSpaceAfter", label: "Space after" },
      { path: "paragraphSplitColumnInsideGutter", label: "Inside gutter" },
      { path: "paragraphSplitColumnOutsideGutter", label: "Outside gutter" },
    ],
  },
  {
    title: "Bullets and Numbering",
    fields: [
      { path: "paragraphListType", label: "List type" },
      { path: "paragraphBulletCharacter", label: "Bullet" },
      { path: "paragraphBulletsTextAfter", label: "Text after" },
      { path: "paragraphBulletsCharacterStyle", label: "Bullet style", collection: "characterStyles" },
      { path: "paragraphAppliedNumberingList", label: "List", collection: "numberingLists" },
      { path: "paragraphNumberingFormat", label: "Format" },
      { path: "paragraphNumberingExpression", label: "Number" },
      { path: "paragraphNumberingStartAt", label: "Start at" },
      { path: "paragraphNumberingContinue", label: "Continue" },
      { path: "paragraphNumberingCharacterStyle", label: "Number style", collection: "characterStyles" },
    ],
  },
  ...CHARACTER_SECTIONS,
];

const OBJECT_SECTIONS: readonly SectionSpec[] = [
  {
    title: "Fill",
    fields: [
      { path: "frameFillColor", label: "Fill", collection: "swatches" },
      { path: "frameFillTint", label: "Tint" },
    ],
  },
  {
    title: "Stroke",
    fields: [
      { path: "frameStrokeColor", label: "Stroke", collection: "swatches" },
      { path: "frameStrokeWeight", label: "Weight" },
      { path: "objectStyleStrokeTint", label: "Tint" },
    ],
  },
  {
    title: "Corner Options",
    fields: [
      { path: "objectStyleCornerOption", label: "Shape" },
      { path: "objectStyleCornerRadius", label: "Size" },
    ],
  },
];

const CELL_SECTIONS: readonly SectionSpec[] = [
  {
    title: "Text",
    fields: [
      { path: "cellVerticalJustification", label: "Align" },
      { path: "cellStyleRotationAngle", label: "Rotation" },
    ],
  },
  {
    title: "Fill",
    fields: [{ path: "cellFillColor", label: "Fill", collection: "swatches" }],
  },
  {
    title: "Strokes",
    fields: [
      { path: "cellTopEdgeStrokeColor", label: "Top", collection: "swatches" },
      { path: "cellTopEdgeStrokeWeight", label: "Top weight" },
      { path: "cellBottomEdgeStrokeColor", label: "Bottom", collection: "swatches" },
      { path: "cellBottomEdgeStrokeWeight", label: "Bottom weight" },
      { path: "cellLeftEdgeStrokeColor", label: "Left", collection: "swatches" },
      { path: "cellLeftEdgeStrokeWeight", label: "Left weight" },
      { path: "cellRightEdgeStrokeColor", label: "Right", collection: "swatches" },
      { path: "cellRightEdgeStrokeWeight", label: "Right weight" },
    ],
  },
];

const TABLE_SECTIONS: readonly SectionSpec[] = [
  {
    title: "Cell Styles",
    fields: [
      { path: "tableStyleHeaderRegionCellStyle", label: "Header rows", collection: "cellStyles" },
      { path: "tableStyleBodyRegionCellStyle", label: "Body rows", collection: "cellStyles" },
      { path: "tableStyleFooterRegionCellStyle", label: "Footer rows", collection: "cellStyles" },
      { path: "tableStyleLeftColumnRegionCellStyle", label: "Left column", collection: "cellStyles" },
      { path: "tableStyleRightColumnRegionCellStyle", label: "Right column", collection: "cellStyles" },
    ],
  },
  {
    title: "Table Border",
    fields: [
      { path: "tableStyleTopBorderStrokeColor", label: "Top", collection: "swatches" },
      { path: "tableStyleTopBorderStrokeWeight", label: "Top weight" },
      { path: "tableStyleBottomBorderStrokeColor", label: "Bottom", collection: "swatches" },
      { path: "tableStyleBottomBorderStrokeWeight", label: "Bottom weight" },
      { path: "tableStyleLeftBorderStrokeColor", label: "Left", collection: "swatches" },
      { path: "tableStyleLeftBorderStrokeWeight", label: "Left weight" },
      { path: "tableStyleRightBorderStrokeColor", label: "Right", collection: "swatches" },
      { path: "tableStyleRightBorderStrokeWeight", label: "Right weight" },
    ],
  },
  {
    title: "Fills",
    fields: [
      { path: "tableStyleAlternatingFills", label: "Alternating" },
      { path: "tableStyleStartRowFillColor", label: "First fill", collection: "swatches" },
      { path: "tableStyleStartRowFillCount", label: "First rows" },
      { path: "tableStyleStartRowFillTint", label: "First tint" },
      { path: "tableStyleEndRowFillColor", label: "Next fill", collection: "swatches" },
      { path: "tableStyleEndRowFillCount", label: "Next rows" },
      { path: "tableStyleEndRowFillTint", label: "Next tint" },
    ],
  },
];

export const STYLE_SECTIONS: Readonly<Record<StyleFamily, readonly SectionSpec[]>> = {
  paragraph: PARAGRAPH_SECTIONS,
  character: CHARACTER_SECTIONS,
  object: OBJECT_SECTIONS,
  cell: CELL_SECTIONS,
  table: TABLE_SECTIONS,
};

// ------------------------------------------------------------ target

/** The style the panel edits — shared so a style panel can open the
 *  options on ITS applied style. */
let target: { family: StyleFamily; selfId: string | null } = { family: "paragraph", selfId: null };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => target;

export function setStyleOptionsTarget(family: StyleFamily, selfId: string | null): void {
  target = { family, selfId };
  for (const l of listeners) l();
}

/** "Style Options…": point the panel at a style and bring it up. */
export function openStyleOptions(family: StyleFamily, selfId: string | null): void {
  setStyleOptionsTarget(family, selfId);
  cockpitActions.openPanel?.(STYLE_OPTIONS_PANEL);
}

/** The ADR 131 address of a style. */
export function styleAddress(family: StyleFamily, selfId: string): string {
  return formatAddress({ kind: "style", family, name: selfId } as never);
}

interface StyleRow {
  selfId: string;
  name: string;
  basedOn?: string | null;
}

// ------------------------------------------------------------- panel

export function StyleOptionsPanel() {
  const current = useSyncExternalStore(subscribe, snapshot);
  const family = current.family;
  const spec = FAMILIES.find((f) => f.family === family)!;
  const styles = useCollection<StyleRow>(spec.collection);

  // Default to the first editable style of the family (the `[None]` /
  // `[No … style]` roots are not editable in InDesign either).
  const [picked, setPicked] = useState<string | null>(current.selfId);
  useEffect(() => setPicked(current.selfId), [current]);
  const selfId = useMemo(() => {
    if (!styles) return null;
    if (picked && styles.some((s) => s.selfId === picked)) return picked;
    return (styles.find((s) => !s.name.startsWith("$ID/")) ?? styles[0])?.selfId ?? null;
  }, [styles, picked]);
  const row = styles?.find((s) => s.selfId === selfId) ?? null;
  const address = selfId ? styleAddress(family, selfId) : null;
  const targets = useMemo(() => (address ? [address] : []), [address]);
  const basedOn = row?.basedOn ? styles?.find((s) => s.selfId === row.basedOn) : null;

  return (
    <div
      data-style-options-panel={styles ? "ready" : "loading"}
      data-style-family={family}
      data-style-target={address ?? ""}
    >
      <CockpitPanelHeader title="Style Options" />
      <div className="flex flex-wrap gap-1 px-3.5 pb-2" role="tablist">
        {FAMILIES.map((f) => (
          <CockpitBtn
            key={f.family}
            sm
            testId={`style-family-${f.family}`}
            primary={f.family === family}
            onClick={() => setStyleOptionsTarget(f.family, null)}
          >
            {f.title}
          </CockpitBtn>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 px-3.5 pb-2">
        <CockpitRow label="Style">
          <select
            data-style-options-select=""
            className="h-[28px] w-full rounded-[6px] border border-input bg-background px-2 text-[12px]"
            value={selfId ?? ""}
            onChange={(e) => setPicked(e.target.value || null)}
          >
            {(styles ?? []).map((s) => (
              <option key={s.selfId} value={s.selfId}>
                {displayName(s.name)}
              </option>
            ))}
          </select>
        </CockpitRow>
        {address ? (
          <>
            <PropertyField path="name" label="Name" targets={targets} schemaKind={address} />
            <CockpitRow label="Based on">
              <span className="text-xs" data-style-based-on={row?.basedOn ?? ""}>
                {basedOn ? displayName(basedOn.name) : "[No style]"}
              </span>
            </CockpitRow>
          </>
        ) : (
          <div className="text-xs" style={{ color: "var(--pg-muted-fg)" }} data-style-options-empty="">
            This document has no {spec.title.toLowerCase()} styles.
          </div>
        )}
      </div>
      {address && (
        <SchemaSections
          key={address}
          targets={targets}
          sections={STYLE_SECTIONS[family]}
          family={family}
          testId={`style:${family}`}
        />
      )}
    </div>
  );
}

/** A row's "Options…" affordance in the cell / table style lists. */
export function StyleOptionsButton({ family, selfId }: { family: StyleFamily; selfId: string }) {
  return (
    <button
      type="button"
      data-style-options-open={selfId}
      title="Style Options…"
      onClick={() => openStyleOptions(family, selfId)}
      className="shrink-0 rounded-[4px] px-1.5 text-[10px] hover:bg-[var(--pg-muted)]"
      style={{ color: "var(--pg-muted-fg)" }}
    >
      Options…
    </button>
  );
}
