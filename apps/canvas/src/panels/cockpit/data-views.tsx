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

// Cockpit — Data-layout mode's surfaces (kit: left Data Source nav,
// canvas-area generated grid). Both are honest seams until the
// data-publishing engine lands; the existing DataMappingPanel
// (stub-panels.tsx) stays the right inspector.

import {
  CockpitPanelHeader,
  CockpitSection,
  ComingSoon,
  StatusPill,
  type PanelProps,
} from "@paged-media/shell";

/** Data mode — LEFT panel: source + records + fields (kit
 *  DataSourcePanel). */
export function DataSourcePanel(_props: PanelProps) {
  return (
    <div
      data-data-source-panel
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "var(--font-sans)",
      }}
    >
      <CockpitPanelHeader title="Data Source" />
      <CockpitSection
        title="Source"
        right={<StatusPill tone="draft">not connected</StatusPill>}
      >
        <span className="pg-ui-xs" style={{ lineHeight: 1.45 }}>
          Connect a structured source (PIM, CSV, API). Records and their fields
          list here, ready to map onto layout slots.
        </span>
      </CockpitSection>
      <ComingSoon icon="ui-database" title="Records & fields coming soon">
        The record list and field chips land with the data-publishing engine.
      </ComingSoon>
    </div>
  );
}

/** Data mode — CANVAS main: the generated product-card grid (kit
 *  DataGrid). */
export function DataGridPanel(_props: PanelProps) {
  return (
    <div
      data-data-grid-panel
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        overflowY: "auto",
      }}
    >
      <ComingSoon icon="ui-bolt" title="Generated layout preview coming soon">
        Connect a source and map fields — generated, repeatable pages preview
        here with per-record status.
      </ComingSoon>
    </div>
  );
}
