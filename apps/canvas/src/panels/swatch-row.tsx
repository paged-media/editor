// Concept 2 — one Swatches-grid row: colour chip (resolved through
// the active CMM via colorPreview, incl. the out-of-gamut badge),
// space/model badges, inline rename, the EDIT popover (the shared
// ColorMixer prefilled, committing via editSwatch), group-assign,
// and delete. Reserved swatches ([None]/[Paper]/[Black]/
// [Registration]) are pinned: no edit/rename/delete affordances.
//
// The popover PORTALS to document.body with a fixed position — the
// dockview panel clips overflow (the tool-rail flyout lesson).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useCanvasClient } from "@paged-media/shell";
import { ColorMixer, type MixerValue } from "@paged-media/ui";
import type {
  ColorGroupSummary,
  ColorPreview,
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
}: {
  swatch: SwatchSummary;
  groups: ColorGroupSummary[];
  groupOf: string | null;
  onAssignGroup: (swatchId: string, groupId: string | null) => void;
}) {
  const client = useCanvasClient();
  const [preview, setPreview] = useState<ColorPreview | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [editorAt, setEditorAt] = useState<{ left: number; top: number } | null>(null);
  const [mix, setMix] = useState<MixerValue | null>(null);
  const rowRef = useRef<HTMLLIElement | null>(null);
  const reserved = isReservedKind(swatch.kind);

  useEffect(() => {
    let cancelled = false;
    void client.colorPreview(swatch.selfId).then((p) => {
      if (!cancelled) setPreview(p);
    });
    return () => {
      cancelled = true;
    };
  }, [client, swatch.selfId]);

  const openEditor = () => {
    if (reserved) return;
    // Seed the mixer from the RAW authored channels (lossless — a
    // Lab swatch edits in Lab); display-derived fallbacks only when
    // the raw read is absent.
    const seed: MixerValue = rawSeed(preview);
    setMix(seed);
    const rect = rowRef.current?.getBoundingClientRect();
    setEditorAt(rect ? { left: rect.right + 8, top: rect.top } : { left: 200, top: 200 });
  };

  const commitEdit = (v: MixerValue) => {
    void client
      .mutate({
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
      })
      .catch(() => {});
  };

  const rename = (name: string) => {
    setRenaming(false);
    if (!name || name === swatch.name) return;
    void client
      .mutate({
        op: "editSwatch",
        args: {
          swatchId: swatch.selfId,
          spec: previewSpec(swatch, preview, name),
        },
      })
      .catch(() => {});
  };

  return (
    <li
      ref={rowRef}
      className="flex items-center gap-2 px-2 py-1 hover:bg-muted/40 border-b border-input/30"
      data-swatch-id={swatch.selfId}
      data-swatch-reserved={reserved || undefined}
    >
      {/* Chip — doubles as the edit affordance. */}
      <button
        type="button"
        data-action="edit-swatch"
        title={reserved ? "Reserved swatch" : "Edit colour"}
        disabled={reserved}
        onClick={openEditor}
        className="w-5 h-5 rounded border border-input shrink-0"
        style={{
          background: preview?.rgbHex ?? "#d1d5db",
          cursor: reserved ? "default" : "pointer",
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
          onDoubleClick={() => !reserved && setRenaming(true)}
          title={reserved ? undefined : "Double-click to rename"}
        >
          {swatch.name}
        </span>
      )}
      {/* Gamut badge for ICC-managed documents. */}
      {preview?.outOfGamut && (
        <span data-swatch-gamut="out" title="Out of gamut" className="text-amber-600 text-[10px]">
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
          className="text-[10px] border border-input rounded max-w-[70px]"
          value={groupOf ?? ""}
          onChange={(e) => onAssignGroup(swatch.selfId, e.target.value || null)}
          title="Colour group"
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
          title="delete swatch"
          data-action="remove-swatch"
          onClick={() =>
            void client
              .mutate({ op: "deleteSwatch", args: { swatchId: swatch.selfId } })
              .catch(() => {})
          }
          className="px-1 hover:text-red-600"
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
  if (preview?.cmyk) return { space: "CMYK", value: [...preview.cmyk], tint: 100 };
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
