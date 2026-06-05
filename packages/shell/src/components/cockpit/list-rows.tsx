// Panel-gallery pass — the `ListPanel` archetype (gallery-kit.jsx):
// the uniform row list every collection panel composes (Links,
// Fonts, Conditions, Articles, Bookmarks, Spreads, …). Rows carry
// the kit's full vocabulary: status dot, glyph, primary/secondary
// text, bordered badge, trailing action, chevron, tree indent.

import { useState, type ReactNode } from "react";

import { Icon } from "../../icons";
import { statusColor, type StatusTone } from "./kit";

export interface ListRowBadge {
  label: string;
  tone: StatusTone;
}

export interface ListRowSpec {
  /** React key + the row's `data-list-row` hook. */
  key: string;
  /** Leading 7px status dot. */
  dot?: StatusTone;
  /** Leading glyph (after the dot, if both). */
  icon?: string;
  /** Override the glyph colour (defaults to muted). */
  iconColor?: string;
  primary: ReactNode;
  /** Mono secondary line — `embedded · CMYK`, `3 styles · 12 refs`. */
  secondary?: ReactNode;
  /** Bordered status badge — `missing`, `lo-res`. */
  badge?: ListRowBadge;
  /** Trailing custom node (an action button, a toggle, a count). */
  trail?: ReactNode;
  /** Trailing muted chevron (the row drills somewhere). */
  chevron?: boolean;
  /** Tree depth (16px per level). */
  indent?: number;
  selected?: boolean;
  onClick?: () => void;
  /** Filter target when `search` is on; defaults to string
   *  `primary` content. */
  searchText?: string;
}

export function ListRows({
  rows,
  search = false,
  searchPlaceholder = "Filter",
  emptyText,
  testId,
}: {
  rows: ListRowSpec[];
  search?: boolean;
  searchPlaceholder?: string;
  /** Shown when there are no rows (post-filter). */
  emptyText?: string;
  testId?: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible =
    search && q !== ""
      ? rows.filter((r) =>
          (r.searchText ?? (typeof r.primary === "string" ? r.primary : ""))
            .toLowerCase()
            .includes(q),
        )
      : rows;
  return (
    <div style={{ padding: "8px 8px 10px" }} data-list-rows={testId}>
      {search && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 30,
            margin: "4px 6px 8px",
            padding: "0 10px",
            borderRadius: 7,
            background: "var(--pg-muted)",
            color: "var(--pg-muted-fg)",
          }}
        >
          <Icon name="ui-search" size={14} />
          <input
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-list-search
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: 12,
              fontFamily: "var(--font-sans)",
              color: "var(--pg-fg)",
            }}
          />
        </label>
      )}
      {visible.length === 0 && emptyText ? (
        <div
          className="pg-ui-xs"
          style={{ padding: "10px 9px", fontStyle: "italic" }}
        >
          {emptyText}
        </div>
      ) : null}
      {visible.map((r) => {
        const interactive = r.onClick != null;
        const Tag = interactive ? "button" : "div";
        return (
          <Tag
            key={r.key}
            type={interactive ? "button" : undefined}
            data-list-row={r.key}
            data-selected={r.selected ? "true" : undefined}
            onClick={r.onClick}
            onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
              if (!r.selected)
                e.currentTarget.style.background = "var(--hover)";
            }}
            onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
              if (!r.selected) e.currentTarget.style.background = "transparent";
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              width: "100%",
              textAlign: "left",
              padding: "7px 9px",
              paddingLeft: 9 + (r.indent ?? 0) * 16,
              border: "none",
              borderRadius: 7,
              marginBottom: 1,
              cursor: interactive ? "pointer" : "default",
              background: r.selected ? "var(--selected-bg)" : "transparent",
              color: r.selected ? "var(--pg-primary)" : "var(--pg-fg)",
            }}
          >
            {r.dot && (
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: statusColor(r.dot),
                  flexShrink: 0,
                }}
              />
            )}
            {r.icon && (
              <Icon
                name={r.icon}
                size={15}
                style={{
                  color:
                    r.iconColor ??
                    (r.selected ? "var(--pg-primary)" : "var(--pg-muted-fg)"),
                  flexShrink: 0,
                }}
              />
            )}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  fontSize: 12.5,
                  fontFamily: "var(--font-sans)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {r.primary}
              </span>
              {r.secondary != null && (
                <span
                  style={{
                    display: "block",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    color: "var(--pg-muted-fg)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {r.secondary}
                </span>
              )}
            </span>
            {r.badge && (
              <span
                data-row-badge={r.badge.label}
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  fontFamily: "var(--font-sans)",
                  color: statusColor(r.badge.tone),
                  border: "1px solid currentColor",
                  borderRadius: 4,
                  padding: "1px 5px",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {r.badge.label}
              </span>
            )}
            {r.trail}
            {r.chevron && (
              <Icon
                name="ui-chevron-right"
                size={13}
                style={{ color: "var(--pg-muted-fg)", flexShrink: 0 }}
              />
            )}
          </Tag>
        );
      })}
    </div>
  );
}

/** Compact icon-button strip pinned above a list (New / Delete /
 *  Duplicate…). `trail` renders right-aligned (a context label). */
export function PanelToolbar({
  children,
  trail,
}: {
  children: ReactNode;
  trail?: ReactNode;
}) {
  return (
    <div
      data-panel-toolbar
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "10px 14px 2px",
      }}
    >
      {children}
      {trail != null && (
        <span
          className="pg-ui-xs"
          style={{ marginLeft: "auto", whiteSpace: "nowrap" }}
        >
          {trail}
        </span>
      )}
    </div>
  );
}

/** One toolbar icon button. Missing `onClick` renders it disabled —
 *  the honest-seam rule for unbacked actions. */
export function ToolbarBtn({
  icon,
  label,
  onClick,
  disabled,
  testId,
}: {
  icon: string;
  /** Tooltip / aria-label. */
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  const inert = disabled || onClick == null;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={inert}
      data-toolbar-btn={testId ?? icon}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!inert) e.currentTarget.style.background = "var(--hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--pg-bg)";
      }}
      style={{
        width: 34,
        height: 30,
        borderRadius: 6,
        border: "1px solid var(--pg-border)",
        background: "var(--pg-bg)",
        color: "var(--chrome-icon)",
        cursor: inert ? "default" : "pointer",
        opacity: inert ? 0.45 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
