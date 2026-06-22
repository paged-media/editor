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

// SDK Phase 5 / gallery pixel-parity — Color Groups panel (deep1
// `ColorGroups` card), LIVE: group rows (chevron + glyph + semibold
// name + count) with the member swatch chips inline below (22px,
// resolved through the active CMM via colorPreview), a per-group
// delete, and the full-width dashed "+ New group" — riding
// createColorGroup / deleteColorGroup. Member assignment lives in
// the Swatches grid (editColorGroup).

import { useEffect, useState } from "react";

import { Icon, useCanvasClient, useCollection } from "@paged-media/shell";
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
      className="h-[22px] w-[22px] shrink-0 rounded-[4px] border border-input"
      style={{ background: preview?.rgbHex ?? "var(--pg-muted)" }}
    />
  );
}

function GroupRow({
  group,
  onDelete,
}: {
  group: ColorGroupSummary;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div data-group-id={group.selfId} className="mb-[10px]">
      <div className="flex items-center gap-[7px]">
        <button
          type="button"
          data-group-toggle
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-[7px] border-0 bg-transparent text-left"
        >
          <Icon
            name={open ? "ui-chevron-down" : "ui-chevron-right"}
            size={12}
            style={{ color: "var(--pg-muted-fg)", flexShrink: 0 }}
          />
          <Icon
            name="panel-color-groups"
            size={14}
            style={{ color: "var(--pg-muted-fg)", flexShrink: 0 }}
          />
          <span
            className="flex-1 truncate text-[12.5px] font-semibold"
            style={{ color: "var(--pg-fg)" }}
          >
            {group.name}
          </span>
          <span className="text-[10px]" style={{ color: "var(--pg-muted-fg)" }}>
            {group.members.length}
          </span>
        </button>
        <button
          type="button"
          title="Delete group (swatches stay)"
          data-group-delete
          onClick={onDelete}
          className="flex h-[20px] w-[20px] cursor-pointer items-center justify-center rounded border-0 bg-transparent"
          style={{ color: "var(--pg-muted-fg)" }}
        >
          <Icon name="ui-x" size={11} />
        </button>
      </div>
      {open && (
        <div
          className="mt-[6px] flex flex-wrap gap-1 pl-[22px]"
          data-group-members
        >
          {group.members.length === 0 ? (
            <span
              className="text-xs italic"
              style={{ color: "var(--pg-muted-fg)" }}
            >
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
    <div className="px-3 py-[10px]" data-color-groups-panel="ready">
      {items.length === 0 ? (
        <div
          className="pb-2 text-xs text-muted-foreground"
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
      <button
        type="button"
        data-toolbar-btn="new-color-group"
        onClick={onNew}
        className="flex h-[30px] w-full cursor-pointer items-center justify-center gap-[6px] rounded-[7px] border border-dashed bg-transparent text-xs"
        style={{
          borderColor: "var(--chrome-divider)",
          color: "var(--pg-muted-fg)",
        }}
      >
        <Icon name="ui-plus" size={13} /> New group
      </button>
    </div>
  );
}
