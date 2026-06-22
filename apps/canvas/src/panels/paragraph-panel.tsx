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

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  Icon,
  TogglePill,
  useBindings,
} from "@paged-media/shell";
import { NumberInput } from "@paged-media/ui";
import type { ParagraphRuleSpec, Value } from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";
import { paragraphComposition } from "./paragraph.composition";

const RULE_BINDINGS = {
  above: {
    kind: "selectionProperty" as const,
    scope: "content" as const,
    path: "paragraphRuleAbove" as const,
  },
  below: {
    kind: "selectionProperty" as const,
    scope: "content" as const,
    path: "paragraphRuleBelow" as const,
  },
};

function unwrapRule(v: Value | null): ParagraphRuleSpec | null {
  if (!v || v.type !== "paragraphRule") return null;
  return v.value;
}

/** A rule with `on: false` is "present but off"; `null` is "no rule
 *  at all". The pill treats both as off and toggles to a sensible
 *  default-on spec / clears to null. */
function ruleIsOn(spec: ParagraphRuleSpec | null): boolean {
  return spec != null && spec.on !== false;
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
  spec,
  disabled,
  onCommit,
}: {
  name: string;
  testId: string;
  spec: ParagraphRuleSpec | null;
  disabled?: boolean;
  onCommit?: (next: Value) => void;
}) {
  const on = ruleIsOn(spec);
  const patch = (delta: Partial<ParagraphRuleSpec>) => {
    const base = spec ?? DEFAULT_RULE;
    onCommit?.({
      type: "paragraphRule",
      value: { ...base, on: true, ...delta },
    } as Value);
  };
  return (
    <div data-rule-row={testId}>
      <div className="flex items-center gap-[9px] py-[5px]">
        <TogglePill
          checked={on}
          disabled={disabled}
          testId={testId}
          onToggle={(next) => {
            // On → write the spec; off → clear the whole rule (null).
            if (next) {
              onCommit?.({
                type: "paragraphRule",
                value: spec ? { ...spec, on: true } : DEFAULT_RULE,
              } as Value);
            } else {
              onCommit?.({ type: "paragraphRule", value: null } as Value);
            }
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
  );
}

export function ParagraphPanel() {
  const rules = useBindings(RULE_BINDINGS);
  const above = unwrapRule(rules.above.value);
  const below = unwrapRule(rules.below.value);

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3 flex flex-col gap-[9px]" data-paragraph-panel="ready">
        <CompositionRenderer composition={paragraphComposition} />
        <div
          className="-mx-3 border-t border-input px-3 pt-2"
          data-section="Paragraph rules"
        >
          <div className="pg-label mb-1">Paragraph rules</div>
          <RuleRow
            name="Rule above"
            testId="rule-above"
            spec={above}
            disabled={rules.above.onCommit == null}
            onCommit={rules.above.onCommit}
          />
          <RuleRow
            name="Rule below"
            testId="rule-below"
            spec={below}
            disabled={rules.below.onCommit == null}
            onCommit={rules.below.onCommit}
          />
        </div>
      </div>
    </CatalogRegistryProvider>
  );
}
