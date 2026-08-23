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


// Guarded bundle loading (ADR 025 §4a).
//
// The editor loads its eight first-party bundles in one array literal over
// `loadBundle`, whose `bundle.activate(host)` is UNGUARDED in the SDK. A throw
// in bundle #3 therefore prevented #4-#8 from loading at all, with nothing
// naming the culprit: no journal entry, no Problems row, no console
// attribution. Seven working plugins beat eight broken ones.
//
// Extracted from `main.tsx` so the FAILURE path is testable without a browser
// and without a real bundle — the success path proves itself every time the
// app boots, but the failure path is exactly the one that must not rot.
//
// The structural fix belongs in plugin-sdk's `load.ts`, where the try/catch
// would protect every host, not just this one. Doing it there costs a contract
// bump + canary publish + editor re-pin, so it rides the single bump in the
// phase that needs one anyway (deliberate deferral, 2026-08-22).

// Subpath, not the barrel: this module needs one function, and the barrel
// drags in the SAB primitives with it.
import { errorIdent } from "@paged-media/client/journal";

/** The shape `loadBundle` returns, restated locally so this module does not
 *  depend on the plugin contract (the editor pins a published canary). */
export interface LoadedBundleLike {
  readonly id: string;
  readonly active: boolean;
  dispose(): void;
}

/** The shape this guard needs off a bundle — just its identity. */
export interface BundleLike {
  manifest: { id: string; version?: string };
}

export interface GuardDeps<B extends BundleLike, L extends LoadedBundleLike> {
  /** The real `loadBundle`, injected so a test can make it throw. */
  load: (bundle: B) => L;
  /** Where the structured event goes. */
  record: (entry: {
    code: string;
    severity?: "debug" | "info" | "warn" | "error";
    durMs?: number;
    data?: Record<string, unknown>;
  }) => void;
  /** Where the human-facing problem goes (the Problems panel sink). */
  publishProblem: (
    bundleId: string,
    key: string,
    diagnostics: {
      severity: "error" | "warning" | "info";
      message: string;
      source?: string;
    }[],
  ) => void;
  /** Told about every bundle the loader met, success or failure, so the
   *  exported journal can say WHICH plugins (and versions) were live. An
   *  empty `plugins` array in a bundle reads as "none loaded", which would be
   *  a lie whenever a bundle threw before anything recorded it. */
  notePlugin?: (id: string, version: string, active: boolean) => void;
  /** Injected for deterministic tests. */
  now?: () => number;
}

/**
 * Wrap `load` so one bundle's activation failure is recorded and contained
 * rather than taking every bundle after it down.
 *
 * Returns `null` for a failed bundle — deliberately NOT a rethrow, and
 * deliberately not a fake handle either. `null` is filtered out by the caller,
 * so a failed bundle simply is not in the disposal list; a fake handle would
 * be a `dispose()` that lies about having set something up.
 *
 * The failure lands in THREE visible places: the journal entry (for the
 * exported bundle), the Problems panel (for the person editing), and the
 * caller's filtered list (so nothing calls `dispose()` on a bundle that never
 * activated).
 */
export function createGuardedLoader<
  B extends BundleLike,
  L extends LoadedBundleLike,
>(deps: GuardDeps<B, L>): (bundle: B) => L | null {
  const now = deps.now ?? (() => performance.now());
  return (bundle: B): L | null => {
    // Reading the id is itself the first thing that can throw on a malformed
    // bundle, so it is inside the guard.
    let pluginId = "unknown";
    const t0 = now();
    try {
      pluginId = bundle.manifest.id;
      const handle = deps.load(bundle);
      deps.notePlugin?.(pluginId, bundle.manifest.version ?? "unknown", true);
      deps.record({
        code: "plugin.activate",
        durMs: now() - t0,
        data: { ok: true, plugin: pluginId },
      });
      return handle;
    } catch (err) {
      deps.notePlugin?.(pluginId, "unknown", false);
      deps.record({
        code: "plugin.activate",
        severity: "error",
        durMs: now() - t0,
        // Only the error KIND crosses: an activation throw routinely carries a
        // module path or a bundler message in its text.
        data: { ok: false, plugin: pluginId, error: errorIdent(err) },
      });
      // The user-facing half. A bundle that failed to activate is a document
      // problem as far as the person editing is concerned, so it goes where
      // every other bundle diagnostic already goes. The full message is safe
      // HERE — the Problems panel is local UI, not an exported artifact.
      deps.publishProblem(pluginId, "activation", [
        {
          severity: "error",
          message: `${pluginId} failed to activate: ${String(err)}`,
          source: "loadBundle",
        },
      ]);
      return null;
    }
  };
}
