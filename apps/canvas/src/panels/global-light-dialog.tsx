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

// Object ▸ Effects ▸ Global light… — InDesign's Global Light dialog: the
// document's light angle and altitude (engine 0.71.8, core ADR 135). An
// effect with "Use global light" on takes its angle (a bevel also its
// altitude) from here. Both are `doc` rows, so the two fields are
// `PropertyField`s on the `doc` address: each edit is one `set` through
// `host.objects` = one undo step, and each offers "Bind to data…".

import { useEffect, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";

import { PropertyField } from "@paged-media/shell";
import type { CommandContribution, MenuItemContribution } from "@paged-media/shell";

export const GLOBAL_LIGHT_COMMAND = "paged.effects.globalLight";

const DOC_TARGETS: readonly string[] = ["doc"];

let isOpen = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => isOpen;

function setOpen(next: boolean): void {
  isOpen = next;
  for (const l of listeners) l();
}

export function openGlobalLight(): void {
  setOpen(true);
}

export const GLOBAL_LIGHT_COMMANDS: CommandContribution[] = [
  {
    id: GLOBAL_LIGHT_COMMAND,
    title: "Global light…",
    category: "Object",
    handler: () => openGlobalLight(),
  },
];

export const GLOBAL_LIGHT_MENU_ITEMS: MenuItemContribution[] = [
  { path: "Object/Effects/Global light…", command: GLOBAL_LIGHT_COMMAND, order: 39, group: "effects" },
];

export function GlobalLightDialog() {
  const open = useSyncExternalStore(subscribe, snapshot, snapshot);
  return open ? <GlobalLightForm /> : null;
}

function GlobalLightForm() {
  const close = () => setOpen(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      data-global-light-backdrop=""
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.5)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-light-title"
        data-global-light-dialog=""
        data-panel-host=""
        style={{
          width: "min(320px, 92vw)",
          padding: 16,
          borderRadius: "var(--radius-lg, 10px)",
          border: "1px solid var(--border, #2a2a2a)",
          background: "var(--elevated, var(--background, #161616))",
          color: "var(--fg, #e7e7e7)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        }}
      >
        <h2 id="global-light-title" style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>
          Global light
        </h2>
        <div className="flex flex-col gap-1.5">
          <PropertyField
            path="documentGlobalLightAngle"
            label="Angle"
            targets={DOC_TARGETS}
            schemaKind="doc"
            chrome={{ suffix: "°" }}
          />
          <PropertyField
            path="documentGlobalLightAltitude"
            label="Altitude"
            targets={DOC_TARGETS}
            schemaKind="doc"
            chrome={{ suffix: "°" }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" data-global-light-done="" onClick={close} style={buttonStyle}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

const buttonStyle: CSSProperties = {
  padding: "6px 14px",
  borderRadius: 7,
  fontSize: 12,
  cursor: "pointer",
  border: "1px solid var(--border, #2a2a2a)",
  background: "var(--pg-primary, #4f7cff)",
  color: "var(--pg-primary-fg, #fff)",
};
