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

// SDK Phase 5 / gallery pixel-parity — Attributes panel, composed
// to the deep1 card (gallery-deep1.jsx `Attributes`):
//
//   Visible / Locked       check rows            LIVE  (W2.5)
//   Nonprinting            check row             LIVE
//   ── OVERPRINT kicker ──
//   Overprint fill/stroke  check rows            LIVE  (W2.3)
//   Gap color               label-left swatch    seam
//
// The LIVE pills bind `selectionProperty:frame{Nonprinting,
// OverprintFill,OverprintStroke}` + the element-level
// `element{Visible,Locked}` (W2.5, 2026-06-07). Kind coverage:
// element visible/locked are on every CommonAttrs-bearing page-item
// kind; nonprinting + overprint as before. On a kind without the
// PropertyEntry the binding reads null → the pill shows the mixed
// (em-dash) sentinel, disabled.

import { useMemo, useState } from "react";

import {
  Icon,
  ObjectFieldFrame,
  PropertyField,
  TogglePill,
  useObjectBindings,
  useObjectField,
  useObjectModel,
  useSelection,
  type ObjectField,
} from "@paged-media/shell";
import type { Value } from "@paged-media/client";

import { addressOfElement } from "../object-model";

// ADR 323 — every pill is an object-model field: reads/writes through
// `host.objects` (one batch over a multi-selection = one undo step),
// each row an `ObjectFieldFrame` ("Bind to data…" + badges).
const BINDINGS = {
  visible: { scope: "element" as const, path: "elementVisible" },
  locked: { scope: "element" as const, path: "elementLocked" },
  nonprinting: { scope: "element" as const, path: "frameNonprinting" },
  overprintFill: { scope: "element" as const, path: "frameOverprintFill" },
  overprintStroke: { scope: "element" as const, path: "frameOverprintStroke" },
};

function unwrapBool(v: Value | null): boolean | null {
  if (!v) return null;
  if (v.type !== "bool") return null;
  return v.value as boolean;
}

function CheckRow({
  field,
  label,
  on,
  mixed,
  seam,
  disabled,
  onToggle,
}: {
  field: ObjectField;
  label: string;
  on: boolean;
  mixed?: boolean;
  seam?: boolean;
  disabled?: boolean;
  onToggle?: (next: boolean) => void;
}) {
  return (
    <ObjectFieldFrame field={field}>
    <label
      className="flex items-center justify-between py-[6px]"
      data-check-row={label}
      data-seam={seam ? "true" : undefined}
    >
      <span className="text-xs" style={{ color: "var(--pg-fg)" }}>
        {label}
      </span>
      <TogglePill
        checked={on}
        mixed={mixed}
        disabled={seam || disabled}
        onToggle={onToggle}
      />
    </label>
    </ObjectFieldFrame>
  );
}

export function AttributesPanel() {
  const resolved = useObjectBindings(BINDINGS);
  const vis = resolved.visible;
  const visChecked = unwrapBool(vis.value);
  const lock = resolved.locked;
  const lockChecked = unwrapBool(lock.value);
  const np = resolved.nonprinting;
  const checked = unwrapBool(np.value);
  const opFill = resolved.overprintFill;
  const opFillChecked = unwrapBool(opFill.value);
  const opStroke = resolved.overprintStroke;
  const opStrokeChecked = unwrapBool(opStroke.value);

  return (
    <div className="p-3 flex flex-col" data-attributes-panel="ready">
      {/* W2.5 — element-level Visible / Locked. Default visible=true,
          so the unset state shows checked; mixed selections read null
          → the em-dash sentinel. */}
      <CheckRow
        field={vis}
        label="Visible"
        on={visChecked === true}
        mixed={visChecked === null}
        disabled={vis.onCommit == null}
        onToggle={(next) => {
          vis.onCommit?.({ type: "bool", value: next } as Value);
        }}
      />
      <CheckRow
        field={lock}
        label="Locked"
        on={lockChecked === true}
        mixed={lockChecked === null}
        disabled={lock.onCommit == null}
        onToggle={(next) => {
          lock.onCommit?.({ type: "bool", value: next } as Value);
        }}
      />
      <CheckRow
        field={np}
        label="Nonprinting"
        on={checked === true}
        mixed={checked === null}
        disabled={np.onCommit == null}
        onToggle={(next) => {
          np.onCommit?.({ type: "bool", value: next } as Value);
        }}
      />
      <div className="-mx-3 mt-2 border-t border-input px-3 pt-2">
        <div className="pg-label mb-1">Overprint</div>
        <CheckRow
          field={opFill}
          label="Overprint fill"
          on={opFillChecked === true}
          mixed={opFillChecked === null}
          disabled={opFill.onCommit == null}
          onToggle={(next) => {
            opFill.onCommit?.({ type: "bool", value: next } as Value);
          }}
        />
        <CheckRow
          field={opStroke}
          label="Overprint stroke"
          on={opStrokeChecked === true}
          mixed={opStrokeChecked === null}
          disabled={opStroke.onCommit == null}
          onToggle={(next) => {
            opStroke.onCommit?.({ type: "bool", value: next } as Value);
          }}
        />
      </div>
      <div className="mt-1 grid grid-cols-[84px_1fr] items-center gap-2">
        <span className="text-xs" style={{ color: "var(--pg-muted-fg)" }}>
          Gap color
        </span>
        <span
          data-seam
          title="Gap colour — awaiting engine support"
          className="flex h-[28px] w-full items-center gap-2 rounded-[6px] border border-input bg-background px-2 opacity-55"
        >
          <span className="h-4 w-4 shrink-0 rounded border border-input bg-transparent" />
          <span
            className="flex-1 text-left text-xs"
            style={{ color: "var(--pg-muted-fg)" }}
          >
            [None]
          </span>
          <Icon
            name="ui-chevron-down"
            size={12}
            style={{ color: "var(--pg-muted-fg)" }}
          />
        </span>
      </div>
      <LabelsSection />
    </div>
  );
}

/** A new label starts as an empty envelope (plugin-sdk's label shape). */
const EMPTY_ENVELOPE = '{"v":1,"data":{}}';
const LABEL_NS = "x-paged:";

/**
 * ADR 323 §4 — the element's script labels (`labels[key]`, IDML
 * `Properties/Label` KeyValuePairs). Every label is READ (the `labels`
 * map); only the `x-paged:` namespace is WRITTEN — core refuses any
 * other key, so a foreign label (InDesign's own, another tool's) stays
 * read-only here rather than offering a write that cannot land. Each
 * value is a PropertyField on `labels[<key>]` (one write = one undo
 * step, "Bind to data…").
 */
function LabelsSection() {
  const { elementSelection } = useSelection();
  const model = useObjectModel();
  const first = elementSelection.length === 1 ? elementSelection[0] : null;
  const address = useMemo(() => (first ? addressOfElement(first) : null), [first]);
  const targets = useMemo(() => (address ? [address] : []), [address]);
  const map = useObjectField({ path: "labels", targets, schemaKind: address ?? "frame" });
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!address) return null;
  const labels =
    map.state.state === "value" && map.state.value && typeof map.state.value === "object"
      ? Object.keys(map.state.value as Record<string, unknown>).sort()
      : [];
  const add = async () => {
    const key = draft.startsWith(LABEL_NS) ? draft : `${LABEL_NS}${draft}`;
    if (!model || draft.trim() === "") return;
    const r = await model.objects.set(address, `labels[${key}]`, EMPTY_ENVELOPE, { label: "labels" });
    setError(r.applied ? null : `${r.code ?? "failed"}: ${r.reason ?? "refused"}`);
    if (r.applied) setDraft("");
  };
  return (
    <div className="-mx-3 mt-2 border-t border-input px-3 pt-2" data-section="Labels" data-labels-target={address}>
      <div className="pg-label mb-1">Labels</div>
      {labels.length === 0 ? (
        <div className="pb-1 text-xs" style={{ color: "var(--pg-muted-fg)" }} data-labels-empty="">
          No labels on this object.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 pb-1" data-labels-list="">
          {labels.map((key) =>
            key.startsWith(LABEL_NS) ? (
              <PropertyField
                key={key}
                path={`labels[${key}]`}
                label={key.slice(LABEL_NS.length)}
                labelPosition="stack"
                targets={targets}
                schemaKind={address}
              />
            ) : (
              <div key={key} className="text-xs" data-label-readonly={key} title="Only x-paged: labels are written here">
                <span className="font-mono">{key}</span>
              </div>
            ),
          )}
        </div>
      )}
      <div className="flex items-center gap-[5px] pb-1">
        <input
          data-label-new-key=""
          placeholder="x-paged:plugin.id"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-[26px] flex-1 rounded-[6px] border border-input bg-background px-2 font-mono text-[11px]"
        />
        <button
          type="button"
          data-label-add=""
          disabled={draft.trim() === ""}
          onClick={() => void add()}
          className="h-[26px] rounded-[6px] border border-input px-2 text-[11px]"
        >
          Add label
        </button>
      </div>
      {error && (
        <div data-label-error="" className="text-[10.5px]" style={{ color: "var(--status-error, var(--pg-destructive))" }}>
          {error}
        </div>
      )}
    </div>
  );
}
