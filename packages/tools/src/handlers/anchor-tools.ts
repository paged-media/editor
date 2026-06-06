// Editor-ops — Add / Delete / Convert Anchor Point gesture handlers.
//
// Click tools on the Scissors pattern, shimming `@paged-media/
// draw-tools`' anchor-edit planning (plugin-draw milestone D2): the
// click→t→split math, the 2-anchor delete guard, and the closing-
// edge `prevSubpathStarts` bookkeeping live in the host-agnostic
// planner; this file owns the host glue — target resolution
// (hit-test, selection fallback), the page-local → path-local map
// (inverse itemTransform, the path-edit overlay's chain), px→pt pick
// tolerance, and the plan → Mutation translation:
//
//   insert  → batch [ pathPointSet(right@segStart),
//                     pathPointSet(left@segEnd),
//                     pathPointInsert(idx, anchor, prevSubpathStarts?) ]
//   remove  → pathPointRemove
//   convert → pathPointCurveType

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";
import type { ElementId, Mutation } from "@paged-media/client";

import {
  affineScale,
  inverseApplyAffine,
} from "@paged-media/draw-geometry";
import {
  planAnchorAdd,
  planAnchorConvert,
  planAnchorDelete,
  type AnchorEditPlan,
} from "@paged-media/draw-tools";

import { CLICK_DRAG_THRESHOLD_PX, pxToPt } from "./shared";

/** Screen-space pick radius around anchors / segments. */
const PICK_TOLERANCE_PX = 6;

export type AnchorEditMode = "add" | "delete" | "convert";

/** Track-J fan-out: the four path-bearing kinds the path-topology
 *  mutations accept (mirrors path-edit's editTarget filter). */
function supportsPathEdit(id: ElementId): boolean {
  return (
    id.kind === "polygon" ||
    id.kind === "rectangle" ||
    id.kind === "textFrame" ||
    id.kind === "graphicLine"
  );
}

function mutationFor(plan: AnchorEditPlan, elementId: ElementId): Mutation {
  switch (plan.kind) {
    case "remove":
      return {
        op: "pathPointRemove",
        args: { elementId, index: plan.index },
      };
    case "convert":
      return {
        op: "pathPointCurveType",
        args: { elementId, index: plan.index, smooth: plan.smooth },
      };
    case "insert": {
      // Dispatch order matters: both endpoint handles update at their
      // OLD flat indices first, then the new anchor lands — one undo
      // entry via batch.
      const ops: Mutation[] = [
        {
          op: "pathPointSet",
          args: {
            elementId,
            index: plan.segStart,
            role: "right",
            position: plan.startRight,
          },
        },
        {
          op: "pathPointSet",
          args: {
            elementId,
            index: plan.segEnd,
            role: "left",
            position: plan.endLeft,
          },
        },
        {
          op: "pathPointInsert",
          args: {
            elementId,
            index: plan.insertIndex,
            anchor: plan.anchor,
            ...(plan.prevSubpathStarts !== undefined
              ? { prevSubpathStarts: plan.prevSubpathStarts }
              : {}),
          },
        },
      ];
      return { op: "batch", args: { ops } };
    }
  }
}

function createHandler(mode: AnchorEditMode): GestureHandler {
  let paged: PagedEditor | null = null;

  const act = async (e: CanvasPointerEvent) => {
    if (!paged || !e.pageId || !e.pagePoint) return;
    const client = paged.client;
    // Resolve the target: hit-test first, single selection fallback
    // (the Scissors rule — a precise click on a hairline path isn't
    // required).
    let target: ElementId | null = null;
    try {
      const reply = await client.send({
        kind: "hitTest",
        payload: { pageId: e.pageId, docPoint: e.pagePoint, filter: "any" },
      });
      if (reply.kind === "hitResult") target = reply.payload.element ?? null;
    } catch {
      /* fall through to the selection */
    }
    if (!target && paged.selection.elementSelection.length === 1) {
      target = paged.selection.elementSelection[0];
    }
    if (!target || !supportsPathEdit(target)) return;
    const result = await client.pathAnchors(target).catch(() => null);
    if (!result || result.pageId !== e.pageId) return;
    // Page-local → path-local (inverse itemTransform); pick tolerance
    // scaled so it stays screen-constant in transformed local space.
    const matrix = result.itemTransform ?? null;
    const local = inverseApplyAffine(matrix, e.pagePoint[0], e.pagePoint[1]);
    if (!local) return;
    const tolerance = pxToPt(paged, PICK_TOLERANCE_PX) / affineScale(matrix);
    const plan =
      mode === "add"
        ? planAnchorAdd(result, local, tolerance)
        : mode === "delete"
          ? planAnchorDelete(result, local, tolerance)
          : planAnchorConvert(result, local, tolerance);
    if (!plan) return;
    const reply = await client.mutate(mutationFor(plan, target));
    if (reply.kind === "mutationFailed") {
      // eslint-disable-next-line no-console
      console.warn(
        `anchor ${mode} rejected by engine:`,
        JSON.stringify((reply as { payload?: unknown }).payload),
      );
    }
  };

  return {
    onActivate(p) {
      paged = p;
    },
    onDeactivate() {
      /* click tool — nothing in flight */
    },
    onPointerDown() {
      /* acts on pointer-up so click-vs-drag is decidable */
    },
    onPointerMove() {},
    onPointerUp(e: CanvasPointerEvent) {
      if (e.button !== 0 || e.maxDelta > CLICK_DRAG_THRESHOLD_PX) return;
      void act(e).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`anchor ${mode} failed:`, err);
      });
    },
  };
}

export const createAddAnchorHandler = (): GestureHandler =>
  createHandler("add");
export const createDeleteAnchorHandler = (): GestureHandler =>
  createHandler("delete");
export const createConvertAnchorHandler = (): GestureHandler =>
  createHandler("convert");
