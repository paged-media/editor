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

// Scripting Stage 2 — embedded-Boa script editor. Multi-line
// textarea for JS source + run button + output log. Each `Run`
// dispatches `client.executeScript(source)` against the loaded
// document; the worker's embedded Boa engine evaluates the script
// and returns captured console.* lines + any thrown error.
//
// Same Operation channel as the gestures + Inspector + REPL —
// every `paged.set(...)` lands as a SetProperty mutation and the
// existing mutationApplied notification updates the rest of the UI.
//
// The Ask bar hands a request to Claude (ADR 221): the agent writes a
// script, runs it through this same door, reads the result back and
// corrects until it is done. Each script it runs shows in the editor and
// the log, so nothing it does is hidden, and every write undoes like a
// hand-run script.

import { useCallback, useEffect, useRef, useState } from "react";

import { describeAiError, onAiAsk, PoweredByClaude, runEditorAgent, useCanvasClient } from "@paged-media/shell";

interface LogEntry {
  source: string;
  output: string[];
  error: string | null;
  /** A line from Claude (its summary, a refusal) rather than a run. */
  note?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PanelProps = any;

const EXAMPLE = `// Try editing the textFrame's opacity from JS.
// All scene-graph writes go through the Operation channel,
// so Cmd-Z undoes them.
paged.set("textFrame:ua365e1", "frameOpacity", 50);
console.log("set opacity to 50");
`;

export function ScriptEditorPanel(_: PanelProps) {
  const client = useCanvasClient();
  const [source, setSource] = useState<string>(EXAMPLE);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const scrollLog = useCallback(() => {
    requestAnimationFrame(() => {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  const askClaude = useCallback(async (requested?: string) => {
    const prompt = (requested ?? ask).trim();
    if (!prompt || asking || running) return;
    const controller = new AbortController();
    setAsking(controller);
    const append = (entry: LogEntry) => {
      setLog((prev) => [...prev, entry]);
      scrollLog();
    };
    append({ source: "", output: [], error: null, note: `You: ${prompt}` });
    try {
      const result = await runEditorAgent(client, {
        mode: "script",
        prompt,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "script") setSource(event.source);
          else if (event.type === "scriptResult") append({ source: event.source, output: event.run.output, error: event.run.error });
        },
      });
      if (result.outcome === "refused") append({ source: "", output: [], error: "Claude declined this request." });
      else {
        const stopped = result.outcome === "turnLimit" ? " (stopped at the turn limit)" : result.outcome === "truncated" ? " (the reply was cut off)" : "";
        append({ source: "", output: [], error: null, note: `Claude: ${result.summary || "Done."}${stopped}` });
      }
      setAsk("");
    } catch (err) {
      append({ source: "", output: [], error: describeAiError(err) });
    } finally {
      setAsking(null);
    }
  }, [ask, asking, running, client, scrollLog]);

  // The command palette's "Ask Claude" row lands here (paged.ai.ask).
  const askRef = useRef(askClaude);
  askRef.current = askClaude;
  useEffect(
    () =>
      onAiAsk((prompt) => {
        setAsk(prompt);
        void askRef.current(prompt);
      }),
    [],
  );

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    try {
      const result = await client.executeScript(source);
      setLog((prev) => [
        ...prev,
        { source, output: result.output, error: result.error },
      ]);
      requestAnimationFrame(() => {
        logRef.current?.scrollTo({
          top: logRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    } catch (err) {
      setLog((prev) => [
        ...prev,
        {
          source,
          output: [],
          error: `dispatch failed: ${(err as Error).message}`,
        },
      ]);
    } finally {
      setRunning(false);
    }
  }, [client, source, running]);

  return (
    <div className="flex flex-col h-full text-sm" data-script-editor="ready">
      <form
        className="flex items-center gap-1 p-1 border-b border-input"
        data-script-ask
        onSubmit={(e) => {
          e.preventDefault();
          void askClaude();
        }}
      >
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="Ask Claude to write a script…"
          aria-label="Ask Claude to write a script"
          disabled={asking !== null}
          className="flex-1 min-w-0 text-xs px-2 py-1 rounded bg-background border border-input outline-none focus:ring-1 focus:ring-ring"
          data-script-ask-input
        />
        {asking ? (
          <button type="button" onClick={() => asking.abort()} className="px-2 py-0.5 rounded hover:bg-muted/60 text-xs" data-action="ask-stop">
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!ask.trim() || running} className="px-2 py-0.5 rounded hover:bg-muted/60 disabled:opacity-50 text-xs" data-action="ask">
            Ask
          </button>
        )}
        <PoweredByClaude size={10} />
      </form>
      <div className="flex items-center justify-between p-1 border-b border-input">
        <span className="text-xs text-muted-foreground px-1">
          JS — embedded Boa
        </span>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running || asking !== null}
          className="px-2 py-0.5 rounded hover:bg-muted/60 disabled:opacity-50"
          data-action="run"
        >
          {running ? "running…" : "Run ▶"}
        </button>
      </div>
      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        className="font-mono text-xs p-2 flex-1 min-h-0 bg-background outline-none focus:ring-1 focus:ring-ring resize-none border-b border-input"
        spellCheck={false}
        data-script-source
        onKeyDown={(e) => {
          // Cmd-Enter (or Ctrl-Enter) runs the script — standard
          // creative-tool convention for script panes.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void run();
          }
        }}
      />
      <div
        ref={logRef}
        className="font-mono text-xs p-2 overflow-y-auto bg-muted/30 max-h-48"
        data-script-log
      >
        {log.length === 0 ? (
          <div className="text-muted-foreground">
            Cmd-Enter to run. Output appears here.
          </div>
        ) : (
          log.map((entry, i) => (
            <div key={i} className="border-b border-input/30 mb-1 pb-1">
              {entry.note && (
                <div className="whitespace-pre-wrap font-sans" data-script-note>
                  {entry.note}
                </div>
              )}
              {entry.output.map((line, j) => (
                <div key={j}>{line}</div>
              ))}
              {entry.error && (
                <div className="text-status-error" data-script-error>
                  ✗ {entry.error}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
