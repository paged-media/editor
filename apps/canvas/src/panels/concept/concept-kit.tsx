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

// Panel-gallery pass — shared chrome for the CONCEPT panels (the
// InDesign-parity + output/a11y surfaces from INDESIGN_PARITY.md).
// A concept panel is an HONEST SEAM at panel scale: the gallery's
// exact field layout, visibly disabled, with the Concept badge up
// top and the kit's "Target ·" end-state footnote pinned below —
// the roadmap reads honestly, nothing fake-interactive.

import type { ReactNode } from "react";

import { Icon, PanelTarget, StatusBadge } from "@paged-media/shell";
import { KitSelect } from "@paged-media/ui";

export function ConceptShell({
  testId,
  target,
  live,
  children,
}: {
  /** `data-<testId>="ready"` root hook. */
  testId: string;
  /** The gallery's Target footnote text. */
  target: ReactNode;
  /** "partial" when parts are live (Glyphs); default concept. */
  live?: boolean;
  children: ReactNode;
}) {
  const probe = { [`data-${testId}`]: "ready" };
  return (
    <div {...probe} className="flex flex-col h-full min-h-0">
      <div className="flex justify-end px-3 pt-2">
        <StatusBadge status={live ? "partial" : "concept"} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-2">
        {children}
      </div>
      <PanelTarget>{target}</PanelTarget>
    </div>
  );
}

export function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[92px_1fr] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <div className="pg-label pt-2 border-t border-input">{children}</div>;
}

export function SeamSelect({ value }: { value: string }) {
  return (
    <KitSelect value="" soft disabled data-seam>
      <option value="">{value}</option>
    </KitSelect>
  );
}

export function SeamNum({ value, icon }: { value: string; icon?: string }) {
  return (
    <span
      data-seam
      className="inline-flex h-[28px] items-stretch overflow-hidden rounded-[6px] border border-input bg-background opacity-55"
    >
      {icon && (
        <span className="inline-flex items-center border-r border-input bg-muted px-[7px] text-muted-foreground">
          <Icon name={icon} size={13} />
        </span>
      )}
      <input
        disabled
        value={value}
        readOnly
        className="w-full min-w-0 flex-1 bg-transparent px-2 text-[11.5px] text-muted-foreground"
        style={{ fontFamily: "var(--font-mono)" }}
      />
    </span>
  );
}

export function SeamSeg({
  options,
  active,
}: {
  options: string[];
  active?: string;
}) {
  return (
    <div
      className="inline-flex w-full overflow-hidden rounded-[6px] border border-input opacity-55"
      role="group"
      data-seam
    >
      {options.map((o, i) => (
        <button
          key={o}
          type="button"
          disabled
          data-active={o === active ? "true" : "false"}
          className="flex-1 text-xs h-[27px] border-0"
          style={{
            borderRight:
              i < options.length - 1 ? "1px solid var(--pg-border)" : "none",
            background:
              o === active ? "var(--chrome-slot-active)" : "var(--pg-bg)",
            color:
              o === active ? "var(--chrome-icon-active)" : "var(--pg-muted-fg)",
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function SeamSwitch({ on }: { on?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      disabled
      data-seam
      className="relative w-[30px] h-[17px] rounded-full border-0 opacity-55"
      style={{
        background: on ? "var(--pg-primary)" : "var(--chrome-divider)",
      }}
    >
      <span
        className="absolute top-[2px] w-[13px] h-[13px] rounded-full bg-white shadow"
        style={{ left: on ? 15 : 2 }}
      />
    </button>
  );
}
