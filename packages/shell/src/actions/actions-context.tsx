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

// The recorder + player. Mounted ABOVE the panel on purpose: the right
// dock renders only its active tab, so a recorder living in the panel
// component would stop recording the moment the user switched tabs to
// do the thing they were recording.
//
// Two taps, for two different jobs:
//
//   · `registries.commands.observe(...)` — the STEPS. The one place a
//     command handler is ever called, so it sees menu, keybinding,
//     palette, tool, panel and plugin commands alike, including ones
//     registered after recording began.
//
//   · `client.subscribe(...)` — the HONESTY. `gestureCommitted` and
//     `mutationApplied` tell us the document changed; when that
//     happens with no command in flight, something the recorder
//     structurally cannot capture just edited the document. Counting
//     it is what turns "silently drops gestures" into a number on
//     screen. See `UncapturedTally` in `model.ts` for why the direct-
//     edit count is a floor rather than an exact ledger.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { useCanvasClient } from "../state/canvas-client-context";
import { useRegistries } from "../state/registries-context";
import {
  EMPTY_TALLY,
  isRecordable,
  newActionId,
  planReplay,
  stepFromInvocation,
  ACTIONS_SCHEMA_VERSION,
  type ActionLibrary,
  type ActionStep,
  type PagedAction,
  type SkipReason,
  type UncapturedTally,
} from "./model";
import { loadLibrary, parseImport, saveLibrary } from "./store";

export interface RecordingState {
  startedAt: number;
  steps: ActionStep[];
  uncaptured: UncapturedTally;
}

export interface ReplayStepResult {
  index: number;
  command: string;
  title: string;
  error: string | null;
}

export interface ReplayReport {
  actionId: string;
  actionName: string;
  ran: ReplayStepResult[];
  skipped: Array<{ index: number; title: string; reason: SkipReason }>;
  /** `mutationApplied` count observed while the replay was in flight.
   *  Reported, never acted on — see `undoNote` in the panel. */
  mutations: number;
  finishedAt: number;
}

export interface ActionsApi {
  actions: PagedAction[];
  recording: RecordingState | null;
  /** Non-null while a replay is in flight. */
  playingId: string | null;
  lastReport: ReplayReport | null;
  /** False when localStorage refused the last write. */
  persisted: boolean;

  startRecording(): void;
  cancelRecording(): void;
  /** Ends the recording and files it under `name`. Returns the new
   *  action, or null when nothing was captured. */
  stopRecording(name: string): PagedAction | null;

  play(actionId: string): Promise<ReplayReport | null>;

  rename(actionId: string, name: string): void;
  remove(actionId: string): void;
  setIncludeDocumentBound(actionId: string, include: boolean): void;
  toggleStep(actionId: string, index: number): void;
  deleteStep(actionId: string, index: number): void;
  /** Returns how many actions were accepted (invalid ones are dropped). */
  importActions(text: string): number;
  dismissReport(): void;
}

const Context = createContext<ActionsApi | null>(null);

export function ActionsProvider({ children }: PropsWithChildren) {
  const registries = useRegistries();
  const client = useCanvasClient();

  const [library, setLibrary] = useState<ActionLibrary>(() => loadLibrary());
  const [recording, setRecording] = useState<RecordingState | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<ReplayReport | null>(null);
  const [persisted, setPersisted] = useState(true);

  // Refs the two taps write through. The observers are installed ONCE
  // (see the effect below) and must not be re-subscribed on every
  // state change, so they read intent from refs rather than closing
  // over state.
  const recordingRef = useRef(false);
  const inFlight = useRef(0);
  const replayingRef = useRef(false);
  const replayMutations = useRef(0);

  const commit = useCallback((next: ActionLibrary) => {
    setLibrary(next);
    setPersisted(saveLibrary(next));
  }, []);

  // Deliberately NOT a functional `setLibrary` updater: React runs
  // updaters during the render phase, so writing localStorage and
  // another component's state from inside one is a side effect in
  // render. Every caller already has the current library in scope.
  const patch = useCallback(
    (actionId: string, fn: (action: PagedAction) => PagedAction) => {
      commit({
        schema: ACTIONS_SCHEMA_VERSION,
        actions: library.actions.map((a) => (a.id === actionId ? fn(a) : a)),
      });
    },
    [library, commit],
  );

  // ── the command tap ────────────────────────────────────────────
  useEffect(() => {
    const off = registries.commands.observe((event) => {
      const { phase, invocation } = event;
      if (phase === "started") {
        inFlight.current += 1;
        if (!recordingRef.current) return;
        if (!isRecordable(invocation.id)) return;
        const step = stepFromInvocation(invocation);
        setRecording((prev) =>
          prev ? { ...prev, steps: [...prev.steps, step] } : prev,
        );
        return;
      }
      inFlight.current = Math.max(0, inFlight.current - 1);
      if (!event.error) return;
      if (!recordingRef.current || !isRecordable(invocation.id)) return;
      // Mark rather than drop: a step that failed while recording is a
      // fact about the recording, and hiding it would leave the user
      // wondering why the action is one step short of what they did.
      setRecording((prev) => {
        if (!prev) return prev;
        const steps = [...prev.steps];
        for (let i = steps.length - 1; i >= 0; i -= 1) {
          if (steps[i].command === invocation.id && !steps[i].failed) {
            steps[i] = { ...steps[i], failed: true };
            break;
          }
        }
        return { ...prev, steps };
      });
    });
    return () => off.dispose();
  }, [registries]);

  // ── the coverage tap ───────────────────────────────────────────
  useEffect(() => {
    const off = client.subscribe((msg) => {
      if (msg.kind === "gestureCommitted") {
        if (replayingRef.current) return;
        if (!recordingRef.current) return;
        setRecording((prev) =>
          prev
            ? {
                ...prev,
                uncaptured: {
                  ...prev.uncaptured,
                  gestures: prev.uncaptured.gestures + 1,
                },
              }
            : prev,
        );
        return;
      }
      if (msg.kind !== "mutationApplied") return;
      if (replayingRef.current) {
        replayMutations.current += 1;
        return;
      }
      if (!recordingRef.current) return;
      // A mutation with a command in flight is (very probably) that
      // command's own work and IS captured. One with none in flight is
      // typing, a panel field, or a gesture commit — none of which the
      // registry can see.
      if (inFlight.current > 0) return;
      setRecording((prev) =>
        prev
          ? {
              ...prev,
              uncaptured: {
                ...prev.uncaptured,
                directEdits: prev.uncaptured.directEdits + 1,
              },
            }
          : prev,
      );
    });
    return () => off();
  }, [client]);

  const startRecording = useCallback(() => {
    setLastReport(null);
    recordingRef.current = true;
    setRecording({
      startedAt: Date.now(),
      steps: [],
      uncaptured: { ...EMPTY_TALLY },
    });
  }, []);

  const cancelRecording = useCallback(() => {
    recordingRef.current = false;
    setRecording(null);
  }, []);

  const stopRecording = useCallback(
    (name: string): PagedAction | null => {
      recordingRef.current = false;
      const current = recording;
      setRecording(null);
      if (!current || current.steps.length === 0) return null;
      const action: PagedAction = {
        id: newActionId(),
        name: name.trim() || `Action ${library.actions.length + 1}`,
        createdAt: Date.now(),
        steps: current.steps,
        uncaptured: current.uncaptured,
        includeDocumentBound: false,
      };
      commit({
        schema: ACTIONS_SCHEMA_VERSION,
        actions: [...library.actions, action],
      });
      return action;
    },
    [recording, library, commit],
  );

  const play = useCallback(
    async (actionId: string): Promise<ReplayReport | null> => {
      const action = library.actions.find((a) => a.id === actionId);
      if (!action || playingId) return null;
      const plan = planReplay(action);
      setPlayingId(actionId);
      setLastReport(null);
      replayingRef.current = true;
      replayMutations.current = 0;
      const ran: ReplayStepResult[] = [];
      try {
        for (const { index, step } of plan.run) {
          let error: string | null = null;
          try {
            await registries.commands.invoke(step.command, step.payload);
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
          }
          ran.push({
            index,
            command: step.command,
            title: step.title,
            error,
          });
        }
      } finally {
        replayingRef.current = false;
        setPlayingId(null);
      }
      const report: ReplayReport = {
        actionId,
        actionName: action.name,
        ran,
        skipped: plan.skip.map((s) => ({
          index: s.index,
          title: s.step.title,
          reason: s.reason,
        })),
        mutations: replayMutations.current,
        finishedAt: Date.now(),
      };
      setLastReport(report);
      return report;
    },
    [library, playingId, registries],
  );

  const api = useMemo<ActionsApi>(
    () => ({
      actions: library.actions,
      recording,
      playingId,
      lastReport,
      persisted,
      startRecording,
      cancelRecording,
      stopRecording,
      play,
      rename: (id, name) => patch(id, (a) => ({ ...a, name })),
      remove: (id) =>
        commit({
          schema: ACTIONS_SCHEMA_VERSION,
          actions: library.actions.filter((a) => a.id !== id),
        }),
      setIncludeDocumentBound: (id, include) =>
        patch(id, (a) => ({ ...a, includeDocumentBound: include })),
      toggleStep: (id, index) =>
        patch(id, (a) => ({
          ...a,
          steps: a.steps.map((s, i) =>
            i === index ? { ...s, disabled: !s.disabled } : s,
          ),
        })),
      deleteStep: (id, index) =>
        patch(id, (a) => ({
          ...a,
          steps: a.steps.filter((_, i) => i !== index),
        })),
      importActions: (text) => {
        const incoming = parseImport(text);
        if (incoming.length === 0) return 0;
        // Re-key on import so a re-import of the same file adds copies
        // rather than silently overwriting the user's edits.
        const fresh = incoming.map((a) => ({ ...a, id: newActionId() }));
        commit({
          schema: ACTIONS_SCHEMA_VERSION,
          actions: [...library.actions, ...fresh],
        });
        return fresh.length;
      },
      dismissReport: () => setLastReport(null),
    }),
    [
      library,
      recording,
      playingId,
      lastReport,
      persisted,
      startRecording,
      cancelRecording,
      stopRecording,
      play,
      patch,
      commit,
    ],
  );

  // Record / stop / play as COMMANDS, so they are palette- and
  // keybinding-reachable like everything else. Registered once (ids
  // are unique per registry and `register` throws on a duplicate);
  // the handlers read the live api through a ref rather than closing
  // over the memo, which changes on every state update.
  //
  // This is also what makes `NON_RECORDABLE_COMMANDS` load-bearing:
  // without it, invoking `paged.actions.play` while recording would
  // record the act of replaying.
  const apiRef = useRef<ActionsApi | null>(null);
  apiRef.current = api;
  useEffect(() => {
    const disposers = [
      registries.commands.register({
        id: "paged.actions.record",
        title: "Actions: start recording",
        category: "Actions",
        handler: () => apiRef.current?.startRecording(),
      }),
      registries.commands.register({
        id: "paged.actions.stop",
        title: "Actions: stop recording",
        category: "Actions",
        handler: () => apiRef.current?.stopRecording(""),
      }),
      registries.commands.register({
        id: "paged.actions.play",
        // The command palette invokes with NO payload (see
        // `CommandPalette.run`), so an id-only handler would register a
        // palette entry that can never do anything — the same lie as a
        // dead rail tool. Falling back to the most recent action makes
        // the palette entry actually usable and matches the "play what
        // I just recorded" reflex; the panel's Play button always
        // passes an explicit id.
        title: "Actions: play most recent",
        category: "Actions",
        handler: (_editor, payload) => {
          const current = apiRef.current;
          if (!current) return;
          const id =
            typeof payload === "string" && payload.length > 0
              ? payload
              : current.actions[current.actions.length - 1]?.id;
          return id ? current.play(id) : undefined;
        },
      }),
    ];
    return () => {
      for (const d of disposers) d.dispose();
    };
  }, [registries]);

  return <Context.Provider value={api}>{children}</Context.Provider>;
}

export function useActions(): ActionsApi {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useActions called outside ActionsProvider");
  return ctx;
}
