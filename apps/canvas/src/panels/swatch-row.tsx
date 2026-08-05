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

// Concept 2 — one Swatches-grid row: colour chip (resolved through
// the active CMM via colorPreview, incl. the out-of-gamut badge),
// space/model badges, inline rename, the EDIT popover (the shared
// ColorMixer prefilled, committing via editSwatch), group-assign,
// and delete. Reserved swatches ([None]/[Paper]/[Black]/
// [Registration]) are pinned: no edit/rename/delete affordances.
//
// The popover PORTALS to document.body with a fixed position — the
// dockview panel clips overflow (the tool-rail flyout lesson).
//
// ADR 023 phase C/D: this row no longer owns its writes. `onMutate`
// carries core's own op to the panel's provider-first lane, and
// `canEdit` / `canDelete` are the capability answers for whoever owns
// the CURRENT rows — booleans, never a plugin id. A row a provider
// serves and a row core serves render through the SAME component,
// because the vocabulary rule makes them the same shape.
//
// THE CHIP IS THE ONE THING THE SEAM CANNOT CARRY. `SwatchSummary`
// holds no channels, and the colour comes from a separate core RPC
// (`colorPreview`) keyed by a DOCUMENT swatch id. A provider row whose
// id names no document swatch therefore has no resolvable chip; it is
// marked `data-swatch-preview="unresolved"` rather than shown as a
// plausible grey, which would be a colour panel lying about a colour.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useCanvasClient } from "@paged-media/shell";
import { ColorMixer, type MixerValue } from "@paged-media/ui";
import type {
  ColorGroupSummary,
  ColorPreview,
  Mutation,
  SwatchSummary,
} from "@paged-media/client";

const RESERVED = new Set(["none", "paper", "black", "registration"]);

export function isReservedKind(kind: string): boolean {
  return RESERVED.has(kind);
}

export function SwatchRow({
  swatch,
  groups,
  groupOf,
  onAssignGroup,
  onMutate,
  canEdit = true,
  canDelete = true,
  canAssignGroup = true,
}: {
  swatch: SwatchSummary;
  groups: ColorGroupSummary[];
  groupOf: string | null;
  onAssignGroup: (swatchId: string, groupId: string | null) => void;
  /** The panel's provider-first write lane (`useProviderFirstMutate`
   *  wrapped with reporting). Core's own op goes in; who honours it is
   *  not this row's business. */
  onMutate: (mutation: Mutation, what: string) => Promise<void>;
  /** Does the ACTIVE owner of the `swatches` rows serve `editSwatch`? */
  canEdit?: boolean;
  /** …and `deleteSwatch`? */
  canDelete?: boolean;
  /** Does the ACTIVE owner of the `colorGroups` rows serve
   *  `editColorGroup`? (A separate collection, so a separate question —
   *  a provider may own the swatch list without owning the groups.) */
  canAssignGroup?: boolean;
}) {
  const client = useCanvasClient();
  const [preview, setPreview] = useState<ColorPreview | null>(null);
  const [previewResolved, setPreviewResolved] = useState<boolean | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [editorAt, setEditorAt] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [mix, setMix] = useState<MixerValue | null>(null);
  const rowRef = useRef<HTMLLIElement | null>(null);
  const reserved = isReservedKind(swatch.kind);

  useEffect(() => {
    let cancelled = false;
    let resolvedOnce = false;
    setPreviewResolved(null);
    const read = () => {
      void client
        .colorPreview(swatch.selfId)
        .then((p) => {
          if (cancelled) return;
          setPreview(p);
          setPreviewResolved(p !== null);
          if (p !== null) resolvedOnce = true;
        })
        .catch(() => {
          if (cancelled) return;
          setPreview(null);
          setPreviewResolved(false);
        });
    };
    read();
    // A row core cannot resolve keeps WATCHING for its swatch to appear.
    // This is the provider case and only the provider case: a palette
    // entry a plugin serves may not be a document swatch YET (paged.sheet
    // mints on first edit), and a chip that stayed grey after the mint
    // would be a colour panel lying about a colour it now has.
    //
    // Scoped to unresolved rows on purpose. A blanket re-read would fire
    // one `colorPreview` per row per mutation, and a document with a
    // bundled library loaded carries ~380 of them.
    const off = client.subscribe((msg) => {
      if (resolvedOnce) return;
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied" ||
        msg.kind === "documentLoaded"
      ) {
        read();
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [client, swatch.selfId]);

  const openEditor = () => {
    if (reserved || !canEdit) return;
    // Seed the mixer from the RAW authored channels (lossless — a
    // Lab swatch edits in Lab); display-derived fallbacks only when
    // the raw read is absent.
    const seed: MixerValue = rawSeed(preview);
    setMix(seed);
    const rect = rowRef.current?.getBoundingClientRect();
    setEditorAt(
      rect ? { left: rect.right + 8, top: rect.top } : { left: 200, top: 200 },
    );
  };

  const commitEdit = (v: MixerValue) => {
    void onMutate(
      {
        op: "editSwatch",
        args: {
          swatchId: swatch.selfId,
          spec: {
            selfId: swatch.selfId,
            name: swatch.name,
            space: v.space,
            value: [...v.value],
            model: swatch.kind === "spot" ? "Spot" : "Process",
            alternateSpace: null,
            alternateValue: [],
            tint: v.tint < 100 ? v.tint : null,
            alpha: null,
          },
        },
      } as Mutation,
      "editSwatch",
    );
  };

  const rename = (name: string) => {
    setRenaming(false);
    if (!name || name === swatch.name) return;
    void onMutate(
      {
        op: "editSwatch",
        args: {
          swatchId: swatch.selfId,
          spec: previewSpec(swatch, preview, name),
        },
      } as Mutation,
      "editSwatch",
    );
  };

  return (
    <li
      ref={rowRef}
      className="flex items-center gap-2 px-2 py-1 hover:bg-muted/40 border-b border-input/30"
      data-swatch-id={swatch.selfId}
      data-swatch-reserved={reserved || undefined}
    >
      {/* Chip — doubles as the edit affordance. An UNRESOLVED chip
          (a provider row core cannot look up) says so instead of
          painting a plausible grey; see the module header. */}
      <button
        type="button"
        data-action="edit-swatch"
        data-swatch-preview={
          previewResolved === false ? "unresolved" : undefined
        }
        title={
          previewResolved === false
            ? "No document swatch carries this id — colour unresolved"
            : reserved
              ? "Reserved swatch"
              : canEdit
                ? "Edit colour"
                : "The active content type does not serve swatch edits"
        }
        disabled={reserved || !canEdit}
        onClick={openEditor}
        className="w-5 h-5 rounded border border-input shrink-0"
        style={{
          background: preview?.rgbHex ?? "#d1d5db",
          borderStyle: previewResolved === false ? "dashed" : undefined,
          cursor: reserved || !canEdit ? "default" : "pointer",
        }}
      />
      {renaming ? (
        <input
          autoFocus
          defaultValue={swatch.name}
          data-swatch-rename-input
          className="flex-1 text-xs border border-input rounded px-1 py-0.5"
          onKeyDown={(e) => {
            if (e.key === "Enter") rename((e.target as HTMLInputElement).value);
            if (e.key === "Escape") setRenaming(false);
          }}
          onBlur={(e) => rename(e.target.value)}
        />
      ) : (
        <span
          className="flex-1 select-none truncate"
          data-swatch-name
          onDoubleClick={() => !reserved && canEdit && setRenaming(true)}
          title={
            reserved
              ? undefined
              : canEdit
                ? "Double-click to rename"
                : "The active content type does not serve swatch renames"
          }
        >
          {swatch.name}
        </span>
      )}
      {/* Gamut badge for ICC-managed documents. */}
      {preview?.outOfGamut && (
        <span
          data-swatch-gamut="out"
          title="Out of gamut"
          className="text-status-review text-[10px]"
        >
          ▲!
        </span>
      )}
      {/* Space + model badges. */}
      {preview?.cmyk && !reserved && (
        <span className="text-[9px] uppercase text-muted-foreground border border-input rounded px-1">
          CMYK
        </span>
      )}
      <span
        className="text-[10px] uppercase text-muted-foreground"
        data-swatch-kind={swatch.kind}
      >
        {swatch.kind}
      </span>
      {/* Group assign. */}
      {!reserved && (
        <select
          data-action="assign-group"
          className="text-[10px] border border-input rounded max-w-[70px] disabled:opacity-40"
          value={groupOf ?? ""}
          disabled={!canAssignGroup}
          onChange={(e) => onAssignGroup(swatch.selfId, e.target.value || null)}
          title={
            canAssignGroup
              ? "Colour group"
              : "The active content type does not serve colour groups"
          }
        >
          <option value="">—</option>
          {groups.map((g) => (
            <option key={g.selfId} value={g.selfId}>
              {g.name}
            </option>
          ))}
        </select>
      )}
      {!reserved && (
        <button
          type="button"
          title={
            canDelete
              ? "delete swatch"
              : "The active content type does not serve swatch deletion"
          }
          data-action="remove-swatch"
          disabled={!canDelete}
          onClick={() =>
            void onMutate(
              {
                op: "deleteSwatch",
                args: { swatchId: swatch.selfId },
              } as Mutation,
              "deleteSwatch",
            )
          }
          className="px-1 hover:text-status-error disabled:opacity-40"
        >
          ✕
        </button>
      )}

      {/* Edit popover — portal + fixed position (overflow clipping). */}
      {editorAt &&
        createPortal(
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 60 }}
              onClick={() => setEditorAt(null)}
              aria-hidden
            />
            <div
              data-swatch-editor
              style={{
                position: "fixed",
                left: editorAt.left,
                top: editorAt.top,
                zIndex: 61,
                background: "var(--elevated)",
                border: "1px solid var(--chrome-divider)",
                borderRadius: 6,
                boxShadow: "var(--shadow-pop)",
                padding: 10,
              }}
            >
              <ColorMixer
                value={mix}
                onChange={setMix}
                onCommit={commitEdit}
                showTint
              />
            </div>
          </>,
          document.body,
        )}
    </li>
  );
}

function hexChannels(hex: string): number[] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Seed mixer state from the RAW authored channels carried on the
 *  preview (protocol 25's lossless read); falls back to display-
 *  derived channels for older replies. */
function rawSeed(preview: ColorPreview | null): MixerValue {
  const space = preview?.space;
  const value = preview?.value;
  if (
    value &&
    (space === "CMYK" || space === "RGB" || space === "LAB" || space === "Gray")
  ) {
    return { space, value: [...value], tint: 100 };
  }
  if (preview?.cmyk)
    return { space: "CMYK", value: [...preview.cmyk], tint: 100 };
  return {
    space: "RGB",
    value: hexChannels(preview?.rgbHex ?? "#808080"),
    tint: 100,
  };
}

/** Spec for a rename: the RAW channels ride along untouched so the
 *  colour doesn't move when only the name changes. */
function previewSpec(
  swatch: SwatchSummary,
  preview: ColorPreview | null,
  name: string,
) {
  const seed = rawSeed(preview);
  return {
    selfId: swatch.selfId,
    name,
    space: seed.space,
    value: [...seed.value],
    model: swatch.kind === "spot" ? "Spot" : "Process",
    alternateSpace: null,
    alternateValue: [],
    tint: null,
    alpha: null,
  };
}
