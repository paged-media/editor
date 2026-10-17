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

// SDK Phase 5 / panel-gallery pass — Index panel.
//
// Gallery list shape over every `<Topic>` (flattened — nested
// `<Topic>` surfaces as one entry per Self for v1) plus Generate Index
// (core ADR 168, protocol 72): the engine writes the index into a story,
// replacing its text, as InDesign's Replace Existing Index does. The
// story is the one holding the text cursor, so the panel asks for one
// rather than guessing which story is the index.

import { useState } from "react";
import {
  ListRows,
  useCanvasClient,
  useCollection,
  useContentSelection,
} from "@paged-media/shell";
import type { IndexTopicSummary } from "@paged-media/client";

export function IndexPanel() {
  const items = useCollection<IndexTopicSummary>("indexTopics");
  const client = useCanvasClient();
  const { contentSelection } = useContentSelection();
  const [failed, setFailed] = useState<string | null>(null);
  // A story's body text, not a table cell's: the index is a story.
  const target =
    contentSelection && !contentSelection.cell ? contentSelection.storyId : null;
  const generate = () => {
    if (!target) return;
    setFailed(null);
    void client
      .mutate({ op: "generateIndex", args: { storyId: target } })
      .catch((err: unknown) =>
        setFailed(err instanceof Error ? err.message : String(err)),
      );
  };
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-index-panel="loading"
      >
        Loading index…
      </div>
    );
  }
  return (
    <div data-index-panel="ready">
      {items.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground" data-empty-index>
          No index topics in this document.
        </div>
      ) : (
        <div data-index-topic-list>
          <ListRows
            search={items.length > 8}
            searchPlaceholder="Filter topics"
            rows={items.map((t) => ({
              key: t.selfId,
              icon: "panel-index",
              primary: t.name,
              secondary: t.sortOrder ?? undefined,
            }))}
          />
        </div>
      )}
      <div className="px-3 pb-3">
        <button
          type="button"
          disabled={!target}
          onClick={generate}
          data-generate-index
          title={
            target
              ? "Generate the index into the story with the text cursor (its text is replaced)"
              : "Place the text cursor in the story that will hold the index"
          }
          className="w-full text-xs h-[30px] rounded-[7px] border text-muted-foreground disabled:opacity-55"
          style={{ borderColor: "var(--chrome-divider)" }}
        >
          + Generate index
        </button>
        {failed ? (
          <div className="pt-2 text-xs text-muted-foreground" data-generate-index-error>
            {failed}
          </div>
        ) : null}
      </div>
    </div>
  );
}
