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

// Navigator panel — wraps the existing PageNavigator component to
// fit the shell's PanelProps signature. Reads everything from
// contexts so registration is `{ component: NavigatorPanel }`
// with no per-mount props plumbing.

import {
  PanelToolbar,
  ToolbarBtn,
  useCamera,
  useCanvasClient,
  useDocument,
  type PanelProps,
} from "@paged-media/shell";
import { Navigator as PageNavigator } from "../ui/Navigator";
import { useAnimatedCamera } from "../ui/useAnimatedCamera";

export function NavigatorPanel(_props: PanelProps) {
  const { handle, snapshots } = useDocument();
  const { camera, setCamera, viewportSize } = useCamera();
  const animateCamera = useAnimatedCamera(camera, setCamera);
  const client = useCanvasClient();

  if (!handle || handle.pageCount === 0) {
    return <div style={{ padding: 12, opacity: 0.5 }}>No document loaded.</div>;
  }

  // B3 — the page VERBS, on the panel a designer actually has open.
  // `paged.pages` is in Design mode's left dock by default and could
  // only navigate; `paged.pages-list` could add and delete and is in no
  // mode's slots. Adding a page from the default layout meant knowing
  // about `Layout > Add page`, and DELETING one had no menu route at
  // all — the list panel was the only way to reach `deletePage`.
  //
  // Appends at the end rather than after a selection: this panel has no
  // row selection to speak of (clicking a thumbnail navigates), so
  // there is no "current page" here that is not just "where the camera
  // is". The list panel keeps the after-the-selection behaviour.
  const onNew = () => {
    const last = handle.pageIds[handle.pageIds.length - 1] ?? null;
    void client
      .mutate({ op: "insertPage", args: { afterPageId: last, masterId: null } })
      .catch(() => {});
  };

  return (
    <>
      <PanelToolbar>
        <ToolbarBtn icon="ui-plus" label="Add page" onClick={onNew} />
      </PanelToolbar>
    <PageNavigator
      pageIds={handle.pageIds}
      pageSizesPt={handle.pageSizesPt}
      snapshots={snapshots}
      viewportSize={viewportSize}
      onCameraChange={animateCamera}
    />
    </>
  );
}
