// Design system (publishing cockpit) — the 64px right-edge panel
// launcher (the kit's panel-selector rail). In the cockpit, each
// entry opens its panel as a right-dock tab (or closes it when it
// is already the open tab) — panels surface in ONE predictable
// place, never scattered. On the legacy dockview path it toggles
// the panel through the substrate. Config comes from the app
// (`<PagedShell panelRail={...}>`) — the shell renders, never
// hardcodes the list.

import { useEffect, useState } from "react";

import { Icon } from "../icons";
import { resolvePanelSpec } from "../docking/panel-bridge";
import { useDockingSubstrate } from "../docking/substrate-context";
import { useRegistries } from "../state/registries-context";
import { useOptionalCockpitState } from "../cockpit/cockpit-state-context";

export interface PanelRailItem {
  /** A registered panel id (`paged.swatches`, …). */
  panelId: string;
  /** Short launcher label, e.g. "Swatches". */
  title: string;
  /** Glyph name. */
  icon: string;
  /** Cockpit — steer the Properties inspector when this item
   *  activates (the kit's Text / Image / Pages rail clicks all
   *  open Properties with a different sub-inspector). */
  inspectorContext?: "text" | "image" | "page";
}

export function PanelRail({ items }: { items: PanelRailItem[] }) {
  const substrate = useDockingSubstrate();
  const cockpit = useOptionalCockpitState();
  const { panels } = useRegistries();
  // Re-render on layout changes so active states track reality
  // (panels closed from their tabs, restored layouts, mode swaps).
  const [, bump] = useState(0);
  useEffect(() => {
    if (!substrate) return;
    const sub = substrate.onLayoutChange(() => bump((n) => n + 1));
    return () => sub.dispose();
  }, [substrate]);

  if ((!cockpit && !substrate) || items.length === 0) return null;

  const isActive = (item: PanelRailItem) =>
    cockpit
      ? cockpit.activeTab === item.panelId &&
        (item.inspectorContext == null ||
          cockpit.inspectorContext === item.inspectorContext)
      : Boolean(substrate?.hasPanel(item.panelId));

  const toggle = (item: PanelRailItem) => {
    const contribution = panels.get(item.panelId);
    if (!contribution) return;
    if (cockpit) {
      // Cockpit: active → close (and clear the steer); otherwise
      // ensure + activate, steering the Properties sub-inspector
      // when the item carries a context (kit Text/Image/Pages).
      if (isActive(item)) {
        cockpit.closeTab(item.panelId);
        if (item.inspectorContext) cockpit.setInspectorContext(null);
      } else {
        cockpit.openPanel(item.panelId);
        cockpit.setInspectorContext(item.inspectorContext ?? null);
      }
      return;
    }
    if (!substrate) return;
    if (substrate.hasPanel(item.panelId)) {
      substrate.closePanel(item.panelId);
    } else {
      substrate.addPanel(resolvePanelSpec(contribution));
    }
    bump((n) => n + 1);
  };

  return (
    <div data-panel-rail style={railStyle}>
      {items.map((item) => {
        const active = isActive(item);
        return (
          <button
            key={`${item.panelId}:${item.inspectorContext ?? ""}`}
            type="button"
            data-panel-rail-item={
              item.inspectorContext
                ? `${item.panelId}:${item.inspectorContext}`
                : item.panelId
            }
            data-active={active ? "true" : "false"}
            title={item.title}
            onClick={() => toggle(item)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              width: 56,
              padding: "7px 0 6px",
              borderRadius: "var(--radius-md)",
              border: "none",
              cursor: "pointer",
              background: active ? "var(--selected-bg)" : "transparent",
              color: active ? "var(--pg-primary)" : "var(--chrome-icon)",
            }}
          >
            <Icon name={item.icon} size={17} />
            <span style={{ fontSize: 9.5, lineHeight: 1 }}>{item.title}</span>
          </button>
        );
      })}
    </div>
  );
}

const railStyle: React.CSSProperties = {
  width: 64,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
  padding: "8px 0",
  borderLeft: "1px solid var(--chrome-border)",
  background: "var(--chrome-rail-bg)",
  overflowY: "auto",
};
