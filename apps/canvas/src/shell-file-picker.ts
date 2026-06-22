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

// K-5 / S-11 — the host file picker backing `host.shell.pickFile`.
//
// A bundle calls `host.shell.pickFile({ accept: [".xlsx"] })` and gets the
// chosen files' BYTES back (read here, at the host boundary — the plugin
// contract never leaks a DOM `File`, so a bundle stays isolate-ready). We
// drive a fresh programmatic `<input type="file">` per call (the same
// pattern the "Open IDML…" command uses), reading each pick into a
// Uint8Array. Resolves to `[]` on cancel.

export interface PickedFile {
  name: string;
  bytes: Uint8Array;
  mimeType: string;
}

export interface FilePickerOptions {
  /** Accept filter — extensions (leading dot) and/or MIME types, joined
   *  into the input's `accept` (e.g. `[".xlsx"]`). */
  accept?: readonly string[];
  /** Allow choosing more than one file. Default false. */
  multiple?: boolean;
}

/** Open a transient file picker and resolve to the chosen files' bytes.
 *  `[]` when the user cancels (or the picker yields nothing). */
export function pickFiles(
  options?: FilePickerOptions,
): Promise<readonly PickedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (options?.accept && options.accept.length > 0) {
      input.accept = options.accept.join(",");
    }
    if (options?.multiple) input.multiple = true;

    let settled = false;
    const finish = (files: readonly PickedFile[]) => {
      if (settled) return;
      settled = true;
      resolve(files);
    };

    input.onchange = async () => {
      const list = input.files ? Array.from(input.files) : [];
      if (list.length === 0) {
        finish([]);
        return;
      }
      const picked = await Promise.all(
        list.map(async (f) => ({
          name: f.name,
          bytes: new Uint8Array(await f.arrayBuffer()),
          mimeType: f.type,
        })),
      );
      finish(picked);
    };
    // Modern browsers fire `cancel` when the dialog is dismissed; older
    // ones never resolve from there, but onchange's empty-list path still
    // covers a re-opened-then-cancelled picker.
    input.oncancel = () => finish([]);

    input.click();
  });
}
