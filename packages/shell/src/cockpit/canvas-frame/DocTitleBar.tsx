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

// Cockpit — the document title bar atop the canvas column (kit
// canvas.jsx CanvasArea header): name · dirty state · a mode badge
// outside Design. All real: documentName + dirty from the worker's
// DocumentMeta, the badge from the mode registry.

import { useDocumentMeta } from "../../catalog/use-collection";
import { useDocument } from "../../state/document-context";
import { useWorkflowMode } from "../../state/workflow-mode-context";
import { useRegistries } from "../../state/registries-context";

export function DocTitleBar() {
  const meta = useDocumentMeta();
  // U14 — most generated/corpus IDMLs carry no meta documentName; the
  // loaded FILE's name (extension stripped, set by the loader) is the
  // honest fallback identity before "Untitled document".
  const { sourceName } = useDocument();
  const { mode } = useWorkflowMode();
  const registries = useRegistries();
  const modeTitle = registries.modes.get(mode)?.title;
  const loaded = meta != null && meta.pageCount > 0;

  return (
    <div
      data-doc-title-bar
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 34,
        padding: "0 14px",
        background: "var(--chrome-panel-bg)",
        borderBottom: "1px solid var(--chrome-border)",
        flexShrink: 0,
        whiteSpace: "nowrap",
        fontFamily: "var(--font-sans)",
      }}
    >
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {loaded
          ? meta.documentName || sourceName || "Untitled document"
          : "No document"}
      </span>
      {loaded && meta.dirty && (
        <span style={{ fontSize: 11.5, color: "var(--pg-muted-fg)" }}>
          Edited
        </span>
      )}
      {mode !== "design" && modeTitle && (
        <span
          data-doc-title-mode-badge
          style={{
            marginLeft: 8,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--pg-primary)",
            border:
              "1px solid color-mix(in srgb, var(--pg-primary) 35%, transparent)",
            borderRadius: "var(--radius-sm)",
            padding: "2px 7px",
          }}
        >
          {modeTitle}
        </span>
      )}
    </div>
  );
}
