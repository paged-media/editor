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

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type {
  DocumentHandle,
  PageId,
  ResolutionResult,
} from "@paged-media/client";

export interface LoadingState {
  name: string;
  bytes: number;
}

interface DocumentContextValue {
  /** Loaded document descriptor; null until the first IDML loads. */
  handle: DocumentHandle | null;
  setHandle: (h: DocumentHandle | null) => void;

  /** In-flight file load; null when idle. */
  loading: LoadingState | null;
  setLoading: (l: LoadingState | null) => void;

  /** Per-page thumbnail object-URLs (revoked on document swap). */
  snapshots: ReadonlyMap<PageId, string>;
  setSnapshots: React.Dispatch<React.SetStateAction<Map<PageId, string>>>;

  /** Flag flipped true after every page has a snapshot — Playwright
   * polls this to avoid contending with the navigator pre-fetch. */
  snapshotsReady: boolean;
  setSnapshotsReady: (ready: boolean) => void;

  /** Tier 3 resolution result. Null before the first resolve fires. */
  resolution: ResolutionResult | null;
  setResolution: (r: ResolutionResult | null) => void;

  /** Convenience reset: clears every per-document field. Called by
   * the loader before kicking off a fresh `loadDocument` so a
   * partial load doesn't show stale snapshots. */
  resetForNewDocument: () => void;
}

const Context = createContext<DocumentContextValue | null>(null);

export function DocumentProvider({ children }: PropsWithChildren) {
  const [handle, setHandle] = useState<DocumentHandle | null>(null);
  const [loading, setLoading] = useState<LoadingState | null>(null);
  const [snapshots, setSnapshots] = useState<Map<PageId, string>>(new Map());
  const [snapshotsReady, setSnapshotsReady] = useState(false);
  const [resolution, setResolution] = useState<ResolutionResult | null>(null);

  const resetForNewDocument = useCallback(() => {
    setSnapshots((prev) => {
      for (const url of prev.values()) URL.revokeObjectURL(url);
      return new Map();
    });
    setResolution(null);
    setSnapshotsReady(false);
  }, []);

  const value = useMemo<DocumentContextValue>(
    () => ({
      handle,
      setHandle,
      loading,
      setLoading,
      snapshots,
      setSnapshots,
      snapshotsReady,
      setSnapshotsReady,
      resolution,
      setResolution,
      resetForNewDocument,
    }),
    [
      handle,
      loading,
      snapshots,
      snapshotsReady,
      resolution,
      resetForNewDocument,
    ],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDocument(): DocumentContextValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useDocument called outside DocumentProvider");
  }
  return ctx;
}
