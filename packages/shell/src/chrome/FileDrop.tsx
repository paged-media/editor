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

// IDML file intake — drag-drop zone + the `<input type="file">` the
// Playwright suite drives via `page.setInputFiles`. Extracted from
// PagedShell so the Header can mount the compact variant.

import { useCallback } from "react";

export interface FileDropProps {
  onFile: (file: File) => void;
  compact?: boolean;
  /** Cockpit — render only the invisible `<input type="file">`.
   *  File intake then runs through File ▸ Open IDML…, canvas
   *  drag-drop, and the Playwright `setInputFiles` hook; the kit
   *  header carries no file widget. */
  hidden?: boolean;
}

export function FileDrop(props: FileDropProps) {
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) props.onFile(file);
    },
    [props],
  );
  const input = (
    // No `accept` filter: like canvas drag-drop, this routes through the
    // importer registry, which claims every registered format (.idml, .svg,
    // .xlsx, images, .docx, …) — a static .idml filter here silently lied.
    <input
      type="file"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) props.onFile(file);
      }}
      style={
        props.hidden
          ? { display: "none" }
          : { marginLeft: props.compact ? 0 : 8, fontSize: 12 }
      }
    />
  );
  if (props.hidden) return input;
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      style={props.compact ? compactDropStyle : dropStyle}
    >
      {props.compact ? "" : "Drop an IDML file here, or "}
      {input}
    </div>
  );
}

const dropStyle: React.CSSProperties = {
  border: "2px dashed var(--chrome-divider)",
  padding: 16,
  borderRadius: "var(--radius-lg)",
  textAlign: "center",
  color: "var(--pg-muted-fg)",
};

const compactDropStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
};
