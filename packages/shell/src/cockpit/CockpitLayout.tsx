// Cockpit — the fixed publishing-cockpit layout (kit app.jsx /
// canvas.jsx). Replaces the dockview body area with three fixed
// columns: LeftPanel (262px, the mode's single left panel) ·
// CanvasColumn (title bar · rulers · viewport on the canvas
// surround · thumbnail filmstrip) · RightDock (320px tab group).
// The ToolRail / PanelRail / ModeSwitcher stay PagedShell chrome
// around this component.
//
// Mode slots resolve through the mode registry; panel ids resolve
// through the panel registry (PanelHost) — the same contracts
// plugins use, so a custom panel renders here untouched.

import type { ComponentType } from "react";

import type { PanelProps } from "../registries/panel";
import { usePaged } from "../state/paged-editor";
import { useRegistries } from "../state/registries-context";
import { useWorkflowMode } from "../state/workflow-mode-context";
import { PanelHost } from "./PanelHost";
import { RightDock } from "./RightDock";
import { DocTitleBar } from "./canvas-frame/DocTitleBar";
import { GuideDragController } from "./canvas-frame/GuideDragController";
import { HRuler, VRulerStrip } from "./canvas-frame/Rulers";
import { ThumbnailRail } from "./canvas-frame/ThumbnailRail";

export interface CockpitLayoutProps {
  /** The document viewport (apps/canvas's CanvasPanel) — rendered in
   *  the canvas column unless the mode overrides the canvas slot. */
  canvasComponent: ComponentType<PanelProps>;
  /** Tab / Shift+Tab chrome hiding — when true the side panels
   *  disappear and the canvas column fills the row. */
  panelsHidden?: boolean;
  /** IDML intake — the canvas column is the drag-drop target. */
  onFile?: (file: File) => void;
}

export function CockpitLayout({
  canvasComponent: CanvasComponent,
  panelsHidden,
  onFile,
}: CockpitLayoutProps) {
  const paged = usePaged();
  const registries = useRegistries();
  const { mode } = useWorkflowMode();
  const slots = registries.modes.get(mode)?.slots;

  const leftId = slots?.left;
  const canvasOverride = slots?.canvas?.startsWith("panel:")
    ? slots.canvas.slice("panel:".length)
    : undefined;
  // Export-style modes replace the document viewport with a centred
  // work surface — no rulers / filmstrip around it (kit canvas.jsx).
  const isOverride = canvasOverride != null;

  return (
    <div
      data-cockpit-layout
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: "flex",
      }}
    >
      {!panelsHidden && leftId && (
        <div
          data-left-panel={leftId}
          style={{
            width: 262,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            borderRight: "1px solid var(--chrome-border)",
            background: "var(--pg-bg)",
            overflow: "hidden",
          }}
        >
          <PanelHost id={leftId} />
        </div>
      )}

      {/* Canvas column */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          background: "var(--pg-bg)",
        }}
      >
        <DocTitleBar />
        {!isOverride && <HRuler />}
        <div
          data-cockpit-canvas
          onDragOver={(e) => {
            if (onFile) e.preventDefault();
          }}
          onDrop={(e) => {
            if (!onFile) return;
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) onFile(file);
          }}
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            background: isOverride ? "var(--pg-bg)" : "var(--canvas-surround)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {!isOverride && <VRulerStrip />}
          {/* W2.8 — `data-paged-viewport` tags the viewport wrapper so
              the GuideDragController can invert client → document
              coordinates against the same rect the canvas uses. */}
          <div
            data-paged-viewport
            style={{ flex: 1, minWidth: 0, position: "relative" }}
          >
            {isOverride ? (
              <PanelHost id={canvasOverride} />
            ) : (
              <CanvasComponent paged={paged} api={{ id: "paged.canvas" }} />
            )}
          </div>
        </div>
        {/* W2.8 — headless guide-drag controller (ruler → drag →
            insert/move/delete guide). Only on the real canvas surface,
            not the export-style overrides (which have no rulers). */}
        {!isOverride && <GuideDragController />}
        {!isOverride && <ThumbnailRail />}
      </div>

      {!panelsHidden && (
        <div
          style={{
            width: 320,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            borderLeft: "1px solid var(--chrome-border)",
            background: "var(--pg-bg)",
            overflow: "hidden",
          }}
        >
          <RightDock />
        </div>
      )}
    </div>
  );
}
