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

// SDK Phase 5 / panel-gallery pass — Character Styles panel.
//
// The shared style-manager surface (style-apply.tsx → shell
// ApplyList): applied select + style rows apply through the
// `(StoryRange, AppliedCharacterStyle)` arm; New/Delete ride
// createCharacterStyle / deleteCharacterStyle. Redefine, groups
// and override markers are honest seams (style-infra roadmap).

import { useObjectField } from "@paged-media/shell";

import { StyleApplyPanel } from "./style-apply";

export function CharacterStylesPanel() {
  // ADR 323 — the applied style is an object-model field on the selection.
  const applied = useObjectField({ path: "appliedCharacterStyle", scope: "content" });
  return (
    <div className="p-0" data-character-styles-panel="ready">
      <StyleApplyPanel
        collection="characterStyles"
        applied={applied}
        family="character"
        itemIcon="panel-character-styles"
        testId="character-styles"
        createOp="createCharacterStyle"
        deleteOp="deleteCharacterStyle"
        newName="New character style"
      />
    </div>
  );
}
