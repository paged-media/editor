// D-11 (rfc-credential-store) — the editor's `SecretStoreBackend` behind
// `host.secrets`. A REFERENCE-ONLY credential store for authenticated
// DB-attach / remote data sources: a bundle holds `credentialRef` STRINGS
// (e.g. `keychain:source-4`), never secret material — so the door is
// set/exists/forget and there is NO get anywhere. Secret bytes never leave
// this realm; the HOST injects the connection string / Authorization header
// at the attach/fetch door on its own side of the wire.
//
// The SDK door (plugin-sdk `host-impl.ts`) owns the capability gate (an
// undeclared `capabilities.secrets` rejects), the plugin-id namespacing,
// and the no-backend honest path. This module owns what the SDK cannot: the
// storage TIER and the user PROMPT (the RFC's "via host UI only").
//
// Two tiers, honestly tiered (RFC §2/§3):
//
//  - WEBCRYPTO-WRAPPED IndexedDB — when a user passphrase is set. A
//    passphrase-derived AES-GCM key (PBKDF2) wraps each secret; the
//    ciphertext + iv + salt live in IndexedDB keyed `paged:<plugin-id>:<ref>`.
//    Survives reload. This is the WEAKER tier the RFC names (no OS keychain
//    on the pure-web path — that is the strong tier behind a future shell);
//    the prompt says so.
//  - SESSION-ONLY in-memory — when no passphrase/backing is configured. Refs
//    die with the tab; documents stay inert until re-entered (the RFC's
//    honest degradation). The default until a passphrase is set.
//
// `set` PROMPTS: it queues a request the SecretPromptDialog renders (the ref
// + the plugin-supplied value as a suggested default + the tier label); the
// user confirms/edits, and only the user-confirmed value is stored. A
// plugin-supplied secret is never persisted silently.

import type { SecretStoreBackend } from "@paged-media/plugin-sdk";

// ── The prompt queue (consent-style, mirrors plugin-consent.ts) ────────────

/** A `set` awaiting the user's confirmation. The dialog renders it and calls
 *  `decide` exactly once; a second call is a no-op (already settled). */
export interface PendingSecret {
  readonly id: number;
  /** The plugin asking (its manifest id) — shown so the user knows who. */
  readonly pluginId: string;
  /** The credential reference the source maps to (e.g. `keychain:source-4`). */
  readonly ref: string;
  /** The value the plugin SUGGESTED (a default the user may edit/clear). The
   *  store never persists this without the user confirming it. */
  readonly suggested: string;
  /** The storage tier the store will use, surfaced honestly in the prompt
   *  ("persisted, wrapped" vs "this session only"). */
  readonly tier: SecretTier;
  /** Settle the prompt. `value` is the user-confirmed secret to store;
   *  `null` cancels (nothing stored — the `set` rejects, the RFC's honest
   *  "the user declined"). */
  decide(value: string | null): void;
}

/** Which tier the store is currently using. */
export type SecretTier = "webcrypto" | "session";

/** The React-facing view of the pending queue (a `useSyncExternalStore` source). */
export interface SecretPromptController {
  subscribe(listener: () => void): () => void;
  /** The request at the head of the FIFO queue (one prompt at a time), or null. */
  current(): PendingSecret | null;
  /** The active tier — drives the prompt's honest tier label + lets a future
   *  settings affordance flip it by setting a passphrase. */
  tier(): SecretTier;
  /** Configure the WebCrypto tier with a user passphrase (persisted, wrapped).
   *  Absent / cleared (`null`) → the session-only fallback. */
  setPassphrase(passphrase: string | null): void;
}

export interface EditorSecretStore {
  /** Injected into `loadBundle({ secrets })` — the SDK door calls this. */
  backend: SecretStoreBackend;
  /** Bound to `<SecretPromptDialog>` so it renders + resolves the prompt. */
  controller: SecretPromptController;
}

// ── WebCrypto helpers (the wrapped-IndexedDB tier) ─────────────────────────

const DB_NAME = "paged-secrets";
const STORE = "secrets";

/** One stored record: AES-GCM ciphertext + its iv + the PBKDF2 salt (so the
 *  passphrase-derived key is reproducible on reload). No plaintext, ever. */
interface WrappedSecret {
  ciphertext: ArrayBuffer;
  iv: Uint8Array<ArrayBuffer>;
  salt: Uint8Array<ArrayBuffer>;
}

/** A fresh, ArrayBuffer-backed random byte view. Typed `Uint8Array<ArrayBuffer>`
 *  (not the default `Uint8Array<ArrayBufferLike>`) so it satisfies the strict
 *  `BufferSource` the TS 5.7+ WebCrypto lib types require — they reject a
 *  possibly-shared backing buffer. */
function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(buf);
  return buf;
}

/** UTF-8 encode into an ArrayBuffer-backed view (same `BufferSource` reason). */
function utf8(s: string): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(s);
  const out = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  out.set(bytes);
  return out;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB.open failed"));
  });
}

function idbDo<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("idb request failed"));
        tx.oncomplete = () => db.close();
      }),
  );
}

/** Derive an AES-GCM key from the passphrase + salt (PBKDF2-SHA-256). */
async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    utf8(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** The storage namespace key for a (plugin, ref) pair — `paged:<id>:<ref>`. */
const nsKey = (pluginId: string, ref: string): string =>
  `paged:${pluginId}:${ref}`;

// ── The store ──────────────────────────────────────────────────────────────

/**
 * Build the editor's secret-store backend + its UI controller. The backend
 * queues a prompt per `set` and stores ONLY the user-confirmed value, into
 * the active tier (WebCrypto-wrapped IndexedDB when a passphrase is set,
 * else a session-only in-memory map). `exists`/`forget` consult the same
 * tier. There is no read-back door anywhere — the trust line holds by
 * construction (the value crosses the wire only HOST-ward, at the attach
 * door, which lives elsewhere; this store never returns plaintext to a
 * caller).
 */
export function createEditorSecretStore(): EditorSecretStore {
  let seq = 0;
  const queue: PendingSecret[] = [];
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const l of listeners) l();
  };

  // The session-only tier (default): a write-namespaced map. We keep the
  // value here ONLY so the host injector can resolve it later — it is never
  // returned to a plugin (no get door exists).
  const session = new Map<string, string>();
  let passphrase: string | null = null;
  const webCryptoAvailable =
    typeof crypto !== "undefined" &&
    !!crypto.subtle &&
    typeof indexedDB !== "undefined";
  const tier = (): SecretTier =>
    passphrase !== null && webCryptoAvailable ? "webcrypto" : "session";

  // --- tier-aware primitives ---------------------------------------------

  async function store(pluginId: string, ref: string, value: string): Promise<void> {
    const key = nsKey(pluginId, ref);
    if (tier() === "webcrypto") {
      const salt = randomBytes(16);
      const iv = randomBytes(12);
      const cryptoKey = await deriveKey(passphrase!, salt);
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        utf8(value),
      );
      const record: WrappedSecret = { ciphertext, iv, salt };
      await idbDo("readwrite", (s) => s.put(record, key));
      // Mirror into the session map too, so the host injector can resolve
      // it without re-prompting for the passphrase mid-session.
      session.set(key, value);
    } else {
      session.set(key, value);
    }
  }

  async function has(pluginId: string, ref: string): Promise<boolean> {
    const key = nsKey(pluginId, ref);
    if (session.has(key)) return true;
    if (webCryptoAvailable) {
      // A wrapped record may exist from a prior session even before the
      // passphrase is re-entered — `exists` reports the REF is held (the
      // source needn't be re-entered), without decrypting.
      const rec = await idbDo<WrappedSecret | undefined>("readonly", (s) =>
        s.get(key),
      );
      return rec !== undefined;
    }
    return false;
  }

  async function remove(pluginId: string, ref: string): Promise<void> {
    const key = nsKey(pluginId, ref);
    session.delete(key);
    if (webCryptoAvailable) {
      await idbDo("readwrite", (s) => s.delete(key)).catch(() => {});
    }
  }

  // --- the controller (UI source) ----------------------------------------

  const controller: SecretPromptController = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    current() {
      return queue[0] ?? null;
    },
    tier,
    setPassphrase(p) {
      passphrase = p && p.length > 0 ? p : null;
      notify();
    },
  };

  // --- the backend (SDK door target) -------------------------------------

  const backend: SecretStoreBackend = {
    // "via host UI only": queue a prompt; store ONLY what the user confirms.
    set(pluginId, ref, secret): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const id = ++seq;
        const pending: PendingSecret = {
          id,
          pluginId,
          ref,
          suggested: secret,
          tier: tier(),
          decide(value) {
            const idx = queue.findIndex((p) => p.id === id);
            if (idx === -1) return; // already settled
            queue.splice(idx, 1);
            notify();
            if (value === null) {
              reject(
                new Error(
                  `host.secrets.set("${ref}") — the user declined to store ` +
                    `the credential (the source stays inert until entered).`,
                ),
              );
              return;
            }
            store(pluginId, ref, value).then(resolve, reject);
          },
        };
        queue.push(pending);
        notify();
      });
    },
    exists(pluginId, ref) {
      return has(pluginId, ref);
    },
    forget(pluginId, ref) {
      return remove(pluginId, ref);
    },
  };

  return { backend, controller };
}
