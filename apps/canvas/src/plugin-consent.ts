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
// `public/_headers`): even a consented origin is reachable only if the page CSP
// admits it. v1 ships a default-deny floor (`'self' blob: data:`); no
// first-party bundle declares `capabilities.network` yet (all `network: false`),
// so the granted set is empty and the floor is exact. Extending the wall for a
// bundle that declares FIXED origins is a reviewed per-bundle CSP edit; dynamic
// loosening for open-ended (`origins: "consent"`) reach is the server-mediated
// M1 step — a meta/`_headers` CSP cannot be loosened after load, so an
// externally-consented origin stays browser-unreachable until then, and the
// bundle degrades honestly. This backend never lies about that: it resolves the
// user's intent; the wall is a separate, conservative gate.

import type { ConsentBackend } from "@paged-media/plugin-sdk";
import type { ConsentResult } from "@paged-media/plugin-api";

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
