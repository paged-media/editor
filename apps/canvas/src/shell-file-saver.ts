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

// K-10 — the host file SAVER backing `host.shell.saveFile`, and the app's
// one blob→download mechanism.
//
// The mirror of `shell-file-picker.ts`: a bundle hands BYTES + a suggested
// name (no DOM File, no Blob crosses the plugin contract, so a bundle stays
// isolate-ready) and the host delivers them. `pickFile` was read-only, so a
// plugin that ingested a file — paged.image adjusting a PSD/PNG/JPEG — had no
// way to give the edited bytes back except the document-level Export Center.
//
// This is NOT a second delivery mechanism: it is the anchor-download the app
// already used for its plugin exporters and page images, extracted here so
// both go out the same door (`export-targets.ts` imports `downloadBytes`).
// A File System Access upgrade (`showSaveFilePicker`) belongs behind this
// function, not beside it.

/** Deliver `bytes` to the user as a download named `filename`. The app's
 *  single blob→anchor mechanism — the Export Center's plugin-exporter
 *  delivery and the PNG page export both route through it. */
export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType?: string,
): void {
  // `.slice()` detaches the view from any SAB/wasm memory it may alias —
  // a Blob over live wasm memory is a use-after-free waiting to happen.
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

/** What `host.shell.saveFile` hands over (the plugin-api `SaveFileOptions`
 *  shape, restated locally so this module stays contract-independent — the
 *  editor pins a published plugin-api canary). */
export interface SaveFileRequest {
  suggestedName: string;
  bytes: Uint8Array;
  mimeType?: string;
}

/** Characters a leaf download name must not carry (the Windows/macOS
 *  reserved set); control characters are filtered by code point below. */
const RESERVED_NAME_CHARS = '<>:"|?*';

/** Sanitize a plugin-supplied name into a leaf file name: it is a
 *  SUGGESTION, never a path. Directory separators, control characters and
 *  the reserved set are dropped; a name left with nothing usable falls back
 *  to a neutral one. Non-ASCII is preserved — a German or Japanese file
 *  name is not a threat. */
export function safeDownloadName(suggested: string): string {
  const leaf = String(suggested).split(/[\\/]/).pop() ?? "";
  const cleaned = [...leaf]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code > 31 && code !== 127 && !RESERVED_NAME_CHARS.includes(ch);
    })
    .join("")
    .trim()
    .slice(0, 180);
  return cleaned.length > 0 && cleaned !== "." && cleaned !== ".."
    ? cleaned
    : "download";
}

/**
 * Back `host.shell.saveFile`. Answers `true` when the bytes were handed to
 * the browser's download path, `false` when the delivery threw.
 *
 * HONEST CEILING (contract-documented): an anchor download cannot observe a
 * user cancel, so `true` means "delivered to the browser", not "a file
 * exists on disk". A File System Access backing added here later can answer
 * a real `false` — the boolean is what makes that upgrade invisible to
 * bundles.
 */
export async function saveFileBytes(
  request: SaveFileRequest,
): Promise<boolean> {
  try {
    downloadBytes(
      request.bytes,
      safeDownloadName(request.suggestedName),
      request.mimeType,
    );
    return true;
  } catch {
    // A refused save is a RESULT, not an exception — the SDK door promises
    // a bundle it never throws in a click handler.
    return false;
  }
}
