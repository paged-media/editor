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

// SDK Phase 5 / panel-gallery pass — Conditions panel.
//
// Gallery list shape over every `<Condition>` in the document:
// visibility-toned dot + name + mono indicator method. The per-row eye
// toggles visibility through the typed core command
// `core.setConditionVisible` (one invoke = one undo step); the New /
// filter toolbar stays a seam.
//
// ADR 323 §4 — Conditional Text: the conditions applied to the TEXT
// selection (`storyRange` `appliedConditions`) as a PropertyField, so it
// writes through host.objects and offers "Bind to data…".

import {
  CockpitSection,
  Icon,
  ListRows,
  PanelToolbar,
  PropertyField,
  ToolbarBtn,
  useCollection,
} from "@paged-media/shell";
import type { ConditionSummary } from "@paged-media/client";

import { invokeCoreCommand } from "../core-command-dialog";

function toggleVisible(cond: ConditionSummary): void {
  void invokeCoreCommand("setConditionVisible", {
    condition: `condition:${cond.selfId}`,
    visible: !cond.visible,
  }).catch(() => {});
}

export function ConditionsPanel() {
  const conditions = useCollection<ConditionSummary>("conditions");
  if (conditions === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-conditions-panel="loading"
      >
        Loading conditions…
      </div>
    );
  }
  return (
    <div data-conditions-panel="ready">
      <PanelToolbar>
        <ToolbarBtn
          icon="ui-plus"
          label="New condition — awaiting engine support"
        />
        <ToolbarBtn icon="ui-filter" label="Filter — awaiting engine support" />
      </PanelToolbar>
      {conditions.length === 0 ? (
        <div
          className="p-3 text-xs text-muted-foreground"
          data-empty-conditions
        >
          No conditions in this document.
        </div>
      ) : (
        <div data-condition-list>
          <ListRows
            rows={conditions.map((cond) => ({
              key: cond.selfId,
              dot: cond.visible ? ("ok" as const) : ("draft" as const),
              primary: cond.name,
              secondary: cond.indicatorMethod ?? undefined,
              trail: (
                <button
                  type="button"
                  data-condition-visible={cond.visible ? "true" : "false"}
                  data-condition-toggle={cond.selfId}
                  title={cond.visible ? "Hide condition" : "Show condition"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleVisible(cond);
                  }}
                  className="inline-flex cursor-pointer border-0 bg-transparent p-0"
                  style={{ color: "var(--pg-fg)" }}
                >
                  <Icon
                    name={cond.visible ? "ui-eye" : "ui-eye-off"}
                    size={14}
                  />
                </button>
              ),
            }))}
          />
        </div>
      )}
      <CockpitSection title="Conditional text">
        <div className="flex flex-col gap-1.5 pb-2" data-conditional-text="">
          <PropertyField
            path="appliedConditions"
            label="Applied to selection"
            scope="content"
            schemaKind="storyRange"
            style="collection"
            collection="conditions"
          />
        </div>
      </CockpitSection>
    </div>
  );
}
