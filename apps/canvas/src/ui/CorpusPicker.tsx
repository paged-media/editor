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

// Dev-only header control: browse + load the staged Envato fidelity
// corpus (`corpus/envato/packs/<name>/template.idml`) without leaving
// the editor. The list + bytes are served by vite.config.ts's
// `corpusIdmlRoute` in dev; in a production build that route doesn't
// exist, the fetch yields non-JSON, and the <select> self-hides.
//
// Loading routes through the shell's `loadDocumentFile` — the exact
// path the File ▸ Open IDML… command uses (see shell
// `state/commands/file-commands.ts`) — so a corpus load behaves
// identically to opening a file from disk (default font, snapshots,
// document handle).

import { useCallback, useEffect, useState } from "react";
import {
  loadDocumentFile,
  useCanvasClient,
  useDocument,
} from "@paged-media/shell";

interface CorpusEntry {
  id: string; // "<group>/<name>" — passed to /corpus/idml/file/
  label: string;
  group: string; // generated | sample | pack
  stage?: string; // packs only: smoke | gated | skip
}

// Per-group marks so the three fixture families are visually distinct.
const GROUP_MARK: Record<string, string> = {
  generated: "⚙",
  sample: "▦",
  pack: "●",
};

export function CorpusPicker() {
  const client = useCanvasClient();
  const doc = useDocument();
  const [entries, setEntries] = useState<CorpusEntry[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/corpus/idml/list")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: unknown) => {
        if (!cancelled && Array.isArray(list)) setEntries(list as CorpusEntry[]);
      })
      .catch(() => {
        // corpus route unreachable (e.g. production build) — stay hidden
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(
    async (id: string) => {
      if (!id) return;
      setBusy(true);
      try {
        // id is "<group>/<name>"; don't encode the slash separator.
        const path = id.split("/").map(encodeURIComponent).join("/");
        const resp = await fetch(`/corpus/idml/file/${path}`);
        if (!resp.ok) {
          console.warn(`[corpus] ${id}: HTTP ${resp.status}`);
          return;
        }
        const buf = await resp.arrayBuffer();
        const file = new File([buf], `${id.replace("/", "-")}.idml`, {
          type: "application/octet-stream",
        });
        await loadDocumentFile(client, file, {
          setHandle: doc.setHandle,
          setLoading: doc.setLoading,
          setStatus: (s) => console.info("[corpus]", s),
          setSnapshotsReady: doc.setSnapshotsReady,
          addSnapshot: (pageId, url) =>
            doc.setSnapshots((prev) => new Map(prev).set(pageId, url)),
          resetForNewDocument: doc.resetForNewDocument,
          pushWarning: (w) => console.warn("[corpus]", w),
        });
      } finally {
        setBusy(false);
      }
    },
    [client, doc],
  );

  if (entries.length === 0) return null;

  return (
    <select
      aria-label="Load corpus IDML"
      title="Load a staged Envato corpus template (dev only)"
      defaultValue=""
      disabled={busy}
      onChange={(e) => {
        const id = e.target.value;
        // Uncontrolled select: snap back to the placeholder so picking
        // the same fixture again re-fires onChange (useful for reloading).
        e.target.selectedIndex = 0;
        void load(id);
      }}
      style={{
        height: 28,
        maxWidth: 240,
        marginRight: 8,
        padding: "0 6px",
        borderRadius: 6,
        border: "1px solid rgba(128,128,128,0.4)",
        background: "transparent",
        color: "inherit",
        font: "inherit",
        fontSize: 12,
      }}
    >
      <option value="" disabled>
        {busy ? "Loading…" : `Corpus… (${entries.length})`}
      </option>
      {entries.map((e) => (
        <option key={e.id} value={e.id}>
          {`${GROUP_MARK[e.group] ?? "●"}  ${e.label}${
            e.stage === "gated" ? " (gated)" : ""
          }`}
        </option>
      ))}
    </select>
  );
}
