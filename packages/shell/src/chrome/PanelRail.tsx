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

  const isActive = (panelId: string) =>
    cockpit
      ? cockpit.activeTab === panelId
      : Boolean(substrate?.hasPanel(panelId));

  const toggle = (panelId: string) => {
    const contribution = panels.get(panelId);
    if (!contribution) return;
    if (cockpit) {
      // Cockpit: active tab → close; otherwise ensure + activate.
      if (cockpit.activeTab === panelId) cockpit.closeTab(panelId);
      else cockpit.openPanel(panelId);
      return;
    }
    if (!substrate) return;
    if (substrate.hasPanel(panelId)) {
      substrate.closePanel(panelId);
    } else {
      substrate.addPanel(resolvePanelSpec(contribution));
    }
    bump((n) => n + 1);
  };

  return (
    <div data-panel-rail style={railStyle}>
      {items.map((item) => {
        const active = isActive(item.panelId);
        return (
          <button
            key={item.panelId}
            type="button"
            data-panel-rail-item={item.panelId}
            data-active={active ? "true" : "false"}
            title={item.title}
            onClick={() => toggle(item.panelId)}
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
