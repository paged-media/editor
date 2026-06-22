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

import type { ReactNode } from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { PageId } from "@paged-media/client";

import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useDocument } from "../state/document-context";
import { useOptionalScreenMode } from "../state/screen-mode-context";

/**
 * Per-page labels: "page N" caption under the page, plus heading-
 * anchor badges (Tier 3 resolution data). The caption count comes
 * from the registry's `pageRects` map; anchor badges come from the
 * resolution table on DocumentContext.
 */
function PageDecorationsRender(props: OverlayProps) {
  const { resolution } = useDocument();
  // Concept 1 (T7) — captions/badges are non-printing chrome: Normal
  // mode only; Preview / Bleed / Slug / Presentation hide them.
  const screenMode = useOptionalScreenMode();
  const inv = 1 / props.camera.scale;
  if (screenMode && screenMode.screenMode !== "normal") return null;
  const out: ReactNode[] = [];

  let i = 0;
  for (const [pageId, r] of props.pageRects) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h + 14 * inv;
    out.push(
      <g
        key={`caption:${pageId}`}
        transform={`translate(${cx}, ${cy}) scale(${inv})`}
      >
        <text
          textAnchor="middle"
          fontSize={11}
          fontFamily="var(--font-sans)"
          fill="var(--pg-muted-fg)"
        >
          page {i + 1}
        </text>
      </g>,
    );
    i += 1;
  }

  if (resolution) {
    out.push(...renderAnchorBadges(resolution, props, inv));
  }

  return <>{out}</>;
}

function renderAnchorBadges(
  resolution: NonNullable<ReturnType<typeof useDocument>["resolution"]>,
  props: OverlayProps,
  inv: number,
): ReactNode[] {
  type Entry = {
    anchorId: string;
    text: string;
    level: number;
    pageNumber: number;
  };
  const byPage = new Map<PageId, Entry[]>();
  for (const [anchorId, pos] of Object.entries(resolution.numbering)) {
    if (!pos.pageId) continue;
    const list = byPage.get(pos.pageId) ?? [];
    list.push({
      anchorId,
      text: pos.text ?? "",
      level: pos.level ?? 0,
      pageNumber: pos.pageNumber,
    });
    byPage.set(pos.pageId, list);
  }

  const badges: ReactNode[] = [];
  for (const [pageId, anchors] of byPage) {
    const r = props.pageRects.get(pageId);
    if (!r) continue;
    anchors.sort((a, b) => a.level - b.level);
    anchors.forEach((a, i) => {
      const cx = r.x + 8 * inv;
      const cy = r.y + (12 + i * 22) * inv;
      const trimmed = a.text.length > 28 ? `${a.text.slice(0, 27)}…` : a.text;
      const label = `⚓ ${a.pageNumber} — ${trimmed}`;
      const labelWidthPx = 8 + label.length * 6.0;
      badges.push(
        <g
          key={`badge:${pageId}:${a.anchorId}`}
          transform={`translate(${cx}, ${cy}) scale(${inv})`}
        >
          <rect
            x={0}
            y={-9}
            width={labelWidthPx}
            height={16}
            rx={3}
            fill="var(--status-approved)"
            fillOpacity="0.92"
          />
          <text
            x={4}
            y={3}
            fontSize={10}
            fontFamily="var(--font-sans)"
            fill="white"
          >
            {label}
          </text>
        </g>,
      );
    });
  }
  return badges;
}

export const pageDecorationsContribution: OverlayContribution = {
  id: "paged.page-decorations",
  render: PageDecorationsRender,
  z: 50,
};
