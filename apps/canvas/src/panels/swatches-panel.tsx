// Concept 2 — Swatches panel v2.
//
// Hybrid (per panel-catalog §5.5): the composition chrome applies a
// swatch to the selection; the expert grid below manages the
// collection — colour chips resolved through the active CMM,
// space/model/reserved badges + gamut flags, EDIT popover (the
// shared ColorMixer, lossless raw-channel seed), inline rename,
// group headers from `colorGroups` with per-row group-assign, and
// delete. Reserved swatches are pinned non-editable. Merge /
// delete-with-replacement stays v2: it needs a core
// reassign-references op before deletion is safe on used swatches.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  importAseBytes,
  useCanvasClient,
} from "@paged-media/shell";

import type { ColorGroupSummary, SwatchSummary } from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";
import { swatchesComposition } from "./swatches.composition";
import { SwatchRow } from "./swatch-row";
import { BUNDLED_LIBRARIES } from "../assets/libraries";

function SwatchCollection() {
  const client = useCanvasClient();
  const [swatches, setSwatches] = useState<SwatchSummary[]>([]);
  const [groups, setGroups] = useState<ColorGroupSummary[]>([]);

  const refresh = useCallback(() => {
    void client
      .collection<SwatchSummary>("swatches")
      .then((s) => setSwatches([...s]))
      .catch(() => setSwatches([]));
    void client
      .collection<ColorGroupSummary>("colorGroups")
      .then((g) => setGroups([...g]))
      .catch(() => setGroups([]));
  }, [client]);

  useEffect(() => {
    refresh();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "documentLoaded" ||
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        refresh();
      }
    });
    return off;
  }, [client, refresh]);

  const onAdd = () => {
    void client
      .mutate({
        op: "createSwatch",
        args: {
          spec: {
            name: "New Swatch",
            space: "CMYK",
            value: [0, 0, 0, 100],
            model: "Process",
          },
        },
      })
      .catch(() => {});
  };

  // Group-assign: move the swatch ref between ColorGroups via
  // editColorGroup (remove from its current group, add to target).
  const assignGroup = (swatchId: string, groupId: string | null) => {
    const current = groups.find((g) => g.members.includes(swatchId));
    const ops: Promise<unknown>[] = [];
    if (current && current.selfId !== groupId) {
      ops.push(
        client.mutate({
          op: "editColorGroup",
          args: {
            groupId: current.selfId,
            spec: {
              selfId: current.selfId,
              name: current.name,
              members: current.members.filter((m) => m !== swatchId),
            },
          },
        }),
      );
    }
    if (groupId && current?.selfId !== groupId) {
      const target = groups.find((g) => g.selfId === groupId);
      if (target) {
        ops.push(
          client.mutate({
            op: "editColorGroup",
            args: {
              groupId,
              spec: {
                selfId: groupId,
                name: target.name,
                members: [...target.members, swatchId],
              },
            },
          }),
        );
      }
    }
    void Promise.all(ops).catch(() => {});
  };

  const groupOf = (swatchId: string): string | null =>
    groups.find((g) => g.members.includes(swatchId))?.selfId ?? null;

  // Render: each group as a header + its member rows, then the
  // ungrouped remainder.
  const grouped = new Set(groups.flatMap((g) => g.members));
  const ungrouped = swatches.filter((s) => !grouped.has(s.selfId));

  const renderRows = (list: SwatchSummary[]) => (
    <ul>
      {list.map((sw) => (
        <SwatchRow
          key={sw.selfId}
          swatch={sw}
          groups={groups}
          groupOf={groupOf(sw.selfId)}
          onAssignGroup={assignGroup}
        />
      ))}
    </ul>
  );

  return (
    <div className="text-sm border-t border-input mt-2 pt-2" data-swatch-collection="ready">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Swatches
        </span>
        <div className="flex items-center gap-1">
          <LibrariesMenu />
          <button
            type="button"
            className="px-2 py-0.5 rounded hover:bg-muted/60"
            data-action="add-swatch"
            onClick={onAdd}
          >
            + New
          </button>
        </div>
      </div>
      {swatches.length === 0 ? (
        <div className="px-1 text-xs text-muted-foreground" data-swatches="empty">
          No swatches.
        </div>
      ) : (
        <>
          {groups.map((g) => {
            const members = swatches.filter((s) => g.members.includes(s.selfId));
            if (members.length === 0) return null;
            return (
              <div key={g.selfId} data-swatch-group={g.selfId}>
                <div className="px-2 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  ▾ {g.name}
                </div>
                {renderRows(members)}
              </div>
            );
          })}
          {renderRows(ungrouped)}
        </>
      )}
    </div>
  );
}

// Concept 2 — bundled open libraries (the freieFarbe HLC atlas +
// the 376-library OCSC). Each loads its UNMODIFIED original .ase on
// demand and imports as ONE undoable operation; the attribution is
// visible right in the menu (CC BY-ND: ship the original, attribute,
// never re-bake). Portal + fixed position — the dockview panel clips
// overflow.
function LibrariesMenu() {
  const client = useCanvasClient();
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const open = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    setAt(rect ? { left: rect.left, top: rect.bottom + 4 } : { left: 100, top: 100 });
  };

  const load = (id: string) => {
    const lib = BUNDLED_LIBRARIES.find((l) => l.id === id);
    if (!lib) return;
    setBusy(id);
    void lib
      .url()
      .then((url) => fetch(url))
      .then((r) => r.arrayBuffer())
      .then((buf) => importAseBytes(client, new Uint8Array(buf), lib.title))
      .finally(() => {
        setBusy(null);
        setAt(null);
      });
  };

  const list = BUNDLED_LIBRARIES.filter((l) =>
    l.title.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="px-2 py-0.5 rounded hover:bg-muted/60 text-xs"
        data-action="open-libraries"
        title="Bundled swatch libraries"
        onClick={open}
      >
        Libraries ▾
      </button>
      {at &&
        createPortal(
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 60 }}
              onClick={() => setAt(null)}
              aria-hidden
            />
            <div
              data-libraries-menu
              style={{
                position: "fixed",
                left: at.left,
                top: at.top,
                zIndex: 61,
                width: 280,
                maxHeight: 360,
                overflowY: "auto",
                background: "#fff",
                border: "1px solid #d4d4d8",
                borderRadius: 6,
                boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
                padding: 8,
                fontSize: 12,
              }}
            >
              <input
                autoFocus
                placeholder="Filter libraries…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full border border-input rounded px-1.5 py-0.5 mb-1 text-xs"
                data-libraries-filter
              />
              {list.slice(0, 50).map((lib) => (
                <button
                  key={lib.id}
                  type="button"
                  data-library-id={lib.id}
                  disabled={busy !== null}
                  onClick={() => load(lib.id)}
                  className="block w-full text-left px-1.5 py-1 rounded hover:bg-muted/60 truncate"
                  title={lib.attribution}
                >
                  {busy === lib.id ? "Loading… " : ""}
                  {lib.title}
                </button>
              ))}
              {list.length > 50 && (
                <div className="px-1.5 py-1 text-muted-foreground">
                  …{list.length - 50} more — refine the filter.
                </div>
              )}
              <div
                className="border-t border-input mt-1 pt-1 text-[10px] text-muted-foreground"
                data-hlc-attribution
              >
                HLC Colour Atlas &amp; OCSC © freieFarbe e.V., CC BY-ND 4.0 —
                originals shipped unmodified, see NOTICE.
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

export function SwatchesPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-swatches-panel="ready">
        <CompositionRenderer composition={swatchesComposition} />
        <SwatchCollection />
      </div>
    </CatalogRegistryProvider>
  );
}
