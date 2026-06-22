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

// W2.4 (2026-06-06) — Tabs panel. LIVE on the W0.2 wire: protocol
// v28's `paragraphTabStops` path replaces a paragraph's whole
// `<TabList>` in one op (`Value::TabStops(TabStopSpec[])`, the
// gradient-feather stop-list precedent — `Value` has no per-element
// list-edit form). The ruler-style stop editor reads the current
// stops from the content-scope snapshot, edits them in local state,
// and commits the WHOLE list on each change (a single
// `setElementProperty` mutate, never one-per-keystroke), undoable.
// Content scope; the apply layer rounds the StoryRange to whole
// paragraphs.
//
// IDML alignment strings (paged_parse::TabStop): LeftAlign /
// CenterAlign / RightAlign / CharacterAlign. The align-on character
// only applies to CharacterAlign stops; the leader is a short string
// repeated to fill the gap (e.g. "." for a dot leader).

import { useEffect, useState } from "react";

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  Icon,
  useBindings,
} from "@paged-media/shell";
import { NumberInput, KitSelect } from "@paged-media/ui";
import type { TabStopSpec, Value } from "@paged-media/client";

import { tabsComposition } from "../tabs.composition";
import { appCatalogRegistry } from "../catalog-registry";

const STOP_BINDING = {
  stops: {
    kind: "selectionProperty" as const,
    scope: "content" as const,
    path: "paragraphTabStops" as const,
  },
};

const ALIGNMENTS: Array<{ value: string; label: string }> = [
  { value: "LeftAlign", label: "Left" },
  { value: "CenterAlign", label: "Center" },
  { value: "RightAlign", label: "Right" },
  { value: "CharacterAlign", label: "Decimal" },
];

/** Pull the live `TabStopSpec[]` out of a `Value::TabStops`. */
function unwrapStops(v: Value | null): TabStopSpec[] {
  if (!v || v.type !== "tabStops") return [];
  return v.value;
}

/** The static stop-ruler illustration — now lit by the live stops.
 *  Ruler width maps 0…RULER_MAX pt across the track. */
const RULER_MAX = 432; // 6 in at 72 pt/in — enough for body columns.

function StopRuler({ stops }: { stops: TabStopSpec[] }) {
  return (
    <div
      data-tabs-ruler
      className="relative h-[30px] overflow-hidden rounded-[6px] border border-input bg-background"
      title="Tab ruler"
    >
      {Array.from({ length: 19 }, (_, i) => (
        <span
          key={i}
          className="absolute bottom-0 top-0 w-px"
          style={{
            left: `${(i + 1) * 5}%`,
            background: "var(--pg-border)",
            opacity: i % 4 === 3 ? 1 : 0.45,
          }}
        />
      ))}
      {stops.map((s, i) => (
        <span
          key={i}
          data-tab-marker
          className="absolute bottom-[3px]"
          style={{
            left: `${Math.min(100, Math.max(0, (s.position / RULER_MAX) * 100))}%`,
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderBottom: "8px solid var(--pg-primary)",
            transform: "translateX(-5px)",
          }}
        />
      ))}
    </div>
  );
}

export function TabsPanel() {
  const { stops: binding } = useBindings(STOP_BINDING);
  const live = unwrapStops(binding.value);
  const disabled = binding.onCommit == null;

  // Local draft of the stop list. Re-seed from the engine on every
  // resolved-value change (selection switch, undo/redo, external
  // edit) so the editor reflects the document; local edits between
  // commits stay in `draft`.
  const [draft, setDraft] = useState<TabStopSpec[]>(live);
  useEffect(() => {
    setDraft(unwrapStops(binding.value));
    // Re-seed keyed on the wire shape so an identical list doesn't
    // clobber an in-flight edit.
  }, [JSON.stringify(binding.value)]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Commit the WHOLE list as one op (the only wire shape there is).
   *  Single mutate per call — callers pass the full next list. */
  const commit = (next: TabStopSpec[]) => {
    setDraft(next);
    if (disabled) return;
    binding.onCommit?.({ type: "tabStops", value: next } as Value);
  };

  const patch = (index: number, delta: Partial<TabStopSpec>) => {
    commit(draft.map((s, i) => (i === index ? { ...s, ...delta } : s)));
  };

  const addStop = () => {
    // Append a left stop past the last position (or at 36 pt for the
    // first), keeping the list position-sorted by construction.
    const last = draft.length ? draft[draft.length - 1].position : 0;
    const next: TabStopSpec = {
      position: Math.round(last + 36),
      alignment: "LeftAlign",
      alignmentCharacter: null,
      leader: null,
    };
    commit([...draft, next]);
  };

  const removeStop = (index: number) => {
    commit(draft.filter((_, i) => i !== index));
  };

  const moveStop = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= draft.length) return;
    const next = draft.slice();
    [next[index], next[j]] = [next[j], next[index]];
    commit(next);
  };

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="flex flex-col gap-2 p-3" data-tabs-panel="ready">
        <CompositionRenderer composition={tabsComposition} />
        <StopRuler stops={draft} />

        {draft.length === 0 && (
          <div
            className="text-xs italic text-muted-foreground"
            data-tabs-empty
          >
            {disabled
              ? "Place a text caret to edit tab stops."
              : "No tab stops. Add one to begin."}
          </div>
        )}

        {draft.map((stop, i) => {
          const isChar = (stop.alignment ?? "LeftAlign") === "CharacterAlign";
          return (
            <div
              key={i}
              data-tab-stop={i}
              className="flex flex-col gap-1.5 rounded-[7px] border border-input p-2"
            >
              <div className="flex items-center gap-1.5">
                <KitSelect
                  value={stop.alignment ?? "LeftAlign"}
                  disabled={disabled}
                  aria-label={`stop ${i} alignment`}
                  data-tab-alignment={i}
                  onChange={(e) => patch(i, { alignment: e.target.value })}
                >
                  {ALIGNMENTS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </KitSelect>
                <button
                  type="button"
                  disabled={disabled || i === 0}
                  title="Move up"
                  aria-label={`move stop ${i} up`}
                  onClick={() => moveStop(i, -1)}
                  className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] border border-input bg-background text-muted-foreground disabled:opacity-40"
                >
                  {/* No up-chevron in the registry — rotate the down. */}
                  <Icon
                    name="ui-chevron-down"
                    size={13}
                    style={{ transform: "rotate(180deg)" }}
                  />
                </button>
                <button
                  type="button"
                  disabled={disabled || i === draft.length - 1}
                  title="Move down"
                  aria-label={`move stop ${i} down`}
                  onClick={() => moveStop(i, 1)}
                  className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] border border-input bg-background text-muted-foreground disabled:opacity-40"
                >
                  <Icon name="ui-chevron-down" size={13} />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  title="Delete stop"
                  aria-label={`delete stop ${i}`}
                  data-tab-remove={i}
                  onClick={() => removeStop(i)}
                  className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] border border-input bg-background text-muted-foreground disabled:opacity-40"
                >
                  <Icon name="ui-x" size={13} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <NumberInput
                  value={stop.position}
                  min={0}
                  suffix="pt"
                  icon="ui-size"
                  disabled={disabled}
                  aria-label={`stop ${i} position`}
                  onChange={() => {}}
                  onCommit={(next) => patch(i, { position: next })}
                />
                <input
                  data-tab-leader={i}
                  defaultValue={stop.leader ?? ""}
                  key={`leader-${stop.leader ?? ""}`}
                  placeholder="Leader"
                  disabled={disabled}
                  aria-label={`stop ${i} leader`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      (e.target as HTMLInputElement).blur();
                  }}
                  onBlur={(e) =>
                    patch(i, { leader: e.target.value || null })
                  }
                  className="h-[28px] w-full rounded-[6px] border border-input bg-background px-2 text-[11.5px] text-foreground disabled:opacity-55"
                  style={{ fontFamily: "var(--font-mono)" }}
                />
              </div>

              {isChar && (
                <input
                  data-tab-align-char={i}
                  defaultValue={stop.alignmentCharacter ?? "."}
                  key={`alignchar-${stop.alignmentCharacter ?? "."}`}
                  placeholder="Align on"
                  disabled={disabled}
                  aria-label={`stop ${i} align character`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      (e.target as HTMLInputElement).blur();
                  }}
                  onBlur={(e) =>
                    patch(i, { alignmentCharacter: e.target.value || null })
                  }
                  className="h-[28px] w-full rounded-[6px] border border-input bg-background px-2 text-[11.5px] text-foreground disabled:opacity-55"
                  style={{ fontFamily: "var(--font-mono)" }}
                />
              )}
            </div>
          );
        })}

        <button
          type="button"
          disabled={disabled}
          data-tab-add
          onClick={addStop}
          className="h-[28px] self-start rounded-[6px] border border-input bg-background px-3 text-xs text-foreground disabled:opacity-55"
        >
          Add tab stop
        </button>
      </div>
    </CatalogRegistryProvider>
  );
}
