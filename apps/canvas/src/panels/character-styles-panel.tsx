// SDK Phase 5 / panel-gallery pass — Character Styles panel.
//
// The shared style-manager surface (style-apply.tsx → shell
// ApplyList): applied select + style rows apply through the
// `(StoryRange, AppliedCharacterStyle)` arm; New/Delete ride
// createCharacterStyle / deleteCharacterStyle. Redefine, groups
// and override markers are honest seams (style-infra roadmap).

import { StyleApplyPanel } from "./style-apply";

export function CharacterStylesPanel() {
  return (
    <div className="p-0" data-character-styles-panel="ready">
      <StyleApplyPanel
        collection="characterStyles"
        appliedPath="appliedCharacterStyle"
        scope="content"
        itemIcon="panel-character-styles"
        testId="character-styles"
        createOp="createCharacterStyle"
        deleteOp="deleteCharacterStyle"
        newName="New character style"
      />
    </div>
  );
}
