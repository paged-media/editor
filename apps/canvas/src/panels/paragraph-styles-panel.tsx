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
