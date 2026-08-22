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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { applicabilityOf } from "./applicability";

import { useRegistries } from "../state/registries-context";
import { useEditContextStack } from "../state/edit-context-stack";
import { useTool } from "../state/tool-context";
import { Icon, hasIcon } from "../icons";
import { ToolOptionsPopover } from "./ToolOptionsPopover";
import type {
  ToolContribution,
  ToolGroupId,
  ToolSectionId,
} from "../registries/tool";

// Concept 1 (T4) — the left tool rail. Shell CHROME, rendered as a
// sibling of the dockview container, NOT a dock panel: fixed, not
// floatable/serializable. Derives its slots purely from
// `ToolRegistry.groups()` (one slot per flyout group) and the A–D
// section dividers from each group's `section`. Reads/writes the
// effective tool via the ToolContext stack. Zero hardcoded tools.
//
// Honest stubs — a contribution with `status: "planned"` renders as a
// dimmed, non-activating entry (`data-tool-status="planned"`, tooltip
// "… — coming soon") instead of a slot that accepts a click and then
// does nothing. The silent no-op is worse than an empty rail: it reads
// as a bug in the user's own input. A planned tool also never takes
// the slot FACE while a working sibling exists.

const SECTION_ORDER: ToolSectionId[] = [
  "selection",
  "drawType",
  "transform",
  "modNav",
];

const LONG_PRESS_MS = 240;
const LAST_USED_STORAGE_KEY = "paged.toolRail.lastUsed";

/** An honest stub (`status: "planned"`) — rendered, dimmed, inert. */
function isPlanned(tool: ToolContribution): boolean {
  return tool.status === "planned";
}

/** Tooltip text. A planned tool says so and does NOT advertise its
 *  reserved key — the key is held for the real implementation, not
 *  bound (see `ToolStatus`), so showing it would promise a keystroke
 *  that does nothing. */
function tooltipFor(tool: ToolContribution): string {
  if (isPlanned(tool)) return `${tool.title} — coming soon`;
  return tool.shortcut
    ? `${tool.title} (${formatShortcut(tool.shortcut)})`
    : tool.title;
}

interface SlotModel {
  group: ToolGroupId;
  members: ToolContribution[];
  /** The group's default member (filled-square tool in the image). */
  defaultTool: ToolContribution;
}

interface SectionModel {
  section: ToolSectionId;
  slots: SlotModel[];
}

/** Build the ordered section → slot model from the registry. */
function deriveSections(
  groups: Map<ToolGroupId, ToolContribution[]>,
): SectionModel[] {
  // B-14 — slots order by the minimum `slotOrder` across a group's
  // members; groups without a hint keep first-seen registration
  // order (seq makes the sort stable AND places unhinted slots after
  // hinted ones only when their seq exceeds the hint values used).
  const bySection = new Map<
    ToolSectionId,
    Array<{ slot: SlotModel; key: number }>
  >();
  let seq = 0;
  for (const [group, members] of groups) {
    if (members.length === 0) continue;
    const section = members[0].section;
    // A planned tool never takes the slot FACE while a working sibling
    // exists — otherwise the slot would read as dead even though the
    // group has live members one flyout away. A slot whose members are
    // ALL planned does show a planned face: that is the honest signal.
    const ready = members.filter((m) => !isPlanned(m));
    const defaultTool =
      ready.find((m) => m.isGroupDefault) ??
      ready[0] ??
      members.find((m) => m.isGroupDefault) ??
      members[0];
    const slot: SlotModel = { group, members, defaultTool };
    const hinted = members
      .map((m) => m.slotOrder)
      .filter((o): o is number => o !== undefined);
    const key = hinted.length > 0 ? Math.min(...hinted) : 1000 + seq;
    seq += 1;
    const arr = bySection.get(section);
    if (arr) arr.push({ slot, key });
    else bySection.set(section, [{ slot, key }]);
  }
  return SECTION_ORDER.filter((s) => bySection.has(s)).map((section) => ({
    section,
    slots: bySection
      .get(section)!
      .sort((a, b) => a.key - b.key)
      .map((e) => e.slot),
  }));
}

export function ToolRail({ foot }: { foot?: ReactNode }) {
  const { tools } = useRegistries();
  const { effectiveTool, setBaseTool } = useTool();

  // Re-derive when the tool registry changes (bundles add/remove tools).
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const sub = tools.onChange(() => setVersion((n) => n + 1));
    return () => sub.dispose();
  }, [tools]);

  const sections = useMemo(
    () => deriveSections(tools.groups()),
    // `version` bumps on every registry change so the model re-derives.
    [tools, version],
  );

  // Per-group "last used" face tool. Seeded from the group default;
  // updated whenever a member of the group becomes effective (click,
  // flyout pick, or shortcut). Persisted in localStorage so the rail
  // faces survive a reload, alongside the dock layout.
  const [lastUsed, setLastUsed] = useState<Record<ToolGroupId, string>>(() => {
    try {
      return JSON.parse(
        window.localStorage.getItem(LAST_USED_STORAGE_KEY) ?? "{}",
      ) as Record<ToolGroupId, string>;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(
        LAST_USED_STORAGE_KEY,
        JSON.stringify(lastUsed),
      );
    } catch {
      // Storage unavailable (private mode) — faces just reset on reload.
    }
  }, [lastUsed]);

  // T8 v2 — torn-off flyouts: group → floating-palette position. The
  // palette is just another projection of the group, so the data model
  // is untouched; closing it returns the group to the rail slot.
  const [tornOff, setTornOff] = useState<
    Record<ToolGroupId, { x: number; y: number }>
  >({});
  const tearOff = useCallback(
    (group: ToolGroupId, pos: { x: number; y: number }) => {
      setTornOff((prev) => ({ ...prev, [group]: pos }));
    },
    [],
  );
  const moveTearOff = useCallback(
    (group: ToolGroupId, pos: { x: number; y: number }) => {
      setTornOff((prev) => ({ ...prev, [group]: pos }));
    },
    [],
  );
  const closeTearOff = useCallback((group: ToolGroupId) => {
    setTornOff((prev) => {
      const next = { ...prev };
      delete next[group];
      return next;
    });
  }, []);

  // Index tool id → group so an effective-tool change can promote the
  // right slot face.
  const groupOf = useMemo(() => {
    const m = new Map<string, ToolGroupId>();
    for (const sec of sections)
      for (const slot of sec.slots)
        for (const member of slot.members) m.set(member.id, slot.group);
    return m;
  }, [sections]);

  useEffect(() => {
    const group = groupOf.get(effectiveTool);
    if (group && lastUsed[group] !== effectiveTool) {
      setLastUsed((prev) => ({ ...prev, [group]: effectiveTool }));
    }
  }, [effectiveTool, groupOf, lastUsed]);

  const faceToolOf = useCallback(
    (slot: SlotModel): ToolContribution => {
      const id = lastUsed[slot.group];
      // `pick` refuses planned tools, so a planned id here can only be
      // stale localStorage (a tool that was live when it was parked).
      return (
        slot.members.find((m) => m.id === id && !isPlanned(m)) ??
        slot.defaultTool
      );
    },
    [lastUsed],
  );

  // K-1 residual closed — an active edit context that declares `toolIds`
  // restricts the rail: every other tool renders dimmed. Picking a dimmed
  // tool is NOT trapped: it COMMITS the context first (the same gentle
  // path as a press outside the frame), then activates — so the rail
  // doubles as an exit, never a dead end. No restriction (empty/absent
  // toolIds, e.g. the sheet grid session) leaves the rail untouched.
  const editContexts = useEditContextStack();
  const restrictedTools = useMemo(() => {
    // `null` (nothing declared) leaves the rail untouched; a DECLARED
    // list restricts to it, and a declared EMPTY list restricts to
    // nothing — every tool greys, and picking one is still the exit.
    const ids = editContexts.active?.toolIds;
    return ids ? new Set(ids) : null;
  }, [editContexts.active]);

  const pick = useCallback(
    (tool: ToolContribution) => {
      // Honest stub — the click is acknowledged by the disabled
      // affordance, never by a tool switch that then does nothing.
      if (isPlanned(tool)) return;
      if (restrictedTools && !restrictedTools.has(tool.id)) {
        editContexts.commit();
      }
      setLastUsed((prev) => ({ ...prev, [tool.group]: tool.id }));
      setBaseTool(tool.id);
    },
    [setBaseTool, restrictedTools, editContexts],
  );

  return (
    <nav style={railStyle} aria-label="Tools" data-tool-rail="ready">
      {sections.map((sec, i) => (
        <div key={sec.section}>
          {i > 0 && <div style={dividerStyle} aria-hidden />}
          <div style={sectionStyle}>
            {sec.slots.map((slot) => (
              <ToolSlot
                key={slot.group}
                slot={slot}
                face={faceToolOf(slot)}
                activeGroup={groupOf.get(effectiveTool)}
                effectiveTool={effectiveTool}
                restricted={restrictedTools}
                onPick={pick}
                onTearOff={tearOff}
              />
            ))}
          </div>
        </div>
      ))}
      {foot != null && (
        <div style={footStyle}>
          <div style={dividerStyle} aria-hidden />
          {foot}
        </div>
      )}

      {/* T8 v2 — floating palettes for torn-off groups. */}
      {Object.entries(tornOff).map(([group, pos]) => {
        const slot = sections
          .flatMap((s) => s.slots)
          .find((s) => s.group === group);
        if (!slot) return null;
        return createPortal(
          <FloatingToolPalette
            key={group}
            slot={slot}
            pos={pos}
            effectiveTool={effectiveTool}
            onPick={pick}
            onMove={(p) => moveTearOff(group, p)}
            onClose={() => closeTearOff(group)}
          />,
          document.body,
        );
      })}
    </nav>
  );
}

/**
 * T8 v2 — a torn-off flyout as a floating mini-toolbar: the same group
 * projection the rail slot renders, draggable by its grip, closable.
 */
function FloatingToolPalette({
  slot,
  pos,
  effectiveTool,
  onPick,
  onMove,
  onClose,
}: {
  slot: SlotModel;
  pos: { x: number; y: number };
  effectiveTool: string;
  onPick: (tool: ToolContribution) => void;
  onMove: (pos: { x: number; y: number }) => void;
  onClose: () => void;
}) {
  const onGripDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, origX: pos.x, origY: pos.y };
    const onWinMove = (ev: PointerEvent) => {
      onMove({
        x: start.origX + ev.clientX - start.x,
        y: start.origY + ev.clientY - start.y,
      });
    };
    const onWinUp = () => {
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
    };
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
  };

  return (
    <div
      style={{ ...paletteStyle, left: pos.x, top: pos.y }}
      role="toolbar"
      aria-label={`${slot.defaultTool.title} tools`}
      data-tool-palette={slot.group}
    >
      <div style={paletteGripStyle} onPointerDown={onGripDown}>
        <span style={{ flex: 1, cursor: "grab", userSelect: "none" }} aria-hidden>
          ⠿
        </span>
        <button
          type="button"
          onClick={onClose}
          style={paletteCloseStyle}
          title="Close palette"
          data-tool-palette-close
        >
          ×
        </button>
      </div>
      <div style={{ display: "flex", gap: 2, padding: 4 }}>
        {slot.members.map((m) => (
          <button
            key={m.id}
            type="button"
            title={tooltipFor(m)}
            data-tool={m.id}
            data-tool-status={isPlanned(m) ? "planned" : undefined}
            aria-disabled={isPlanned(m) ? true : undefined}
            onClick={() => onPick(m)}
            style={{
              ...(m.id === effectiveTool
                ? { ...slotStyle, ...slotActiveStyle }
                : slotStyle),
              ...(isPlanned(m) ? plannedStyle : null),
            }}
          >
            <SlotGlyph tool={m} />
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolSlot({
  slot,
  face,
  activeGroup,
  effectiveTool,
  restricted,
  onPick,
  onTearOff,
}: {
  slot: SlotModel;
  face: ToolContribution;
  activeGroup: ToolGroupId | undefined;
  effectiveTool: string;
  /** Active edit context's declared tool set — tools outside it dim. */
  restricted?: Set<string> | null;
  onPick: (tool: ToolContribution) => void;
  onTearOff?: (group: ToolGroupId, pos: { x: number; y: number }) => void;
}) {
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  // Flyout is portalled to <body> so it escapes the rail's overflow
  // clip (overflow-y:auto forces overflow-x to compute as auto too).
  // Position is captured from the slot rect at open time.
  const [flyoutPos, setFlyoutPos] = useState<{ left: number; top: number } | null>(
    null,
  );
  // Double-click tool-options popover (T8), same portal treatment.
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [optionsPos, setOptionsPos] = useState<{ left: number; top: number } | null>(
    null,
  );
  const longPressRef = useRef<number | null>(null);
  const openedByHold = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const hasFlyout = slot.members.length > 1;
  const isActive = activeGroup === slot.group;

  const clearTimer = () => {
    if (longPressRef.current != null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const openFlyout = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setFlyoutPos({ left: rect.right + 4, top: rect.top });
    setFlyoutOpen(true);
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0 || !hasFlyout) return;
      openedByHold.current = false;
      longPressRef.current = window.setTimeout(() => {
        openedByHold.current = true;
        openFlyout();
      }, LONG_PRESS_MS);
    },
    [hasFlyout, openFlyout],
  );

  const onClick = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>) => {
      clearTimer();
      // A hold opened the flyout — don't also activate the face tool.
      if (openedByHold.current) {
        openedByHold.current = false;
        return;
      }
      // Alt+click cycles the slot through its group's hidden tools —
      // the non-conflicting form of "cycle within a group" (the
      // Shift+key combos are real tool shortcuts of their own).
      // Planned members are skipped: cycling onto one would park the
      // slot on an inert face.
      if (e.altKey && hasFlyout) {
        const start = slot.members.findIndex((m) => m.id === face.id);
        for (let step = 1; step <= slot.members.length; step++) {
          const next = slot.members[(start + step) % slot.members.length];
          if (isPlanned(next)) continue;
          onPick(next);
          return;
        }
        return;
      }
      onPick(face);
    },
    [face, onPick, hasFlyout, slot.members],
  );

  // Close the flyout on a pointer-down OUTSIDE this slot. The
  // containment check keeps the opening gesture's own trailing pointer
  // event (and clicks on the flyout items) from closing it prematurely.
  useEffect(() => {
    if (!flyoutOpen) return;
    const close = (e: PointerEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (flyoutRef.current?.contains(target)) return;
      setFlyoutOpen(false);
    };
    window.addEventListener("pointerdown", close, { capture: true });
    return () =>
      window.removeEventListener("pointerdown", close, { capture: true });
  }, [flyoutOpen]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        title={tooltipFor(face)}
        aria-pressed={isActive}
        aria-disabled={isPlanned(face) ? true : undefined}
        data-tool-slot={slot.group}
        data-tool={face.id}
        data-tool-status={isPlanned(face) ? "planned" : undefined}
        data-active={isActive ? "true" : "false"}
        data-context-dimmed={
          restricted && !restricted.has(face.id) ? "true" : undefined
        }
        // Phase F — declare the STATE, not just the styling. The rail
        // already implemented "applies elsewhere" correctly (dimmed and
        // still clickable, so picking one leaves the context); this names
        // it in the shared vocabulary so the other surfaces can match and
        // the guard can check they do.
        data-applies={applicabilityOf({
          exists: true,
          appliesHere: !restricted || restricted.has(face.id),
        })}
        onPointerDown={onPointerDown}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
        onClick={onClick}
        onDoubleClick={() => {
          // T8 — double-click opens the tool's options; no-op if none.
          if (!face.options) return;
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) setOptionsPos({ left: rect.right + 4, top: rect.top });
          setFlyoutOpen(false);
          setOptionsOpen(true);
        }}
        onContextMenu={(e) => {
          if (!hasFlyout) return;
          e.preventDefault();
          openFlyout();
        }}
        style={{
          ...(isActive ? { ...slotStyle, ...slotActiveStyle } : slotStyle),
          // Context restriction — dimmed but CLICKABLE (a pick commits the
          // context and activates; see the rail's pick handler).
          ...(restricted && !restricted.has(face.id)
            ? { opacity: 0.35 }
            : null),
          ...(isPlanned(face) ? plannedStyle : null),
        }}
      >
        <SlotGlyph tool={face} />
        {hasFlyout && <span style={flyoutMarkerStyle} aria-hidden />}
      </button>

      {flyoutOpen &&
        hasFlyout &&
        flyoutPos &&
        createPortal(
          <div
            ref={flyoutRef}
            style={{ ...flyoutStyle, left: flyoutPos.left, top: flyoutPos.top }}
            role="menu"
            data-tool-flyout={slot.group}
          >
            {onTearOff && (
              <button
                type="button"
                title="Tear off into a floating palette"
                data-tool-tearoff={slot.group}
                onClick={() => {
                  setFlyoutOpen(false);
                  onTearOff(slot.group, {
                    x: flyoutPos.left,
                    y: flyoutPos.top,
                  });
                }}
                style={tearOffStyle}
              >
                ⠿ Tear off
              </button>
            )}
            {slot.members.map((member) => {
            const memberActive = member.id === effectiveTool;
            const memberDimmed = restricted ? !restricted.has(member.id) : false;
            const memberPlanned = isPlanned(member);
            return (
              <button
                key={member.id}
                type="button"
                role="menuitem"
                title={tooltipFor(member)}
                data-tool={member.id}
                data-tool-status={memberPlanned ? "planned" : undefined}
                aria-disabled={memberPlanned ? true : undefined}
                data-context-dimmed={memberDimmed ? "true" : undefined}
              data-applies={applicabilityOf({
                exists: true,
                appliesHere: !memberDimmed,
              })}
                onClick={() => {
                  if (memberPlanned) return;
                  setFlyoutOpen(false);
                  onPick(member);
                }}
                style={{
                  ...(memberActive
                    ? { ...flyoutItemStyle, ...slotActiveStyle }
                    : flyoutItemStyle),
                  ...(memberDimmed ? { opacity: 0.35 } : null),
                  ...(memberPlanned ? plannedStyle : null),
                }}
              >
                <SlotGlyph tool={member} />
                <span style={flyoutLabelStyle}>{member.title}</span>
                {memberPlanned ? (
                  <span style={flyoutShortcutStyle}>Coming soon</span>
                ) : (
                  member.shortcut && (
                    <span style={flyoutShortcutStyle}>
                      {formatShortcut(member.shortcut)}
                    </span>
                  )
                )}
              </button>
            );
            })}
          </div>,
          document.body,
        )}

      {optionsOpen &&
        face.options &&
        optionsPos &&
        createPortal(
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 50 }}
              onClick={() => setOptionsOpen(false)}
              aria-hidden
            />
            <ToolOptionsPopover
              spec={face.options}
              style={{
                position: "fixed",
                left: optionsPos.left,
                top: optionsPos.top,
                zIndex: 51,
              }}
            />
          </>,
          document.body,
        )}
    </div>
  );
}

/** Icon if the glyph exists, else the shortcut letter as a fallback. */
function SlotGlyph({ tool }: { tool: ToolContribution }) {
  if (hasIcon(tool.icon)) return <Icon name={tool.icon} size={18} />;
  const letter = tool.shortcut
    ? tool.shortcut.replace(/^shift\+/, "").slice(0, 1).toUpperCase()
    : tool.title.slice(0, 1).toUpperCase();
  return <span style={{ fontSize: 12, fontWeight: 600 }}>{letter}</span>;
}

/** "shift+p" → "⇧P", "=" → "=". Display only. */
function formatShortcut(s: string): string {
  return s
    .split("+")
    .map((part) =>
      part === "shift"
        ? "⇧"
        : part.length === 1
          ? part.toUpperCase()
          : part,
    )
    .join("");
}

const RAIL_WIDTH = 38;

const railStyle: CSSProperties = {
  width: RAIL_WIDTH,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  padding: "8px 0",
  borderRight: "1px solid var(--chrome-border)",
  background: "var(--chrome-rail-bg)",
  overflowY: "auto",
  overflowX: "visible",
};

const sectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
};

const footStyle: CSSProperties = {
  marginTop: "auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
  paddingTop: 4,
};

const dividerStyle: CSSProperties = {
  width: 22,
  height: 1,
  margin: "6px auto",
  background: "var(--chrome-divider)",
};

const slotStyle: CSSProperties = {
  position: "relative",
  width: 30,
  height: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  // Non-shorthand border so the active style can override just the
  // colour without React's shorthand/longhand mixing warning.
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "transparent",
  borderRadius: 5,
  background: "transparent",
  color: "var(--chrome-icon)",
  cursor: "pointer",
  padding: 0,
};

/** Honest-stub presentation: dimmed, no pointer affordance. Mirrors
 *  the `ComingSoon` panel stub's muted treatment at rail scale. */
const plannedStyle: CSSProperties = {
  opacity: 0.35,
  cursor: "default",
};

const slotActiveStyle: CSSProperties = {
  background: "var(--chrome-slot-active)",
  color: "var(--elevated)",
  borderColor: "var(--chrome-slot-active)",
};

const flyoutMarkerStyle: CSSProperties = {
  position: "absolute",
  right: 2,
  bottom: 2,
  width: 0,
  height: 0,
  borderLeft: "4px solid transparent",
  borderBottom: "4px solid currentColor",
};

const flyoutStyle: CSSProperties = {
  position: "fixed",
  zIndex: 50,
  display: "flex",
  flexDirection: "column",
  minWidth: 190,
  padding: 4,
  borderRadius: 6,
  border: "1px solid var(--chrome-divider)",
  background: "var(--elevated)",
  boxShadow: "var(--shadow-pop)",
};

const flyoutItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  height: 26,
  padding: "0 8px",
  border: "none",
  borderRadius: 4,
  background: "transparent",
  color: "var(--chrome-menu-text)",
  cursor: "pointer",
  textAlign: "left",
};

const flyoutLabelStyle: CSSProperties = {
  flex: 1,
  fontSize: 12,
};

const flyoutShortcutStyle: CSSProperties = {
  fontSize: 11,
  opacity: 0.6,
};

const tearOffStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  height: 22,
  padding: "0 8px",
  marginBottom: 2,
  border: "none",
  borderBottom: "1px solid var(--chrome-border)",
  borderRadius: 0,
  background: "transparent",
  color: "var(--chrome-label)",
  cursor: "pointer",
  fontSize: 11,
  textAlign: "left",
};

const paletteStyle: CSSProperties = {
  position: "fixed",
  zIndex: 60,
  borderRadius: 6,
  border: "1px solid var(--chrome-divider)",
  background: "var(--elevated)",
  boxShadow: "var(--shadow-pop)",
};

const paletteGripStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  height: 18,
  padding: "0 6px",
  borderBottom: "1px solid var(--chrome-border)",
  background: "var(--chrome-rail-bg)",
  borderTopLeftRadius: 6,
  borderTopRightRadius: 6,
  color: "var(--chrome-label)",
  fontSize: 11,
  touchAction: "none",
};

const paletteCloseStyle: CSSProperties = {
  width: 14,
  height: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  borderRadius: 3,
  background: "transparent",
  color: "var(--chrome-label)",
  cursor: "pointer",
  padding: 0,
  fontSize: 12,
  lineHeight: 1,
};
