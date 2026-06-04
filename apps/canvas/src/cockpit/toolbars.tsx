// Cockpit — the six mode-specific ContextToolbar left segments
// (styleguide D4; the kit's chrome.jsx ContextToolbar is the
// reference). REAL where the engine delivers (Design's tool pills
// drive the live tool stack; Prepress reads the working profile;
// Export drives the real PDF dialog); honest disabled stubs where
// the backend doesn't exist yet (track changes, data sources,
// approvals) — styled per the kit so the seam is visible, never
// fake-interactive.

import { useState, type ReactNode } from "react";
import {
  Icon,
  notifyExportPdfDialog,
  useDocumentMeta,
  type ModeToolbarProps,
  type PagedEditor,
} from "@paged-media/shell";

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
  onClick?: () => void;
  testId?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      disabled={props.disabled}
      data-cockpit-action={props.testId}
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
        border: props.primary ? "none" : "1px solid var(--chrome-divider)",
        background: props.primary
          ? "var(--pg-primary)"
          : hover && !props.disabled
            ? "var(--hover)"
            : "transparent",
        color: props.primary ? "var(--pg-primary-fg)" : "var(--chrome-menu-text)",
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
        icon="ui-eye"
        testId="preview-toggle"
        onClick={() => editor?.screenMode.togglePreview()}
      >
        Preview
      </Chip>
    </>
  );
}

// ── Content — editing flow (stubs) + the live document name ────

export function ContentToolbar(_props: ModeToolbarProps) {
  const meta = useDocumentMeta();
  return (
    <>
      <Soon icon="ui-history">Track changes</Soon>
      <Soon icon="ui-comment">Comments</Soon>
      <Sep />
      <Soon icon="ui-translate">Language</Soon>
      {meta ? (
        <span className="pg-mono-meta" style={{ marginLeft: 6 }}>
          {meta.documentName || "document"} · {meta.pageCount} pages
        </span>
      ) : null}
    </>
  );
}

// ── Prepress — REAL working-space chip + issue toggles ─────────

export function PrepressToolbar(_props: ModeToolbarProps) {
  const meta = useDocumentMeta();
  const profile = meta?.cmykProfileName ?? "No CMYK profile";
  const active = meta?.cmykProfileActive ?? false;
  return (
    <>
      <Chip icon="ui-target" testId="output-profile" disabled>
        {profile}
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: active
              ? "var(--status-approved)"
              : "var(--status-review)",
          }}
        />
      </Chip>
      <Sep />
      <Soon icon="ui-warn">Show issues</Soon>
      <Soon icon="ui-displays">Separations</Soon>
    </>
  );
}

// ── Data layout — source / generate (stubs) ────────────────────

export function DataToolbar(_props: ModeToolbarProps) {
  return (
    <>
      <Soon icon="ui-database">Connect source</Soon>
      <Soon icon="ui-filter">Filter records</Soon>
      <Sep />
      <Soon icon="ui-bolt">Generate</Soon>
    </>
  );
}

// ── Review — approvals (stubs) ─────────────────────────────────

export function ReviewToolbar(_props: ModeToolbarProps) {
  return (
    <>
      <Soon icon="ui-check">Approve</Soon>
      <Soon icon="ui-return">Request changes</Soon>
      <Sep />
      <Soon icon="ui-history">Compare versions</Soon>
    </>
  );
}

// ── Export — drives the REAL PDF export ────────────────────────

export function ExportToolbar(_props: ModeToolbarProps) {
  const meta = useDocumentMeta();
  return (
    <>
      <Chip
        icon="ui-export"
        primary
        testId="export-pdf"
        disabled={!meta}
        onClick={() => notifyExportPdfDialog("open")}
      >
        Export PDF…
      </Chip>
      <Sep />
      <Soon icon="ui-web">Web</Soon>
      <Soon icon="ui-doc">Print package</Soon>
    </>
  );
}
