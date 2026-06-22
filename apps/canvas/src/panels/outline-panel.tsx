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

// Outline panel — wraps the existing Outline component for the
// docking substrate. Same pattern as NavigatorPanel: all data
// from context hooks, no props.

import {
  useCamera,
  useDocument,
  type PanelProps,
} from "@paged-media/shell";
import { Outline } from "../ui/Outline";
import { useAnimatedCamera } from "../ui/useAnimatedCamera";

export function OutlinePanel(_props: PanelProps) {
  const { handle, resolution } = useDocument();
  const { camera, setCamera, viewportSize } = useCamera();
  const animateCamera = useAnimatedCamera(camera, setCamera);

  if (!handle || handle.pageCount === 0 || !resolution) {
    return (
      <div style={{ padding: 12, opacity: 0.5 }}>
        Outline unavailable. Load a document with heading anchors to populate.
      </div>
    );
  }

  return (
    <Outline
      resolution={resolution}
      pageIds={handle.pageIds}
      pageSizesPt={handle.pageSizesPt}
      viewportSize={viewportSize}
      onCameraChange={animateCamera}
    />
  );
}
