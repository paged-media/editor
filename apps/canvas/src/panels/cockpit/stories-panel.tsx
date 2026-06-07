// Cockpit — Stories (Content mode's left panel). REAL story list +
// per-story field inspector.
//
// W3.A2 — `"stories"` is a real document collection on the wire (it
// joined `CollectionName`), so the panel reads it through
// `useCollection<StorySummary>("stories")` — the same snapshot
// discipline (refetch on every Operation push) every other collection
// panel follows. Each row shows the story's character + paragraph
// counts and an OVERSET badge (`StorySummary.overset`); clicking sets a
// content selection at the story's head so the canvas scrolls the caret
// into view AND opens the per-story FIELD INSPECTOR below the list.
//
// W2.7 — the field inspector (matrix gaps 9/10). The inspector reads
// from the SAME `StorySummary` the row binds to — so it stays live on
// every document change (the collection refetches on
// mutation/undo/redo/load). The honest read surface for a story on the
// current wire is exactly four fields: `selfId`, `characterCount`,
// `paragraphCount`, `overset`. Everything richer the kit's inspector
// wants — the applied-frames chain / threading topology, word count,
// and first-paragraph preview — has NO story-keyed read on the wire, so
// each is rendered as an HONEST SEAM that names the missing read
// (these become the W2.7 core follow-ups). Renaming a story has no
// Operation either (`RenameStory` is absent from the Mutation set), so
// the inspector is read-only by design; the only action is the
// row-click caret-at-head selection, which already exists.

import { useEffect, useState } from "react";

import {
  CockpitPanelHeader,
  ComingSoon,
  ListRows,
  StatusPill,
  useCollection,
  useContentSelection,
  type ListRowSpec,
} from "@paged-media/shell";
import type { StorySummary } from "@paged-media/client";

export function StoriesPanel() {
  const { contentSelection, setContentSelection } = useContentSelection();
  const stories = useCollection<StorySummary>("stories");

  // The inspector targets a story by id. Seed from / follow the content
  // selection so the canvas caret and the inspector agree, but keep a
  // local mirror so a click selects even when no caret has landed yet.
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  useEffect(() => {
    if (contentSelection?.storyId) setInspectedId(contentSelection.storyId);
  }, [contentSelection?.storyId]);

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

  const activeStoryId = inspectedId ?? contentSelection?.storyId ?? null;
  const oversetCount = stories.filter((s) => s.overset).length;
  // The inspected story — looked up by id on EVERY render off the live
  // collection, so its counts/overset track document edits without a
  // local copy going stale.
  const inspected = stories.find((s) => s.selfId === activeStoryId) ?? null;
  const inspectedIndex = inspected
    ? stories.findIndex((s) => s.selfId === inspected.selfId)
    : -1;

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
    // into view AND opens the inspector. Honest: this is the same
    // content-selection the text tool drives.
    onClick: () => {
      setInspectedId(s.selfId);
      setContentSelection({ storyId: s.selfId, start: 0, end: 0 });
    },
  }));

  return (
    <div
      data-stories-panel="ready"
      style={{
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        height: "100%",
      }}
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
          {inspected && (
            <StoryInspector
              story={inspected}
              index={inspectedIndex >= 0 ? inspectedIndex : 0}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Per-story field inspector (W2.7, gaps 9/10). REAL reads off
 *  `StorySummary`; the richer kit fields are honest seams that name the
 *  missing wire read. */
function StoryInspector({
  story,
  index,
}: {
  story: StorySummary;
  index: number;
}) {
  return (
    <div
      data-story-inspector={story.selfId}
      style={{
        borderTop: "1px solid var(--pg-border)",
        margin: "4px 0 0",
        padding: "12px 14px 16px",
        background: "var(--chrome-panel-bg)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 9,
        }}
      >
        <span className="pg-label">Story {index + 1}</span>
        <StatusPill
          tone={story.overset ? "error" : "ready"}
          testId="story-overset-status"
        >
          {story.overset ? "Overset" : "Fits"}
        </StatusPill>
      </div>

      {/* REAL — the four honest StorySummary fields. */}
      <Field label="Story id" value={story.selfId} mono testId="story-self-id" />
      <Field
        label="Characters"
        value={String(story.characterCount)}
        mono
        testId="story-char-count"
      />
      <Field
        label="Paragraphs"
        value={String(story.paragraphCount)}
        mono
        testId="story-para-count"
      />
      <Field
        label="Overset"
        value={story.overset ? "yes" : "no"}
        mono
        testId="story-overset"
      />

      {/* HONEST SEAMS — no story-keyed read on the current wire. Each
          names the read a core follow-up must add. */}
      <div
        style={{
          height: 1,
          background: "var(--pg-border)",
          margin: "10px 0 9px",
        }}
      />
      <Seam
        label="Frame chain"
        testId="story-seam-frame-chain"
        note="No story→frame map on the wire (StorySummary carries no frame ids; nextTextFrame/previousTextFrame are reachable only from a known frame). Needs a frameChain accessor keyed by story id."
      />
      <Seam
        label="Words"
        testId="story-seam-words"
        note="No word count on the wire (StorySummary has characterCount only). Needs a wordCount field or a story-text read to tokenise."
      />
      <Seam
        label="First paragraph"
        testId="story-seam-preview"
        note="No story-text read on the wire. Needs a storyText / paragraphPreview accessor keyed by story id."
      />

      <div
        className="pg-ui-xs"
        style={{ marginTop: 11, lineHeight: 1.45 }}
        data-story-inspector-footer
      >
        Renaming, approval, and comments land with the collaboration backend —
        a story carries no rename Operation on the wire today.
      </div>
    </div>
  );
}

/** One real key/value row in the inspector. */
function Field({
  label,
  value,
  mono,
  testId,
}: {
  label: string;
  value: string;
  mono?: boolean;
  testId: string;
}) {
  return (
    <div
      data-story-field={testId}
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        padding: "2px 0",
      }}
    >
      <span className="pg-ui-xs" style={{ whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span
        className={mono ? "pg-value" : undefined}
        data-story-field-value={testId}
        style={{
          fontSize: 11.5,
          fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
          color: "var(--pg-fg)",
          textAlign: "right",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** An honest seam row — the field the kit's inspector wants, marked as
 *  awaiting a named wire read rather than guessed. `title` carries the
 *  missing-read note for the hover + screen readers. */
function Seam({
  label,
  note,
  testId,
}: {
  label: string;
  note: string;
  testId: string;
}) {
  return (
    <div
      data-story-seam={testId}
      title={note}
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        padding: "2px 0",
      }}
    >
      <span className="pg-ui-xs" style={{ whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span
        className="pg-ui-xs"
        style={{ fontStyle: "italic", color: "var(--pg-muted-fg)" }}
      >
        awaits wire read
      </span>
    </div>
  );
}
