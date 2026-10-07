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

// SDK Phase 3 — Paragraph panel.
//
// Declarative composition over the paragraph layout apply arms
// (indents, spacing, drop caps, hyphenation, keep options). W2.1
// (2026-06-06) adds the bespoke **Paragraph rules** disclosure:
// rule above / rule below ride the whole-struct
// `Value::ParagraphRule` path (no catalog leaf emits that shape), so
// the disclosure is hand-wired here on the effects-panel drop-shadow
// precedent — the pill toggles the rule on/off (a `null` clears it),
// and the indented fields patch Weight + Offset on the struct.
// Content-scope bindings; the apply layer rounds the range to whole
// paragraphs (paragraphs are atomic).
//
// ADR 023 phase C/D — REWIRED, not rewritten. Every composition field
// retargets through `useBindings`, which now resolves through the
// binding-provider seam; nothing in the composition changed. The
// bespoke rule rows read the seam's verdict for the same reason the
// Character panel's do: `absent` (an active provider owns the selection
// and has no paragraph rule) is a SEAM, not a mixed value, and it must
// never be answered from core — the text caret is independent of a
// plugin's edit context, so falling through would show whatever
// paragraph was last touched.
//
// ADR 323 — the composition fields (align, indents, spacing, drop cap,
// hyphenation, keep options, span columns: 21 paths) are migrated
// `PropertyField`s (paragraph.composition.ts). The rule rows keep their
// bespoke toggle + weight / offset UI (a `ParagraphRuleSpec` struct is
// opaque in the schema), but read and write through `host.objects`
// (`useObjectField` on the text selection's `storyRange`): one write =
// one undo step, wrapped in `ObjectFieldFrame` for "Bind to data…" and
// the badges. An edit context that owns the selection (a sheet cell)
// still answers the field — `absent` there is a seam, never core's
// answer for some other paragraph.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  Icon,
  ObjectFieldFrame,
  TogglePill,
  useObjectField,
} from "@paged-media/shell";
import { NumberInput } from "@paged-media/ui";
import type { ParagraphRuleSpec } from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";
import { paragraphComposition } from "./paragraph.composition";

/** A rule with `on: false` is "present but off"; `null` — or, through
 *  host.objects, a spec whose every field is null — is "no rule at all".
 *  The pill treats both as off and toggles to a sensible default-on spec
 *  / clears to null. */
function ruleIsOn(spec: ParagraphRuleSpec | null): boolean {
  if (spec == null || spec.on === false) return false;
  return spec.on === true || spec.weight != null;
}

const DEFAULT_RULE: ParagraphRuleSpec = {
  on: true,
  weight: 1,
  offset: 0,
  color: null,
  tint: null,
  leftIndent: null,
  rightIndent: null,
  width: null,
};

function RuleRow({
  name,
  testId,
  path,
}: {
  name: string;
  testId: string;
  path: "paragraphRuleAbove" | "paragraphRuleBelow";
}) {
  const field = useObjectField({ path, scope: "content" });
  const spec =
    field.state.state === "value" && field.state.value && typeof field.state.value === "object"
      ? (field.state.value as ParagraphRuleSpec)
      : null;
  const disabled = field.commit == null;
  const write = (next: ParagraphRuleSpec | null) => void field.commit?.(next);
  const on = ruleIsOn(spec);
  const patch = (delta: Partial<ParagraphRuleSpec>) => {
    const base = spec ?? DEFAULT_RULE;
    write({ ...base, on: true, ...delta });
  };
  const absent = field.bindingState === "absent";
  return (
    <ObjectFieldFrame
      field={field}
      data-rule-row={testId}
      data-seam={absent ? "true" : undefined}
    >
      <div style={{ opacity: absent ? 0.55 : 1 }}>
      <div className="flex items-center gap-[9px] py-[5px]">
        <TogglePill
          checked={on}
          disabled={disabled}
          testId={testId}
          onToggle={(next) => {
            // On → write the spec; off → clear the whole rule (null).
            write(next ? (spec ? { ...spec, on: true } : DEFAULT_RULE) : null);
          }}
        />
        <span
          className="flex-1 text-xs"
          style={{ color: on ? "var(--pg-fg)" : "var(--pg-muted-fg)" }}
        >
          {name}
        </span>
        {on && (
          <Icon
            name="ui-chevron-down"
            size={13}
            style={{ color: "var(--pg-muted-fg)" }}
          />
        )}
      </div>
      {on && (
        <div
          className="mb-[6px] ml-1 grid grid-cols-2 gap-2 py-2 pl-3"
          data-rule-fields={testId}
          style={{ borderLeft: "2px solid var(--pg-primary-soft)" }}
        >
          <NumberInput
            suffix="pt"
            value={spec?.weight ?? 1}
            min={0}
            disabled={disabled}
            onChange={() => {}}
            onCommit={(next) => patch({ weight: next })}
            aria-label={`${testId} weight`}
          />
          <NumberInput
            suffix="pt"
            value={spec?.offset ?? 0}
            disabled={disabled}
            onChange={() => {}}
            onCommit={(next) => patch({ offset: next })}
            aria-label={`${testId} offset`}
          />
        </div>
      )}
      </div>
    </ObjectFieldFrame>
  );
}

export function ParagraphPanel() {

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3 flex flex-col gap-[9px]" data-paragraph-panel="ready">
        <CompositionRenderer composition={paragraphComposition} />
        <div
          className="-mx-3 border-t border-input px-3 pt-2"
          data-section="Paragraph rules"
        >
          <div className="pg-label mb-1">Paragraph rules</div>
          <RuleRow name="Rule above" testId="rule-above" path="paragraphRuleAbove" />
          <RuleRow name="Rule below" testId="rule-below" path="paragraphRuleBelow" />
        </div>
      </div>
    </CatalogRegistryProvider>
  );
}
