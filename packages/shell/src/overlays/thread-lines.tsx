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
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// B4 — View ▸ Show text threads: the path a story takes across the
// spread.
//
// THE GAP THIS CLOSES. Threading ports render only on the SELECTED,
// page-owned frame (see `threading-ports.tsx`), so a story's route was
// invisible unless you clicked each frame in turn and remembered what
// you saw. A three-frame story across two spreads had no representation
// anywhere in the product — the Stories panel counts frames but cannot
// show you WHERE they are.
//
// WHY THIS WAS DEFERRED, AND WHAT UNBLOCKED IT. The deferral said the
// overlay layer had no geometry for non-selected frames, which was
// true of the door it was looking at: `frameChain` returns
// `{ frameId, next, overflow }` — topology, no bounds. The bounds come
// from a DIFFERENT door, `elementGeometry(ids)`, which takes an
// arbitrary id list and answers `bounds` + `itemTransform` + `pageId`
// for each. Nothing had to ship engine-side; the two halves just had
// never been put together. Worth stating plainly, because "the data
// isn't there" and "I was asking the wrong door" look identical from
// the call site.
//
// WHAT IT DRAWS. For every story, a polyline from each frame's OUT
// corner (bottom-right) to the next frame's IN corner (top-left) — the
// same two corners the ports occupy, so the line visibly leaves the
// port it belongs to. The last hop of an overset story ends in a stub
// with the overset tint, because a story that overflows has a "next"
// the document does not contain, and drawing nothing there would read
// as "the story ends here", which is the opposite of the truth.
//
// COLOUR. Violet (`--overlay-guide`) dashed for the route, red
// (`--overlay-target`) for the overset stub. NO NEW TOKEN: the brand
// repo owns the palette, and inventing a fifth overlay colour here is
// exactly the drift `overlay-tokens.spec.ts` exists to catch. Violet
// because a thread line is structural non-printing chrome, which is
// what violet already means here; red because it already means "the
// problem is here" and the overset badge is red for that reason. If a
// dedicated thread colour is wanted it should be minted in brand and
// flow back, not started here.
//
// COST. Off by default, and every fetch is gated on that flag: with
// the toggle off this overlay issues ZERO wire traffic. On, it costs
// one `paged.stories()` + one `frameChain` per story + one batched
// `elementGeometry`, refreshed on the same pushes the threading
// controller listens to.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { ElementGeometryItem, ElementId } from "@paged-media/client";

import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useCanvasClient } from "../state/canvas-client-context";
import {
  getViewToggle,
  subscribeViewToggles,
} from "../state/view-toggles";

import { applyAffine } from "./affine";

/** Matches `threading-ports.tsx` so the line starts where the port
 *  sits rather than near it. */
const PORT_OFFSET_PX = 13;

interface StorySummaryLite {
  selfId: string;
  overset?: boolean;
}

/** One drawn hop: from frame A's out corner to frame B's in corner. */
interface Hop {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A dangling last hop — the story overflows the final frame. */
interface Stub {
  key: string;
  x: number;
  y: number;
}

function ThreadLinesRender(props: OverlayProps) {
  const client = useCanvasClient();
  const on = useSyncExternalStore(
    subscribeViewToggles,
    () => getViewToggle("textThreads"),
    () => false,
  );

  const [chains, setChains] = useState<
    { frames: string[]; overset: boolean }[]
  >([]);
  const [geometry, setGeometry] = useState<Map<string, ElementGeometryItem>>(
    new Map(),
  );

  // Guards a late reply from a previous refresh overwriting a newer
  // one — every await below is a chance for the document to have moved
  // on, and the last writer would otherwise win by arriving last
  // rather than by being current.
  const runRef = useRef(0);

  const refresh = useCallback(async () => {
    const run = ++runRef.current;
    try {
      // `stories` is not a `client.collection` name; StorySummary comes
      // from the `paged.stories()` script surface, as ThreadingController
      // documents at its own call site.
      const res = await client.executeScript("paged.stories()");
      const stories = JSON.parse(
        res.output[0] ?? "[]",
      ) as StorySummaryLite[];
      if (run !== runRef.current) return;

      const built: { frames: string[]; overset: boolean }[] = [];
      const wanted: ElementId[] = [];
      for (const story of stories) {
        const links = await client.frameChain(story.selfId);
        if (run !== runRef.current) return;
        // A single-frame story has no hop to draw, and asking for its
        // geometry would be traffic spent on nothing.
        if (links.length < 2 && !story.overset) continue;
        const frames = links.map((l) => l.frameId);
        built.push({ frames, overset: story.overset === true });
        for (const id of frames) wanted.push({ kind: "textFrame", id });
      }

      if (wanted.length === 0) {
        setChains([]);
        setGeometry(new Map());
        return;
      }
      const items = await client.elementGeometry(wanted);
      if (run !== runRef.current) return;
      const byId = new Map<string, ElementGeometryItem>();
      for (const item of items) {
        if (item.id.kind === "textFrame") byId.set(item.id.id as string, item);
      }
      setChains(built);
      setGeometry(byId);
    } catch {
      // A story that vanished mid-refresh, a script budget, a closed
      // document. A diagnostic overlay must never take the canvas down
      // — it draws nothing and tries again on the next push.
      if (run === runRef.current) {
        setChains([]);
        setGeometry(new Map());
      }
    }
  }, [client]);

  useEffect(() => {
    if (!on) {
      // Toggling off drops the mirror, so re-enabling always re-reads
      // rather than flashing a stale route from three edits ago.
      setChains([]);
      setGeometry(new Map());
      return;
    }
    void refresh();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied" ||
        msg.kind === "documentLoaded" ||
        msg.kind === "stats"
      ) {
        void refresh();
      }
    });
    return off;
  }, [on, client, refresh]);

  // Renders an EMPTY marker rather than nothing when off, so "the
  // overlay is mounted and idle" and "the overlay never mounted" are
  // distinguishable — from a spec and from devtools. They look
  // identical when the off branch returns null, and that cost an hour
  // of diagnosis the first time.
  if (!on) return <g data-thread-lines="off" />;

  const inv = 1 / props.camera.scale;
  const offDoc = PORT_OFFSET_PX * inv;

  /** Corner of a frame in OVERLAY space, or null when the frame sits on
   *  the pasteboard (no page rect — the same C-23 rule the ports obey). */
  const corner = (
    frameId: string,
    which: "in" | "out",
  ): [number, number] | null => {
    const item = geometry.get(frameId);
    if (!item) return null;
    const pr = item.pageId ? props.pageRects.get(item.pageId) : undefined;
    if (!pr) return null;
    const [top, left, bottom, right] = item.bounds;
    const [x, y] =
      which === "in"
        ? applyAffine(item.itemTransform, left, top)
        : applyAffine(item.itemTransform, right, bottom);
    const sign = which === "in" ? -1 : 1;
    return [pr.x + x + sign * offDoc, pr.y + y + sign * offDoc];
  };

  const hops: Hop[] = [];
  const stubs: Stub[] = [];
  for (const chain of chains) {
    for (let i = 0; i < chain.frames.length - 1; i++) {
      const from = corner(chain.frames[i], "out");
      const to = corner(chain.frames[i + 1], "in");
      if (!from || !to) continue;
      hops.push({
        key: `${chain.frames[i]}->${chain.frames[i + 1]}`,
        x1: from[0],
        y1: from[1],
        x2: to[0],
        y2: to[1],
      });
    }
    if (chain.overset && chain.frames.length > 0) {
      const last = corner(chain.frames[chain.frames.length - 1], "out");
      if (last) stubs.push({ key: `${chain.frames.at(-1)}-overset`, x: last[0], y: last[1] });
    }
  }

  return (
    <g data-thread-lines={hops.length > 0 || stubs.length > 0 ? "ready" : "empty"}>
      {hops.map((h) => (
        <g key={h.key} data-thread-hop={h.key}>
          <line
            x1={h.x1}
            y1={h.y1}
            x2={h.x2}
            y2={h.y2}
            stroke="var(--overlay-guide)"
            strokeWidth={1.5 * inv}
            strokeDasharray={`${5 * inv} ${3 * inv}`}
            strokeLinecap="round"
            fill="none"
          />
          {/* Direction marker at the destination: a story reads one way,
              and a plain segment between two frames does not say which. */}
          <circle
            cx={h.x2}
            cy={h.y2}
            r={3 * inv}
            fill="var(--overlay-guide)"
          />
        </g>
      ))}
      {stubs.map((s) => (
        <g key={s.key} data-thread-overset={s.key}>
          <line
            x1={s.x}
            y1={s.y}
            x2={s.x + 26 * inv}
            y2={s.y + 26 * inv}
            stroke="var(--overlay-target)"
            strokeWidth={1.5 * inv}
            strokeDasharray={`${3 * inv} ${3 * inv}`}
            strokeLinecap="round"
          />
          <circle
            cx={s.x + 26 * inv}
            cy={s.y + 26 * inv}
            r={3.5 * inv}
            fill="none"
            stroke="var(--overlay-target)"
            strokeWidth={1.5 * inv}
          />
        </g>
      ))}
    </g>
  );
}

export const threadLinesContribution: OverlayContribution = {
  id: "paged.overlay.threadLines",
  render: ThreadLinesRender,
  // Under the selection chrome and the ports (z 100 default), so a
  // route line never sits on top of a handle the user is reaching for.
  z: 60,
};
