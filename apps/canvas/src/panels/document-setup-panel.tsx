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

// ADR 323 — Document Setup and Margins and Columns as schema-driven
// forms over the object model's document and page addresses:
//
//   · Document Setup edits `doc`: bleed and slug (core `setProperty`),
//     the document defaults (`setDocumentDefaults`), colour management
//     (`setColorSettings` / `setProofSetup` / `setUseStandardLabForSpots`)
//     and the active condition set. Each is a virtual path core's `Set`
//     resolves to its dedicated op, so the panel writes `set("doc", …)`
//     and never builds the op itself.
//   · Margins and Columns edits one page (`page:<id>`) or every page at
//     once: with "All pages" each field writes ONE batch over every page
//     address = one undo step.
//
// Every field is a `PropertyField` ("Bind to data…", badge, the schema's
// type and range); rows the schema adds that no section names appear
// under "More".

import { useMemo, useState } from "react";

import { CockpitPanelHeader, CockpitRow, useCollection } from "@paged-media/shell";
import { formatAddress } from "@paged-media/plugin-sdk";
import type { PageSummary } from "@paged-media/client";

import { SchemaSections, type SectionSpec } from "./schema-sections";

const DOCUMENT_SECTIONS: readonly SectionSpec[] = [
  {
    title: "Bleed",
    fields: [
      { path: "documentBleedTop", label: "Top" },
      { path: "documentBleedBottom", label: "Bottom" },
      { path: "documentBleedInsideOrLeft", label: "Inside" },
      { path: "documentBleedOutsideOrRight", label: "Outside" },
    ],
  },
  {
    title: "Slug",
    fields: [
      { path: "documentSlugTop", label: "Top" },
      { path: "documentSlugBottom", label: "Bottom" },
      { path: "documentSlugInsideOrLeft", label: "Inside" },
      { path: "documentSlugRightOrOutside", label: "Outside" },
    ],
  },
  {
    title: "Defaults",
    fields: [
      { path: "defaultFillColor", label: "Fill", collection: "swatches" },
      { path: "defaultStrokeColor", label: "Stroke", collection: "swatches" },
      { path: "defaultStrokeWeight", label: "Weight" },
    ],
  },
  {
    title: "Color Management",
    fields: [
      { path: "cmykProfile", label: "CMYK profile" },
      { path: "rgbPolicy", label: "RGB policy" },
      { path: "renderingIntent", label: "Intent" },
      { path: "blackPointCompensation", label: "Black point" },
      { path: "useStandardLabForSpots", label: "Lab for spots" },
    ],
  },
  {
    title: "Proof Setup",
    fields: [
      { path: "proofProfile", label: "Profile" },
      { path: "proofIntent", label: "Intent" },
      { path: "proofSimulatePaperWhite", label: "Paper white" },
    ],
  },
  {
    title: "Conditions",
    fields: [{ path: "activeConditionSet", label: "Active set", collection: "conditionSets" }],
  },
];

const PAGE_SECTIONS: readonly SectionSpec[] = [
  {
    title: "Page",
    fields: [
      { path: "pageBounds", label: "Bounds" },
      { path: "appliedMaster", label: "Master", collection: "masterPages" },
    ],
  },
  {
    title: "Margins",
    fields: [
      { path: "pageMarginTop", label: "Top" },
      { path: "pageMarginBottom", label: "Bottom" },
      { path: "pageMarginLeft", label: "Inside" },
      { path: "pageMarginRight", label: "Outside" },
    ],
  },
  {
    title: "Columns",
    fields: [
      { path: "pageColumnCount", label: "Number" },
      { path: "pageColumnGutter", label: "Gutter" },
    ],
  },
];

const DOC_TARGETS = ["doc"] as const;

export function DocumentSetupPanel() {
  return (
    <div data-document-setup-panel="ready">
      <CockpitPanelHeader title="Document Setup" />
      <SchemaSections targets={DOC_TARGETS} sections={DOCUMENT_SECTIONS} testId="doc" />
    </div>
  );
}

const ALL = "__all__";

/** The page address the object model resolves (`page:<self id>`). */
export function pageAddress(selfId: string): string {
  return formatAddress({ kind: "page", id: selfId } as never);
}

export function MarginsColumnsPanel() {
  const pages = useCollection<PageSummary>("pages");
  const [pick, setPick] = useState<string>("");
  const chosen = pick || pages?.[0]?.selfId || "";
  const targets = useMemo(() => {
    if (!pages || pages.length === 0) return [];
    if (chosen === ALL) return pages.map((p) => pageAddress(p.selfId));
    return [pageAddress(chosen)];
  }, [pages, chosen]);
  return (
    <div data-margins-columns-panel={pages ? "ready" : "loading"} data-page-targets={targets.length}>
      <CockpitPanelHeader title="Margins and Columns" />
      <div className="px-3.5 pb-2">
        <CockpitRow label="Pages">
          <select
            data-page-select=""
            className="h-[28px] w-full rounded-[6px] border border-input bg-background px-2 text-[12px]"
            value={chosen}
            onChange={(e) => setPick(e.target.value)}
          >
            {(pages ?? []).map((p) => (
              <option key={p.selfId} value={p.selfId}>
                Page {p.index}
              </option>
            ))}
            {(pages?.length ?? 0) > 1 && <option value={ALL}>All pages</option>}
          </select>
        </CockpitRow>
      </div>
      {targets.length > 0 && (
        <SchemaSections key={targets.join(" ")} targets={targets} sections={PAGE_SECTIONS} testId="page" />
      )}
    </div>
  );
}
