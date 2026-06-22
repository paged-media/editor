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

import { useEffect, useMemo, useState, type CSSProperties } from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type {
  Camera,
} from "@paged-media/client";
// eslint-disable-next-line import/no-relative-parent-imports
import type { PageId } from "@paged-media/client";

import type {
  OverlayContribution,
  OverlayPageRect,
  OverlayProps,
} from "../registries/overlay";
import { useRegistries } from "../state/registries-context";
import { useOptionalPaged } from "../state/paged-editor";

export interface OverlayHostProps {
  /** Current camera. */
  camera: Camera;
  /** Page rectangles in iteration order. The host turns this into
   *  the registry's page-id-keyed Map for contributions. */
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<OverlayPageRect>;
  /** Host SVG size in CSS px. */
  width: number;
  height: number;
}

/**
 * Mounts every registered overlay contribution inside a shared SVG
 * sized to the host (`width` × `height`) and transformed by the
 * current camera. Re-renders on contribution registration changes
 * so a bundle disposing its overlay disappears in the next tick.
 *
 * Contributions render their own subtree; the host only provides:
 *   - z-order sorting (default 100, ties break on insertion order)
 *   - the shared `<svg>` + camera-transform `<g>` wrapper
 *   - the standard `OverlayProps` (paged, camera, pageRects Map)
 */
export function OverlayHost(props: OverlayHostProps) {
  const registries = useRegistries();
  const paged = useOptionalPaged();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const off = registries.overlays.onChange(() => setVersion((v) => v + 1));
    return () => off.dispose();
  }, [registries.overlays]);

  const sorted = useMemo<OverlayContribution[]>(() => {
    const list = registries.overlays.list().slice();
    list.sort((a, b) => (a.z ?? 100) - (b.z ?? 100));
    return list;
    // version triggers the resort whenever a contribution comes or goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registries.overlays, version]);

  const pageRects = useMemo<ReadonlyMap<PageId, OverlayPageRect>>(() => {
    const map = new Map<PageId, OverlayPageRect>();
    const n = Math.min(props.pageIds.length, props.pageRects.length);
    for (let i = 0; i < n; i++) {
      map.set(props.pageIds[i], props.pageRects[i]);
    }
    return map;
  }, [props.pageIds, props.pageRects]);

  const k = props.camera.scale;
  const transform = `matrix(${k}, 0, 0, ${k}, ${props.camera.tx}, ${props.camera.ty})`;
  const overlayProps: OverlayProps = { paged, camera: props.camera, pageRects };

  return (
    <svg width={props.width} height={props.height} style={overlayStyle}>
      <g transform={transform}>
        {sorted.map((c) => {
          const Render = c.render;
          return <Render key={c.id} {...overlayProps} />;
        })}
      </g>
    </svg>
  );
}

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  display: "block",
};
