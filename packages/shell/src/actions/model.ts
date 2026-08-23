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

// Actions — the recorded-and-replayed command sequence. THIS FILE IS
// PURE: no React, no DOM, no cross-package imports (the type import
// below is erased). The panel, the store and the recorder all sit on
// top of it, and the Node tier of `tests/actions.spec.ts` imports it
// directly.
//
// ─────────────────────────────────────────────────────────────────────
// WHAT AN ACTION IS, AND — MORE IMPORTANTLY — WHAT IT IS NOT
// ─────────────────────────────────────────────────────────────────────
//
// An action is a list of COMMAND INVOCATIONS. The recorder taps
// `CommandRegistry.observe` (see `registries/command.ts`), which is the
// one place a command handler is ever called, so it sees every menu
// item, keybinding, command-palette entry, tool activation, panel
// show/hide, schema-panel row action and plugin/bundle command —
// live, including commands registered after the recorder started.
//
// It does NOT see direct manipulation. These paths never reach the
// command registry, and an action therefore CANNOT contain them:
//
//   · canvas gestures — the tool spine's beginGesture/updateGesture/
//     commitGesture over the gesture SAB (`tools/gesture-handler.ts`):
//     move, resize, rotate, scale, pen/shape drawing, marquee;
//   · typing — `useTextEditing.ts` issues insertText / deleteRange
//     mutations straight at the client;
//   · panel FIELD edits — the catalog binding hook
//     (`catalog/binding-hook.ts`) and ~20 hand-written panels call
//     `client.mutate` directly (font size, stroke weight, swatch
//     edits, table row heights, …);
//   · selection — canvas clicks and marquee go to
//     `client.setElementSelection`, not a command;
//   · camera — scroll/pinch/pan write the camera SAB;
//   · guide drags, threading-port drags, path-edit handle drags;
//   · Cmd-Z / Cmd-Shift-Z, which are handled in `useTextEditing.ts`
//     and deliberately not routed through the registry (picking
//     Edit ▸ Undo from the menu IS recorded — the keystroke is not).
//
// Rather than leave that as a footnote nobody reads, the recorder
// COUNTS what it could not capture while it was running (see
// `UncapturedTally`) and the panel states it per recording. A silent
// drop would produce an action that replays to a different document
// than the user recorded; a counted drop is a fact on screen.
//
// ─────────────────────────────────────────────────────────────────────
// PAYLOADS AND IDS
// ─────────────────────────────────────────────────────────────────────
//
// Illustrator's answer to "which object does a replayed step act on?"
// is: whatever is selected AT REPLAY TIME. That works here because the
// overwhelming majority of commands take NO payload and read the live
// selection through their handler closure (`paged.object.group`,
// every Arrange verb, the zoom verbs, tool activation). Those steps
// are `contextual` and replay perfectly in any document.
//
// The exceptions are the parameterised commands — the schema-panel
// row actions invoke with a row id, plugin commands take structured
// payloads. A payload carrying `{kind:"rectangle", id:"ua365e1"}`
// replays against an id that does not exist in another document. Those
// steps are classified `documentBound` and are SKIPPED by default,
// visibly, with the reason shown. `PagedAction.includeDocumentBound`
// is the explicit opt-in for replaying an action in the document it
// was recorded in.

import type { CommandInvocation } from "../registries/command";

/** Bump when the persisted shape changes incompatibly. */
export const ACTIONS_SCHEMA_VERSION = 1;

/**
 * How a step behaves at replay time. Derived from the payload alone —
 * the tap cannot see what a handler reads, so the verdict describes
 * what we can PROVE about the recorded data, never a guess about the
 * handler's internals.
 */
export type StepVerdict =
  /** No payload. Replays against the replay-time context (selection,
   *  camera, active document) — Illustrator's semantics. */
  | "contextual"
  /** Payload persisted intact and carries no document-scoped id.
   *  Replays verbatim anywhere. */
  | "portable"
  /** Payload embeds ids minted by the document it was recorded in.
   *  Only meaningful in THAT document. */
  | "documentBound"
  /** Payload could not survive a JSON round-trip (a function, a Blob,
   *  a DOM node, a cycle). The step is recorded and shown, but it can
   *  never be replayed. */
  | "unserializable";

export interface ActionStep {
  /** Command id, e.g. `paged.object.group`. */
  command: string;
  /** The command's title at record time — kept so the list still
   *  reads sensibly when a plugin that owned the command is absent. */
  title: string;
  /** JSON-cloned payload. Absent for `contextual`, and absent for
   *  `unserializable` (there was nothing to keep). */
  payload?: unknown;
  verdict: StepVerdict;
  /** The handler rejected while recording. Kept visible rather than
   *  dropped — a failed step is information about the recording. */
  failed?: boolean;
  /** User toggle: skip this step on replay without deleting it. */
  disabled?: boolean;
}

/** What the recorder saw happen that it could not turn into a step. */
export interface UncapturedTally {
  /** `gestureCommitted` messages — direct canvas manipulation. */
  gestures: number;
  /** `mutationApplied` messages that landed while NO command was in
   *  flight: typing, panel field edits, drag commits. Approximate by
   *  construction — a mutation issued by a slow async command that had
   *  already settled would be counted here. It is a floor on what was
   *  missed, not an exact ledger, and the panel says so. */
  directEdits: number;
}

export interface PagedAction {
  id: string;
  name: string;
  /** Epoch ms. */
  createdAt: number;
  steps: ActionStep[];
  uncaptured: UncapturedTally;
  /** Opt in to replaying `documentBound` steps. Off by default: those
   *  ids only exist in the document the action was recorded in. */
  includeDocumentBound: boolean;
}

export interface ActionLibrary {
  schema: number;
  actions: PagedAction[];
}

export const EMPTY_LIBRARY: ActionLibrary = {
  schema: ACTIONS_SCHEMA_VERSION,
  actions: [],
};

export const EMPTY_TALLY: UncapturedTally = { gestures: 0, directEdits: 0 };

/**
 * Commands the recorder refuses to record, because recording them
 * would record the act of recording. Kept deliberately tiny —
 * everything else (including panel show/hide and Undo/Redo) records,
 * and the panel lets the user delete steps they did not want.
 */
export const NON_RECORDABLE_COMMANDS: readonly string[] = [
  "paged.actions.record",
  "paged.actions.stop",
  "paged.actions.play",
];

export function isRecordable(commandId: string): boolean {
  return !NON_RECORDABLE_COMMANDS.includes(commandId);
}

// ─────────────────────────────────────────── payload classification

/** The `kind` discriminants of `ElementId` (client `protocol.ts`). */
const ELEMENT_ID_KINDS = new Set([
  "textFrame",
  "rectangle",
  "oval",
  "polygon",
  "graphicLine",
  "group",
  "storyRange",
  "table",
  "tableCell",
]);

/**
 * Engine self-ids as they appear on the wire: a `u` followed by at
 * least four alphanumerics of which at least one is a digit, either
 * standing alone (`PageId` = `"u0f396d"`) or as the tail after a `:`
 * or `/` (`"textFrame:ua365e1"`, `"Color/uPagedSheetChart3366CC"`).
 *
 * This is a HEURISTIC and it is deliberately biased toward FLAGGING.
 * The digit requirement is what keeps ordinary vocabulary out —
 * "underline", "uppercase", "unit" have no digit and are left alone —
 * and named library ids like `"Color/Black"` never match because the
 * tail does not start with `u`.
 *
 * Both error directions stay visible, which is why a heuristic is
 * acceptable here: a false positive marks a portable step
 * `documentBound`, so it is skipped WITH ITS REASON SHOWN and the user
 * can tick the override; a false negative replays a step that then
 * fails, and the replay report names it.
 */
const SELF_ID = /(?:^|[:/])u(?=[0-9a-z]*\d)[0-9a-z]{4,}$/i;

export function looksLikeDocumentId(value: unknown): boolean {
  if (typeof value === "string") return SELF_ID.test(value);
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.kind === "string" &&
    ELEMENT_ID_KINDS.has(record.kind) &&
    "id" in record
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.some(looksLikeDocumentId);
  return Object.values(record).some(looksLikeDocumentId);
}

export interface ClassifiedPayload {
  verdict: StepVerdict;
  /** The JSON-cloned payload, or undefined when there is nothing to
   *  keep (no payload at all, or it did not survive the clone). */
  payload?: unknown;
}

/**
 * Decide a step's verdict and take the snapshot. Cloning through JSON
 * does double duty: it detaches the payload from a caller that may
 * mutate it, and the clone either succeeding or throwing IS the
 * serializability test.
 */
export function classifyPayload(payload: unknown): ClassifiedPayload {
  if (payload === undefined) return { verdict: "contextual" };
  let clone: unknown;
  try {
    const json = JSON.stringify(payload);
    // `JSON.stringify(() => {})` returns undefined rather than
    // throwing, so an unstringifiable value has to be caught here too.
    if (json === undefined) return { verdict: "unserializable" };
    clone = JSON.parse(json);
  } catch {
    return { verdict: "unserializable" };
  }
  return {
    verdict: looksLikeDocumentId(clone) ? "documentBound" : "portable",
    payload: clone,
  };
}

/** Build a step from one observed invocation. */
export function stepFromInvocation(invocation: CommandInvocation): ActionStep {
  const { verdict, payload } = classifyPayload(invocation.payload);
  const step: ActionStep = {
    command: invocation.id,
    title: invocation.title,
    verdict,
  };
  if (payload !== undefined) step.payload = payload;
  return step;
}

// ─────────────────────────────────────────────────────── replay plan

export type SkipReason =
  "disabled" | "failedWhileRecording" | "documentBound" | "unserializable";

export interface PlannedStep {
  index: number;
  step: ActionStep;
}

export interface SkippedStep extends PlannedStep {
  reason: SkipReason;
}

export interface ReplayPlan {
  run: PlannedStep[];
  skip: SkippedStep[];
}

/**
 * Split an action into what will run and what will not, BEFORE
 * anything is invoked, so the panel can show the user the plan rather
 * than a post-hoc surprise.
 */
export function planReplay(action: PagedAction): ReplayPlan {
  const run: PlannedStep[] = [];
  const skip: SkippedStep[] = [];
  action.steps.forEach((step, index) => {
    const entry: PlannedStep = { index, step };
    const reason = skipReasonFor(step, action.includeDocumentBound);
    if (reason) skip.push({ ...entry, reason });
    else run.push(entry);
  });
  return { run, skip };
}

function skipReasonFor(
  step: ActionStep,
  includeDocumentBound: boolean,
): SkipReason | null {
  if (step.disabled) return "disabled";
  if (step.failed) return "failedWhileRecording";
  if (step.verdict === "unserializable") return "unserializable";
  if (step.verdict === "documentBound" && !includeDocumentBound) {
    return "documentBound";
  }
  return null;
}

export function skipReasonLabel(reason: SkipReason): string {
  switch (reason) {
    case "disabled":
      return "turned off";
    case "failedWhileRecording":
      return "failed while recording";
    case "documentBound":
      return "carries ids from the recorded document";
    case "unserializable":
      return "payload could not be saved";
  }
}

export function verdictLabel(verdict: StepVerdict): string {
  switch (verdict) {
    case "contextual":
      return "selection";
    case "portable":
      return "portable";
    case "documentBound":
      return "doc ids";
    case "unserializable":
      return "not saved";
  }
}

export function verdictTitle(verdict: StepVerdict): string {
  switch (verdict) {
    case "contextual":
      return "No payload — replays against whatever is selected at replay time.";
    case "portable":
      return "Payload carries no document ids — replays anywhere.";
    case "documentBound":
      return "Payload embeds ids minted by the recorded document. Skipped unless you allow document-bound steps.";
    case "unserializable":
      return "The payload could not be saved (a function, blob or cycle). This step can never replay.";
  }
}

// ────────────────────────────────────────────── script projection

/**
 * Render an action as a demo/automation script.
 *
 * This is the honest answer to "should Actions just BE a script?". The
 * host-side automation layer (`demo/automation.ts`) already exposes
 * `editor.runCommand(id, payload)` against this exact registry, so an
 * action's steps map onto it one for one and the shipped runner can
 * execute them. What a script CANNOT carry is the per-step verdict and
 * the record-time tally — the two things that stop a replay lying
 * about what it contains. So the step list stays the primitive and the
 * script is a projection of it, not a replacement.
 *
 * Note the worker's `paged.*` Boa global is the wrong target: it lives
 * inside the worker and reaches the scene graph only, so it cannot
 * express tool activation, panel commands, export or plugin commands.
 */
export function toDemoScript(action: PagedAction): string {
  const plan = planReplay(action);
  const lines: string[] = [
    `// ${action.name} — recorded ${new Date(action.createdAt).toISOString()}`,
  ];
  if (action.uncaptured.gestures || action.uncaptured.directEdits) {
    lines.push(
      `// NOT captured while recording: ${action.uncaptured.gestures} canvas gesture(s), ` +
        `${action.uncaptured.directEdits} direct edit(s) (typing / panel fields).`,
    );
  }
  for (const { index, step } of plan.run) {
    const payload =
      step.payload === undefined ? "" : `, ${JSON.stringify(step.payload)}`;
    lines.push(
      `await editor.runCommand(${JSON.stringify(step.command)}${payload}); // ${index + 1}. ${step.title}`,
    );
  }
  for (const { index, step, reason } of plan.skip) {
    lines.push(
      `// skipped ${index + 1}. ${step.title} (${skipReasonLabel(reason)})`,
    );
  }
  return lines.join("\n") + "\n";
}

// ────────────────────────────────────────────────────── validation

function isTally(value: unknown): value is UncapturedTally {
  const t = value as UncapturedTally | undefined;
  return (
    !!t && typeof t.gestures === "number" && typeof t.directEdits === "number"
  );
}

const VERDICTS: readonly StepVerdict[] = [
  "contextual",
  "portable",
  "documentBound",
  "unserializable",
];

function isStep(value: unknown): value is ActionStep {
  const s = value as ActionStep | undefined;
  return (
    !!s &&
    typeof s.command === "string" &&
    typeof s.title === "string" &&
    VERDICTS.includes(s.verdict)
  );
}

/**
 * Validate anything claiming to be a library — a localStorage blob a
 * previous build wrote, or a file a user imported. Unknown shapes are
 * DROPPED rather than repaired: a half-understood action would replay
 * something nobody recorded.
 */
export function parseLibrary(value: unknown): ActionLibrary {
  const lib = value as ActionLibrary | undefined;
  if (
    !lib ||
    lib.schema !== ACTIONS_SCHEMA_VERSION ||
    !Array.isArray(lib.actions)
  ) {
    return EMPTY_LIBRARY;
  }
  const actions = lib.actions.filter(
    (a): a is PagedAction =>
      !!a &&
      typeof a.id === "string" &&
      typeof a.name === "string" &&
      typeof a.createdAt === "number" &&
      Array.isArray(a.steps) &&
      a.steps.every(isStep) &&
      isTally(a.uncaptured) &&
      typeof a.includeDocumentBound === "boolean",
  );
  return { schema: ACTIONS_SCHEMA_VERSION, actions };
}

export function newActionId(): string {
  return `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
