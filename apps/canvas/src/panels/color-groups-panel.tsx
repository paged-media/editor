// SDK Phase 5 / panel-gallery pass — Color Groups panel, now LIVE.
//
// Gallery shape: collapsible group rows (chevron + name + count)
// that expand to their member swatches (chips resolved through the
// active CMM via colorPreview), a per-group delete, and the
// dashed "+ New group" — all riding the real
// createColorGroup / editColorGroup / deleteColorGroup ops.
// Filtering the Swatches panel by group stays a follow-up
// affordance (the Swatches grid already renders group headers).

import { useEffect, useState } from "react";

import {
  Icon,
  ToolbarBtn,
  useCanvasClient,
  useCollection,
} from "@paged-media/shell";
import type { ColorGroupSummary, ColorPreview } from "@paged-media/client";

function MemberChip({ swatchId }: { swatchId: string }) {
  const client = useCanvasClient();
  const [preview, setPreview] = useState<ColorPreview | null>(null);
  useEffect(() => {
    let cancelled = false;
    void client
      .colorPreview(swatchId)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, swatchId]);
  return (
    <span
      data-group-member={swatchId}
      title={preview?.name ?? swatchId}
      className="flex items-center gap-2 text-xs py-1"
    >
      <span
        className="w-[18px] h-[18px] rounded-[5px] border border-input shrink-0"
        style={{ background: preview?.rgbHex ?? "var(--pg-muted)" }}
      />
      <span className="truncate">{preview?.name ?? swatchId}</span>
    </span>
  );
}

function GroupRow({
  group,
  onDelete,
}: {
  group: ColorGroupSummary;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div data-group-id={group.selfId} className="px-1">
      <div className="flex items-center gap-2 py-1.5 rounded-[7px]">
        <button
          type="button"
          data-group-toggle
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 flex-1 min-w-0 bg-transparent border-0 cursor-pointer text-left"
        >
          <Icon
            name={open ? "ui-chevron-down" : "ui-chevron-right"}
            size={13}
            style={{ color: "var(--pg-muted-fg)", flexShrink: 0 }}
          />
          <Icon
            name="panel-color-groups"
            size={15}
            style={{ color: "var(--pg-muted-fg)", flexShrink: 0 }}
          />
          <span className="text-xs truncate" style={{ color: "var(--pg-fg)" }}>
            {group.name}
          </span>
          <span className="pg-value text-[10.5px] text-muted-foreground shrink-0">
            {group.members.length} swatch
            {group.members.length === 1 ? "" : "es"}
          </span>
        </button>
        <button
          type="button"
          title="Delete group (swatches stay)"
          data-group-delete
          onClick={onDelete}
          className="w-[22px] h-[22px] rounded flex items-center justify-center bg-transparent border-0 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <Icon name="ui-x" size={12} />
        </button>
      </div>
      {open && (
        <div className="pl-7 pb-1" data-group-members>
          {group.members.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">
              Empty group — assign swatches from the Swatches panel.
            </span>
          ) : (
            group.members.map((m) => <MemberChip key={m} swatchId={m} />)
          )}
        </div>
      )}
    </div>
  );
}

export function ColorGroupsPanel() {
  const client = useCanvasClient();
  const items = useCollection<ColorGroupSummary>("colorGroups");

  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-color-groups-panel="loading"
      >
        Loading color groups…
      </div>
    );
  }

  const onNew = () => {
    void client
      .mutate({
        op: "createColorGroup",
        args: { spec: { selfId: null, name: "New group", members: [] } },
      })
      .catch(() => {});
  };

  const onDelete = (groupId: string) => {
    void client
      .mutate({ op: "deleteColorGroup", args: { groupId } })
      .catch(() => {});
  };

  return (
    <div className="p-2" data-color-groups-panel="ready">
      {items.length === 0 ? (
        <div
          className="p-2 text-xs text-muted-foreground"
          data-empty-color-groups
        >
          No color groups in this document.
        </div>
      ) : (
        <div data-color-group-list>
          {items.map((group) => (
            <GroupRow
              key={group.selfId}
              group={group}
              onDelete={() => onDelete(group.selfId)}
            />
          ))}
        </div>
      )}
      <div className="px-1 pt-2">
        <ToolbarBtn
          icon="ui-plus"
          label="New group"
          onClick={onNew}
          testId="new-color-group"
        />
      </div>
    </div>
  );
}
