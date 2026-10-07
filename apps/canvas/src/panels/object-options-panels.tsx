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

// ADR 323 — options panels for the document's named objects, as
// schema-driven forms over their object-model addresses:
//
//   · Swatch Options   `swatch:<id>`        name, model, tint, alpha, ink
//                                             settings — and the colour as
//                                             ONE atomic write of the whole
//                                             `color` struct (space, value,
//                                             model together: setting
//                                             `space` then `value` would
//                                             convert through an
//                                             intermediate colour);
//   · Text Variables   `textVariable:<id>`  the variable's definition;
//   · Section Options  `section:<id>`       prefix, numbering style, start;
//   · Guides           `guide:<id>`         position.
//
// Lists come from the document collections where the wire has one
// (swatches, sections) and from `host.objects.query` otherwise (text
// variables and guides are addressable but have no collection). Every
// field writes through `host.objects`, offers "Bind to data…" and shows
// the binding badge.

import { useEffect, useMemo, useState } from "react";

import {
  CockpitBtn,
  CockpitPanelHeader,
  CockpitRow,
  ObjectFieldFrame,
  displayName,
  useCollection,
  useObjectField,
  useObjectModel,
} from "@paged-media/shell";
import { formatAddress } from "@paged-media/plugin-sdk";
import type { SectionSummary, SwatchSummary } from "@paged-media/client";

import { SchemaSections, type SectionSpec } from "./schema-sections";

const SELECT =
  "h-[28px] w-full rounded-[6px] border border-input bg-background px-2 text-[12px]";

/** Addresses matching a selector, refreshed on every object change. */
function useQuery(selector: string): string[] | null {
  const model = useObjectModel();
  const [list, setList] = useState<string[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!model) return;
    const d = model.objects.onDidChange(() => setTick((n) => n + 1));
    return () => d.dispose();
  }, [model]);
  useEffect(() => {
    if (!model) {
      setList([]);
      return;
    }
    let cancelled = false;
    void model.objects
      .query(selector)
      .then((r) => {
        if (!cancelled) setList(r);
      })
      .catch(() => {
        if (!cancelled) setList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [model, selector, tick]);
  return list;
}

function Picker({
  testId,
  value,
  options,
  onChange,
}: {
  testId: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange(v: string): void;
}) {
  return (
    <select data-options-picker={testId} className={SELECT} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <div className="px-3.5 pb-3 text-xs" style={{ color: "var(--pg-muted-fg)" }} data-options-empty="">
      {children}
    </div>
  );
}

// ------------------------------------------------------ swatch options

const SWATCH_SECTIONS: readonly SectionSpec[] = [
  {
    title: "Swatch",
    fields: [
      { path: "name", label: "Name" },
      { path: "model", label: "Type" },
      { path: "tint", label: "Tint" },
      { path: "alpha", label: "Alpha" },
    ],
  },
  {
    title: "Alternate",
    fields: [
      { path: "alternateSpace", label: "Space" },
      { path: "alternateValue", label: "Value" },
    ],
  },
  {
    title: "Ink",
    fields: [
      { path: "convertToProcess", label: "To process" },
      { path: "inkAliasTo", label: "Alias to", collection: "swatches" },
    ],
  },
];

const SPACES = ["CMYK", "RGB", "LAB", "Gray"] as const;
const COMPONENTS: Record<string, number> = { CMYK: 4, RGB: 3, LAB: 3, Gray: 1 };

/** The whole colour (`swatch.color`) as ONE write: space + components
 *  (+ the model it carries) go together. */
function SwatchColorEditor({ address }: { address: string }) {
  const targets = useMemo(() => [address], [address]);
  const field = useObjectField({ path: "color", targets, schemaKind: address });
  const current =
    field.state.state === "value" && field.state.value && typeof field.state.value === "object"
      ? (field.state.value as { space?: string; value?: number[] } & Record<string, unknown>)
      : null;
  const [space, setSpace] = useState<string>("CMYK");
  const [text, setText] = useState("");
  useEffect(() => {
    setSpace(current?.space ?? "CMYK");
    setText((current?.value ?? []).map((n) => String(Math.round(n * 1000) / 1000)).join(", "));
  }, [current?.space, JSON.stringify(current?.value)]); // eslint-disable-line react-hooks/exhaustive-deps
  const parts = text.split(/[\s,]+/).filter(Boolean).map(Number);
  const valid = parts.length === COMPONENTS[space] && parts.every((n) => Number.isFinite(n));
  const commit = field.commit;
  return (
    <ObjectFieldFrame field={field} className="relative flex flex-col gap-1.5">
      <CockpitRow label="Space">
        <select
          data-swatch-color-space=""
          className={SELECT}
          value={space}
          disabled={!commit}
          onChange={(e) => setSpace(e.target.value)}
        >
          {SPACES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </CockpitRow>
      <CockpitRow label="Value">
        <input
          data-swatch-color-value=""
          className={`${SELECT} font-mono`}
          value={text}
          disabled={!commit}
          aria-invalid={!valid}
          onChange={(e) => setText(e.target.value)}
        />
      </CockpitRow>
      <div>
        <CockpitBtn
          sm
          testId="swatch-color-apply"
          disabled={!commit || !valid}
          onClick={() => void commit?.({ ...(current ?? {}), space, value: parts })}
        >
          Apply colour
        </CockpitBtn>
      </div>
    </ObjectFieldFrame>
  );
}

export function SwatchOptionsPanel() {
  const swatches = useCollection<SwatchSummary>("swatches");
  const [pick, setPick] = useState("");
  const editable = (swatches ?? []).filter((s) => s.kind !== "none" && s.kind !== "registration");
  const selfId = pick && editable.some((s) => s.selfId === pick) ? pick : (editable[0]?.selfId ?? "");
  const address = selfId ? formatAddress({ kind: "swatch", name: selfId } as never) : null;
  const targets = useMemo(() => (address ? [address] : []), [address]);
  return (
    <div data-swatch-options-panel={swatches ? "ready" : "loading"} data-options-target={address ?? ""}>
      <CockpitPanelHeader title="Swatch Options" />
      <div className="px-3.5 pb-2">
        <CockpitRow label="Swatch">
          <Picker
            testId="swatch"
            value={selfId}
            options={editable.map((s) => ({ value: s.selfId, label: displayName(s.name) }))}
            onChange={setPick}
          />
        </CockpitRow>
      </div>
      {address ? (
        <>
          <div className="px-3.5 pb-2">
            <SwatchColorEditor key={address} address={address} />
          </div>
          <SchemaSections key={address} targets={targets} sections={SWATCH_SECTIONS} testId="swatch" />
        </>
      ) : (
        <Empty>This document has no editable swatches.</Empty>
      )}
    </div>
  );
}

// ------------------------------------------------------ text variables

const TEXT_VARIABLE_SECTIONS: readonly SectionSpec[] = [
  {
    title: "Definition",
    fields: [
      { path: "textVariableName", label: "Name" },
      { path: "textVariableType", label: "Type" },
      { path: "textVariableContents", label: "Text" },
      { path: "textVariableTextBefore", label: "Text before" },
      { path: "textVariableTextAfter", label: "Text after" },
      { path: "textVariableDateFormat", label: "Date format" },
    ],
  },
];

/** The id half of an address (`textVariable:<id>` → `<id>`). */
const idOf = (address: string) => address.slice(address.indexOf(":") + 1);

function AddressListPanel({
  title,
  testId,
  selector,
  sections,
  empty,
}: {
  title: string;
  testId: string;
  selector: string;
  sections: readonly SectionSpec[];
  empty: string;
}) {
  const list = useQuery(selector);
  const [pick, setPick] = useState("");
  const address = pick && list?.includes(pick) ? pick : (list?.[0] ?? null);
  const targets = useMemo(() => (address ? [address] : []), [address]);
  return (
    <div data-object-options-panel={list ? testId : "loading"} data-options-target={address ?? ""}>
      <CockpitPanelHeader title={title} />
      {address ? (
        <>
          <div className="px-3.5 pb-2">
            <CockpitRow label={title.replace(/s$/, "")}>
              <Picker
                testId={testId}
                value={address}
                options={(list ?? []).map((a) => ({ value: a, label: displayName(idOf(a)) }))}
                onChange={setPick}
              />
            </CockpitRow>
          </div>
          <SchemaSections key={address} targets={targets} sections={sections} testId={testId} />
        </>
      ) : (
        <Empty>{empty}</Empty>
      )}
    </div>
  );
}

export function TextVariablesPanel() {
  return (
    <AddressListPanel
      title="Text Variables"
      testId="textVariable"
      selector="textVariable"
      sections={TEXT_VARIABLE_SECTIONS}
      empty="No text variables (or this engine does not list them yet)."
    />
  );
}

// ------------------------------------------------------ gradient options

/** A gradient's ramp (`gradient:<id>`, ADR 132 virtual paths over
 *  `editGradient`): its name, type and STOPS. The stops are a list of
 *  records — the PropertyField's item editor adds, removes, reorders and
 *  edits one stop at a time, each edit ONE `set` of the whole ramp = one
 *  undo step (§12.8). */
const GRADIENT_SECTIONS: readonly SectionSpec[] = [
  {
    title: "Gradient",
    fields: [
      { path: "name", label: "Name" },
      { path: "kind", label: "Type" },
      {
        path: "stops",
        label: "Stops",
        items: {
          itemLabel: "stopColor",
          fields: [
            { field: "stopColor", label: "Colour", style: "collection", props: { collectionName: "swatches" } },
            { field: "locationPct", label: "Location" },
            { field: "midpointPct", label: "Midpoint" },
          ],
          newItem: { stopColor: "Color/Black", locationPct: 100 },
        },
      },
    ],
  },
];

export function GradientOptionsPanel() {
  return (
    <AddressListPanel
      title="Gradient Options"
      testId="gradient"
      selector="gradient"
      sections={GRADIENT_SECTIONS}
      empty="This document has no gradients."
    />
  );
}

// ------------------------------------------------------ section options

const SECTION_SECTIONS: readonly SectionSpec[] = [
  {
    title: "Page Numbering",
    fields: [
      { path: "prefix", label: "Prefix" },
      { path: "numberingStyle", label: "Style" },
      { path: "startAt", label: "Start at" },
    ],
  },
];

export function SectionOptionsPanel() {
  const sections = useCollection<SectionSummary>("sections");
  const [pick, setPick] = useState("");
  const selfId =
    pick && sections?.some((s) => s.selfId === pick) ? pick : (sections?.[0]?.selfId ?? "");
  const address = selfId ? formatAddress({ kind: "section", id: selfId } as never) : null;
  const targets = useMemo(() => (address ? [address] : []), [address]);
  return (
    <div data-section-options-panel={sections ? "ready" : "loading"} data-options-target={address ?? ""}>
      <CockpitPanelHeader title="Numbering & Section Options" />
      {address ? (
        <>
          <div className="px-3.5 pb-2">
            <CockpitRow label="Section">
              <Picker
                testId="section"
                value={selfId}
                options={(sections ?? []).map((s, i) => ({
                  value: s.selfId,
                  label: `${i + 1}. ${s.prefix || s.selfId}`,
                }))}
                onChange={setPick}
              />
            </CockpitRow>
          </div>
          <SchemaSections key={address} targets={targets} sections={SECTION_SECTIONS} testId="section" />
        </>
      ) : (
        <Empty>This document has no numbering sections.</Empty>
      )}
    </div>
  );
}

// --------------------------------------------------------------- guides

const GUIDE_SECTIONS: readonly SectionSpec[] = [
  { title: "Guide", fields: [{ path: "position", label: "Position" }] },
];

export function GuidesPanel() {
  return (
    <AddressListPanel
      title="Guides"
      testId="guide"
      selector="guide"
      sections={GUIDE_SECTIONS}
      empty="No ruler guides (or this engine does not list them yet)."
    />
  );
}
