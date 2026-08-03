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

// Cockpit — the six mode-specific ContextToolbar left segments
// (styleguide D4; the kit's chrome.jsx ContextToolbar is the
// reference). REAL where the engine delivers — every pill drives a
// live action against an already-shipped capability:
//
//   • Design   — live tool stack + the screen-mode preview toggle
//                (reflects the real screen mode).
//   • Content  — selection-aware quick-raises of the Character /
//                Paragraph formatting docks; the style-apply tabs;
//                a live caret/range readout (honest-disabled with a
//                tooltip when there is no text selection).
//   • Prepress — the real working-space chip, a live preflight badge
//                (severity counts from the last export), a Validate
//                pill that runs the REAL PDF pipeline, and a Bleed
//                screen-mode toggle (reflects the real screen mode).
//   • Data     — raises the Field-mapping dock (real focus); the
//                source/generate pills are HONEST seams (no data-
//                publishing engine yet).
//   • Review   — raises the Comments dock (real focus); approve /
//                request-changes / compare are HONEST seams (no
//                collaboration backend yet).
//   • Export   — drives the REAL PDF dialog plus the live Page-images
//                and IDML outputs (selects the target + raises the
//                Export Center; the run actions live there, W2.6).
//
// "soon" chips mark the deliberate honest reductions — visible,
// disabled, never fake-interactive (brand honesty rule). A pill is
// only a `Soon` when there is genuinely no backend to drive.

import { useState, type ReactNode } from "react";
import {
  Icon,
  notifyExportPdfDialog,
  useCanvasClient,
  useContentSelection,
  useDocument,
  useDocumentMeta,
  useOptionalCockpitState,
  useScreenMode,
  type ModeToolbarProps,
  type PagedEditor,
} from "@paged-media/shell";

import {
  recordFindings,
  severityCounts,
  usePreflightFindings,
} from "../panels/cockpit/preflight-findings";
import { setSelectedExportTarget } from "../panels/cockpit/export-targets";

// ── tiny shared primitives (kit Pill/Chip styling) ─────────────

function ToolPill(props: {
  icon: string;
  title: string;
  on?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      data-cockpit-action={props.testId}
      data-on={props.on ? "" : undefined}
      onClick={props.onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 30,
        height: 30,
        borderRadius: "var(--radius-md)",
        border: "none",
        background: props.on
          ? "var(--selected-bg)"
          : hover && !props.disabled
            ? "var(--hover)"
            : "transparent",
        color: props.on ? "var(--pg-primary)" : "var(--chrome-icon)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: props.disabled ? "default" : "pointer",
        opacity: props.disabled ? 0.45 : 1,
        flexShrink: 0,
        padding: 0,
      }}
    >
      <Icon name={props.icon} size={17} />
    </button>
  );
}

function Chip(props: {
  icon?: string;
  children: ReactNode;
  disabled?: boolean;
  primary?: boolean;
  on?: boolean;
  title?: string;
  onClick?: () => void;
  testId?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      disabled={props.disabled}
      title={props.title}
      data-cockpit-action={props.testId}
      data-on={props.on ? "" : undefined}
      onClick={props.onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 28,
        padding: "0 11px",
        borderRadius: "var(--radius-md)",
        border: props.primary
          ? "none"
          : props.on
            ? "1px solid var(--pg-primary)"
            : "1px solid var(--chrome-divider)",
        background: props.primary
          ? "var(--pg-primary)"
          : props.on
            ? "var(--selected-bg)"
            : hover && !props.disabled
              ? "var(--hover)"
              : "transparent",
        color: props.primary
          ? "var(--pg-primary-fg)"
          : props.on
            ? "var(--pg-primary)"
            : "var(--chrome-menu-text)",
        fontFamily: "var(--font-sans)",
        fontSize: 12,
        fontWeight: props.primary ? 600 : 400,
        cursor: props.disabled ? "default" : "pointer",
        opacity: props.disabled ? 0.45 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {props.icon ? <Icon name={props.icon} size={14} /> : null}
      {props.children}
    </button>
  );
}

function Sep() {
  return (
    <span
      style={{
        width: 1,
        height: 18,
        background: "var(--chrome-divider)",
        margin: "0 4px",
        flexShrink: 0,
      }}
    />
  );
}

/** "Coming soon" affordance — a stub is visibly a stub. */
function Soon({ children, icon }: { children: ReactNode; icon?: string }) {
  return (
    <Chip icon={icon} disabled>
      {children}
      <span className="pg-mono-meta" style={{ fontSize: 9.5 }}>
        soon
      </span>
    </Chip>
  );
}

const asEditor = (paged: unknown) => paged as PagedEditor | null;

/** Raise a registered panel into the active right dock — activates
 *  the tab if the mode already seeds it, otherwise opens it as a new
 *  closable tab (same surface the panel rail uses). Returns a click
 *  handler + whether that panel is the live active tab, so a pill can
 *  reflect the real dock state. Null when no cockpit is mounted (the
 *  legacy dockview path) — the caller renders the pill disabled. */
function usePanelRaise(panelId: string): {
  raise?: () => void;
  active: boolean;
} {
  const cockpit = useOptionalCockpitState();
  if (!cockpit) return { active: false };
  const active = cockpit.activeTab === panelId;
  return {
    active,
    raise: () => {
      if (cockpit.rightTabs.includes(panelId)) cockpit.activateTab(panelId);
      else cockpit.openPanel(panelId);
    },
  };
}

/** A pill that raises a formatting dock; honest-disabled with an
 *  explanatory tooltip when its precondition (a text selection) is
 *  not met. */
function RaisePill(props: {
  panelId: string;
  icon: string;
  label: string;
  enabled: boolean;
  disabledTitle: string;
  testId: string;
}) {
  const { raise, active } = usePanelRaise(props.panelId);
  const disabled = !props.enabled || !raise;
  return (
    <Chip
      icon={props.icon}
      on={active && !disabled}
      disabled={disabled}
      title={disabled ? props.disabledTitle : props.label}
      testId={props.testId}
      onClick={raise}
    >
      {props.label}
    </Chip>
  );
}

// ── Design — live tool pills + screen-mode preview toggle ──────

const DESIGN_TOOLS: ReadonlyArray<{ id: string; icon: string; title: string }> =
  [
    { id: "paged.tool.select", icon: "tool-select", title: "Select (V)" },
    { id: "paged.tool.type", icon: "tool-type", title: "Type (T)" },
    {
      id: "paged.tool.rectangleFrame",
      icon: "tool-rectangleFrame",
      title: "Rectangle frame (F)",
    },
    { id: "paged.tool.pen", icon: "tool-pen", title: "Pen (P)" },
    { id: "paged.tool.line", icon: "tool-line", title: "Line (\\)" },
  ];

export function DesignToolbar({ paged }: ModeToolbarProps) {
  const editor = asEditor(paged);
  const active = editor?.tool.effectiveTool;
  const screenMode = useScreenMode();
  const previewOn = screenMode.screenMode === "preview";
  return (
    <>
      {DESIGN_TOOLS.map((t) => (
        <ToolPill
          key={t.id}
          icon={t.icon}
          title={t.title}
          on={active === t.id}
          testId={`tool:${t.id}`}
          onClick={() => editor?.tool.setBaseTool(t.id)}
        />
      ))}
      <Sep />
      <Chip
        icon={previewOn ? "ui-eye-off" : "ui-eye"}
        on={previewOn}
        testId="preview-toggle"
        title={previewOn ? "Back to normal view (W)" : "Preview (W)"}
        onClick={() => screenMode.togglePreview()}
      >
        Preview
      </Chip>
    </>
  );
}

// ── Content — selection-aware formatting raises + live readout ──

export function ContentToolbar(_props: ModeToolbarProps) {
  const meta = useDocumentMeta();
  const { contentSelection } = useContentSelection();
  // The Type tool sets a caret/range; with neither, the formatting
  // quick-raises are honestly disabled (nothing to format).
  const hasCaret = contentSelection != null;
  const hasRange =
    contentSelection != null && contentSelection.start !== contentSelection.end;
  const selLabel = !hasCaret
    ? "No text selection"
    : hasRange
      ? "Text selected"
      : "Caret placed";

  return (
    <>
      <RaisePill
        panelId="paged.character"
        icon="panel-character"
        label="Character"
        enabled={hasCaret}
        disabledTitle="Place the caret in text to format characters"
        testId="content-character"
      />
      <RaisePill
        panelId="paged.paragraph"
        icon="panel-paragraph"
        label="Paragraph"
        enabled={hasCaret}
        disabledTitle="Place the caret in text to format paragraphs"
        testId="content-paragraph"
      />
      <Sep />
      <RaisePill
        panelId="paged.paragraph-styles"
        icon="panel-paragraph-styles"
        label="Styles"
        enabled={hasCaret}
        disabledTitle="Place the caret in text to apply a paragraph style"
        testId="content-styles"
      />
      <Sep />
      <span
        className="pg-mono-meta"
        data-cockpit-action="content-selection"
        data-on={hasCaret ? "" : undefined}
        title={selLabel}
        style={{ marginLeft: 2, opacity: hasCaret ? 1 : 0.55 }}
      >
        {selLabel}
      </span>
      {meta ? (
        <span className="pg-mono-meta" style={{ marginLeft: 8 }}>
          {meta.documentName || "document"} · {meta.pageCount} pages
        </span>
      ) : null}
    </>
  );
}

// ── Prepress — REAL working-space chip + live preflight + bleed ─

export function PrepressToolbar(_props: ModeToolbarProps) {
  const meta = useDocumentMeta();
  const client = useCanvasClient();
  const screenMode = useScreenMode();
  const { findings, runCount } = usePreflightFindings(client);
  const [running, setRunning] = useState(false);

  const profile = meta?.cmykProfileName ?? "No CMYK profile";
  const profileActive = meta?.cmykProfileActive ?? false;
  const loaded = meta != null && meta.pageCount > 0;
  const bleedOn = screenMode.screenMode === "bleed";

  const { errors, warnings } = severityCounts(findings ?? null);
  const hasRun = runCount > 0;
  const issueLabel = !hasRun
    ? "Preflight"
    : errors > 0
      ? `${errors} error${errors === 1 ? "" : "s"}`
      : warnings > 0
        ? `${warnings} warning${warnings === 1 ? "" : "s"}`
        : "No issues";
  const issueDot = !hasRun
    ? "var(--status-draft)"
    : errors > 0
      ? "var(--status-error)"
      : warnings > 0
        ? "var(--status-review)"
        : "var(--status-approved)";

  // Validate runs the REAL PDF pipeline; its typed return seeds the
  // shared findings store the Preflight panel + the Issues badge read.
  const validate = async () => {
    if (!loaded || running) return;
    setRunning(true);
    try {
      const result = await client.exportPdf({ standard: "pdf17" });
      recordFindings(result);
    } catch {
      /* surfaced in the Preflight panel; the badge stays as-is */
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Chip
        icon="ui-target"
        testId="output-profile"
        title={
          profileActive ? "Working CMYK profile" : "No working CMYK profile"
        }
        disabled
      >
        {profile}
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: profileActive
              ? "var(--status-approved)"
              : "var(--status-review)",
          }}
        />
      </Chip>
      <Sep />
      <Chip
        icon="ui-warn"
        testId="prepress-validate"
        primary
        disabled={!loaded || running}
        title="Run preflight — the real PDF/X validation pipeline"
        onClick={() => void validate()}
      >
        {running ? "Validating…" : "Validate"}
      </Chip>
      <Chip
        icon="ui-displays"
        testId="prepress-issues"
        title={
          hasRun ? "Last preflight result" : "Run Validate to see findings"
        }
        disabled
      >
        {issueLabel}
        <span
          data-prepress-issue-dot
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: issueDot,
          }}
        />
      </Chip>
      <Sep />
      <Chip
        icon="ui-eye"
        testId="prepress-bleed"
        on={bleedOn}
        title={bleedOn ? "Back to normal view" : "Show the bleed area"}
        onClick={() => screenMode.setScreenMode(bleedOn ? "normal" : "bleed")}
      >
        Bleed
      </Chip>
    </>
  );
}

// ── Data layout — REAL mapping raise + honest source/generate ──

export function DataToolbar(_props: ModeToolbarProps) {
  // All three pills raise the LIVE paged.data bundle panels (the mode's
  // ComingSoon era is over): bindings = field mapping, sources = connect,
  // dataset = the batch-generate catalog.
  const mapping = usePanelRaise("media.paged.data.panel.bindings");
  const sources = usePanelRaise("media.paged.data.panel.sources");
  const dataset = usePanelRaise("media.paged.data.panel.dataset");
  return (
    <>
      <Chip
        icon="ui-database"
        testId="data-mapping"
        on={mapping.active}
        disabled={!mapping.raise}
        title="Field mapping"
        onClick={mapping.raise}
      >
        Field mapping
      </Chip>
      <Sep />
      <Chip
        icon="ui-flow"
        testId="data-sources"
        on={sources.active}
        disabled={!sources.raise}
        title="Connect source"
        onClick={sources.raise}
      >
        Connect source
      </Chip>
      <Chip
        icon="ui-bolt"
        testId="data-generate"
        on={dataset.active}
        disabled={!dataset.raise}
        title="Generate"
        onClick={dataset.raise}
      >
        Generate
      </Chip>
    </>
  );
}

// ── Review — REAL comments raise + honest approvals ────────────

export function ReviewToolbar(_props: ModeToolbarProps) {
  const { raise, active } = usePanelRaise("paged.comments");
  return (
    <>
      <Chip
        icon="ui-comment"
        testId="review-comments"
        on={active}
        disabled={!raise}
        title="Comments"
        onClick={raise}
      >
        Comments
      </Chip>
      <Sep />
      <Soon icon="ui-check">Approve</Soon>
      <Soon icon="ui-return">Request changes</Soon>
      <Soon icon="ui-history">Compare versions</Soon>
    </>
  );
}

// ── Export — drives the REAL PDF / image / IDML outputs ────────

export function ExportToolbar(_props: ModeToolbarProps) {
  const meta = useDocumentMeta();
  const { handle } = useDocument();
  // The image/IDML run actions live in the Export Center; the pills
  // select the target so the centre + inspector switch to it (the
  // live cross-panel store), the canonical "pick what to export"
  // gesture. PDF is one click further — the dialog owns its form.
  return (
    <>
      <Chip
        icon="ui-export"
        primary
        testId="export-pdf"
        disabled={!meta}
        title="Export a print PDF (PDF/X-4)"
        onClick={() => notifyExportPdfDialog("open")}
      >
        Export PDF…
      </Chip>
      <Sep />
      <Chip
        icon="ui-page"
        testId="export-image"
        disabled={!handle}
        title="Set up page-image (PNG) export in the Export Center"
        onClick={() => setSelectedExportTarget("image")}
      >
        Page images
      </Chip>
      {/* IDML export moved to the paged.publish plugin exporter (ADR-022
          Phase 5) — it lives in the Export Center's plugin-exporters section,
          so there's no built-in IDML target chip here anymore. */}
      <Sep />
      <Soon icon="ui-web">Web</Soon>
    </>
  );
}
