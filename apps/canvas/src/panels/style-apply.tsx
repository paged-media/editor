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

// Panel-gallery pass — the shared style-manager surface behind
// Character / Paragraph / Object (and readonly Cell / Table)
// Styles. Wraps the shell's `ApplyList` archetype with the live
// wire: items from the named collection, the applied style from
// the `applied*Style` binding, apply through the same
// SetElementProperty arm the old collection-select used, and
// New / Delete through the collection-mutation ops. Redefine is
// an honest seam (no engine op yet) — ApplyList renders the
// handlerless button disabled.
//
// ADR 323 — the applied style is an object-model field: read/written
// through `host.objects` (`appliedParagraphStyle` / `…Character…` /
// `…Object…` are `ref` rows; one batch over a multi-selection = one undo
// step), and the list sits in an `ObjectFieldFrame` so "Bind to data…"
// binds the applied style. New / Delete stay collection ops (they make
// and remove STYLES, not set a property).

import { useCallback, useEffect, useState } from "react";

import {
  ApplyList,
  ObjectFieldFrame,
  useCanvasClient,
  useObjectField,
} from "@paged-media/shell";
import type {
  CollectionName,
  Mutation,
  PropertyPath,
  Value,
} from "@paged-media/client";

interface StyleRow {
  selfId: string;
  name: string;
  basedOn?: string | null;
}

type CreateStyleOp =
  | "createParagraphStyle"
  | "createCharacterStyle"
  | "createObjectStyle";
type DeleteStyleOp =
  | "deleteParagraphStyle"
  | "deleteCharacterStyle"
  | "deleteObjectStyle";

export interface StyleApplyPanelProps {
  /** Document collection feeding the list. */
  collection: CollectionName;
  /** The applied-entity PropertyPath (e.g. appliedParagraphStyle). */
  appliedPath: PropertyPath;
  /** Binding scope — content for text styles, element for object. */
  scope: "content" | "element";
  /** The panel's row glyph. */
  itemIcon: string;
  /** ApplyList's `data-apply-list` hook. */
  testId: string;
  /** createXStyle / deleteXStyle mutation op names. */
  createOp: CreateStyleOp;
  deleteOp: DeleteStyleOp;
  /** Default name for a freshly created style. */
  newName: string;
}

function unwrapAppliedId(v: Value | null): string {
  if (!v) return "";
  if (v.type === "text") return (v.value as string) ?? "";
  return "";
}

export function StyleApplyPanel({
  collection,
  appliedPath,
  scope,
  itemIcon,
  testId,
  createOp,
  deleteOp,
  newName,
}: StyleApplyPanelProps) {
  const client = useCanvasClient();
  const applied = useObjectField({ path: appliedPath, scope });
  const appliedId = unwrapAppliedId(applied.value);
  const onCommit = applied.onCommit;

  const [items, setItems] = useState<StyleRow[]>([]);
  const refresh = useCallback(() => {
    void client
      .collection<StyleRow>(collection)
      .then((rows) => setItems([...rows]))
      .catch(() => setItems([]));
  }, [client, collection]);

  useEffect(() => {
    refresh();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "documentLoaded" ||
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        refresh();
      }
    });
    return off;
  }, [client, refresh]);

  const apply = onCommit
    ? (selfId: string) => {
        onCommit({ type: "text", value: selfId } as Value);
      }
    : undefined;

  const onNew = () => {
    void client
      .mutate({ op: createOp, args: { name: newName } } as Mutation)
      .catch(() => {});
  };

  // Delete removes the style highlighted in the list (the applied
  // one); without an applied style there is nothing to target.
  const onDelete = appliedId
    ? () => {
        void client
          .mutate({ op: deleteOp, args: { styleId: appliedId } } as Mutation)
          .catch(() => {});
      }
    : undefined;

  return (
    <ObjectFieldFrame field={applied} data-style-apply={collection}>
      <ApplyList
        appliedId={appliedId}
        groups={[{ items }]}
        itemIcon={itemIcon}
        collection={collection}
        onApply={apply}
        onNew={onNew}
        onDelete={onDelete}
        testId={testId}
      />
    </ObjectFieldFrame>
  );
}
