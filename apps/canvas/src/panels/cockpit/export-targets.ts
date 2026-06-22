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

// Cockpit — the Export family's shared output model + live actions.
//
// W2.6 (Full-Green) — every output is now either LIVE (a real action
// through the published client surface) or HONEST (a visible,
// disabled concept seam). The three Export-mode panels (Outputs nav,
// Export Center table, Export inspector) read this single source so
// they stay in lockstep.
//
// LIVE outputs and the published capability behind each:
//   • pdf-x4 — `client.exportPdf(...)` (the ExportPdfDialog owns the
//     option form + page loop + download).
//   • image  — `client.requestSnapshot(pageId, widthPx, dpi)` → real
//     PNG bytes per page (the navigator/fidelity readback path).
//   • idml   — `client.exportIdml()` → real `.idml` package bytes.
//
// HONEST outputs (web / social / package) carry the "soon" pill and
// stay disabled until the multi-format publishing pipeline lands.

import { useSyncExternalStore } from "react";
import type { CanvasClient } from "@paged-media/client";
import type { ExporterContribution } from "@paged-media/shell";

export type ExportTargetId =
  | "pdf-x4"
  | "image"
  | "idml"
  | "web"
  | "social"
  | "package";

export interface ExportTarget {
  id: ExportTargetId;
  icon: string;
  title: string;
  note: string;
  /** LIVE = a real action exists; HONEST = a disabled concept seam. */
  live: boolean;
  /** How a LIVE target runs (HONEST targets have no action).
   *  - "dialog": opens the ExportPdfDialog (settings live there)
   *  - "image":  runs the inline PNG page export (settings here)
   *  - "idml":   serialises + downloads the IDML package */
  action?: "dialog" | "image" | "idml";
}

export const EXPORT_TARGETS: ExportTarget[] = [
  {
    id: "pdf-x4",
    icon: "ui-doc",
    title: "Print PDF (PDF/X-4)",
    note: "Text as text · native CMYK + spot plates",
    live: true,
    action: "dialog",
  },
  {
    id: "image",
    icon: "ui-page",
    title: "Page images (PNG)",
    note: "Rasterised pages · pick resolution",
    live: true,
    action: "image",
  },
  {
    id: "idml",
    icon: "ui-export",
    title: "IDML package",
    note: "Round-trip source · re-openable in InDesign",
    live: true,
    action: "idml",
  },
  { id: "web", icon: "ui-web", title: "Web bundle", note: "Responsive HTML", live: false },
  {
    id: "social",
    icon: "ui-social",
    title: "Social crops",
    note: "Per-network image crops",
    live: false,
  },
  {
    id: "package",
    icon: "ui-export",
    title: "Print package",
    note: "Document + links + fonts, zipped",
    live: false,
  },
];

export function exportTargetById(id: string): ExportTarget {
  return EXPORT_TARGETS.find((t) => t.id === id) ?? EXPORT_TARGETS[0];
}

// ── Tiny cross-panel store: which output target is selected. The
//    Outputs nav (left) writes; the Export inspector (right) and the
//    Export Center (canvas) read. Module-level, no provider plumbing
//    (same pattern as notifyExportPdfDialog). ─────────────────────
let selectedTarget: ExportTargetId = "pdf-x4";
const listeners = new Set<() => void>();
export function setSelectedExportTarget(id: ExportTargetId): void {
  selectedTarget = id;
  for (const fn of listeners) fn();
}
export function useSelectedExportTarget(): ExportTargetId {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => selectedTarget,
  );
}

// ── Inline per-output settings for the LIVE image output. Persisted
//    so the choice survives reloads (the ExportPdfDialog persists its
//    own form the same way). The image action reads this directly. ──
export interface ImageSettings {
  /** Output DPI — drives requestSnapshot's px width per page. */
  dpi: 72 | 150 | 300;
  /** "all" = every page; "current" = the active page only. */
  scope: "all" | "current";
}

const IMAGE_KEY = "paged.export.image.v1";
const IMAGE_DEFAULTS: ImageSettings = { dpi: 150, scope: "all" };

let imageSettings: ImageSettings = loadImageSettings();
const imageListeners = new Set<() => void>();

function loadImageSettings(): ImageSettings {
  try {
    const raw = localStorage.getItem(IMAGE_KEY);
    if (!raw) return IMAGE_DEFAULTS;
    return { ...IMAGE_DEFAULTS, ...(JSON.parse(raw) as Partial<ImageSettings>) };
  } catch {
    return IMAGE_DEFAULTS;
  }
}

export function setImageSettings(patch: Partial<ImageSettings>): void {
  imageSettings = { ...imageSettings, ...patch };
  try {
    localStorage.setItem(IMAGE_KEY, JSON.stringify(imageSettings));
  } catch {
    /* quota — last-used settings are a convenience only */
  }
  for (const fn of imageListeners) fn();
}

export function useImageSettings(): ImageSettings {
  return useSyncExternalStore(
    (fn) => {
      imageListeners.add(fn);
      return () => imageListeners.delete(fn);
    },
    () => imageSettings,
  );
}

/** Snapshot widths come from page width × DPI / 72 (the fidelity
 *  convention). One page → one PNG download. */
function pngWidthPx(pageWidthPt: number, dpi: number): number {
  return Math.max(1, Math.round((pageWidthPt * dpi) / 72));
}

export interface ImageExportResult {
  /** How many PNG files were produced (one per exported page). */
  files: number;
}

/**
 * LIVE image output — rasterise the selected page range to PNG via
 * the published `client.requestSnapshot` and trigger one download per
 * page. Returns the file count so callers (and tests) can assert real
 * bytes were produced. `triggerDownload` is injectable so the action
 * stays unit-testable; it defaults to the Blob → object-URL → anchor
 * click pattern the PDF/IDML paths use.
 */
export async function runImageExport(
  client: Pick<CanvasClient, "requestSnapshot">,
  args: {
    pageIds: string[];
    pageSizesPt: ReadonlyArray<readonly [number, number]>;
    settings: ImageSettings;
    activePageIndex?: number;
    baseName?: string;
  },
  triggerDownload: (bytes: Uint8Array, filename: string) => void = defaultDownload,
): Promise<ImageExportResult> {
  const { pageIds, pageSizesPt, settings } = args;
  if (pageIds.length === 0) return { files: 0 };

  const indices =
    settings.scope === "current"
      ? [Math.min(Math.max(args.activePageIndex ?? 0, 0), pageIds.length - 1)]
      : pageIds.map((_, i) => i);

  const base = (args.baseName || "document").replace(/\.idml$/i, "");
  const pad = String(pageIds.length).length;
  let files = 0;

  for (const i of indices) {
    const pageId = pageIds[i];
    const widthPt = pageSizesPt[i]?.[0] ?? 595; // A4-ish fallback
    const widthPx = pngWidthPx(widthPt, settings.dpi);
    const snap = await client.requestSnapshot(pageId, widthPx, settings.dpi);
    const bytes = Uint8Array.from(snap.pngBytes);
    const label =
      indices.length === 1
        ? `${base}.png`
        : `${base}-p${String(i + 1).padStart(pad, "0")}.png`;
    triggerDownload(bytes, label);
    files += 1;
  }

  return { files };
}

function defaultDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.slice()], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** K-2 / S-06 — run a plugin-registered exporter: pull its bytes and
 *  download them under its suggested name (the host owns blob→download,
 *  which is the whole point of the exporter contribution). Returns false
 *  when the exporter declined (a null result — nothing to export). */
export async function runPluginExporter(
  exporter: ExporterContribution,
  triggerDownload: (
    bytes: Uint8Array,
    filename: string,
    mimeType?: string,
  ) => void = pluginDownload,
): Promise<boolean> {
  const result = await exporter.export();
  if (!result) return false;
  triggerDownload(result.bytes, result.fileName, exporter.mimeType);
  return true;
}

function pluginDownload(
  bytes: Uint8Array,
  filename: string,
  mimeType?: string,
): void {
  const blob = new Blob([bytes.slice()], {
    type: mimeType || "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** LIVE IDML output — serialise the loaded document and download the
 *  `.idml` package (the same bytes Save As IDML produces). */
export async function runIdmlExport(
  client: Pick<CanvasClient, "exportIdml">,
  baseName: string | undefined,
  triggerDownload: (bytes: Uint8Array, filename: string) => void = (
    bytes,
    filename,
  ) => {
    const blob = new Blob([bytes.slice()], {
      type: "application/vnd.adobe.indesign-idml-package",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
): Promise<void> {
  const bytes = await client.exportIdml();
  const base = (baseName || "document").replace(/\.idml$/i, "");
  triggerDownload(bytes, `${base}.idml`);
}
