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
import { applicabilityOf, applicabilityStyle } from "./applicability";

import { useRegistries } from "../state/registries-context";
import { useEditContextStack } from "../state/edit-context-stack";
import { useTool } from "../state/tool-context";
import { Icon, hasIcon } from "../icons";
import { ToolOptionsPopover } from "./ToolOptionsPopover";
import {
  BUILT_IN_TOOL_CLUSTERS,
  type ToolClusterId,
  type ToolContribution,
  type ToolGroupId,
  type ToolSectionId,
} from "../registries/tool";
import type { EditContextContribution } from "../registries/edit-context";

// Concept 1 (T4) — the left tool rail. Shell CHROME, rendered as a
// sibling of the dockview container, NOT a dock panel: fixed, not
// floatable/serializable. Derives its slots purely from
// `ToolRegistry.groups()` (one slot per flyout group), laid out two
// to a row and grouped into named CLUSTERS (`ToolClusterId`) with a
// divider between them. Reads/writes the effective tool via the
// ToolContext stack. Zero hardcoded tools.
//
// Why two columns and clusters: with the plugins loaded the rail holds
// ~40 slots, and one column of them is twice the height of a laptop
// viewport — half the toolbox scrolled out of sight, raster and vector
// tools interleaved by section. Two columns fit it; clusters say what
// each run of tools is for.
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

interface ClusterModel {
  cluster: ToolClusterId;
  label: string;
  slots: SlotModel[];
}

/** Where a slot goes when none of its members declares a `cluster`. */
const SECTION_CLUSTER: Record<ToolSectionId, ToolClusterId> = {
  selection: "select",
  drawType: "draw",
  transform: "transform",
  modNav: "view",
};

const CONTEXT_CLUSTER_PREFIX = "context:";

/** "rasterImage" → "Raster image"; "media.paged.x.fooBar" → "Foo bar". */
function humanize(id: string): string {
  const last = id.split(/[.:/]/).filter(Boolean).pop() ?? id;
  const words = last
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Bucket the ordered slots into clusters. A slot's cluster is the first
 * one a member declares; failing that, the edit context whose `toolIds`
 * claim one of its members (a bundle's context-only tools — the raster
 * brushes — stay together instead of scattering across sections); and
 * failing that, its section's. Built-in clusters keep their fixed order
 * with `view` last; any other cluster sits before `view`, in first-seen
 * order. Slot order inside a cluster is the section order.
 */
function deriveClusters(
  sections: SectionModel[],
  contexts: EditContextContribution[],
): ClusterModel[] {
  const contextOf = new Map<string, string>();
  for (const ctx of contexts)
    for (const id of ctx.toolIds ?? [])
      if (!contextOf.has(id)) contextOf.set(id, ctx.type);

  const buckets = new Map<ToolClusterId, SlotModel[]>();
  // Declared slots first, then inferred ones: a bundle that registers
  // before the built-ins must not push Selection down its own cluster.
  const ordered = sections
    .flatMap((sec) => sec.slots.map((slot) => ({ sec, slot })))
    .map((e, i) => ({
      ...e,
      rank: (e.slot.members.some((m) => m.cluster) ? 0 : 1e6) + i,
    }))
    .sort((a, b) => a.rank - b.rank);
  for (const { sec, slot } of ordered) {
    const declared = slot.members.find((m) => m.cluster)?.cluster;
    const ctx = slot.members
      .map((m) => contextOf.get(m.id))
      .find((t): t is string => t !== undefined);
    const cluster =
      declared ??
      (ctx !== undefined
        ? CONTEXT_CLUSTER_PREFIX + ctx
        : SECTION_CLUSTER[sec.section]);
    const arr = buckets.get(cluster);
    if (arr) arr.push(slot);
    else buckets.set(cluster, [slot]);
  }

  const known = new Map(BUILT_IN_TOOL_CLUSTERS.map((c) => [c.id, c.label]));
  const head = BUILT_IN_TOOL_CLUSTERS.filter((c) => c.id !== "view").map(
    (c) => c.id,
  );
  const extra = [...buckets.keys()].filter((id) => !known.has(id));
  const order = [...head, ...extra, "view"];
  return order
    .filter((id) => buckets.has(id))
    .map((id) => ({
      cluster: id,
      label:
        known.get(id) ??
        humanize(
          id.startsWith(CONTEXT_CLUSTER_PREFIX)
            ? id.slice(CONTEXT_CLUSTER_PREFIX.length)
            : id,
        ),
      slots: buckets.get(id)!,
    }));
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

export function ToolRail({
  foot,
  hostToolIds,
}: {
  foot?: ReactNode;
  /** The tools the HOST registered (the built-ins). Every other tool came
   *  from a plugin bundle; one that a bundle's edit context claims in its
   *  `toolIds` is a frame tool and shows only inside that frame. Absent ⇒
   *  no tool is treated as a plugin's (nothing is hidden). */
  hostToolIds?: ReadonlySet<string>;
}) {
  const { tools, editContexts: contextRegistry } = useRegistries();
  const { effectiveTool, setBaseTool } = useTool();

  // Re-derive when the tool or edit-context registry changes (bundles
  // add/remove tools; a context's `toolIds` decide undeclared clusters).
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((n) => n + 1);
    const subs = [tools.onChange(bump), contextRegistry.onChange(bump)];
    return () => subs.forEach((s) => s.dispose());
  }, [tools, contextRegistry]);

  const sections = useMemo(
    () => deriveSections(tools.groups()),
    // `version` bumps on every registry change so the model re-derives.
    [tools, version],
  );
  const clusters = useMemo(
    () => deriveClusters(sections, contextRegistry.list()),
    [sections, contextRegistry, version],
  );
  const clusterOf = useMemo(() => {
    const m = new Map<ToolGroupId, string>();
    for (const c of clusters) for (const s of c.slots) m.set(s.group, c.label);
    return m;
  }, [clusters]);

  const tooltip = useRailTooltip();

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

  // Plugin FRAME tools — contributed by a bundle (not the host) and
  // claimed by one of its edit contexts' `toolIds`, i.e. tools that work
  // only inside that plugin's frame (the raster brushes inside an
  // image). Outside every context they leave the rail; inside their
  // context the restriction below shows them. The tool in hand is never
  // hidden, whichever way it was picked (shortcut, command palette).
  const frameTools = useMemo(() => {
    const ids = new Set<string>();
    if (!hostToolIds) return ids;
    for (const ctx of contextRegistry.list())
      for (const id of ctx.toolIds ?? [])
        if (!hostToolIds.has(id)) ids.add(id);
    return ids;
    // `version` bumps when a bundle registers or drops a context.
  }, [hostToolIds, contextRegistry, version]);

  const slotVisible = (slot: SlotModel): boolean => {
    if (slot.members.some((m) => m.id === effectiveTool)) return true;
    const face = faceToolOf(slot);
    if (restrictedTools)
      return applicabilityStyle(
        applicabilityOf({
          exists: true,
          appliesHere: restrictedTools.has(face.id),
          id: face.id,
        }),
        "palette",
      ).visible;
    // A slot is a frame slot when one of its members is claimed and none
    // is the host's: a flyout of plugin tools follows its group, so a
    // member the context's list leaves out (polygonal lasso beside the
    // lasso) does not keep the slot on the rail by itself.
    const frameSlot =
      slot.members.some((m) => frameTools.has(m.id)) &&
      !slot.members.some((m) => hostToolIds?.has(m.id));
    return !frameSlot;
  };

  // A cluster whose every slot is hidden drops out whole, so it leaves
  // no orphaned divider behind.
  const visibleClusters = clusters
    .map((c) => ({ ...c, slots: c.slots.filter(slotVisible) }))
    .filter((c) => c.slots.length > 0);

  return (
    <nav style={railStyle} aria-label="Tools" data-tool-rail="ready">
      {/* The tools scroll on a short window; the foot (fill/stroke,
       *  proof, screen mode) stays pinned below them, never scrolled
       *  out of reach. */}
      <div style={railToolsStyle} onScroll={tooltip.hide}>
      {visibleClusters.map((c, i) => (
        <div
          key={c.cluster}
          role="group"
          aria-label={c.label}
          data-tool-cluster={c.cluster}
        >
          {i > 0 && <div style={dividerStyle} aria-hidden />}
          <div style={clusterStyle}>
            {c.slots.map((slot) => (
              <ToolSlot
                key={slot.group}
                slot={slot}
                face={faceToolOf(slot)}
                activeGroup={groupOf.get(effectiveTool)}
                effectiveTool={effectiveTool}
                restricted={restrictedTools}
                onPick={pick}
                onTearOff={tearOff}
                onHint={(tool, anchor) =>
                  tooltip.show({
                    tool,
                    cluster: clusterOf.get(slot.group),
                    more: slot.members.filter(
                      (m) => m.id !== tool.id && !isPlanned(m),
                    ).length,
                    anchor,
                  })
                }
                onUnhint={tooltip.hide}
              />
            ))}
          </div>
        </div>
      ))}
      </div>
      {tooltip.node}
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
  onHint,
  onUnhint,
}: {
  slot: SlotModel;
  face: ToolContribution;
  activeGroup: ToolGroupId | undefined;
  effectiveTool: string;
  /** Active edit context's declared tool set — tools outside it dim. */
  restricted?: Set<string> | null;
  onPick: (tool: ToolContribution) => void;
  onTearOff?: (group: ToolGroupId, pos: { x: number; y: number }) => void;
  /** Hover/focus — ask the rail to show this tool's tooltip. */
  onHint?: (tool: ToolContribution, anchor: RailAnchor) => void;
  onUnhint?: () => void;
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
    const rect = popoverAnchor(containerRef.current);
    if (rect) setFlyoutPos({ left: rect.left, top: rect.top });
    onUnhint?.();
    setFlyoutOpen(true);
  }, [onUnhint]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      onUnhint?.();
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

  // Palette semantics: an inapplicable slot is not rendered at all. See
  // the `data-applies` note below for why hiding rather than dimming.
  const applies = applicabilityOf({
    exists: true,
    appliesHere: !restricted || restricted.has(face.id),
    id: face.id,
  });
  if (!applicabilityStyle(applies, "palette").visible) return null;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        // The rail tooltip (useRailTooltip) replaces the native `title`:
        // that one waits ~1 s and can say no more than the name.
        aria-label={tooltipFor(face)}
        aria-pressed={isActive}
        aria-disabled={isPlanned(face) ? true : undefined}
        data-tool-slot={slot.group}
        data-tool={face.id}
        data-tool-status={isPlanned(face) ? "planned" : undefined}
        data-active={isActive ? "true" : "false"}
        data-context-dimmed={
          restricted && !restricted.has(face.id) ? "true" : undefined
        }
        // Phase F — the rail is a PALETTE: a surface the eye scans, so
        // an inapplicable tool costs attention rather than teaching
        // anything. It holds 60 tools (28 built-in + 19 draw + 13
        // image), and inside `sheet` — whose context declares
        // `toolIds: []` — every one of them would dim. Inside draw's own
        // `vectorGraphic`, which declares 3 of draw's 19, 57 would.
        //
        // Dimming is an escape hatch when a few things do not apply and a
        // wall of grey when almost nothing does; at that ratio it makes
        // the context read as a degraded version of the app instead of a
        // place with its own tools. So on a palette `elsewhere` HIDES.
        // Selection stays regardless (ALWAYS_IN_PALETTE) so the way out
        // is never more than one obvious click.
        data-applies={applicabilityOf({
          exists: true,
          appliesHere: !restricted || restricted.has(face.id),
          id: face.id,
        })}
        onPointerDown={onPointerDown}
        onPointerUp={clearTimer}
        onPointerEnter={(e) => {
          if (e.pointerType === "touch" || flyoutOpen) return;
          const at = popoverAnchor(containerRef.current);
          if (at) onHint?.(face, at);
        }}
        onPointerLeave={() => {
          clearTimer();
          onUnhint?.();
        }}
        onFocus={(e) => {
          const at = popoverAnchor(containerRef.current);
          if (at && e.currentTarget.matches(":focus-visible"))
            onHint?.(face, at);
        }}
        onBlur={() => onUnhint?.()}
        onClick={onClick}
        onDoubleClick={() => {
          // T8 — double-click opens the tool's options; no-op if none.
          if (!face.options) return;
          const rect = popoverAnchor(containerRef.current);
          if (rect) setOptionsPos({ left: rect.left, top: rect.top });
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
                id: member.id,
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

/** A popover's top-left: just past the rail's right edge (NOT the
 *  slot's — in two columns the slot's right edge of the left column is
 *  the right column), level with the slot. */
interface RailAnchor {
  left: number;
  top: number;
}

function popoverAnchor(el: HTMLElement | null): RailAnchor | null {
  if (!el) return null;
  const slot = el.getBoundingClientRect();
  const rail = el.closest("[data-tool-rail]")?.getBoundingClientRect();
  return { left: (rail?.right ?? slot.right) + 6, top: slot.top };
}

const TOOLTIP_DELAY_MS = 350;
/** After a tooltip closes, the next one within this window opens at
 *  once — scanning down the rail reads tool after tool, not a wait each. */
const TOOLTIP_WARM_MS = 500;

interface RailHint {
  tool: ToolContribution;
  /** Label of the cluster the slot sits in. */
  cluster?: string;
  /** Working tools behind the slot's flyout, besides this one. */
  more: number;
  anchor: RailAnchor;
}

/** One tooltip for the whole rail: delayed on first hover, immediate
 *  while the pointer moves from slot to slot. */
function useRailTooltip() {
  const [hint, setHint] = useState<RailHint | null>(null);
  const timer = useRef<number | null>(null);
  const visible = useRef(false);
  const warmUntil = useRef(0);

  const clear = () => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const show = useCallback((h: RailHint) => {
    clear();
    if (visible.current || performance.now() < warmUntil.current) {
      visible.current = true;
      setHint(h);
      return;
    }
    timer.current = window.setTimeout(() => {
      visible.current = true;
      setHint(h);
    }, TOOLTIP_DELAY_MS);
  }, []);

  const hide = useCallback(() => {
    clear();
    if (visible.current) warmUntil.current = performance.now() + TOOLTIP_WARM_MS;
    visible.current = false;
    setHint(null);
  }, []);

  useEffect(() => clear, []);

  const node = hint ? createPortal(<RailTooltip hint={hint} />, document.body) : null;
  return { show, hide, node };
}

function RailTooltip({ hint }: { hint: RailHint }) {
  const { tool, cluster, more, anchor } = hint;
  const planned = isPlanned(tool);
  return (
    <div
      role="tooltip"
      data-tool-tooltip={tool.id}
      style={{
        ...tooltipStyle,
        left: anchor.left,
        top: anchor.top + SLOT_SIZE / 2,
      }}
    >
      {cluster && <div style={tooltipClusterStyle}>{cluster}</div>}
      <div style={tooltipHeadStyle}>
        <span style={tooltipTitleStyle}>{tool.title}</span>
        {!planned && tool.shortcut && (
          <kbd style={tooltipKeyStyle}>{formatShortcut(tool.shortcut)}</kbd>
        )}
      </div>
      {planned ? (
        <div style={tooltipBodyStyle}>Coming soon</div>
      ) : (
        tool.description && <div style={tooltipBodyStyle}>{tool.description}</div>
      )}
      {more > 0 && (
        <div style={tooltipMoreStyle}>
          Hold or right-click for {more} more {more === 1 ? "tool" : "tools"}
        </div>
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

const SLOT_SIZE = 28;
const SLOT_GAP = 2;
const RAIL_PAD_X = 5;
const RAIL_WIDTH = 2 * SLOT_SIZE + SLOT_GAP + 2 * RAIL_PAD_X;

const railStyle: CSSProperties = {
  width: RAIL_WIDTH,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: `4px ${RAIL_PAD_X}px 6px`,
  boxSizing: "border-box",
  borderRight: "1px solid var(--chrome-border)",
  background: "var(--chrome-rail-bg)",
  overflow: "hidden",
};

const railToolsStyle: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  scrollbarWidth: "none",
};

const clusterStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: `repeat(2, ${SLOT_SIZE}px)`,
  gap: SLOT_GAP,
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
  width: 2 * SLOT_SIZE + SLOT_GAP - 12,
  height: 1,
  margin: "4px auto",
  background: "var(--chrome-divider)",
};

const slotStyle: CSSProperties = {
  position: "relative",
  width: SLOT_SIZE,
  height: SLOT_SIZE,
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

const tooltipStyle: CSSProperties = {
  position: "fixed",
  zIndex: 70,
  transform: "translateY(-50%)",
  maxWidth: 240,
  padding: "7px 9px",
  borderRadius: 6,
  border: "1px solid var(--chrome-divider)",
  background: "var(--elevated)",
  boxShadow: "var(--shadow-pop)",
  color: "var(--chrome-menu-text)",
  pointerEvents: "none",
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

const tooltipClusterStyle: CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--chrome-label)",
};

const tooltipHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  justifyContent: "space-between",
};

const tooltipTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
};

const tooltipKeyStyle: CSSProperties = {
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  fontSize: 11,
  padding: "0 4px",
  borderRadius: 3,
  border: "1px solid var(--chrome-divider)",
  color: "var(--chrome-label)",
};

const tooltipBodyStyle: CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.4,
  opacity: 0.85,
};

const tooltipMoreStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--chrome-label)",
};
