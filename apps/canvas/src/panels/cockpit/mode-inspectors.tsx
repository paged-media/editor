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

// Cockpit — the single RIGHT inspectors for the non-design modes
// (kit right-panels.jsx: StoryInspector, PreflightInspector/Output
// Readiness, ReviewInspector). Kit shape, real data where the wire
// carries it, visible seams elsewhere.

import {
  CockpitPanelHeader,
  CockpitSection,
  ComingSoon,
  Icon,
  StatusPill,
  useCollection,
  useDocumentMeta,
  useDocumentStats,
  type PanelProps,
} from "@paged-media/shell";
import type { FontSummary, LinkSummary } from "@paged-media/client";

/** Low-res convention shared with Preflight/Health — placements below
 *  this effective PPI warn (the editor's "warn, not fail" floor). */
const LOW_RES_PPI = 150;

/** Content mode — story inspector. The live story count is real;
 *  per-story words/risk/approval await the stories collection +
 *  collaboration backend. */
export function StoryInspectorPanel(_props: PanelProps) {
  const stats = useDocumentStats();
  return (
    <div
      data-story-inspector-panel
      style={{ overflowY: "auto", height: "100%" }}
    >
      <CockpitPanelHeader
        title="Story"
        action={
          stats ? (
            <span className="pg-mono-meta">{stats.stories} stories</span>
          ) : undefined
        }
      />
      <ComingSoon icon="panel-paragraph" title="Story status coming soon">
        Words, overset risk, language expansion and approval state land with the
        engine's stories collection and the collaboration backend.
      </ComingSoon>
    </div>
  );
}

/** A single output-readiness check. `pass` null = the data source
 *  isn't wired (honest seam, "soon"); true/false = a real verdict. */
interface ReadinessCheck {
  key: string;
  label: string;
  pass: boolean | null;
  /** Mono detail shown on the right when the check has run. */
  detail?: string;
}

/** Prepress mode — output readiness (kit PreflightInspector).
 *
 *  W2.6 (Full-Green) — every row is honest-or-live. LIVE rows read the
 *  same W0.6 wire summaries the Health/Preflight panels consume:
 *  CMYK working space (`meta.cmykProfileActive`), missing fonts
 *  (`FontSummary.isMissing`), missing links + low-res placements
 *  (`LinkSummary.status` / `.effectivePpi`). Bleed stays an HONEST
 *  seam until the engine grows a bleed-coverage accessor. */
export function OutputReadinessPanel(_props: PanelProps) {
  const meta = useDocumentMeta();
  const fonts = useCollection<FontSummary>("fonts");
  const links = useCollection<LinkSummary>("links");
  const loaded = meta != null && meta.pageCount > 0;
  const cmyk = meta?.cmykProfileActive ?? false;

  const missingFonts = fonts ? fonts.filter((f) => f.isMissing).length : null;
  const missingLinks = links
    ? links.filter((l) => l.status === "missing").length
    : null;
  const lowRes = links
    ? links.filter(
        (l) => l.effectivePpi != null && l.effectivePpi < LOW_RES_PPI,
      ).length
    : null;

  const checks: ReadinessCheck[] = [
    {
      key: "cmyk",
      label: "CMYK working space active",
      pass: loaded ? cmyk : null,
    },
    {
      key: "fonts",
      label: "All fonts available",
      pass: missingFonts == null ? null : missingFonts === 0,
      detail:
        missingFonts == null
          ? undefined
          : missingFonts === 0
            ? "ok"
            : `${missingFonts} missing`,
    },
    {
      key: "links",
      label: "All links present",
      pass: missingLinks == null ? null : missingLinks === 0,
      detail:
        missingLinks == null
          ? undefined
          : missingLinks === 0
            ? "ok"
            : `${missingLinks} missing`,
    },
    {
      key: "ppi",
      label: `Images ≥ ${LOW_RES_PPI} PPI`,
      pass: lowRes == null ? null : lowRes === 0,
      detail:
        lowRes == null
          ? undefined
          : lowRes === 0
            ? "ok"
            : `${lowRes} low-res`,
    },
    // HONEST seam — no bleed-coverage accessor on the wire yet.
    { key: "bleed", label: "Bleed 3 mm", pass: null },
  ];

  // The X-4 verdict is the AND of the live checks (seams don't block).
  const liveChecks = checks.filter((c) => c.pass != null);
  const allPass = liveChecks.every((c) => c.pass === true);

  return (
    <div
      data-output-readiness-panel
      style={{ overflowY: "auto", height: "100%" }}
    >
      <CockpitPanelHeader
        title="Output readiness"
        action={
          loaded ? (
            <StatusPill tone={allPass ? "ready" : "warn"} testId="readiness-x4">
              {allPass ? "PDF/X-4 ready" : "Not ready"}
            </StatusPill>
          ) : undefined
        }
      />
      <CockpitSection title="PDF/X-4 checklist">
        {checks.map((c) => (
          <ReadinessRow key={c.key} check={c} />
        ))}
      </CockpitSection>
      <CockpitSection title="Color" defaultOpen={false}>
        <span className="pg-ui-xs" style={{ lineHeight: 1.45 }}>
          Profile, rendering intent and ink limits read from the document's
          color settings — see the Color settings panel.
        </span>
      </CockpitSection>
    </div>
  );
}

function ReadinessRow({ check }: { check: ReadinessCheck }) {
  const seam = check.pass == null;
  return (
    <div
      data-readiness-row={check.key}
      data-readiness-pass={seam ? undefined : check.pass ? "true" : "false"}
      data-seam={seam ? "" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "6px 0",
        opacity: seam ? 0.55 : 1,
      }}
    >
      {seam ? (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "var(--status-draft)",
            marginLeft: 3,
            marginRight: 4,
            flexShrink: 0,
          }}
        />
      ) : (
        <Icon
          name={check.pass ? "ui-check" : "ui-x"}
          size={14}
          style={{
            color: check.pass
              ? "var(--status-approved)"
              : "var(--status-error)",
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ fontSize: 12.5, fontFamily: "var(--font-sans)" }}>
        {check.label}
      </span>
      <span className="pg-mono-meta" style={{ marginLeft: "auto" }}>
        {seam ? "soon" : (check.detail ?? "")}
      </span>
    </div>
  );
}

/** Review mode — approval inspector. Approvals + version history
 *  await the collaboration backend. */
export function ReviewInspectorPanel(_props: PanelProps) {
  return (
    <div
      data-review-inspector-panel
      style={{ overflowY: "auto", height: "100%" }}
    >
      <CockpitPanelHeader title="Review" />
      <ComingSoon icon="ui-pin" title="Approvals coming soon">
        Approve, request changes and version compare land with the collaboration
        backend.
      </ComingSoon>
    </div>
  );
}
