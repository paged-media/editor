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

// Cockpit panel primitives — the design system's `PK.*` set
// (brand/editor/ui_kits/editor/kit.jsx), typed and token-driven.
// Every new cockpit panel composes from these so density, borders
// and the status language stay uniform.

import { useState, type ReactNode } from "react";

import { Icon } from "../../icons";

export function PanelHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 14px 8px",
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          whiteSpace: "nowrap",
          fontFamily: "var(--font-sans)",
        }}
      >
        {title}
      </span>
      {action}
    </div>
  );
}

export function Section({
  title,
  defaultOpen = true,
  right,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: "1px solid var(--pg-border)", padding: "0 14px" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0 8px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "var(--pg-fg)",
        }}
      >
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            fontFamily: "var(--font-sans)",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {right}
          <Icon
            name={open ? "ui-chevron-down" : "ui-chevron-right"}
            size={14}
            style={{ color: "var(--pg-muted-fg)" }}
          />
        </span>
      </button>
      {open && <div style={{ paddingBottom: 12 }}>{children}</div>}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <div className="pg-label" style={{ margin: "0 0 7px" }}>
      {children}
    </div>
  );
}

export function Row({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "96px 1fr",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: "var(--pg-muted-fg)",
          fontFamily: "var(--font-sans)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

export function Btn({
  children,
  primary,
  sm,
  full,
  disabled,
  onClick,
  tone,
  testId,
}: {
  children: ReactNode;
  primary?: boolean;
  sm?: boolean;
  full?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  tone?: "soft";
  testId?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      data-cockpit-action={testId}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        height: sm ? 28 : 34,
        padding: sm ? "0 11px" : "0 14px",
        borderRadius: sm ? "var(--radius-md)" : "var(--radius-lg)",
        border:
          primary || tone === "soft" ? "none" : "1px solid var(--pg-border)",
        background: primary
          ? "var(--pg-primary)"
          : tone === "soft"
            ? "var(--pg-muted)"
            : "transparent",
        color: primary ? "var(--pg-primary-fg)" : "var(--pg-fg)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
        fontFamily: "var(--font-sans)",
        fontSize: sm ? 12 : 13,
        fontWeight: 600,
        width: full ? "100%" : "auto",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export type StatusTone = "ready" | "ok" | "warn" | "error" | "info" | "draft";

const STATUS_COLOR: Record<StatusTone, string> = {
  ready: "var(--status-approved)",
  ok: "var(--status-approved)",
  warn: "var(--status-review)",
  error: "var(--status-error)",
  info: "var(--status-info)",
  draft: "var(--status-draft)",
};

/** Resolves a status tone to its CSS color token — for archetype
 *  components (list dots, badges) outside this module. */
export function statusColor(tone: StatusTone): string {
  return STATUS_COLOR[tone];
}

/** Coloured dot + words — the brand's no-traffic-lights status
 *  language (never emoji). */
export function StatusPill({
  tone,
  children,
  testId,
}: {
  tone: StatusTone;
  children: ReactNode;
  testId?: string;
}) {
  const c = STATUS_COLOR[tone];
  return (
    <span
      data-status-pill={testId}
      data-tone={tone}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11.5,
        color: c,
        fontFamily: "var(--font-sans)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{ width: 7, height: 7, borderRadius: "50%", background: c }}
      />
      {children}
    </span>
  );
}

/** Mono tabular value — `11 pt`, `06 / 07`, `240 dpi`. */
export function Value({ children }: { children: ReactNode }) {
  return <span className="pg-value">{children}</span>;
}

/** Big-number metric tile (publication health). */
export function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: StatusTone;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--pg-border)",
        borderRadius: "var(--radius-md)",
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        minWidth: 0,
      }}
    >
      <span
        className="pg-value"
        style={{
          fontSize: 16,
          color: tone ? STATUS_COLOR[tone] : "var(--pg-fg)",
        }}
      >
        {value}
      </span>
      <span className="pg-ui-xs" style={{ whiteSpace: "nowrap" }}>
        {label}
      </span>
    </div>
  );
}

/** Panel maturity badge — the gallery's Live / Partial / Concept
 *  status language. In product it marks CONCEPT surfaces (and the
 *  odd Partial) so the roadmap reads honestly; fully-live panels
 *  carry no badge. */
export type PanelStatus = "live" | "partial" | "concept";

const PANEL_STATUS: Record<
  PanelStatus,
  { label: string; color: string; glyph: "check" | "half" | "ring" }
> = {
  live: { label: "Live", color: "var(--status-approved)", glyph: "check" },
  partial: { label: "Partial", color: "var(--status-review)", glyph: "half" },
  concept: { label: "Concept", color: "var(--pg-muted-fg)", glyph: "ring" },
};

export function StatusBadge({ status }: { status: PanelStatus }) {
  const s = PANEL_STATUS[status];
  return (
    <span
      title={s.label}
      data-panel-status={status}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 19,
        padding: "0 7px 0 6px",
        borderRadius: 999,
        background: `color-mix(in srgb, ${s.color} 15%, transparent)`,
        color: s.color,
        fontFamily: "var(--font-sans)",
        fontSize: 10,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {s.glyph === "check" ? (
        <Icon name="ui-check" size={11} />
      ) : s.glyph === "half" ? (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            boxShadow: `inset 0 0 0 1.5px ${s.color}`,
            backgroundImage: `linear-gradient(90deg, ${s.color} 50%, transparent 50%)`,
          }}
        />
      ) : (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            border: `1.5px solid ${s.color}`,
          }}
        />
      )}
      {s.label}
    </span>
  );
}

/** The gallery's "Target ·" end-state footnote — pinned under a
 *  concept/partial panel so the intended final behaviour ships
 *  with the seam. */
export function PanelTarget({ children }: { children: ReactNode }) {
  return (
    <div
      data-panel-target
      style={{
        display: "flex",
        gap: 7,
        padding: "9px 12px",
        borderTop: "1px solid var(--pg-border)",
        background: "color-mix(in srgb, var(--pg-primary) 5%, transparent)",
        flexShrink: 0,
      }}
    >
      <Icon
        name="ui-target"
        size={12}
        style={{ color: "var(--pg-primary)", flexShrink: 0, marginTop: 1 }}
      />
      <span
        style={{
          fontSize: 10.5,
          lineHeight: 1.4,
          color: "var(--pg-muted-fg)",
          fontFamily: "var(--font-sans)",
        }}
      >
        <b style={{ color: "var(--pg-primary)", fontWeight: 600 }}>Target · </b>
        {children}
      </span>
    </div>
  );
}

/** Empty-state body for stubbed product surfaces — a stub is
 *  visibly a stub, never fake-interactive. */
export function ComingSoon({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      data-coming-soon
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "36px 20px",
        textAlign: "center",
        color: "var(--pg-muted-fg)",
      }}
    >
      <Icon name={icon} size={26} style={{ opacity: 0.6 }} />
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "var(--font-sans)",
          color: "var(--pg-fg)",
        }}
      >
        {title}
      </span>
      <span className="pg-ui-xs" style={{ maxWidth: 280, lineHeight: 1.45 }}>
        {children}
      </span>
    </div>
  );
}
