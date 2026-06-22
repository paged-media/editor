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

// SDK Phase 5 / panel-gallery pass — Object Styles panel.
//
// The shared style-manager surface (style-apply.tsx → shell
// ApplyList). Element-scope binding to appliedObjectStyle — the
// apply arm (Track A's Task G) routes the Value::Text(selfId)
// commit to the page item's `applied_object_style` field; the
// style cascade resolves on the next rebuild. New/Delete ride
// createObjectStyle / deleteObjectStyle; Redefine is an honest
// seam (no capture-from-selection op yet).

import { StyleApplyPanel } from "./style-apply";

export function ObjectStylesPanel() {
  return (
    <div className="p-0" data-object-styles-panel="ready">
      <StyleApplyPanel
        collection="objectStyles"
        appliedPath="appliedObjectStyle"
        scope="element"
        itemIcon="panel-object-styles"
        testId="object-styles"
        createOp="createObjectStyle"
        deleteOp="deleteObjectStyle"
        newName="New object style"
      />
    </div>
  );
}
