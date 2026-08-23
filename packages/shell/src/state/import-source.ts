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

// U14 — the in-flight import's source-file name.
//
// A file opened through the importer-registry union (File ▸ Open… /
// drag-drop routing an `.idml` to paged.publish, a `.pdf` to
// paged.pdf, …) reaches the document loader via the plugin's
// `host.nativeDocument.open(bytes)` — a contract that carries BYTES
// only, so the file's display name is lost at that seam and the doc
// title bar used to fall back to a generic "Imported document".
//
// The shell knows the name at the moment it hands the bytes to the
// importer, so it parks it here; the app's open orchestration TAKES it
// (single-shot) when — and only when — the importer actually opens a
// document. An importer that merely PLACES content into the open
// document never takes the slot; the caller clears it when the import
// settles, so a stale name cannot leak into a later open.

let pendingImportSource: string | null = null;

/** Park (or clear, with `null`) the file name of the import being
 *  dispatched to a plugin importer. */
export function setPendingImportSource(name: string | null): void {
  pendingImportSource = name;
}

/** Single-shot read: returns the parked name and clears the slot. */
export function takePendingImportSource(): string | null {
  const name = pendingImportSource;
  pendingImportSource = null;
  return name;
}
