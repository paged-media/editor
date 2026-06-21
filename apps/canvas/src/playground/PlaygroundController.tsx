// Playground controller — mounted only in the `demo` build. Reads `?script=<id>`
// from the URL, loads the script source + metadata from /scripts/, runs it
// against the live editor via window.__demo.run, and shows the source side-by-side
// (the "how scripting works" view) with Run/Restart controls.
//
// URL params:
//   ?script=<id>   which demo script to load (from /scripts/manifest.json)
//   ?embed         chromeless — hides the source panel (clean for an <iframe>);
//                  a small "</> Script" toggle still reveals it
//   ?autoplay      run the script automatically once loaded
//
// Lives in apps/canvas (not shell) because it's app/demo-specific. Renders null
// in a normal build (only included when isDemoBuild).

import { useCallback, useEffect, useState } from "react";

interface ScriptMeta {
  id: string;
  title?: string;
  description?: string;
}

type Status = "idle" | "loading" | "running" | "done" | "error";

interface DemoApi {
  run(source: string): Promise<{ ok: boolean; error?: string }>;
}

function getParams(): { scriptId: string | null; embed: boolean; autoplay: boolean } {
  const p = new URLSearchParams(window.location.search);
  return {
    scriptId: p.get("script"),
    embed: p.has("embed"),
    autoplay: p.has("autoplay"),
  };
}

export function PlaygroundController(): React.ReactElement | null {
  const [{ scriptId, embed, autoplay }] = useState(getParams);
  const [source, setSource] = useState<string | null>(null);
  const [meta, setMeta] = useState<ScriptMeta | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(!embed);

  useEffect(() => {
    if (!scriptId) return;
    let alive = true;
    setStatus("loading");
    Promise.all([
      fetch(`/scripts/${scriptId}.js`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`script ${scriptId} not found`)))),
      fetch(`/scripts/manifest.json`)
        .then((r) => (r.ok ? r.json() : { scripts: [] }))
        .catch(() => ({ scripts: [] })),
    ])
      .then(([src, manifest]) => {
        if (!alive) return;
        setSource(src);
        const m = (manifest as { scripts?: ScriptMeta[] }).scripts?.find((s) => s.id === scriptId);
        setMeta(m ?? { id: scriptId });
        setStatus("idle");
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [scriptId]);

  const run = useCallback(async () => {
    const api = (window as unknown as { __demo?: DemoApi }).__demo;
    if (!api || !source) return;
    setError(null);
    setStatus("running");
    try {
      const res = await api.run(source);
      setStatus(res.ok ? "done" : "error");
      if (!res.ok) setError(res.error ?? "script error");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [source]);

  // Autoplay once the source is loaded.
  useEffect(() => {
    if (source && autoplay && status === "idle") void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, autoplay]);

  if (!scriptId) return null;

  const statusColor =
    status === "error" ? "var(--warn, #e5484d)" : status === "running" ? "var(--pg-primary, #6b5cff)" : "var(--valid, #30a46c)";

  return (
    <>
      {/* Toggle chip — always present so an embedded demo can reveal the source. */}
      <button
        type="button"
        data-playground-toggle
        onClick={() => setSourceOpen((v) => !v)}
        style={{
          position: "fixed",
          left: 16,
          top: 72,
          zIndex: 8800,
          font: "inherit",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 11,
          cursor: "pointer",
          color: "var(--pg-fg, #fff)",
          background: "var(--chrome-panel-bg, #1e1e22)",
          border: "1px solid var(--pg-border, #333)",
          borderRadius: "var(--radius-sm, 4px)",
          padding: "4px 9px",
        }}
      >
        {sourceOpen ? "× script" : "</> script"}
      </button>

      {sourceOpen ? (
        <div
          data-playground-source
          style={{
            position: "fixed",
            left: 16,
            top: 104,
            bottom: 16,
            zIndex: 8700,
            width: 380,
            display: "flex",
            flexDirection: "column",
            background: "var(--chrome-panel-bg, #1e1e22)",
            color: "var(--pg-fg, #fff)",
            border: "1px solid var(--pg-border, #333)",
            borderRadius: "var(--radius-md, 8px)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            overflow: "hidden",
            fontFamily: "var(--font-sans)",
          }}
        >
          <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid var(--pg-border, #333)" }}>
            <div style={{ fontSize: 13, fontWeight: 640 }}>{meta?.title ?? scriptId}</div>
            {meta?.description ? (
              <div style={{ fontSize: 12, color: "var(--pg-muted-fg, #aaa)", marginTop: 2 }}>{meta.description}</div>
            ) : null}
          </div>
          <pre
            data-playground-code
            style={{
              flex: 1,
              margin: 0,
              padding: "12px 14px",
              overflow: "auto",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--pg-muted-fg, #cdd)",
              whiteSpace: "pre-wrap",
            }}
          >
            {source ?? (status === "loading" ? "Loading…" : "—")}
          </pre>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 14px",
              borderTop: "1px solid var(--pg-border, #333)",
            }}
          >
            <button
              type="button"
              data-playground-run
              onClick={run}
              disabled={!source || status === "running"}
              style={{
                font: "inherit",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: source ? "pointer" : "default",
                color: "var(--pg-primary-fg, #fff)",
                background: "var(--pg-primary, #6b5cff)",
                border: "none",
                borderRadius: "var(--radius-sm, 4px)",
                padding: "5px 14px",
                opacity: !source || status === "running" ? 0.6 : 1,
              }}
            >
              {status === "done" || status === "error" ? "Restart" : "Run"}
            </button>
            <span style={{ fontSize: 11.5, color: statusColor }}>
              {status === "running" ? "running…" : status === "done" ? "done" : status === "error" ? `error: ${error ?? ""}` : ""}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
