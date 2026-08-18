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

// @paged-media/tools — the built-in tool bundle (Concept 1).
//
// The InDesign tool catalog as ToolContributions + the gesture
// handlers for the tools the engine supports. Registered by the app
// via `<PagedShell tools={BUILT_IN_TOOLS}>` — through the identical
// `ToolRegistry.register` path a third-party bundle would use. This
// workspace package is the decision-B publish unit
// (`@paged-media/tools` on npm once the org + token exist).

export { BUILT_IN_TOOLS } from "./built-in-tools";
// The shared post-insert flow (mutate → select created → geometry
// refresh) — reused by the editor's `paged.insert.*` command layer so
// menu/palette inserts land exactly like tool-drawn ones.
export { mutateAndSelect, type MutateReply } from "./handlers/shared";
export { createEllipseHandler } from "./handlers/ellipse-tool";
export { createGradientFeatherHandler } from "./handlers/gradient-feather-tool";
export { createGradientSwatchHandler } from "./handlers/gradient-tool";
export { createLineHandler } from "./handlers/line-tool";
export { createPageHandler } from "./handlers/page-tool";
export { createPencilHandler } from "./handlers/pencil-tool";
export { createPenHandler } from "./handlers/pen-tool";
export { createPolygonHandler } from "./handlers/polygon-tool";
export { createRectangleHandler } from "./handlers/rectangle-tool";
export { createScissorsHandler } from "./handlers/scissors-tool";
export { createShearHandler } from "./handlers/shear-tool";
export { createSmoothHandler } from "./handlers/smooth-tool";
export {
  createRotateHandler,
  createScaleHandler,
  createTransformGestureHandler,
  type TransformGestureKind,
} from "./handlers/transform-tools";
