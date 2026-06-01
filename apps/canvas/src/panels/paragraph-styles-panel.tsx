// SDK Phase 5 — Paragraph Styles panel.
//
// Hybrid: the composition's `collection-select` row applies a style to
// the selection (the D1 + D7 proof), and the management section below
// reads the paragraph-style collection and creates / deletes entries
// through the collection-mutation wire (createParagraphStyle /
// deleteParagraphStyle). Editing a style's options (font size, indents)
// rides `setStyleProperty` and is the richer follow-up.

import { useCallback, useEffect, useState } from "react";

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  useCanvasClient,
} from "@paged-media/shell";

import type { ParagraphStyleSummary } from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";
import { paragraphStylesComposition } from "./paragraph-styles.composition";

function ParagraphStyleCollection() {
  const client = useCanvasClient();
  const [styles, setStyles] = useState<ParagraphStyleSummary[]>([]);

  const refresh = useCallback(() => {
    void client
      .collection<ParagraphStyleSummary>("paragraphStyles")
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
      .mutate({ op: "createParagraphStyle", args: { name: "New Paragraph Style" } })
      .catch(() => {});
  };
  const onRemove = (styleId: string) => {
    void client
      .mutate({ op: "deleteParagraphStyle", args: { styleId } })
      .catch(() => {});
  };

  return (
    <div className="text-sm border-t border-input mt-2 pt-2" data-style-collection="ready">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Paragraph styles
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
          No paragraph styles.
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

export function ParagraphStylesPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-paragraph-styles-panel="ready">
        <CompositionRenderer composition={paragraphStylesComposition} />
        <ParagraphStyleCollection />
      </div>
    </CatalogRegistryProvider>
  );
}
