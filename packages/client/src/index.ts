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

// @paged-media/client — the framework-agnostic canvas client.
//
// Public surface: CanvasClient + the wire types + SAB primitives.
// No React, no DOM dependencies beyond Worker + SharedArrayBuffer.
// The package is shared verbatim between the editor UI and the
// embedded Boa script bridge (which sees the same types via tsify).

export { CanvasClient, type CanvasClientOptions } from "./client";

// Wire-format types — re-exports of the tsify-generated types from
// `crates/paged-canvas/src/channel.rs`. See `./protocol.ts`.
export * from "./protocol";

// SAB primitives.
export {
  CameraBuffer,
  CAMERA_SAB_BYTES,
  OFFSET_SCALE,
  OFFSET_TX,
  OFFSET_TY,
  OFFSET_GEN_LO,
  OFFSET_GEN_HI,
  IDENTITY_CAMERA,
  supportsSharedArrayBuffer,
  docToViewport,
  viewportToDoc,
  type Camera,
} from "./sab/camera";
export {
  GestureBuffer,
  GESTURE_SAB_BYTES,
  GESTURE_SAB_OFFSETS,
  GESTURE_MODIFIER_SHIFT,
  GESTURE_MODIFIER_ALT,
  GESTURE_MODIFIER_DISABLE_SNAP,
  supportsGestureSab,
  type GestureUpdateRecord,
} from "./sab/gesture";
