// SDK Phase 5 (named sweep) — Swatches panel.
//
// Hybrid (per panel-catalog §5.5): the composition chrome applies a
// swatch to the selection (SetProperty FrameFillColor), and the
// collection-management section below it reads the document's swatch
// list and creates / deletes entries through the collection-mutation
// wire:
//   + New  → createSwatch (a default process-black CMYK swatch)
//   ✕      → deleteSwatch
// Editing a swatch's colour (the new-swatch colour dialog) reuses
// editSwatch and is the richer follow-up; the wire is ready for it.

import { useCallback, useEffect, useState } from "react";

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  useCanvasClient,
} from "@paged-media/shell";

import type { SwatchSummary } from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";
import { swatchesComposition } from "./swatches.composition";

function SwatchCollection() {
  const client = useCanvasClient();
  const [swatches, setSwatches] = useState<SwatchSummary[]>([]);

  const refresh = useCallback(() => {
    void client
      .collection<SwatchSummary>("swatches")
      .then((s) => setSwatches([...s]))
      .catch(() => setSwatches([]));
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

  const onRemove = (swatchId: string) => {
    void client
      .mutate({ op: "deleteSwatch", args: { swatchId } })
      .catch(() => {});
  };

  return (
    <div className="text-sm border-t border-input mt-2 pt-2" data-swatch-collection="ready">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Swatches
        </span>
        <button
          type="button"
          className="px-2 py-0.5 rounded hover:bg-muted/60"
          data-action="add-swatch"
          onClick={onAdd}
        >
          + New
        </button>
      </div>
      {swatches.length === 0 ? (
        <div className="px-1 text-xs text-muted-foreground" data-swatches="empty">
          No swatches.
        </div>
      ) : (
        <ul>
          {swatches.map((sw) => (
            <li
              key={sw.selfId}
              className="flex items-center gap-2 px-2 py-1 hover:bg-muted/40 border-b border-input/30"
              data-swatch-id={sw.selfId}
            >
              <span className="flex-1 select-none truncate">{sw.name}</span>
              <span className="text-[10px] uppercase text-muted-foreground">
                {sw.kind}
              </span>
              <button
                type="button"
                title="delete swatch"
                data-action="remove-swatch"
                onClick={() => onRemove(sw.selfId)}
                className="px-1 hover:text-red-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
