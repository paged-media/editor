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

// D-03 (paged.data §11) — the editor half of the network-consent door
// (`host.network`). A document carrying queries is treated as carrying code:
// NOTHING reaches the network until the user reviews the data-source manifest
// (the requesting origins + the stated purpose) and consents, per-origin.
//
// The SDK door (plugin-sdk `host-impl.ts`) owns the capability gate, the
// `capabilities.network` allow-list filter, and remembered-grant persistence
// (the bundle's own storage namespace). This module owns only what the SDK
// cannot: the consent DECISION and the data-source-manifest UI. Injected via
// `loadBundle({ consent })`, it flips `supports("network.consent@1")` true;
// absent it the door denies every origin (the honest no-consent posture).
//
// The OUTER wall is the editor's CSP `connect-src` (see `vite.config.ts` +
// `public/_headers`, built from `boot/network-policy.ts`): even a consented
// origin is reachable only if the page CSP admits it. The floor is
// `'self' blob: data:`; a deployment may admit EXACT data origins at build time
// (`PAGED_DATA_ORIGINS`, ADR 218). A header CSP is fixed when the page loads and
// cannot be loosened by a later grant, so an origin the user consents to but
// the deployment did not list stays browser-unreachable — the dialog says so
// per origin (`admittedDataOrigins`), and the requesting bundle reports the
// failed fetch. This backend resolves the user's intent; the wall is a
// separate, conservative gate, and it never widens to a bare `https:`.

import type { ConsentBackend } from "@paged-media/plugin-sdk";
import type { ConsentResult } from "@paged-media/plugin-api";

import { wallAdmits } from "./boot/network-policy";

/** Replaced at build time by vite (`define`, ADR 218): the data origins this
 *  build's CSP admits beyond the same-origin floor. */
declare const __PAGED_DATA_ORIGINS__: readonly string[] | undefined;

/** The data origins the page's `connect-src` admits (empty = the floor). */
export function admittedDataOrigins(): readonly string[] {
  return typeof __PAGED_DATA_ORIGINS__ === "undefined" ? [] : __PAGED_DATA_ORIGINS__;
}

/** Will a request to `origin` pass this page's network wall? */
export function reachableOrigin(origin: string): boolean {
  const self = typeof location === "undefined" ? undefined : location.origin;
  return wallAdmits(origin, admittedDataOrigins(), self);
}

/** A consent request awaiting the user's decision. The dialog renders this and
 *  calls `decide` exactly once; a second call is a no-op (already settled). */
export interface PendingConsent {
  readonly id: number;
  /** The origins (`scheme://host[:port]`) the bundle is asking to reach — already
   *  filtered by the SDK door to its declared allow-list, minus remembered grants. */
  readonly origins: readonly string[];
  /** The human-readable reason the bundle stated for the reach. */
  readonly purpose: string;
  /** Settle this request. `granted` is the subset the user allowed (anything
   *  outside `origins` is ignored); the remainder is denied. `remember` asks the
   *  SDK door to persist the grant for this document (survives reopen). */
  decide(decision: { granted: readonly string[]; remember: boolean }): void;
}

/** The React-facing view of the pending queue (a `useSyncExternalStore` source). */
export interface ConsentController {
  subscribe(listener: () => void): () => void;
  /** The request at the head of the FIFO queue (one prompt at a time), or null. */
  current(): PendingConsent | null;
}

export interface EditorConsent {
  /** Injected into `loadBundle({ consent })` — the SDK door calls `request`. */
  backend: ConsentBackend;
  /** Bound to the `<ConsentDialog>` so it renders + resolves the prompt. */
  controller: ConsentController;
}

/**
 * Build the editor's consent backend + its UI controller. The backend queues a
 * pending request per `requestConsent` call and resolves it when the dialog
 * (or, in tests, the `__consent` handle) decides. Closing the dialog without a
 * grant denies every origin — default-deny is the dismissal, not a special path.
 */
export function createEditorConsentBackend(): EditorConsent {
  let seq = 0;
  const queue: PendingConsent[] = [];
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const l of listeners) l();
  };

  const controller: ConsentController = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    // Stable across calls while the head is unchanged (the object is created
    // once), so it is a safe `getSnapshot` for `useSyncExternalStore`.
    current() {
      return queue[0] ?? null;
    },
  };

  const backend: ConsentBackend = {
    request(origins, purpose): Promise<ConsentResult> {
      return new Promise<ConsentResult>((resolve) => {
        const id = ++seq;
        const requested = [...origins];
        const pending: PendingConsent = {
          id,
          origins: requested,
          purpose,
          decide({ granted, remember }) {
            const idx = queue.findIndex((p) => p.id === id);
            if (idx === -1) return; // already settled
            queue.splice(idx, 1);
            const grantedSet = new Set(
              granted.filter((o) => requested.includes(o)),
            );
            resolve({
              granted: requested.filter((o) => grantedSet.has(o)),
              denied: requested.filter((o) => !grantedSet.has(o)),
              remembered: remember && grantedSet.size > 0,
            });
            notify();
          },
        };
        queue.push(pending);
        notify();
      });
    },
  };

  return { backend, controller };
}
