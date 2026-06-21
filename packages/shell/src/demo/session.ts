// DemoSession — the stepping interpreter that turns a flat demo script into a
// controllable, observable run: play / pause / single-step / restart / seek-to-
// chapter, with a "current statement" cursor for the source viewer.
//
// How it works: the source is split into top-level statements; each is run behind
// an `await __gate(i)` so the controller can report the current statement, pause
// between statements, single-step, and pace playback. Chapters are the statements
// that call demo.showInfo / demo.step. Seeking REPLAYS from the top in a silent/
// fast mode (demo.* boxes + pacing suppressed) up to the target — deterministic
// because a demo starts from paged.file.new — then runs the target normally.
//
// Note: the splitter handles strings, template literals, comments and bracket
// depth. It deliberately does NOT handle regex literals — demo scripts don't use
// them (documented constraint).

import { buildAutomation, type CanvasHandleLike, type DemoGlobals } from "./automation";
import { demoResetOverlay } from "./overlay";

export interface Statement {
  index: number;
  text: string;
  lineStart: number; // 1-based, inclusive
  lineEnd: number; // 1-based, inclusive
  /** True if this statement opens a narration chapter (demo.showInfo/demo.step). */
  isChapter: boolean;
  chapterLabel?: string;
}

export type SessionStatus = "idle" | "playing" | "paused" | "stepping" | "done" | "error";

export interface SessionState {
  status: SessionStatus;
  currentIndex: number; // statement currently executing / about to execute (-1 before start)
  currentChapter: number; // index into chapters[], -1 before the first
  error: string | null;
}

const STOP = Symbol("paged.demo.stop");

/** Split source into top-level statements with line spans. */
export function splitTopLevelStatements(source: string): Statement[] {
  const out: Statement[] = [];
  let depth = 0;
  let i = 0;
  let stmtStart = 0;
  const n = source.length;

  const lineAt = (pos: number): number => {
    let line = 1;
    for (let k = 0; k < pos && k < n; k++) if (source[k] === "\n") line++;
    return line;
  };
  const push = (end: number): void => {
    const text = source.slice(stmtStart, end).trim();
    if (text && !/^\/\//.test(text)) {
      const realStart = stmtStart + (source.slice(stmtStart, end).length - source.slice(stmtStart, end).trimStart().length);
      out.push({
        index: out.length,
        text,
        lineStart: lineAt(realStart),
        lineEnd: lineAt(end - 1),
        ...chapterInfo(text),
      });
    }
    stmtStart = end;
  };

  while (i < n) {
    const c = source[i];
    // comments
    if (c === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    // strings
    if (c === '"' || c === "'") {
      i++;
      while (i < n && source[i] !== c) {
        if (source[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    // template literals (with nested ${...})
    if (c === "`") {
      i++;
      while (i < n && source[i] !== "`") {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === "$" && source[i + 1] === "{") {
          let td = 1;
          i += 2;
          while (i < n && td > 0) {
            if (source[i] === "{") td++;
            else if (source[i] === "}") td--;
            i++;
          }
          continue;
        }
        i++;
      }
      i++;
      continue;
    }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (c === ";" && depth === 0) {
      push(i + 1);
      i++;
      continue;
    }
    i++;
  }
  push(n);
  return out;
}

function chapterInfo(text: string): { isChapter: boolean; chapterLabel?: string } {
  const m = text.match(/demo\.(showInfo|step|pause)\s*\(\s*(["'`])([^"'`]*)\2/);
  if (!m) return { isChapter: false };
  return { isChapter: true, chapterLabel: m[3] || "Step" };
}

export interface DemoSessionOptions {
  source: string;
  handle: CanvasHandleLike;
  /** Notified on every state change (status / current statement / chapter). */
  onState?: (state: SessionState) => void;
  /** Default ms between statements while playing (0 = as fast as the editor settles). */
  speedMs?: number;
}

export class DemoSession {
  readonly statements: Statement[];
  readonly chapters: Statement[];
  private state: SessionState = { status: "idle", currentIndex: -1, currentChapter: -1, error: null };
  private readonly onState?: (s: SessionState) => void;
  private speedMs: number;

  // run control
  private paused = false;
  private resumeWaiters: Array<() => void> = [];
  private silent = false; // replay fast-forward: suppress demo.* boxes + pacing
  private replayTarget = -1; // stop after this statement index when replaying
  private runToken = 0; // invalidates an in-flight run on restart/seek
  private readonly globals: DemoGlobals;

  constructor(opts: DemoSessionOptions) {
    this.statements = splitTopLevelStatements(opts.source);
    this.chapters = this.statements.filter((s) => s.isChapter);
    this.onState = opts.onState;
    this.speedMs = opts.speedMs ?? 250;
    this.globals = buildAutomation(opts.handle, { isSilent: () => this.silent });
  }

  getState(): SessionState {
    return this.state;
  }
  setSpeed(ms: number): void {
    this.speedMs = ms;
  }

  private emit(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    this.onState?.(this.state);
  }

  /** The gate run before each statement. */
  private gate = async (index: number): Promise<void> => {
    const token = this.runToken;
    if (this.replayTarget >= 0) {
      if (index > this.replayTarget) throw STOP; // abort past the seek target
      // silent fast-forward up to (and including) the target's pre-roll
      if (index === this.replayTarget) {
        this.replayTarget = -1; // reached target → resume normal (show this chapter's box)
        this.silent = false;
      }
      this.emit({ currentIndex: index, currentChapter: this.chapterIndexFor(index) });
      return;
    }
    this.emit({ currentIndex: index, currentChapter: this.chapterIndexFor(index) });
    // single-step: pause after handing control back for one statement
    if (this.state.status === "stepping") {
      this.paused = true;
    }
    while (this.paused && token === this.runToken) {
      this.emit({ status: "paused" });
      await new Promise<void>((r) => this.resumeWaiters.push(r));
    }
    if (token !== this.runToken) throw STOP;
    if (this.speedMs > 0) await new Promise((r) => setTimeout(r, this.speedMs));
  };

  private chapterIndexFor(stmtIndex: number): number {
    let ci = -1;
    for (let k = 0; k < this.chapters.length; k++) if (this.chapters[k].index <= stmtIndex) ci = k;
    return ci;
  }

  private buildInstrumented(): (...args: unknown[]) => Promise<void> {
    const body = this.statements.map((s) => `await __gate(${s.index});\n${s.text};`).join("\n");
    const names = [...Object.keys(this.globals), "__gate"];
    // eslint-disable-next-line no-new-func
    const factory = new Function(...names, `"use strict"; return (async () => {\n${body}\n})();`) as (
      ...args: unknown[]
    ) => Promise<void>;
    return factory;
  }

  private async exec(): Promise<void> {
    const token = ++this.runToken;
    demoResetOverlay();
    this.paused = false;
    this.resumeWaiters = [];
    const factory = this.buildInstrumented();
    const args = [...Object.values(this.globals), this.gate];
    try {
      await factory(...args);
      if (token === this.runToken) this.emit({ status: "done" });
    } catch (e) {
      if (e === STOP) {
        // intentional stop (restart / seek / out-of-token) — settle as paused
        if (token === this.runToken) this.emit({ status: "paused" });
        return;
      }
      if (token === this.runToken) this.emit({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Start (or resume) playing. */
  play(): void {
    if (this.state.status === "paused" && this.runToken > 0) {
      this.paused = false;
      this.emit({ status: "playing" });
      this.flushResume();
      return;
    }
    this.emit({ status: "playing", error: null });
    void this.exec();
  }

  pause(): void {
    this.paused = true;
    this.emit({ status: "paused" });
  }

  /** Run exactly one statement, then pause. */
  step(): void {
    if (this.state.status === "idle" || this.state.status === "done" || this.runToken === 0) {
      this.emit({ status: "stepping", error: null });
      void this.exec();
      return;
    }
    this.paused = false;
    this.emit({ status: "stepping" });
    this.flushResume();
  }

  /** Restart from the top (paused at statement 0). */
  restart(): void {
    this.runToken++;
    this.flushResume();
    this.silent = false;
    this.replayTarget = -1;
    this.emit({ status: "idle", currentIndex: -1, currentChapter: -1, error: null });
  }

  /** Seek to chapter N: silently replay from the top to that chapter, then show it. */
  seekToChapter(chapterIndex: number): void {
    const target = this.chapters[chapterIndex];
    if (!target) return;
    this.runToken++; // abort any in-flight run
    this.flushResume();
    this.paused = false;
    this.silent = true;
    this.replayTarget = target.index;
    this.emit({ status: "playing", error: null });
    void this.exec();
  }

  private flushResume(): void {
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const r of waiters) r();
  }
}
