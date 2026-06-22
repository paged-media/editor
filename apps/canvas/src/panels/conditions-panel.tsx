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
// visibility-toned dot + name + mono indicator method. The per-row
// eye toggle stays an honest seam until
// `Operation::SetConditionVisible` ships; the New/filter toolbar
// likewise.

import {
  Icon,
  ListRows,
  PanelToolbar,
  ToolbarBtn,
  useCollection,
} from "@paged-media/shell";
import type { ConditionSummary } from "@paged-media/client";

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
              // Visibility toggle — awaiting SetConditionVisible.
              trail: (
                <span
                  data-condition-visible={cond.visible ? "true" : "false"}
                  data-seam
                  title="Toggle visibility — awaiting engine support"
                  style={{ opacity: 0.45, display: "inline-flex" }}
                >
                  <Icon
                    name={cond.visible ? "ui-eye" : "ui-eye-off"}
                    size={14}
                  />
                </span>
              ),
            }))}
          />
        </div>
      )}
    </div>
  );
}
