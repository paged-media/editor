// Playground controller (demo build) — drives a DemoSession (the stepping
// interpreter) and renders the transport UI: a source viewer that highlights the
// CURRENT statement, play/pause/single-step, a chapter scrub bar + table of
// contents (click to rewind/forward by replaying), keyboard + speed controls,
// copy-snippet, and edit-&-run.
//
// URL params: ?script=<id>  ?embed (chromeless)  ?autoplay
//
// The live editor it drives is window.__canvas (exposed in the demo/dev build);
// demo.highlight spotlights are rendered by the shell's <DemoSpotlight/>.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DemoSession,
  type CanvasHandleLike,
  type SessionState,
  type Statement,
} from "@paged-media/shell";

interface ScriptMeta {
  id: string;
  title?: string;
  description?: string;
}

function getParams(): { scriptId: string | null; embed: boolean; autoplay: boolean } {
  const p = new URLSearchParams(window.location.search);
  return { scriptId: p.get("script"), embed: p.has("embed"), autoplay: p.has("autoplay") };
}

const SPEEDS = [
  { label: "0.5×", ms: 500 },
  { label: "1×", ms: 250 },
  { label: "2×", ms: 90 },
];

export function PlaygroundController(): React.ReactElement | null {
  const [{ scriptId, embed, autoplay }] = useState(getParams);
  const [meta, setMeta] = useState<ScriptMeta | null>(null);
  const [draft, setDraft] = useState<string>(""); // editable buffer
  const [current, setCurrent] = useState<string | null>(null); // source the session runs
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(!embed);
  const [speedMs, setSpeedMs] = useState(250);
  const [state, setState] = useState<SessionState>({ status: "idle", currentIndex: -1, currentChapter: -1, error: null });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [chapters, setChapters] = useState<Statement[]>([]);
  const sessionRef = useRef<DemoSession | null>(null);

  // 1) load the script source + metadata
  useEffect(() => {
    if (!scriptId) return;
    let alive = true;
    Promise.all([
      fetch(`/scripts/${scriptId}.js`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`script "${scriptId}" not found`)))),
      fetch(`/scripts/manifest.json`).then((r) => (r.ok ? r.json() : { scripts: [] })).catch(() => ({ scripts: [] })),
    ])
      .then(([src, manifest]) => {
        if (!alive) return;
        setDraft(src);
        setCurrent(src);
        setMeta((manifest as { scripts?: ScriptMeta[] }).scripts?.find((s) => s.id === scriptId) ?? { id: scriptId });
      })
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [scriptId]);

  // 2) (re)create the session whenever the running source changes
  useEffect(() => {
    if (!current) return;
    const handle = (window as unknown as { __canvas?: CanvasHandleLike }).__canvas;
    if (!handle) return;
    const session = new DemoSession({ source: current, handle, onState: setState, speedMs });
    sessionRef.current = session;
    setStatements(session.statements);
    setChapters(session.chapters);
    if (autoplay) session.play();
    return () => {
      session.restart(); // abort any in-flight run
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  useEffect(() => {
    sessionRef.current?.setSpeed(speedMs);
  }, [speedMs]);

  const playing = state.status === "playing";
  const toggle = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    if (playing) s.pause();
    else if (state.status === "done") {
      s.restart();
      s.play();
    } else s.play();
  }, [playing, state.status]);
  const stepOnce = useCallback(() => sessionRef.current?.step(), []);
  const restart = useCallback(() => {
    sessionRef.current?.restart();
  }, []);
  const seekChapter = useCallback((i: number) => sessionRef.current?.seekToChapter(i), []);
  const runEdited = useCallback(() => {
    setEditing(false);
    setCurrent(draft); // recreates the session (effect) → autoplay handled separately
    // play after the new session mounts
    setTimeout(() => sessionRef.current?.play(), 0);
  }, [draft]);
  const copyAll = useCallback(() => void navigator.clipboard?.writeText(current ?? ""), [current]);

  // 3) keyboard transport
  useEffect(() => {
    if (!scriptId) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "TEXTAREA" || tgt.tagName === "INPUT" || tgt.isContentEditable)) return;
      const s = sessionRef.current;
      if (!s) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        stepOnce();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seekChapter(Math.max(0, state.currentChapter - 1));
      } else if (e.key === "r") {
        restart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scriptId, toggle, stepOnce, restart, seekChapter, state.currentChapter]);

  const activeSpan = useMemo(() => {
    const st = statements[state.currentIndex];
    return st ? { from: st.lineStart, to: st.lineEnd } : null;
  }, [statements, state.currentIndex]);

  if (!scriptId) return null;

  return (
    <>
      <button type="button" data-playground-toggle onClick={() => setOpen((v) => !v)} style={chipStyle}>
        {open ? "× script" : "</> script"}
      </button>

      {open ? (
        <div data-playground-source style={panelStyle}>
          <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid var(--pg-border,#333)" }}>
            <div style={{ fontSize: 13, fontWeight: 640 }}>{meta?.title ?? scriptId}</div>
            {meta?.description ? (
              <div style={{ fontSize: 12, color: "var(--pg-muted-fg,#aaa)", marginTop: 2 }}>{meta.description}</div>
            ) : null}
          </div>

          {/* chapter table of contents / scrub */}
          {chapters.length > 0 ? (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "8px 12px", borderBottom: "1px solid var(--pg-border,#333)" }}>
              {chapters.map((c, i) => (
                <button
                  key={c.index}
                  type="button"
                  data-playground-chapter={i}
                  title={c.chapterLabel}
                  onClick={() => seekChapter(i)}
                  style={{
                    font: "inherit",
                    fontSize: 10.5,
                    cursor: "pointer",
                    borderRadius: 999,
                    border: "1px solid var(--pg-border,#333)",
                    padding: "2px 8px",
                    maxWidth: 120,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: i === state.currentChapter ? "var(--pg-primary-fg,#fff)" : "var(--pg-muted-fg,#aaa)",
                    background: i === state.currentChapter ? "var(--pg-primary,#6b5cff)" : "transparent",
                  }}
                >
                  {i + 1}. {c.chapterLabel}
                </button>
              ))}
            </div>
          ) : null}

          {/* source viewer (read) or editor (edit) */}
          {editing ? (
            <textarea
              data-playground-edit
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1,
                margin: 0,
                padding: "12px 14px",
                resize: "none",
                border: "none",
                outline: "none",
                background: "transparent",
                color: "var(--pg-fg,#ddd)",
                fontFamily: "var(--font-mono,monospace)",
                fontSize: 12,
                lineHeight: "18px",
              }}
            />
          ) : (
            <div data-playground-code style={{ flex: 1, overflow: "auto", padding: "8px 0", fontFamily: "var(--font-mono,monospace)", fontSize: 12, lineHeight: "18px" }}>
              {(current ?? (loadError ? `// ${loadError}` : "Loading…")).split("\n").map((line, i) => {
                const ln = i + 1;
                const active = activeSpan && ln >= activeSpan.from && ln <= activeSpan.to;
                return (
                  <div
                    key={i}
                    data-line={ln}
                    style={{
                      display: "flex",
                      padding: "0 14px",
                      background: active ? "color-mix(in srgb, var(--pg-primary,#6b5cff) 22%, transparent)" : "transparent",
                      borderLeft: active ? "2px solid var(--pg-primary,#6b5cff)" : "2px solid transparent",
                    }}
                  >
                    <span style={{ width: 24, textAlign: "right", marginRight: 12, color: "var(--pg-muted-fg,#666)", userSelect: "none" }}>{ln}</span>
                    <span style={{ whiteSpace: "pre-wrap", color: "var(--pg-fg,#cdd)" }}>{line || " "}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* transport */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: "1px solid var(--pg-border,#333)", flexWrap: "wrap" }}>
            <button type="button" data-playground-play onClick={toggle} style={btnPrimary} title="Play / Pause (Space)">
              {playing ? "❚❚" : state.status === "done" ? "↻" : "▶"}
            </button>
            <button type="button" data-playground-step onClick={stepOnce} style={btnGhost} title="Step (→)">
              ⤼ step
            </button>
            <button type="button" data-playground-restart onClick={restart} style={btnGhost} title="Restart (r)">
              ⟲
            </button>
            <span style={{ display: "inline-flex", border: "1px solid var(--pg-border,#333)", borderRadius: 4, overflow: "hidden" }}>
              {SPEEDS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setSpeedMs(s.ms)}
                  style={{ ...btnGhost, borderRadius: 0, padding: "3px 7px", color: speedMs === s.ms ? "var(--pg-primary,#6b5cff)" : "var(--pg-muted-fg,#aaa)" }}
                >
                  {s.label}
                </button>
              ))}
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button type="button" data-playground-copy onClick={copyAll} style={btnGhost} title="Copy script">
                copy
              </button>
              {editing ? (
                <button type="button" data-playground-runedit onClick={runEdited} style={btnPrimary} title="Run edited script">
                  run ▶
                </button>
              ) : (
                <button type="button" data-playground-edit-toggle onClick={() => setEditing(true)} style={btnGhost} title="Edit & run">
                  edit
                </button>
              )}
            </span>
            <span style={{ width: "100%", fontSize: 11, color: state.status === "error" ? "var(--warn,#e5484d)" : "var(--pg-muted-fg,#888)" }}>
              {state.status}
              {state.error ? `: ${state.error}` : ""}
              {state.currentChapter >= 0 && chapters.length ? ` · ${state.currentChapter + 1}/${chapters.length}` : ""}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}

const chipStyle: React.CSSProperties = {
  position: "fixed",
  left: 16,
  top: 72,
  zIndex: 8800,
  font: "inherit",
  fontFamily: "var(--font-mono,monospace)",
  fontSize: 11,
  cursor: "pointer",
  color: "var(--pg-fg,#fff)",
  background: "var(--chrome-panel-bg,#1e1e22)",
  border: "1px solid var(--pg-border,#333)",
  borderRadius: "var(--radius-sm,4px)",
  padding: "4px 9px",
};
const panelStyle: React.CSSProperties = {
  position: "fixed",
  left: 16,
  top: 104,
  bottom: 16,
  zIndex: 8700,
  width: 400,
  display: "flex",
  flexDirection: "column",
  background: "var(--chrome-panel-bg,#1e1e22)",
  color: "var(--pg-fg,#fff)",
  border: "1px solid var(--pg-border,#333)",
  borderRadius: "var(--radius-md,8px)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  overflow: "hidden",
  fontFamily: "var(--font-sans)",
};
const btnGhost: React.CSSProperties = {
  font: "inherit",
  fontSize: 12,
  cursor: "pointer",
  color: "var(--pg-muted-fg,#ccc)",
  background: "transparent",
  border: "1px solid var(--pg-border,#333)",
  borderRadius: "var(--radius-sm,4px)",
  padding: "3px 9px",
};
const btnPrimary: React.CSSProperties = {
  font: "inherit",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  color: "var(--pg-primary-fg,#fff)",
  background: "var(--pg-primary,#6b5cff)",
  border: "none",
  borderRadius: "var(--radius-sm,4px)",
  padding: "4px 11px",
};
