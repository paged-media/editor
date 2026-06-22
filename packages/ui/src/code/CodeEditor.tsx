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

// CodeEditor — the host-provided code-editor widget (paged.web W-04).
// Line numbers, light syntax highlighting (HTML + CSS), a diagnostics
// gutter (severity dots + inline squiggles), value/onChange wiring and
// a read-only mode. Lives in the HOST'S UI package so every
// scripting-adjacent plugin shares ONE editor and the host owns the
// (zero) dependency — the editor tree has no CodeMirror/Prism/Shiki,
// and the brand line forbids adding one for two textareas, so this is
// a self-contained textarea-over-highlighted-pre overlay.
//
// The props shape is `CodeEditorProps` from `@paged-media/plugin-api`
// (vendored here as a structural twin so `@paged-media/ui` keeps no
// plugin-api dependency — the editor asserts the match at the
// injection site in main.tsx, exactly like the panel contract). A
// bundle authors against `host.widgets.CodeEditor` and gets THIS where
// the host injects it, or a plain textarea where it doesn't.

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { highlight, type CodeLanguage } from "./highlight";

export interface CodeEditorDiagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  /** 1-based line. */
  line: number;
}

export interface CodeEditorProps {
  value: string;
  onChange(next: string): void;
  language?: CodeLanguage;
  diagnostics?: readonly CodeEditorDiagnostic[];
  readOnly?: boolean;
  minHeight?: number;
  ariaLabel?: string;
}

const FONT = "12px/1.5 var(--font-mono, monospace)";
const PAD = 8;
const GUTTER_W = 40; // line-number column
const MARK_W = 14; // diagnostics dot column

// Token-class → colour. Injected once (idempotent by id) so the
// highlighter's spans resolve in both themes without hardcoded hex.
const HIGHLIGHT_CSS = `
.pg-code-editor .code-tag { color: var(--pg-primary); }
.pg-code-editor .code-attr { color: var(--status-info); }
.pg-code-editor .code-string { color: var(--status-approved); }
.pg-code-editor .code-comment { color: var(--pg-muted-fg); font-style: italic; }
.pg-code-editor .code-selector { color: var(--pg-primary); }
.pg-code-editor .code-prop { color: var(--status-info); }
.pg-code-editor .code-value { color: var(--pg-fg); }
.pg-code-editor .code-squiggle {
  text-decoration: underline wavy var(--status-error);
  text-decoration-skip-ink: none;
}
.pg-code-editor .code-squiggle-warning {
  text-decoration-color: var(--status-review);
}
`;

const DOT: Record<CodeEditorDiagnostic["severity"], string> = {
  error: "var(--status-error)",
  warning: "var(--status-review)",
  info: "var(--status-info)",
};

let cssInjected = false;
function ensureCss(): void {
  if (cssInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.dataset.pgCodeEditor = "1";
  el.textContent = HIGHLIGHT_CSS;
  document.head.appendChild(el);
  cssInjected = true;
}

export function CodeEditor({
  value,
  onChange,
  language = "text",
  diagnostics = [],
  readOnly = false,
  minHeight = 96,
  ariaLabel,
}: CodeEditorProps) {
  ensureCss();
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const id = useId();

  const lines = value.split("\n");
  const lineCount = Math.max(lines.length, 1);

  // Per-line worst severity (for the gutter dots) + tooltip text.
  const byLine = new Map<number, CodeEditorDiagnostic>();
  for (const d of diagnostics) {
    const ln = Math.min(Math.max(d.line, 1), lineCount);
    const prev = byLine.get(ln);
    if (!prev || rank(d.severity) > rank(prev.severity)) byLine.set(ln, d);
  }

  // Keep the highlighted underlay scroll-synced with the textarea.
  useLayoutEffect(() => {
    if (preRef.current) preRef.current.scrollTop = scrollTop;
  }, [scrollTop, value]);

  const codeStyle: CSSProperties = {
    margin: 0,
    font: FONT,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    padding: PAD,
    boxSizing: "border-box",
    tabSize: 2,
  };

  return (
    <div
      className="pg-code-editor"
      data-code-editor={language}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `${MARK_W}px ${GUTTER_W}px 1fr`,
        minHeight,
        font: FONT,
        color: "var(--pg-fg)",
        background: "var(--pg-bg)",
        border: "1px solid var(--pg-border)",
        borderRadius: "var(--radius-sm, 4px)",
        overflow: "hidden",
      }}
    >
      {/* diagnostics dot gutter */}
      <div
        aria-hidden
        data-code-gutter-marks
        style={{
          overflow: "hidden",
          paddingTop: PAD,
          background: "var(--pg-bg)",
        }}
      >
        <div style={{ transform: `translateY(${-scrollTop}px)` }}>
          {Array.from({ length: lineCount }, (_, i) => {
            const d = byLine.get(i + 1);
            return (
              <div
                key={i}
                data-code-mark={d ? d.severity : undefined}
                title={d ? `${d.severity}: ${d.message}` : undefined}
                style={{
                  height: "1.5em",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {d && (
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "var(--radius-full, 999px)",
                      background: DOT[d.severity],
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* line-number gutter */}
      <div
        aria-hidden
        data-code-gutter-lines
        style={{
          overflow: "hidden",
          paddingTop: PAD,
          paddingRight: 6,
          textAlign: "right",
          color: "var(--pg-muted-fg)",
          font: FONT,
          fontVariantNumeric: "tabular-nums",
          borderRight: "1px solid var(--pg-border)",
          background: "var(--pg-bg)",
          userSelect: "none",
        }}
      >
        <div style={{ transform: `translateY(${-scrollTop}px)` }}>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} style={{ height: "1.5em" }}>
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* code cell: highlighted underlay + transparent textarea */}
      <div style={{ position: "relative" }}>
        <pre
          ref={preRef}
          aria-hidden
          data-code-underlay
          style={{
            ...codeStyle,
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            color: "var(--pg-fg)",
            pointerEvents: "none",
          }}
          // Highlighted source: the regex tokenizer escapes every
          // token, so this is safe to inject.
          dangerouslySetInnerHTML={{
            __html: highlightWithSquiggles(value, language, byLine),
          }}
        />
        <textarea
          ref={taRef}
          id={id}
          data-code-input
          spellCheck={false}
          readOnly={readOnly}
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          style={{
            ...codeStyle,
            position: "relative",
            width: "100%",
            height: "100%",
            minHeight,
            resize: "vertical",
            border: "none",
            outline: "none",
            background: "transparent",
            color: "transparent",
            caretColor: "var(--pg-fg)",
            overflow: "auto",
          }}
        />
      </div>
    </div>
  );
}

function rank(s: CodeEditorDiagnostic["severity"]): number {
  return s === "error" ? 3 : s === "warning" ? 2 : 1;
}

// Highlight, then wrap the diagnosed lines in a squiggle span. Done at
// the line level (cheap, robust) rather than per-token so a malformed
// line still underlines.
function highlightWithSquiggles(
  src: string,
  language: CodeLanguage,
  byLine: Map<number, CodeEditorDiagnostic>,
): string {
  if (byLine.size === 0) return highlight(src, language);
  const out: string[] = [];
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    const d = byLine.get(i + 1);
    const html = highlight(line, language).replace(/\n$/, "");
    if (d && line.length > 0) {
      const cls =
        d.severity === "warning"
          ? "code-squiggle code-squiggle-warning"
          : d.severity === "error"
            ? "code-squiggle"
            : "";
      out.push(cls ? `<span class="${cls}">${html}</span>` : html);
    } else {
      out.push(html);
    }
  });
  return out.join("\n") + "\n";
}
