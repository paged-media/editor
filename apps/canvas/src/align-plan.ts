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

// ADR 323 — Align / Distribute as TYPED COMMANDS over `host.objects`.
//
// Align is not a property: it is a verb over a set of objects. So the
// Align panel no longer computes and sends `setElementProperty` itself;
// it invokes `paged.align.objects` with declared args
// `{ kind, targets }`. The command reads each target's `frameBounds`
// through `host.objects`, plans the new bounds here (pure, so the node
// unit test pins it), and commits them as ONE `host.objects.batch` = one
// undo step. A script, the CLI's editor bridge or a data binding invokes
// the same command with the same args.
//
// Types-only imports: node's type stripping runs this file as-is.

import type { ShellObjectOp, ShellValueType } from "@paged-media/shell";

export const ALIGN_KINDS = [
  "left",
  "centerH",
  "right",
  "top",
  "centerV",
  "bottom",
  "distributeH",
  "distributeV",
] as const;
export type AlignKind = (typeof ALIGN_KINDS)[number];

export const ALIGN_COMMAND = "paged.align.objects";

/** The declared args: which alignment, over which object addresses. */
export const ALIGN_ARGS: ShellValueType = {
  kind: "struct",
  fields: {
    kind: { kind: "enum", members: ALIGN_KINDS },
    targets: { kind: "list", of: { kind: "text" } },
  },
};

export type Bounds = [number, number, number, number];

/** The `frameBounds` writes an alignment needs (IDML bounds are
 *  [top, left, bottom, right]); objects already in place are skipped.
 *  Align needs ≥ 2 objects, distribute ≥ 3. */
export function planAlign(
  kind: AlignKind,
  entries: ReadonlyArray<{ address: string; bounds: Bounds }>,
): ShellObjectOp[] {
  const distribute = kind === "distributeH" || kind === "distributeV";
  if (entries.length < (distribute ? 3 : 2)) return [];
  let minTop = Infinity;
  let minLeft = Infinity;
  let maxBottom = -Infinity;
  let maxRight = -Infinity;
  for (const { bounds: [t, l, b, r] } of entries) {
    minTop = Math.min(minTop, t);
    minLeft = Math.min(minLeft, l);
    maxBottom = Math.max(maxBottom, b);
    maxRight = Math.max(maxRight, r);
  }
  const out: ShellObjectOp[] = [];
  const push = (address: string, [t, l, b, r]: Bounds, nTop: number, nLeft: number) => {
    if (Math.abs(nTop - t) < 1e-3 && Math.abs(nLeft - l) < 1e-3) return;
    const w = r - l;
    const h = b - t;
    out.push({ op: "set", address, path: "frameBounds", value: [nTop, nLeft, nTop + h, nLeft + w] });
  };
  if (distribute) {
    const h = kind === "distributeH";
    const center = ([t, l, b, r]: Bounds) => (h ? (l + r) / 2 : (t + b) / 2);
    const sorted = [...entries].sort((a, b) => center(a.bounds) - center(b.bounds));
    const first = center(sorted[0].bounds);
    const step = (center(sorted[sorted.length - 1].bounds) - first) / (sorted.length - 1);
    for (let i = 1; i < sorted.length - 1; i++) {
      const { address, bounds } = sorted[i];
      const [t, l, b, r] = bounds;
      const target = first + step * i;
      push(address, bounds, h ? t : target - (b - t) / 2, h ? target - (r - l) / 2 : l);
    }
    return out;
  }
  for (const { address, bounds } of entries) {
    const [t, l, b, r] = bounds;
    const w = r - l;
    const hh = b - t;
    let nTop = t;
    let nLeft = l;
    if (kind === "left") nLeft = minLeft;
    else if (kind === "right") nLeft = maxRight - w;
    else if (kind === "centerH") nLeft = (minLeft + maxRight - w) / 2;
    else if (kind === "top") nTop = minTop;
    else if (kind === "bottom") nTop = maxBottom - hh;
    else if (kind === "centerV") nTop = (minTop + maxBottom - hh) / 2;
    push(address, bounds, nTop, nLeft);
  }
  return out;
}

interface AlignObjects {
  get(address: string, path: string): Promise<{ kind: string; value?: unknown }>;
  batch(ops: readonly ShellObjectOp[], opts?: { label?: string }): Promise<{ applied: boolean; undoSteps: 0 | 1; code?: string; reason?: string }>;
}

/** Run an alignment: read → plan → ONE batch. Returns the batch result
 *  (`undoSteps: 0` when nothing moved). */
export async function runAlign(
  objects: AlignObjects,
  args: { kind: AlignKind; targets: readonly string[] },
) {
  const entries: { address: string; bounds: Bounds }[] = [];
  for (const address of args.targets) {
    const v = await objects.get(address, "frameBounds");
    if (v.kind === "value" && Array.isArray(v.value) && v.value.length === 4) {
      entries.push({ address, bounds: v.value as Bounds });
    }
  }
  const ops = planAlign(args.kind, entries);
  if (ops.length === 0) return { applied: true, undoSteps: 0 as const };
  return objects.batch(ops, { label: `align ${args.kind}` });
}
