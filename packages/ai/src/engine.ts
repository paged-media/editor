/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * This file is part of paged (https://paged.media) and is additionally
 * available under the Paged Media Enterprise License (PMEL). Full
 * copyright and license information is available in LICENSE.md which is
 * distributed with this source code.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    MPL-2.0 OR Paged Media Enterprise License (PMEL)
 */

// The one door the agent drives the document through. The editor implements
// it over `CanvasClient.executeScript` (the worker's wasm engine), the CLI
// over the headless host's `runScript`; the agent never knows which.

/** What one script run returned: the console lines (`[log] …`), the error
 *  (`Name: message`, or `runtime budget exceeded: …`) and which budget
 *  tripped, if one did. */
export interface ScriptRun {
  output: string[];
  error: string | null;
  budgetKind?: string | null;
}

export interface ScriptEngine {
  /** Run a `paged.*` Boa script against the open document. Never throws for
   *  a script failure — that is `error`. */
  runScript(source: string): Promise<ScriptRun>;
  /** A PNG of page `pageIndex` (1-based), for the model to judge the look.
   *  Absent where the host cannot rasterise. */
  renderPage?(pageIndex: number): Promise<Uint8Array | null>;
}

/** Story health after a run, read through the same script door. */
export interface StoryHealth {
  stories: number;
  overset: string[];
}

const HEALTH_PROBE = `console.log(paged.stories());`;

/** Read which stories are overset. A failure reads as "unknown" (null)
 *  rather than failing the agent's turn. */
export async function readStoryHealth(engine: ScriptEngine): Promise<StoryHealth | null> {
  const run = await engine.runScript(HEALTH_PROBE);
  if (run.error) return null;
  // Console lines carry their level: `[log] [{"selfId":…}]`.
  const line = run.output.map((l) => l.replace(/^\[\w+\] /, "")).find((l) => l.startsWith("["));
  if (!line) return null;
  try {
    const rows = JSON.parse(line) as Array<{ selfId: string; overset?: boolean }>;
    return { stories: rows.length, overset: rows.filter((r) => r.overset).map((r) => r.selfId) };
  } catch {
    return null;
  }
}
