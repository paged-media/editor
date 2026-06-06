// W2.9 — text-frame threading ports (TH-01…04, gestures.md §4.1.7 /
// VR-08).
//
// Renders the IN-port (top-left) and OUT-port (bottom-right) on the
// selection chrome of a SELECTED text frame, the InDesign threading
// affordance. Camera-constant size (kit overlay tokens), like the
// resize/rotate handles: positioned at the oriented bbox corners then
// scaled by `1/camera.scale` so the glyph stays a fixed screen size.
//
// Port states (the glyph each port shows):
//   - in-port  ▸  when the frame CONTINUES a chain (it is some
//                 session link's `to`); empty otherwise.
//   - out-port ▸  when the frame already HAS a next frame; a hollow
//                 arrow (the loadable affordance) otherwise; a red "+"
//                 OVERSET badge when the frame's story overflows.
//
// Interaction:
//   - out-port pointerdown → load the threading cursor (TH start). The
//     headless ThreadingController's window listeners then resolve the
//     next click (link an empty frame / draw+link a new one). The port
//     STOPS propagation so the canvas doesn't also begin a gesture.
//   - in-port pointerdown on a threaded frame → unlinkFrames (break
//     the incoming link). gestures.md gives the in-port the "break the
//     thread into me" semantics; an idle in-port is inert.
//
// Only text-frame selections render ports; other element kinds skip
// (a rectangle has no story to thread). Multi-selection skips too —
// threading is a single-frame affordance.

import { useCallback } from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { Mutation } from "@paged-media/client";

import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useCanvasClient } from "../state/canvas-client-context";
import { useSelection } from "../state/selection-context";
import { useOptionalThreading } from "../state/threading-context";

import { applyAffine } from "./affine";

/** Port box half-size in screen px (camera-constant). Sized to sit
 *  clear of the 8-px resize handles (HT-07: ports never overlap resize
 *  handles) — the in/out ports anchor at the TL/BR corners, offset
 *  outward so they tuck against, not under, the corner handles. */
const PORT_PX = 9;
const PORT_OFFSET_PX = 13;

function ThreadingPortsRender(props: OverlayProps) {
  const { elementGeometry } = useSelection();
  const threading = useOptionalThreading();
  const client = useCanvasClient();

  const unlink = useCallback(
    (frameId: string) => {
      const m: Mutation = { op: "unlinkFrames", args: { frame: frameId } };
      void client.mutate(m).then((reply) => {
        if (reply.kind === "mutationApplied") threading?.linkRemoved(frameId);
      });
    },
    [client, threading],
  );

  // Threading is single-frame; skip multi-select and non-text kinds.
  if (!threading) return null;
  if (elementGeometry.length !== 1) return null;
  const item = elementGeometry[0];
  if (item.id.kind !== "textFrame") return null;

  const pr = props.pageRects.get(item.pageId);
  if (!pr) return null;

  const frameId = item.id.id;
  const inv = 1 / props.camera.scale;
  const offDoc = PORT_OFFSET_PX * inv;

  const [top, left, bottom, right] = item.bounds;
  // In-port at the top-left corner, out-port at the bottom-right,
  // projected through the item transform so a rotated frame's ports
  // ride its oriented corners. Offset diagonally OUTWARD from the
  // corner so the port clears the resize handle.
  const [ix, iy] = applyAffine(item.itemTransform, left, top);
  const [ox, oy] = applyAffine(item.itemTransform, right, bottom);

  const continues = threading.continuesChain(frameId);
  const hasNext = threading.hasNext(frameId);
  const overset = threading.isOverset(frameId);
  const loadedFromThis = threading.loaded?.sourceFrameId === frameId;

  return (
    <>
      {renderPort({
        key: "in",
        cx: pr.x + ix - offDoc,
        cy: pr.y + iy - offDoc,
        inv,
        filled: continues,
        kind: "in",
        overset: false,
        active: false,
        // In-port breaks the incoming thread when the frame is threaded.
        onDown: continues ? () => unlink(frameId) : undefined,
      })}
      {renderPort({
        key: "out",
        cx: pr.x + ox + offDoc,
        cy: pr.y + oy + offDoc,
        inv,
        filled: hasNext,
        kind: "out",
        overset,
        active: loadedFromThis,
        onDown: () =>
          threading.loadCursor({
            sourceFrameId: frameId,
            sourcePageId: item.pageId,
          }),
      })}
    </>
  );
}

interface PortSpec {
  key: string;
  cx: number;
  cy: number;
  inv: number;
  /** Chain glyph: filled ▸ when the port participates in a chain. */
  filled: boolean;
  kind: "in" | "out";
  /** Out-port only: paint the red "+" overset badge. */
  overset: boolean;
  /** This out-port is the loaded-cursor source (highlight). */
  active: boolean;
  onDown?: () => void;
}

function renderPort(spec: PortSpec) {
  const { key, cx, cy, inv, filled, kind, overset, active, onDown } = spec;
  const s = PORT_PX;
  const fill = overset
    ? "var(--status-error)"
    : filled || active
      ? "var(--overlay-selection)"
      : "white";
  const ink = overset ? "white" : "var(--overlay-selection)";
  return (
    <g
      key={key}
      data-thread-port={kind}
      data-thread-state={
        overset ? "overset" : filled ? "chained" : active ? "loaded" : "empty"
      }
      transform={`translate(${cx}, ${cy}) scale(${inv})`}
      style={{ cursor: "pointer", pointerEvents: "all" }}
      onPointerDown={
        onDown
          ? (e) => {
              // Win the pointer before ViewportCanvas's pointerdown
              // (which would start a marquee/translate) and before the
              // controller's window listener treats it as a drop.
              e.preventDefault();
              e.stopPropagation();
              onDown();
            }
          : undefined
      }
    >
      <rect
        x={-s}
        y={-s}
        width={s * 2}
        height={s * 2}
        fill={fill}
        stroke="var(--overlay-selection)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {overset ? (
        // Overset badge: a red "+" inside the out-port.
        <path
          d={`M ${-s * 0.5} 0 H ${s * 0.5} M 0 ${-s * 0.5} V ${s * 0.5}`}
          stroke={ink}
          strokeWidth={1.6}
          vectorEffect="non-scaling-stroke"
          fill="none"
        />
      ) : (
        // Chain arrow ▸ (points "out" of the frame for both ports).
        <path
          d={`M ${-s * 0.35} ${-s * 0.45} L ${s * 0.4} 0 L ${-s * 0.35} ${s * 0.45} Z`}
          fill={filled || active ? "white" : ink}
          stroke="none"
        />
      )}
    </g>
  );
}

export const threadingPortsContribution: OverlayContribution = {
  id: "paged.threading-ports",
  render: ThreadingPortsRender,
  // Above the resize handles (z 300) / rotate handle (z 310) so the
  // ports are always clickable on top of the chrome.
  z: 320,
};
