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

import { downloadBytes } from "../../shell-file-saver";

export type ExportTargetId = "pdf-x4" | "image" | "web" | "social" | "package";

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
   *  (IDML export moved to the paged.publish plugin exporter — ADR-022
   *  Phase 5 — so it's no longer a built-in target.) */
  action?: "dialog" | "image";
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
  // IDML export is now the paged.publish plugin's exporter (ADR-022 Phase 5)
  // — it appears in the Export Center's plugin-exporters section via the
  // registry, no longer a built-in static target.
  {
    id: "web",
    icon: "ui-web",
    title: "Web bundle",
    note: "Responsive HTML",
    live: false,
  },
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
  /** "all" = every page; "current" = the active page only; "range" =
   *  the pages named by `range`.
   *
   *  E-2 — the range exists because all/current is a BINARY and the
   *  common ask sits between them ("pages 3-7", "the two covers"). This
   *  is paged's answer to Photoshop's `Export As → artboards`: the
   *  containment those artboards provide is already a page here, so
   *  what was missing was only the ability to name a SUBSET. */
  scope: "all" | "current" | "range";
  /** Output container. PNG is lossless with alpha; JPEG is smaller and
   *  has NO alpha, which is why the encoder flattens onto white first —
   *  see `encodePageImage`. */
  format: "png" | "jpeg";
  /** JPEG quality, 0.5–1. Ignored for PNG. */
  quality: number;
  /** A 1-based page list like `"1-3,5,8-10"`. Only read when
   *  `scope === "range"`. Kept as the typed STRING rather than a parsed
   *  array so a half-typed entry survives a re-render — parsing on
   *  every keystroke would fight the user. */
  range: string;
}

/** Parse a 1-based page range into ZERO-based indices, clamped to
 *  `pageCount` and de-duplicated, in ascending order.
 *
 *  Returns `null` for input that names no valid page, which the caller
 *  must treat as a REFUSAL rather than as "export everything" — a typo
 *  that silently writes 400 files is worse than one that writes none.
 *  Empty input is `null` for the same reason.
 *
 *  Deliberately tolerant of the shapes people actually type: spaces
 *  anywhere, a trailing comma, and a reversed pair (`7-3`) which reads
 *  as the same span rather than as nothing. */
export function parsePageRange(
  spec: string,
  pageCount: number,
): number[] | null {
  if (pageCount <= 0) return null;
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const t = part.trim();
    if (t === "") continue;
    const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(t);
    if (!m) return null; // a malformed token invalidates the whole spec
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (!(a >= 1) || !(b >= 1)) return null;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    for (let n = lo; n <= hi; n++) {
      if (n <= pageCount) out.add(n - 1);
    }
  }
  return out.size === 0 ? null : [...out].sort((x, y) => x - y);
}

const IMAGE_KEY = "paged.export.image.v1";
const IMAGE_DEFAULTS: ImageSettings = {
  dpi: 150,
  scope: "all",
  range: "",
  format: "png",
  // 0.9, not 0.8: these are PAGE renders with type on them, and JPEG
  // ringing around glyph edges is the first thing a designer notices.
  quality: 0.9,
};

let imageSettings: ImageSettings = loadImageSettings();
const imageListeners = new Set<() => void>();

function loadImageSettings(): ImageSettings {
  try {
    const raw = localStorage.getItem(IMAGE_KEY);
    if (!raw) return IMAGE_DEFAULTS;
    return {
      ...IMAGE_DEFAULTS,
      ...(JSON.parse(raw) as Partial<ImageSettings>),
    };
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
  /** Why nothing was written, when that was a REFUSAL rather than an
   *  empty document. `"range"` = the page range named no valid page. */
  refused?: "range";
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
  triggerDownload: (
    bytes: Uint8Array,
    filename: string,
  ) => void = defaultDownload,
): Promise<ImageExportResult> {
  const { pageIds, pageSizesPt, settings } = args;
  if (pageIds.length === 0) return { files: 0 };

  let indices: number[];
  if (settings.scope === "current") {
    indices = [
      Math.min(Math.max(args.activePageIndex ?? 0, 0), pageIds.length - 1),
    ];
  } else if (settings.scope === "range") {
    const parsed = parsePageRange(settings.range ?? "", pageIds.length);
    // REFUSE rather than fall back to every page. A range that parses
    // to nothing is a typo, and answering a typo with 400 files is the
    // worst of the three possible behaviours.
    if (parsed === null) return { files: 0, refused: "range" };
    indices = parsed;
  } else {
    indices = pageIds.map((_, i) => i);
  }

  const base = (args.baseName || "document").replace(/\.idml$/i, "");
  const pad = String(pageIds.length).length;
  let files = 0;

  for (const i of indices) {
    const pageId = pageIds[i];
    const widthPt = pageSizesPt[i]?.[0] ?? 595; // A4-ish fallback
    const widthPx = pngWidthPx(widthPt, settings.dpi);
    const snap = await client.requestSnapshot(pageId, widthPx, settings.dpi);
    const png = Uint8Array.from(snap.pngBytes);
    const encoded = await encodePageImage(
      png,
      settings.format,
      settings.quality,
    );
    // A realm that cannot encode JPEG falls back to the PNG it already
    // has rather than writing nothing — the page still lands, and the
    // extension follows the bytes so the file is never mislabelled.
    const isJpeg = settings.format === "jpeg" && encoded !== null;
    const bytes = encoded ?? png;
    const ext = isJpeg ? "jpg" : "png";
    const label =
      indices.length === 1
        ? `${base}.${ext}`
        : `${base}-p${String(i + 1).padStart(pad, "0")}.${ext}`;
    triggerDownload(bytes, label);
    files += 1;
  }

  return { files };
}

function defaultDownload(bytes: Uint8Array, filename: string): void {
  downloadBytes(
    bytes,
    filename,
    filename.endsWith(".jpg") ? "image/jpeg" : "image/png",
  );
}

/**
 * Re-encode a page snapshot, which the engine always hands back as PNG.
 *
 * PNG passes through untouched — no decode, no re-encode, so a lossless
 * export stays byte-for-byte what the renderer produced.
 *
 * JPEG HAS NO ALPHA, so the bitmap is drawn onto an opaque WHITE canvas
 * before encoding — white because that is what paper is, and because it
 * matches what the PDF export puts behind the same page.
 *
 * BE PRECISE ABOUT WHY, because the obvious reason is not the true one
 * TODAY. A page snapshot is ALREADY opaque: core's `render_snapshot`
 * documents "background is white (matching the renderer's default for
 * `render_document`)" and its own test asserts an empty page comes back
 * `(255, 255, 255, 255)` in every pixel. So no transparency currently
 * reaches this function, and the flatten changes nothing.
 *
 * It stays anyway, and this is the argument: the day a
 * transparent-background PNG export appears — an ordinary ask, and the
 * only reason anyone picks PNG over JPEG for a page — the alpha becomes
 * real, and WITHOUT this the JPEG lane fails by rendering every
 * transparent region BLACK. A silent, ugly, whole-page failure. One
 * `fillRect` is a cheap price for removing that trapdoor, provided
 * nobody later reads this as "transparency happens here" and builds on
 * it. It does not, yet.
 *
 * Returns `null` when the realm has no imaging primitives (Node), so the
 * caller can fall back rather than throw.
 */
export async function encodePageImage(
  pngBytes: Uint8Array,
  format: "png" | "jpeg",
  quality: number,
): Promise<Uint8Array | null> {
  if (format === "png") return pngBytes;
  if (
    typeof createImageBitmap !== "function" ||
    typeof OffscreenCanvas !== "function"
  ) {
    return null;
  }
  const bmp = await createImageBitmap(
    new Blob([pngBytes.slice() as BlobPart], { type: "image/png" }),
  );
  try {
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, bmp.width, bmp.height);
    ctx.drawImage(bmp, 0, 0);
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: Math.min(Math.max(quality, 0.5), 1),
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bmp.close();
  }
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

// K-10 — plugin bytes leave the app through ONE mechanism: the exporter
// registry's delivery here and the bundle-driven `host.shell.saveFile` door
// are the same `downloadBytes` call, so the two paths cannot drift.
const pluginDownload = downloadBytes;

// runIdmlExport removed — IDML export is now the paged.publish plugin's
// exporter (ADR-022 Phase 5), run through the shared runPluginExporter above.
