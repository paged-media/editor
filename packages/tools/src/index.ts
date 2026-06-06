// @paged-media/tools — the built-in tool bundle (Concept 1).
//
// The InDesign tool catalog as ToolContributions + the gesture
// handlers for the tools the engine supports. Registered by the app
// via `<PagedShell tools={BUILT_IN_TOOLS}>` — through the identical
// `ToolRegistry.register` path a third-party bundle would use. This
// workspace package is the decision-B publish unit
// (`@paged-media/tools` on npm once the org + token exist).

export { BUILT_IN_TOOLS } from "./built-in-tools";
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
