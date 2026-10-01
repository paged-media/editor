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

// W2.4 (2026-06-06) — Bullets & Numbering panel. LIVE on the W0.2
// wire: protocol v28's list-authoring text paths
// (`paragraphListType` + `paragraphBulletCharacter` +
// `paragraphNumberingFormat`) flip the gallery's List type segments
// and the bullet glyph / numbering format fields seam→live.
//
// W2.10 (2026-06-07) — named LIST-DEFINITION management on the W1.22
// `NumberingList` surface (protocol v35). The document's
// `<NumberingList>` resources read from the `numberingLists`
// collection; create / rename / delete ride the CRUD ops
// (`createNumberingList` / `editNumberingList` / `deleteNumberingList`,
// each carrying a `NumberingListSpec`); a list assigns to the
// selected paragraphs through `paragraphAppliedNumberingList`
// (content scope, `Value::Text` = the list selfId). Continuity is the
// per-list `continueAcrossStories` flag (a live toggle on the editing
// row) — the renderer reads it for cross-story numbering continuity.
//
// PUBLISHED-TYPES GAP: `paragraphAppliedNumberingList` is WRITE-ONLY
// on the v35 wire — the paragraph property snapshot carries NO
// read-back entry, so the panel cannot reflect WHICH list a
// paragraph currently uses (assign is a forward command, honestly
// labelled). The applied state lives in the model + survives undo;
// only the read accessor is missing.
//
// List type rides the declarative composition (a ToggleGroupLeaf over
// `Value::Text`). The bullet glyph + numbering format are free text,
// which no catalog leaf emits, so they are hand-wired here over the
// same content-scope bindings on the effects-panel / paragraph-rules
// precedent — a single `setElementProperty` mutate per commit
// (Enter / blur), undoable. Content scope; the apply layer rounds the
// StoryRange to whole paragraphs.
//
// Protocol 64 (2026-10-01) — the list-marker overrides became settable
// paragraph paths: Number (`paragraphNumberingExpression` — the
// marker template; until now this row wrote `paragraphNumberingFormat`,
// which is the COUNTER STYLE, so "^#.^t" landed in the wrong field),
// Style (`paragraphNumberingFormat`, now a picker over IDML's sample
// strings), Mode / Start at (`paragraphNumberingContinue` /
// `paragraphNumberingStartAt`), Text after (`paragraphBulletsTextAfter`)
// and both marker character styles (`paragraphBulletsCharacterStyle` /
// `paragraphNumberingCharacterStyle`, picked from the document's
// character styles).
//
// Still-seam gallery rows: Level / Restart scope / Position — they
// await a per-paragraph list-level model.

import { useState } from "react";

import type { CompositionNode } from "@paged-media/catalog";
import {
  CatalogRegistryProvider,
  CompositionRenderer,
  Icon,
  PAGED_INPUT_COLLECTION_SELECT,
  useBindings,
  useCanvasClient,
  useCollection,
  useContentSelection,
} from "@paged-media/shell";
import type { NumberingListSummary, Value } from "@paged-media/client";
import { KitSelect, NumberInput } from "@paged-media/ui";

import { appCatalogRegistry } from "../catalog-registry";
import { bulletsNumberingComposition } from "../bullets-numbering.composition";
import { ConceptShell, Kicker, Row, SeamNum, SeamSelect } from "./concept-kit";

const TEXT_BINDINGS = {
  bullet: {
    kind: "selectionProperty" as const,
    scope: "content" as const,
    path: "paragraphBulletCharacter" as const,
  },
  format: {
    kind: "selectionProperty" as const,
    scope: "content" as const,
    path: "paragraphNumberingFormat" as const,
  },
  expression: {
    kind: "selectionProperty" as const,
    scope: "content" as const,
    path: "paragraphNumberingExpression" as const,
  },
  textAfter: {
    kind: "selectionProperty" as const,
    scope: "content" as const,
    path: "paragraphBulletsTextAfter" as const,
  },
  startAt: {
    kind: "selectionProperty" as const,
    scope: "content" as const,
    path: "paragraphNumberingStartAt" as const,
  },
  continue: {
    kind: "selectionProperty" as const,
    scope: "content" as const,
    path: "paragraphNumberingContinue" as const,
  },
};

/** IDML `NumberingFormat` sample strings — the counter style the
 *  renderer reads from the text before the first comma. */
const NUMBERING_FORMATS = [
  "1, 2, 3, 4...",
  "01, 02, 03...",
  "I, II, III, IV...",
  "i, ii, iii, iv...",
  "A, B, C, D...",
  "a, b, c, d...",
];

/** A character-style picker over the document's `characterStyles`
 *  (the marker's style; `[None]` = the empty string, which clears the
 *  override). One composition leaf, so it reads/writes through the
 *  same binding seam as every other field. */
function charStylePicker(
  path: "paragraphBulletsCharacterStyle" | "paragraphNumberingCharacterStyle",
): CompositionNode {
  return {
    catalogId: PAGED_INPUT_COLLECTION_SELECT,
    props: { collectionName: "characterStyles" },
    bindings: {
      value: { kind: "selectionProperty", scope: "content", path },
    },
  };
}

const BULLET_CHAR_STYLE = charStylePicker("paragraphBulletsCharacterStyle");
const NUMBER_CHAR_STYLE = charStylePicker("paragraphNumberingCharacterStyle");

/** `paragraphNumberingContinue` is three-state on the wire: `Bool`
 *  sets it, `Text("")` is "inherit" — and inherit is NOT `true` (an
 *  inheriting paragraph restarts after a non-list paragraph, an
 *  explicitly continuing one resumes). So the mode select keeps all
 *  three. */
type NumberingMode = "" | "continue" | "restart";

function unwrapMode(v: Value | null): NumberingMode | null {
  if (!v) return null;
  if (v.type === "bool") return v.value ? "continue" : "restart";
  if (v.type === "text" && v.value === "") return "";
  return null;
}

function modeValue(mode: NumberingMode): Value {
  return mode === ""
    ? ({ type: "text", value: "" } as Value)
    : ({ type: "bool", value: mode === "continue" } as Value);
}

function unwrapCount(v: Value | null): number | null {
  if (!v || v.type !== "length") return null;
  return v.value;
}

/** Unwrap a `Value::Text` to its string (empty = cleared override). */
function unwrapText(v: Value | null): string {
  if (!v || v.type !== "text") return "";
  return v.value;
}

/** Kit-styled bare text field bound to a `Value::Text` content path.
 *  Commits the whole string on Enter / blur (one mutate per commit);
 *  an empty string clears the per-paragraph override on the engine
 *  side. Disabled (no commit) when there is no content selection. */
function TextField({
  testId,
  value,
  placeholder,
  mono,
  disabled,
  onCommit,
}: {
  testId: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
  onCommit?: (next: Value) => void;
}) {
  const commit = (raw: string) => {
    if (disabled) return;
    if (raw === value) return;
    onCommit?.({ type: "text", value: raw } as Value);
  };
  return (
    <input
      data-bullets-field={testId}
      defaultValue={value}
      // Re-key on the resolved value so an external change (undo /
      // selection switch) re-seeds the uncontrolled field.
      key={value}
      placeholder={placeholder}
      disabled={disabled}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      onBlur={(e) => commit(e.target.value)}
      aria-label={testId}
      className="h-[28px] w-full rounded-[6px] border border-input bg-background px-2 text-[11.5px] text-foreground disabled:opacity-55"
      style={{ fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)" }}
    />
  );
}

/** One row in the list-definitions manager. Inline rename on
 *  double-click / Enter, a continuity (continue-across-stories)
 *  toggle, an Assign button (active only with a content selection),
 *  and a delete. */
function ListDefRow({
  list,
  canAssign,
  onAssign,
  onRename,
  onToggleContinuity,
  onDelete,
}: {
  list: NumberingListSummary;
  canAssign: boolean;
  onAssign: () => void;
  onRename: (name: string) => void;
  onToggleContinuity: (next: boolean) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div
      data-list-def={list.selfId}
      className="mb-[6px] flex items-center gap-[6px]"
    >
      <Icon
        name="ui-rows"
        size={13}
        style={{ color: "var(--pg-muted-fg)", flexShrink: 0 }}
      />
      {editing ? (
        <input
          data-list-def-name-input
          autoFocus
          defaultValue={list.name}
          aria-label="list name"
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={(e) => {
            setEditing(false);
            const next = e.target.value.trim();
            if (next && next !== list.name) onRename(next);
          }}
          className="h-[24px] min-w-0 flex-1 rounded-[5px] border border-input bg-background px-2 text-[12px] text-foreground"
        />
      ) : (
        <button
          type="button"
          data-list-def-name
          title="Double-click to rename"
          onDoubleClick={() => setEditing(true)}
          className="min-w-0 flex-1 cursor-text truncate border-0 bg-transparent text-left text-[12.5px] font-semibold"
          style={{ color: "var(--pg-fg)" }}
        >
          {list.name}
        </button>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={list.continueAcrossStories}
        data-list-def-continuity
        title={
          list.continueAcrossStories
            ? "Continue numbers across stories (on)"
            : "Restart numbers per story (off)"
        }
        onClick={() => onToggleContinuity(!list.continueAcrossStories)}
        className="relative h-[16px] w-[28px] shrink-0 rounded-full border-0"
        style={{
          background: list.continueAcrossStories
            ? "var(--pg-primary)"
            : "var(--chrome-divider)",
        }}
      >
        <span
          className="absolute top-[2px] h-[12px] w-[12px] rounded-full bg-white shadow"
          style={{ left: list.continueAcrossStories ? 14 : 2 }}
        />
      </button>
      <button
        type="button"
        data-list-def-assign
        disabled={!canAssign}
        title={
          canAssign
            ? "Assign to selected paragraphs"
            : "Place a text caret to assign"
        }
        onClick={onAssign}
        className="shrink-0 cursor-pointer rounded-[5px] border border-input bg-background px-[7px] py-[3px] text-[10.5px] text-foreground disabled:cursor-default disabled:opacity-45"
      >
        Assign
      </button>
      <button
        type="button"
        data-list-def-delete
        title="Delete list definition"
        onClick={onDelete}
        className="flex h-[20px] w-[20px] shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent"
        style={{ color: "var(--pg-muted-fg)" }}
      >
        <Icon name="ui-x" size={11} />
      </button>
    </div>
  );
}

/** W2.10 — the named list-definitions manager (the W1.22
 *  `NumberingList` surface). */
function ListDefinitions() {
  const client = useCanvasClient();
  const lists = useCollection<NumberingListSummary>("numberingLists");
  const { contentSelection } = useContentSelection();
  const canAssign = contentSelection != null;

  const onNew = () => {
    void client
      .mutate({
        op: "createNumberingList",
        args: {
          spec: {
            selfId: null,
            name: "New list",
            continueAcrossStories: false,
            continueAcrossDocuments: false,
          },
        },
      })
      .catch(() => {});
  };

  const onEdit = (list: NumberingListSummary, patch: Partial<NumberingListSummary>) => {
    void client
      .mutate({
        op: "editNumberingList",
        args: {
          listId: list.selfId,
          spec: {
            selfId: list.selfId,
            name: patch.name ?? list.name,
            continueAcrossStories:
              patch.continueAcrossStories ?? list.continueAcrossStories,
            continueAcrossDocuments: list.continueAcrossDocuments,
          },
        },
      })
      .catch(() => {});
  };

  const onDelete = (listId: string) => {
    void client
      .mutate({ op: "deleteNumberingList", args: { listId } })
      .catch(() => {});
  };

  // Assign applies the list selfId to the selected paragraphs through
  // `paragraphAppliedNumberingList` (content scope — the apply layer
  // rounds to whole paragraphs). Write-only on the wire (no read-back
  // entry), so this is a forward command.
  const onAssign = (listId: string) => {
    if (!contentSelection) return;
    void client
      .mutate({
        op: "setElementProperty",
        args: {
          elementId: {
            kind: "storyRange",
            id: {
              story_id: contentSelection.storyId,
              start: contentSelection.start,
              end: contentSelection.end,
            },
          } as never,
          path: "paragraphAppliedNumberingList",
          value: { type: "text", value: listId } as Value,
        },
      })
      .catch(() => {});
  };

  return (
    <div data-list-definitions={lists === null ? "loading" : "ready"}>
      <Kicker>List definitions</Kicker>
      {lists === null ? (
        <div className="py-2 text-xs text-muted-foreground">
          Loading lists…
        </div>
      ) : lists.length === 0 ? (
        <div
          className="py-1 text-xs text-muted-foreground"
          data-empty-list-definitions
        >
          No named lists in this document.
        </div>
      ) : (
        <div data-list-def-list>
          {lists.map((list) => (
            <ListDefRow
              key={list.selfId}
              list={list}
              canAssign={canAssign}
              onAssign={() => onAssign(list.selfId)}
              onRename={(name) => onEdit(list, { name })}
              onToggleContinuity={(next) =>
                onEdit(list, { continueAcrossStories: next })
              }
              onDelete={() => onDelete(list.selfId)}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        data-toolbar-btn="new-numbering-list"
        onClick={onNew}
        className="mt-[2px] flex h-[28px] w-full cursor-pointer items-center justify-center gap-[6px] rounded-[7px] border border-dashed bg-transparent text-xs"
        style={{
          borderColor: "var(--chrome-divider)",
          color: "var(--pg-muted-fg)",
        }}
      >
        <Icon name="ui-plus" size={13} /> New list
      </button>
      {/* Honest seam: the applied list cannot be reflected per
          paragraph — `paragraphAppliedNumberingList` is write-only on
          the v35 wire (no read-back entry). */}
      <div
        data-applied-readback-seam
        data-seam
        className="mt-[6px] text-[10.5px] italic opacity-70"
        style={{ color: "var(--pg-muted-fg)" }}
      >
        Applied list per paragraph is write-only on the wire — no read-back.
      </div>
    </div>
  );
}

export function BulletsPanel() {
  const text = useBindings(TEXT_BINDINGS);
  const bullet = unwrapText(text.bullet.value);
  const format = unwrapText(text.format.value);
  const expression = unwrapText(text.expression.value);
  const textAfter = unwrapText(text.textAfter.value);
  const startAt = unwrapCount(text.startAt.value);
  const mode = unwrapMode(text.continue.value);

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <ConceptShell
        testId="bullets-panel"
        live
        target="List type, bullet glyph and text after, numbering style, number expression, start at / continue, marker character styles and named list definitions (create / rename / continuity / assign) are live; level / restart scope / position land with a per-paragraph list-level model."
      >
        {/* W2.10 — named list-definition management. */}
        <ListDefinitions />

        {/* LIVE — list type segment (paragraphListType). */}
        <CompositionRenderer composition={bulletsNumberingComposition} />

        {/* Level awaits a per-paragraph list-level model. */}
        <Row label="Level">
          <SeamNum value="1" />
        </Row>

        <Kicker>Numbering style</Kicker>
        <Row label="Style">
          {/* LIVE — paragraphNumberingFormat, the counter style
              ("1, 2, 3, 4…" / "i, ii, iii, iv…"). */}
          <KitSelect
            data-bullets-field="numbering-format"
            aria-label="numbering-format"
            value={format}
            disabled={text.format.onCommit == null}
            onChange={(e) =>
              text.format.onCommit?.({
                type: "text",
                value: e.target.value,
              } as Value)
            }
          >
            <option value="">[Style default]</option>
            {NUMBERING_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            {format !== "" && !NUMBERING_FORMATS.includes(format) ? (
              <option value={format}>{format}</option>
            ) : null}
          </KitSelect>
        </Row>
        <Row label="Number">
          {/* LIVE (v64) — paragraphNumberingExpression, the marker
              template ("^#.^t", "(^#)"). */}
          <TextField
            testId="numbering-expression"
            value={expression}
            placeholder="^#.^t"
            mono
            disabled={text.expression.onCommit == null}
            onCommit={text.expression.onCommit}
          />
        </Row>
        <Row label="Char style">
          {/* LIVE (v64) — paragraphNumberingCharacterStyle. */}
          <div data-bullets-field="numbering-char-style" className="min-w-0">
            <CompositionRenderer composition={NUMBER_CHAR_STYLE} />
          </div>
        </Row>
        <Row label="Mode">
          {/* LIVE (v64) — paragraphNumberingContinue (three-state). */}
          <KitSelect
            data-bullets-field="numbering-mode"
            aria-label="numbering-mode"
            value={mode ?? "__mixed__"}
            soft={mode === null}
            disabled={text.continue.onCommit == null}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "__mixed__") return;
              text.continue.onCommit?.(modeValue(next as NumberingMode));
            }}
          >
            {mode === null && (
              <option value="__mixed__" disabled>
                —
              </option>
            )}
            <option value="">[Style default]</option>
            <option value="continue">Continue from previous number</option>
            <option value="restart">Start at</option>
          </KitSelect>
        </Row>
        <Row label="Start at">
          {/* LIVE (v64) — paragraphNumberingStartAt, a whole number
              >= 1. Read when the count restarts (Mode = Start at). */}
          <NumberInput
            value={startAt}
            min={1}
            precision={0}
            disabled={text.startAt.onCommit == null}
            onChange={() => {}}
            onCommit={(next) =>
              text.startAt.onCommit?.({
                type: "length",
                value: Math.max(1, Math.round(next)),
              } as Value)
            }
            aria-label="numbering-start-at"
          />
        </Row>
        <Row label="Restart">
          <SeamSelect value="At this level" />
        </Row>

        <Kicker>Bullet</Kicker>
        <Row label="Glyph">
          {/* LIVE — paragraphBulletCharacter (the glyph itself). */}
          <TextField
            testId="bullet-character"
            value={bullet}
            placeholder="•"
            disabled={text.bullet.onCommit == null}
            onCommit={text.bullet.onCommit}
          />
        </Row>
        <Row label="Text after">
          {/* LIVE (v64) — paragraphBulletsTextAfter, IDML spelling
              ("^t" is a tab). */}
          <TextField
            testId="bullets-text-after"
            value={textAfter}
            placeholder="^t"
            mono
            disabled={text.textAfter.onCommit == null}
            onCommit={text.textAfter.onCommit}
          />
        </Row>
        <Row label="Char style">
          {/* LIVE (v64) — paragraphBulletsCharacterStyle. */}
          <div data-bullets-field="bullets-char-style" className="min-w-0">
            <CompositionRenderer composition={BULLET_CHAR_STYLE} />
          </div>
        </Row>

        <Kicker>Position</Kicker>
        <Row label="Alignment">
          <SeamSelect value="Left" />
        </Row>
        <Row label="Indent">
          <SeamNum value="—" icon="ui-size" />
        </Row>
        <Row label="Tab">
          <SeamNum value="—" icon="ui-size" />
        </Row>

        {/* The gallery preview box — static illustration. */}
        <div
          data-seam
          data-bullets-preview
          className="rounded-[7px] border border-input bg-background px-3 py-2 opacity-70"
          style={{
            fontFamily: "var(--font-serif, serif)",
            fontSize: 12.5,
            lineHeight: 1.7,
          }}
        >
          <div>1.&emsp;Solid oak frame</div>
          <div>2.&emsp;Natural oil finish</div>
        </div>
      </ConceptShell>
    </CatalogRegistryProvider>
  );
}
