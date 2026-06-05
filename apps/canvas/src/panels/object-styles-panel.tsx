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
