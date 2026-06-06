import type { Disposable, VisibilityPredicate } from "./types";
import type { CursorSpec } from "../tools/cursor";
import type { GestureHandler } from "../tools/gesture-handler";
import type { ToolOptionsSpec } from "../tools/tool-options";

/**
 * Concept 1 (toolbar) — the fifth registry / fifth Contribution-API
 * arm alongside Panel / Command / SemanticGroup / Keybinding. A tool
 * is DATA: an icon, a label, a shortcut, a flyout group, a cursor,
 * optional options, an enablement predicate, and — once the gesture
 * spine lands (Phase 2) — the `gesture` handler factory the spine
 * mounts on the canvas overlay when the tool is active.
 *
 * `gesture` / `cursor` / `options` are OPTIONAL so a tool can be
 * registered as pure rail data before its handler / cursor / options
 * exist. The rail renders whatever is registered; bundles contribute
 * tools through the identical `register` path the built-ins use.
 */
export type ToolId = string;

/**
 * Flyout group — one rail SLOT. Tools that share a group occupy the
 * same slot, with the non-default members hidden behind the flyout
 * triangle (e.g. Pen + Add/Delete/Convert-Anchor; Rectangle + Ellipse
 * + Polygon). Free-form string so bundles can introduce new slots.
 */
export type ToolGroupId = string;

/**
 * The four lettered clusters of the InDesign toolbox (A–D). These are
 * VISUAL section dividers between runs of slots, distinct from the
 * flyout `group`. (The toolbar concept's single `ToolGroupId` enum is
 * refined here into group = slot + section = divider, matching the
 * `toolbar.png` reference: a section contains several flyout slots.)
 */
export type ToolSectionId = "selection" | "drawType" | "transform" | "modNav";

export interface ToolContribution {
  /** Stable id. Format `<namespace>.<tool>`, e.g. `paged.tool.pen`. */
  id: ToolId;
  /** Rail tooltip / label. */
  title: string;
  /** Icon name, resolved by the shared icon component. */
  icon: string;
  /** Single-key shortcut, e.g. `"v"`, `"a"`, `"shift+p"`. Claimed via
   *  the KeybindingRegistry as a class with the text-suppression guard. */
  shortcut?: string;
  /** Flyout group (one rail slot). */
  group: ToolGroupId;
  /** Which A–D section divider the slot sits under. */
  section: ToolSectionId;
  /** Ordering within the group's flyout (and of slots within a section). */
  order?: number;
  /** B-14 (2026-06-06) — SLOT position hint within the section: the
   *  rail orders slots by the minimum `slotOrder` across a group's
   *  members, falling back to first-seen registration order. Lets a
   *  late-registered bundle place its slot among the built-ins
   *  instead of trailing the section. */
  slotOrder?: number;
  /** Marks the group's default tool (the filled-square tools in the
   *  image) — shown on the slot face at rest. */
  isGroupDefault?: boolean;
  /** Cursor while active. May be overridden per-position by the
   *  handler's `cursorAt`. */
  cursor?: CursorSpec;
  /** The gesture handler factory the spine mounts on activation
   *  (Phase 2). Absent for tools whose handler / engine op isn't
   *  wired yet — they appear in the rail but don't mutate. */
  gesture?: () => GestureHandler;
  /** Optional tool-level options (e.g. Polygon sides), shown in a
   *  double-click popover. */
  options?: ToolOptionsSpec;
  /** Optional enablement predicate against application state. */
  when?: VisibilityPredicate;
  /** Transitional bridge to the legacy scalar `ActiveTool` union
   *  (`"select"` / `"text"`) the canvas spine still routes through.
   *  Drop once consumers read `ToolId` directly. */
  legacyKey?: "select" | "text";
}

/** Transitional alias — existing code that imported `Tool` keeps
 *  compiling against the richer shape. */
export type Tool = ToolContribution;

export type ToolRegistryEvent =
  | { kind: "registered"; contribution: ToolContribution }
  | { kind: "unregistered"; id: ToolId };

export interface ToolRegistry {
  register(contribution: ToolContribution): Disposable;
  unregister(id: ToolId): void;
  get(id: ToolId): ToolContribution | undefined;
  list(): ToolContribution[];
  /** Group → ordered members, derived. The rail renders one slot per
   *  group, first-seen group order preserved; members sorted by
   *  `order`. */
  groups(): Map<ToolGroupId, ToolContribution[]>;
  onChange(handler: (event: ToolRegistryEvent) => void): Disposable;
}

/**
 * Default in-memory `ToolRegistry`. Insertion order is preserved so
 * the rail renders slots deterministically.
 */
export function createToolRegistry(): ToolRegistry {
  const byId = new Map<ToolId, ToolContribution>();
  const listeners = new Set<(event: ToolRegistryEvent) => void>();

  function emit(event: ToolRegistryEvent) {
    for (const fn of listeners) fn(event);
  }

  return {
    register(contribution) {
      if (byId.has(contribution.id)) {
        throw new Error(
          `ToolRegistry: id "${contribution.id}" already registered`,
        );
      }
      byId.set(contribution.id, contribution);
      emit({ kind: "registered", contribution });
      return {
        dispose() {
          if (byId.delete(contribution.id)) {
            emit({ kind: "unregistered", id: contribution.id });
          }
        },
      };
    },
    unregister(id) {
      if (byId.delete(id)) {
        emit({ kind: "unregistered", id });
      }
    },
    get(id) {
      return byId.get(id);
    },
    list() {
      return Array.from(byId.values());
    },
    groups() {
      // First-seen group order preserved (Map insertion order); members
      // sorted by `order` (stable sort keeps registration order for ties).
      const out = new Map<ToolGroupId, ToolContribution[]>();
      for (const c of byId.values()) {
        const arr = out.get(c.group);
        if (arr) arr.push(c);
        else out.set(c.group, [c]);
      }
      for (const arr of out.values()) {
        arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      }
      return out;
    },
    onChange(handler) {
      listeners.add(handler);
      return {
        dispose() {
          listeners.delete(handler);
        },
      };
    },
  };
}

/**
 * Built-in tools seeded at shell startup so the rail is populated
 * before any bundle runs. Phase 0 ships the two tools the canvas
 * spine already routes pointer events through (Selection, Type); the
 * full InDesign catalog (with gesture factories) lands as
 * `BUILT_IN_TOOLS` in apps/canvas during Phase 1/2. Keys/shortcuts
 * are lowercased to match `KeyboardEvent.key`.
 */
export const DEFAULT_TOOLS: ToolContribution[] = [
  {
    id: "paged.tool.select",
    title: "Selection",
    icon: "tool-select",
    shortcut: "v",
    group: "select",
    section: "selection",
    order: 0,
    isGroupDefault: true,
    legacyKey: "select",
  },
  {
    id: "paged.tool.type",
    title: "Type",
    icon: "tool-type",
    shortcut: "t",
    group: "type",
    section: "drawType",
    order: 0,
    isGroupDefault: true,
    legacyKey: "text",
  },
];
