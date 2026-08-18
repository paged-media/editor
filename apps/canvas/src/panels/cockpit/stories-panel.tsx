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
// current wire is four `StorySummary` fields (`selfId`,
// `characterCount`, `paragraphCount`, `overset`) plus the
// `requestFrameChain` story→frame read (v38 door, consumed by the
// row-click select/reveal below). What's still richer than the wire —
// word count and first-paragraph preview — stays rendered as an HONEST
// SEAM that names the missing read (these become the W2.7 core
// follow-ups). Renaming a story has no Operation either (`RenameStory`
// is absent from the Mutation set), so the inspector is read-only by
// design.
//
// U6 — clicking a row now ALSO element-selects the story's first frame
// (via `client.frameChain`) and fit-navigates the camera to it, so the
// panel actually takes you to the story on canvas — in addition to the
// caret-at-head content selection the text tool drives.

import { useEffect, useState } from "react";

import {
  CockpitPanelHeader,
  ComingSoon,
  ListRows,
  StatusPill,
  useCamera,
  useCanvasClient,
  useCollection,
  useContentSelection,
  useDocument,
  useSelection,
  type ListRowSpec,
} from "@paged-media/shell";
import type { ElementId, StorySummary } from "@paged-media/client";

import { layoutPages, fitCamera } from "../../ui/layout";
import { useAnimatedCamera } from "../../ui/useAnimatedCamera";

export function StoriesPanel() {
  const client = useCanvasClient();
  const { handle } = useDocument();
  const { contentSelection, setContentSelection } = useContentSelection();
  const { setElementSelection, setElementGeometry } = useSelection();
  const { camera, setCamera, viewportSize } = useCamera();
  const animateCamera = useAnimatedCamera(camera, setCamera);
  const stories = useCollection<StorySummary>("stories");

  // U6 — resolve the story's frame chain (v38 `requestFrameChain`),
  // element-select its FIRST frame (the tree-panel selection idiom:
  // worker-first, then mirror + geometry so overlays key on it), and
  // reveal the frame by fitting the camera onto its doc-space rect
  // (page rect from the same vertical-stack layout math the canvas
  // uses + the frame's page-local bounds). Best-effort: a wire
  // failure must not break the caret-at-head row click.
  const revealFirstFrame = async (storyId: string) => {
    try {
      const links = await client.frameChain(storyId);
      const first = links[0];
      if (!first) return;
      const id: ElementId = { kind: "textFrame", id: first.frameId };
      const applied = await client.setElementSelection([id], "replace");
      setElementSelection(applied);
      const geoms = await client.elementGeometry(applied);
      setElementGeometry(geoms);
      const g = geoms[0];
      if (!g || !g.pageId || !handle) return;
      const pageIndex = handle.pageIds.indexOf(g.pageId);
      if (pageIndex < 0) return;
      const pageRect = layoutPages(handle.pageSizesPt)[pageIndex];
      if (!pageRect) return;
      const [top, left, bottom, right] = g.bounds;
      const frameRect = {
        x: pageRect.x + left,
        y: pageRect.y + top,
        w: Math.max(right - left, 1),
        h: Math.max(bottom - top, 1),
      };
      const [vw, vh] = viewportSize;
      if (vw <= 0 || vh <= 0) return;
      const fit = fitCamera(vw, vh, frameRect);
      // A small frame would fit at an absurd zoom — cap at 200% and
      // keep the frame centred (same centring arithmetic as fitCamera).
      const scale = Math.min(fit.scale, 2);
      animateCamera(
        scale === fit.scale
          ? fit
          : {
              scale,
              tx: (vw - frameRect.w * scale) / 2 - frameRect.x * scale,
              ty: (vh - frameRect.h * scale) / 2 - frameRect.y * scale,
            },
      );
    } catch {
      // Select/reveal is additive — swallow and keep the caret click.
    }
  };

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
    // Selecting a story = a caret at its head (the same
    // content-selection the text tool drives) + opens the inspector.
    // U6: ALSO element-select the chain's first frame and fit the
    // camera onto it so the click lands you at the story on canvas.
    onClick: () => {
      setInspectedId(s.selfId);
      setContentSelection({ storyId: s.selfId, start: 0, end: 0 });
      void revealFirstFrame(s.selfId);
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
          names the read a core follow-up must add. (The frame chain is
          no longer a seam: `requestFrameChain` is a real story→frame
          read, consumed by the row-click select/reveal.) */}
      <div
        style={{
          height: 1,
          background: "var(--pg-border)",
          margin: "10px 0 9px",
        }}
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
