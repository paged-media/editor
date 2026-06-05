// Cockpit — the right dock: the kit's DockGroup (right-panels.jsx).
// A 36px tab strip (icon · title · close ✕, active tab carries the
// 2px violet underline) over the active panel. The strip hides when
// only one tab is open — the kit's "single fixed inspector" look in
// the non-design modes. The ONLY tabbed surface in the app; panels
// never float or re-dock elsewhere.

import { Icon, hasIcon } from "../icons";
import { useRegistries } from "../state/registries-context";
import { useCockpitState } from "./cockpit-state-context";
import { PanelHost } from "./PanelHost";

export function RightDock() {
  const { rightTabs, activeTab, activateTab, closeTab } = useCockpitState();
  const { panels } = useRegistries();

  // Resolve tabs against the registry — a disposed plugin panel
  // simply drops out of the strip.
  const tabs = rightTabs
    .map((id) => panels.get(id))
    .filter((c): c is NonNullable<typeof c> => c != null);
  const active = activeTab && panels.get(activeTab) ? activeTab : null;

  return (
    <div
      data-right-dock
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
      }}
    >
      {tabs.length > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            height: 36,
            background: "var(--chrome-panel-bg)",
            borderBottom: "1px solid var(--chrome-border)",
            flexShrink: 0,
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
        >
          {tabs.map((t) => {
            const a = active === t.id;
            const icon = t.icon && hasIcon(t.icon) ? t.icon : undefined;
            return (
              <button
                key={t.id}
                type="button"
                data-dock-tab={t.id}
                data-active={a || undefined}
                onClick={() => activateTab(t.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 12px",
                  border: "none",
                  cursor: "pointer",
                  background: a ? "var(--pg-bg)" : "transparent",
                  color: a ? "var(--pg-fg)" : "var(--pg-muted-fg)",
                  fontFamily: "var(--font-sans)",
                  fontSize: 12.5,
                  fontWeight: a ? 600 : 500,
                  borderBottom: a
                    ? "2px solid var(--pg-primary)"
                    : "2px solid transparent",
                  borderRight: "1px solid var(--chrome-border)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {icon && (
                  <Icon name={icon} size={13} style={{ opacity: 0.85 }} />
                )}
                {t.title}
                {a && t.closable !== false && (
                  <span
                    role="button"
                    aria-label={`Close ${t.title}`}
                    data-dock-tab-close={t.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(t.id);
                    }}
                    style={{
                      display: "inline-flex",
                      opacity: 0.4,
                      marginLeft: 2,
                      cursor: "pointer",
                    }}
                  >
                    <Icon name="ui-x" size={12} />
                  </span>
                )}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {active ? (
          <PanelHost id={active} />
        ) : (
          <div className="pg-ui-xs" style={{ padding: 16, opacity: 0.6 }}>
            No panel open.
          </div>
        )}
      </div>
    </div>
  );
}
