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

// Gallery pixel-parity — the style-manager surface (deep1
// `styleManager`): applied select (kit chrome) + the 28px
// clear-override icon button, optional "Next: …" line, group
// kickers, h28 style rows (check / panel glyph at .35, override
// "+", mono shortcut), and the icon footer — `+` new, `✓`
// redefine, `✕` delete right-aligned — above a full-bleed
// hairline. Footer actions without a handler render disabled
// (honest seam: redefine awaits its engine op). Raw IDML names
// display through `displayName` ("$ID/…" stripped).

import type { ReactNode } from "react";

import { Icon } from "../../icons";
import { displayName } from "../../catalog/leaves";

export interface ApplyStyleItem {
  /** IDML `Self` id — the apply payload + react key. */
  selfId: string;
  name: string;
  /** Local overrides on top of the applied style ("+" marker). */
  override?: boolean;
  /** Keyboard shortcut chip, e.g. "⌥1". */
  shortcut?: string;
}

export interface ApplyStyleGroup {
  /** Kicker label; omit for a single unnamed group. */
  name?: string;
  items: ApplyStyleItem[];
}

export function ApplyList({
  appliedId,
  groups,
  itemIcon,
  next,
  collection,
  onApply,
  onNew,
  onRedefine,
  onDelete,
  readonly = false,
  readonlyNote,
  testId,
}: {
  /** Currently applied style's selfId ("" = [None] / unresolved). */
  appliedId: string;
  groups: ApplyStyleGroup[];
  /** Glyph for unselected rows (the panel's own glyph). */
  itemIcon: string;
  /** Next-style display line ("Next: Body") — paragraph styles. */
  next?: string;
  /** Source collection name — stamped as `data-collection` on the
   *  applied select (the stable spec hook). */
  collection?: string;
  onApply?: (selfId: string) => void;
  onNew?: () => void;
  onRedefine?: () => void;
  onDelete?: () => void;
  /** Readonly variant (cell/table styles until table selection
   *  lands): rows render without apply affordance + a note. */
  readonly?: boolean;
  readonlyNote?: ReactNode;
  testId?: string;
}) {
  const flat = groups.flatMap((g) => g.items);
  return (
    <div data-apply-list={testId}>
      <div className="px-3 pb-2 pt-3">
        <div className="flex items-center gap-[6px]">
          <span className="relative inline-flex min-w-0 flex-1">
            <select
              value={appliedId}
              disabled={readonly || onApply == null}
              data-apply-select
              data-collection={collection}
              onChange={(e) => onApply?.(e.target.value)}
              className="h-[30px] w-full appearance-none overflow-hidden text-ellipsis whitespace-nowrap rounded-[6px] border border-input bg-background pl-2.5 pr-7 text-[12.5px] disabled:opacity-55"
              style={{
                fontFamily: "var(--font-sans)",
                color: "var(--pg-fg)",
              }}
            >
              <option value="">[None]</option>
              {flat.map((i) => (
                <option key={i.selfId} value={i.selfId}>
                  {displayName(i.name)}
                  {i.override ? " +" : ""}
                </option>
              ))}
            </select>
            <Icon
              name="ui-chevron-down"
              size={13}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "var(--pg-muted-fg)" }}
            />
          </span>
          {/* Clear override — awaiting the override surface
              (style-infra roadmap). */}
          <button
            type="button"
            title="Clear override — awaiting engine support"
            disabled
            data-apply-action="clear-override"
            className="h-[28px] w-[28px] shrink-0 rounded-[6px] border border-input bg-background opacity-45"
          >
            <Icon
              name="ui-return"
              size={13}
              className="mx-auto"
              style={{ color: "var(--pg-muted-fg)" }}
            />
          </button>
        </div>
        {next && (
          <div
            className="mt-2 flex items-center gap-[6px] text-[11px]"
            style={{ color: "var(--pg-muted-fg)" }}
          >
            Next: <span style={{ color: "var(--pg-fg)" }}>{next}</span>
          </div>
        )}
      </div>
      <div className="px-2 pb-[6px]">
        {groups.map((g, gi) => (
          <div key={g.name ?? gi}>
            {g.name && (
              <div
                className="px-2 pb-[3px] pt-[6px] text-[10px] font-bold uppercase"
                style={{
                  letterSpacing: "0.08em",
                  color: "var(--pg-muted-fg)",
                }}
              >
                {g.name}
              </div>
            )}
            {g.items.map((it) => {
              const on = it.selfId === appliedId;
              const interactive = !readonly && onApply != null;
              return (
                <button
                  key={it.selfId}
                  type="button"
                  disabled={!interactive}
                  data-apply-item={it.selfId}
                  data-applied={on ? "true" : undefined}
                  data-override={it.override ? "true" : undefined}
                  onClick={() => onApply?.(it.selfId)}
                  onMouseEnter={(e) => {
                    if (!on && interactive)
                      e.currentTarget.style.background = "var(--hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!on) e.currentTarget.style.background = "transparent";
                  }}
                  className="flex h-[28px] w-full items-center gap-2 rounded-[6px] border-0 px-2 text-left"
                  style={{
                    cursor: interactive ? "pointer" : "default",
                    background: on ? "var(--selected-bg)" : "transparent",
                    color: on ? "var(--pg-primary)" : "var(--pg-fg)",
                  }}
                >
                  <Icon
                    name={on ? "ui-check" : itemIcon}
                    size={12}
                    style={{ opacity: on ? 1 : 0.35, flexShrink: 0 }}
                  />
                  <span
                    className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {displayName(it.name)}
                  </span>
                  {it.override && (
                    <span
                      title="Overrides"
                      className="shrink-0 text-[10px] font-bold"
                      style={{ color: "var(--status-review)" }}
                    >
                      +
                    </span>
                  )}
                  {it.shortcut && (
                    <span
                      className="shrink-0 text-[10px]"
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: "var(--pg-muted-fg)",
                      }}
                    >
                      {it.shortcut}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        {readonly && readonlyNote != null && (
          <div
            className="px-2 pt-2 text-[10.5px] italic"
            style={{ color: "var(--pg-muted-fg)" }}
          >
            {readonlyNote}
          </div>
        )}
      </div>
      {!readonly && (
        <div className="flex gap-[5px] border-t border-input px-3 pb-3 pt-[6px]">
          <FooterIconBtn
            icon="ui-plus"
            label="New style"
            action="new"
            onClick={onNew}
          />
          <FooterIconBtn
            icon="ui-check"
            label="Redefine style from selection — awaiting engine support"
            action="redefine"
            onClick={onRedefine}
          />
          <FooterIconBtn
            icon="ui-x"
            label="Delete style"
            action="delete"
            onClick={onDelete}
            className="ml-auto"
          />
        </div>
      )}
    </div>
  );
}

/** 28px icon footer button — disabled (honest seam) when no
 *  handler is wired. */
function FooterIconBtn({
  icon,
  label,
  action,
  onClick,
  className = "",
}: {
  icon: string;
  label: string;
  action: string;
  onClick?: () => void;
  className?: string;
}) {
  const inert = onClick == null;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={inert}
      data-apply-action={action}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!inert) e.currentTarget.style.background = "var(--hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--pg-bg)";
      }}
      className={`flex h-[28px] w-[28px] items-center justify-center rounded-[6px] border border-input ${className}`}
      style={{
        background: "var(--pg-bg)",
        color: "var(--chrome-icon)",
        cursor: inert ? "default" : "pointer",
        opacity: inert ? 0.45 : 1,
      }}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}
