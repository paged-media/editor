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

// Design system (publishing cockpit) — the 64px right-edge panel
// launcher (the kit's panel-selector rail). Each entry opens its
// panel as a right-dock tab (or closes it when it is already the
// open tab) — panels surface in ONE predictable place, never
// scattered. Config comes from the app
// (`<PagedShell panelRail={...}>`) — the shell renders, never
// hardcodes the list.

import { useEffect, useMemo, useReducer } from "react";

import { hasIcon, Icon } from "../icons";
import { PluginGlyph } from "../icons/plugin-glyph";
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
  const cockpit = useOptionalCockpitState();
  const { panels } = useRegistries();

  // K-8 — the rail DOOR: registered panels that opted in (`rail: true`)
  // render as launcher items after the app's built-ins. Registry-derived
  // + live (a bundle activating later appears; a disposed one drops).
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const sub = panels.onChange(() => bump());
    return () => sub.dispose();
  }, [panels]);
  const pluginItems = useMemo(
    () =>
      panels
        .list()
        .filter((p) => p.rail)
        .map((p) => ({ panelId: p.id, title: p.title, icon: p.icon ?? "" })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panels, version],
  );

  if (!cockpit || (items.length === 0 && pluginItems.length === 0)) return null;

  const isActive = (item: PanelRailItem) =>
    cockpit.activeTab === item.panelId &&
    (item.inspectorContext == null ||
      cockpit.inspectorContext === item.inspectorContext);

  const toggle = (item: PanelRailItem) => {
    const contribution = panels.get(item.panelId);
    if (!contribution) return;
    // Active → close (and clear the steer); otherwise ensure +
    // activate, steering the Properties sub-inspector when the item
    // carries a context (kit Text/Image/Pages).
    if (isActive(item)) {
      cockpit.closeTab(item.panelId);
      if (item.inspectorContext) cockpit.setInspectorContext(null);
    } else {
      cockpit.openPanel(item.panelId);
      cockpit.setInspectorContext(item.inspectorContext ?? null);
    }
  };

  const renderItem = (item: PanelRailItem, plugin: boolean) => {
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
            {plugin && !hasIcon(item.icon) && panels.get(item.panelId)?.iconSvg ? (
              <PluginGlyph svg={panels.get(item.panelId)!.iconSvg!} size={17} />
            ) : (
              <Icon name={item.icon} size={17} />
            )}
            <span style={{ fontSize: 9.5, lineHeight: 1 }}>{item.title}</span>
          </button>
        );
  };

  return (
    <div data-panel-rail style={railStyle}>
      {items.map((item) => renderItem(item, false))}
      {pluginItems.length > 0 && items.length > 0 && (
        <div
          aria-hidden
          style={{
            width: 28,
            borderTop: "1px solid var(--chrome-border)",
            margin: "4px 0",
          }}
        />
      )}
      {pluginItems.map((item) => renderItem(item, true))}
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
