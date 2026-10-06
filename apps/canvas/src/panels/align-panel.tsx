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

// SDK Phase 5 (v1 sweep) — Align panel.
//
// Six-button alignment palette: align-left / -center-h / -right
// + align-top / -center-v / -bottom, distribute H / V; each aligns
// the selection to its own AABB edges or centre. Per
// `docs/design/panel-catalog.md` §6 Tier 3 + §10 audit
// register: declares `writes: ["geometry"]` since the commit set
// is a multi-target rewrite of frame bounds.
//
// ADR 323 — the panel no longer computes or sends geometry itself: each
// button invokes the TYPED command `paged.align.objects` with
// `{ kind, targets }` (declared args, align-plan.ts), which reads every
// target's `frameBounds` through `host.objects` and commits ONE batch —
// one undo step. A script invokes the same command.

import { Icon, useObjectModel, useRegistries, useSelection } from "@paged-media/shell";
import { KitSelect } from "@paged-media/ui";

import { ALIGN_COMMAND, type AlignKind } from "../align-plan";

// Glyphs per the deep1 card (icon clusters with a divider —
// ui-rows/ui-cols-2/ui-rows are the kit's vertical stand-ins).
const ALIGN_H: Array<{ kind: AlignKind; icon: string; hint: string }> = [
  { kind: "left", icon: "ui-align-left", hint: "Align left" },
  { kind: "centerH", icon: "ui-align-center", hint: "Center horizontally" },
  { kind: "right", icon: "ui-align-right", hint: "Align right" },
];
const ALIGN_V: Array<{ kind: AlignKind; icon: string; hint: string }> = [
  { kind: "top", icon: "ui-rows", hint: "Align top" },
  { kind: "centerV", icon: "ui-cols-2", hint: "Center vertically" },
  { kind: "bottom", icon: "ui-rows", hint: "Align bottom" },
];

const DISTRIBUTE_BUTTONS: Array<{
  kind: AlignKind;
  icon: string;
  hint: string;
}> = [
  { kind: "distributeH", icon: "ui-cols-2", hint: "Distribute horizontally" },
  { kind: "distributeV", icon: "ui-rows", hint: "Distribute vertically" },
];

export function AlignPanel() {
  const registries = useRegistries();
  const model = useObjectModel();
  const { elementSelection } = useSelection();
  const enabled = elementSelection.length >= 2;

  async function align(kind: AlignKind) {
    if (!model || elementSelection.length < 2) return;
    const targets = elementSelection.map((id) => model.addressOf(id));
    try {
      await registries.commands.invoke(ALIGN_COMMAND, { kind, targets });
    } catch (err) {
      console.warn(`paged.align: ${kind} refused`, err);
    }
  }

  const distributeEnabled = elementSelection.length >= 3;

  const iconBtn = (
    btn: { kind: AlignKind; icon: string; hint: string },
    on: boolean,
  ) => (
    <button
      type="button"
      key={btn.kind}
      data-align-kind={btn.kind}
      disabled={!on}
      title={btn.hint}
      className="flex h-[30px] w-[32px] items-center justify-center rounded-[6px] border border-input bg-background hover:bg-muted/60 disabled:opacity-50"
      style={{ color: "var(--chrome-icon)" }}
      onClick={() => {
        void align(btn.kind);
      }}
    >
      <Icon name={btn.icon} size={15} />
    </button>
  );

  return (
    <div className="p-3 flex flex-col gap-2" data-align-panel="ready">
      {/* Align-to scope — Selection is the live behaviour; Page /
          Margins / Spread wait on page-membership reads (gap 7). */}
      <div className="mb-px">
        <div
          className="text-[11.5px] mb-[5px]"
          style={{ color: "var(--pg-muted-fg)" }}
        >
          Align to
        </div>
        <KitSelect value="selection" onChange={() => {}} data-align-scope>
          <option value="selection">Selection</option>
          <option value="page" disabled>
            Page — awaiting engine support
          </option>
          <option value="margins" disabled>
            Margins — awaiting engine support
          </option>
          <option value="spread" disabled>
            Spread — awaiting engine support
          </option>
        </KitSelect>
      </div>
      <div className="pg-label pt-1">Align objects</div>
      <div className="flex gap-2" role="group" aria-label="Align">
        <div className="flex gap-1">
          {ALIGN_H.map((b) => iconBtn(b, enabled))}
        </div>
        <div
          className="w-px self-stretch"
          style={{ background: "var(--pg-border)" }}
        />
        <div className="flex gap-1">
          {ALIGN_V.map((b) => iconBtn(b, enabled))}
        </div>
      </div>
      <div className="pg-label pt-2">Distribute</div>
      <div className="flex gap-1" role="group" aria-label="Distribute">
        {DISTRIBUTE_BUTTONS.map((b) => iconBtn(b, distributeEnabled))}
      </div>
      {/* Equal-spacing distribute — honest seam until the panel
          grows the spacing input's commit path. */}
      <div className="-mx-3 mt-1 flex items-center gap-2 border-t border-input px-3 pt-[10px]">
        <span data-seam className="contents">
          <button
            type="button"
            role="switch"
            aria-checked={false}
            disabled
            data-use-spacing
            className="relative w-[30px] h-[17px] shrink-0 rounded-full border-0 opacity-55"
            style={{ background: "var(--chrome-divider)" }}
          >
            <span className="absolute top-[2px] left-[2px] w-[13px] h-[13px] rounded-full bg-white shadow" />
          </button>
          <span className="flex-1 text-xs" style={{ color: "var(--pg-fg)" }}>
            Use spacing
          </span>
          <span
            className="pg-value text-xs"
            style={{ color: "var(--pg-muted-fg)" }}
          >
            — mm
          </span>
        </span>
      </div>
      {enabled ? null : (
        <div className="text-xs text-muted-foreground" data-align-hint>
          Select 2 or more frames to align.
        </div>
      )}
      {!distributeEnabled && enabled ? (
        <div className="text-xs text-muted-foreground" data-distribute-hint>
          Select 3 or more frames to distribute.
        </div>
      ) : null}
    </div>
  );
}
