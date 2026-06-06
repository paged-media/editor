// Cockpit — Stories (Content mode's left panel). REAL story list.
//
// W2.12 — there is no `"stories"` document collection on the wire (it
// isn't in `CollectionName`); the engine surfaces stories through the
// `paged.stories()` script host fn, which returns `StorySummary[]`
// (selfId / characterCount / paragraphCount / overset). We read it via
// `client.executeScript("paged.stories()")` and refetch on every
// Operation-log push — the same snapshot discipline `useCollection`
// follows. Each row shows the story's character + paragraph counts and
// an OVERSET badge (`StorySummary.overset`); clicking sets a content
// selection at the story's head so the canvas scrolls the caret into
// view. The kit's words/approval columns remain seams (no word count
// on the wire; approval needs the collaboration backend).

import { useEffect, useState } from "react";

import {
  CockpitPanelHeader,
  ComingSoon,
  ListRows,
  useCanvasClient,
  useContentSelection,
  type ListRowSpec,
} from "@paged-media/shell";
import type { CanvasClient, StorySummary } from "@paged-media/client";

/** Read the live story list off the script host. `null` until the
 *  first fetch; refetches on mutation / undo / redo / load. */
function useStories(client: CanvasClient): StorySummary[] | null {
  const [stories, setStories] = useState<StorySummary[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const refetch = () => {
      void client
        .executeScript("paged.stories()")
        .then((r) => {
          if (cancelled) return;
          const raw = r.output[0] ?? "[]";
          setStories(JSON.parse(raw) as StorySummary[]);
        })
        .catch(() => {
          if (cancelled) return;
          setStories([]);
        });
    };
    refetch();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied" ||
        msg.kind === "documentLoaded"
      ) {
        refetch();
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [client]);
  return stories;
}

export function StoriesPanel() {
  const client = useCanvasClient();
  const { contentSelection, setContentSelection } = useContentSelection();
  const stories = useStories(client);

  if (stories === null) {
    return (
      <div
        data-stories-panel="loading"
        style={{ overflowY: "auto", height: "100%" }}
      >
        <CockpitPanelHeader title="Stories" />
        <div className="pg-ui-xs" style={{ padding: "10px 14px" }}>
          Loading stories…
        </div>
      </div>
    );
  }

  const activeStoryId = contentSelection?.storyId ?? null;
  const oversetCount = stories.filter((s) => s.overset).length;

  const rows: ListRowSpec[] = stories.map((s, i) => ({
    key: s.selfId,
    icon: "panel-character",
    primary: `Story ${i + 1}`,
    secondary: `${s.characterCount} char${
      s.characterCount === 1 ? "" : "s"
    } · ${s.paragraphCount} ¶ · ${s.selfId}`,
    badge: s.overset ? { label: "overset", tone: "error" } : undefined,
    selected: s.selfId === activeStoryId,
    // Selecting a story = a caret at its head; the canvas scrolls it
    // into view. Honest: this is the same content-selection the text
    // tool drives.
    onClick: () => setContentSelection({ storyId: s.selfId, start: 0, end: 0 }),
  }));

  return (
    <div
      data-stories-panel="ready"
      style={{ overflowY: "auto", height: "100%" }}
    >
      <CockpitPanelHeader
        title="Stories"
        action={<span className="pg-mono-meta">{stories.length}</span>}
      />
      {stories.length === 0 ? (
        <ComingSoon icon="panel-character" title="No stories yet">
          This document carries no text stories. Place a text frame and type to
          start one.
        </ComingSoon>
      ) : (
        <>
          {oversetCount > 0 && (
            <div
              data-stories-overset-summary
              className="pg-ui-xs"
              style={{
                margin: "2px 14px 0",
                color: "var(--status-error)",
              }}
            >
              {oversetCount} overset stor{oversetCount === 1 ? "y" : "ies"}
            </div>
          )}
          <div data-story-list>
            <ListRows rows={rows} />
          </div>
          <div
            className="pg-ui-xs"
            style={{ padding: "0 14px 12px", lineHeight: 1.45 }}
          >
            Word counts and approval state land with the collaboration backend.
          </div>
        </>
      )}
    </div>
  );
}
