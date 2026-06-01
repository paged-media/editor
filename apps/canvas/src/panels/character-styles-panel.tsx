// SDK Phase 5 — Character Styles panel.
//
// Hybrid twin of the Paragraph Styles panel: composition applies a
// style to the selection; the management section creates / deletes
// entries via createCharacterStyle / deleteCharacterStyle.

import { useCallback, useEffect, useState } from "react";

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  useCanvasClient,
} from "@paged-media/shell";

import type { CharacterStyleSummary } from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";
import { characterStylesComposition } from "./character-styles.composition";

function CharacterStyleCollection() {
  const client = useCanvasClient();
  const [styles, setStyles] = useState<CharacterStyleSummary[]>([]);

  const refresh = useCallback(() => {
    void client
      .collection<CharacterStyleSummary>("characterStyles")
      .then((s) => setStyles([...s]))
      .catch(() => setStyles([]));
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
      .mutate({ op: "createCharacterStyle", args: { name: "New Character Style" } })
      .catch(() => {});
  };
  const onRemove = (styleId: string) => {
    void client
      .mutate({ op: "deleteCharacterStyle", args: { styleId } })
      .catch(() => {});
  };

  return (
    <div className="text-sm border-t border-input mt-2 pt-2" data-style-collection="ready">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Character styles
        </span>
        <button
          type="button"
          className="px-2 py-0.5 rounded hover:bg-muted/60"
          data-action="add-style"
          onClick={onAdd}
        >
          + New
        </button>
      </div>
      {styles.length === 0 ? (
        <div className="px-1 text-xs text-muted-foreground" data-styles="empty">
          No character styles.
        </div>
      ) : (
        <ul>
          {styles.map((s) => (
            <li
              key={s.selfId}
              className="flex items-center gap-2 px-2 py-1 hover:bg-muted/40 border-b border-input/30"
              data-style-id={s.selfId}
            >
              <span className="flex-1 select-none truncate">{s.name}</span>
              <button
                type="button"
                title="delete style"
                data-action="remove-style"
                onClick={() => onRemove(s.selfId)}
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

export function CharacterStylesPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-character-styles-panel="ready">
        <CompositionRenderer composition={characterStylesComposition} />
        <CharacterStyleCollection />
      </div>
    </CatalogRegistryProvider>
  );
}
