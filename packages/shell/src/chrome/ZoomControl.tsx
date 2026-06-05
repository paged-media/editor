// Design system — the header zoom dropdown (kit chrome.jsx "50% ▾").
// REAL: the percentage reads the live camera scale; the menu items
// invoke the registered zoom commands (zoom in / out / 100% / fit),
// so behaviour matches the View menu and keyboard shortcuts.

import { Icon } from "../icons";
import { useCamera } from "../state/camera-context";
import { useRegistries } from "../state/registries-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

const ZOOM_ITEMS: Array<[string, string]> = [
  ["Zoom in", "paged.view.zoomIn"],
  ["Zoom out", "paged.view.zoomOut"],
  ["Zoom to 100%", "paged.view.zoom100"],
  ["Fit document", "paged.view.zoomFit"],
];

export function ZoomControl() {
  const { camera } = useCamera();
  const { commands } = useRegistries();
  const pct = Math.round(camera.scale * 100);
  // No registry subscription needed: the camera context re-renders
  // this control on every zoom/pan, re-evaluating `commands.get`
  // long before the menu could be opened.

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-zoom-control
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          height: 30,
          padding: "0 10px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--pg-border)",
          background: "transparent",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          fontSize: 12,
          color: "var(--pg-fg)",
        }}
      >
        {pct}%
        <Icon name="ui-chevron-down" size={13} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4}>
        {ZOOM_ITEMS.map(([label, id]) =>
          commands.get(id) ? (
            <DropdownMenuItem
              key={id}
              data-zoom-item={id}
              onSelect={() => void commands.invoke(id)}
            >
              {label}
            </DropdownMenuItem>
          ) : null,
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
