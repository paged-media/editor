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

// The demo script runner. Evaluates a demo script with the unified globals
// (paged / editor / demo) injected, as an async function so the script can
// `await demo.showInfo(...)` (suspend on the narration box) and
// `await paged.run(...)` (round-trip to the worker).
//
// NOTE: uses `new Function` to eval FIRST-PARTY, trusted demo scripts (loaded
// from our own manifest). For untrusted user scripts in the public playground,
// swap this for the engine's Boa sandbox (the script-author surface is the same).
// The demo build's CSP must allow 'unsafe-eval' (or use the Boa path).

import { buildAutomation, type CanvasHandleLike, type DemoGlobals } from "./automation";
import { demoResetOverlay } from "./overlay";

export interface RunResult {
  ok: boolean;
  error?: string;
}

/** Run `source` with the given globals injected. */
export async function runDemoScript(source: string, globals: DemoGlobals): Promise<RunResult> {
  const names = Object.keys(globals);
  const values = names.map((n) => (globals as unknown as Record<string, unknown>)[n]);
  try {
    // eslint-disable-next-line no-new-func
    const factory = new Function(...names, `"use strict"; return (async () => {\n${source}\n})();`) as (
      ...args: unknown[]
    ) => Promise<unknown>;
    await factory(...values);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Convenience: build the automation from a `__canvas`-shaped handle and run a
 * script against it. This is what the dev/playground `window.__demo.run` calls.
 */
export async function runDemoScriptWithHandle(source: string, handle: CanvasHandleLike): Promise<RunResult> {
  demoResetOverlay();
  return runDemoScript(source, buildAutomation(handle));
}
