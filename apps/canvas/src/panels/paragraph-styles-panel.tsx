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

// SDK Phase 5 / panel-gallery pass — Paragraph Styles panel.
//
// The shared style-manager surface (style-apply.tsx → shell
// ApplyList): applied select + style rows apply through the
// `(StoryRange, AppliedParagraphStyle)` arm; New/Delete ride
// createParagraphStyle / deleteParagraphStyle. Redefine, style
// groups, override "+" markers and next-style chaining are
// honest seams until their engine surfaces land (style-infra
// roadmap).

import { StyleApplyPanel } from "./style-apply";

export function ParagraphStylesPanel() {
  return (
    <div className="p-0" data-paragraph-styles-panel="ready">
      <StyleApplyPanel
        collection="paragraphStyles"
        appliedPath="appliedParagraphStyle"
        scope="content"
        itemIcon="panel-paragraph-styles"
        testId="paragraph-styles"
        createOp="createParagraphStyle"
        deleteOp="deleteParagraphStyle"
        newName="New paragraph style"
      />
    </div>
  );
}
