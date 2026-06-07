// The editor's host-injected ASSET SOURCE for the plugin SDK (W-06).
//
// `host.assets.getFontFace(family, style?)` is the capability-gated,
// READ-ONLY door that serves a DOCUMENT font face's BYTES so a bundle
// (paged.web) can compose a real `@font-face` in its preview. The SDK
// owns the door, the gate, and the budget; the editor's only job is to
// provide a `BundleAssetProvider` rooted at the REAL document-font
// mechanism — the same injection shape as the code-editor widget and
// the problems sink.
//
// THE HONEST VERDICT (DESIGN.md §13.4): document fonts are referenced by
// NAME (IDML `Fonts/Font_*.xml` carries no bytes). The only font bytes
// the MAIN THREAD ever holds is the single default-shaping font
// (`/fonts/Inter.ttf`, fetched in `@paged-media/shell`'s document-loader
// and passed to `loadDocument(bytes, fontBytes)` as the engine's
// FALLBACK font — NOT a named per-family registration). The corpus
// family→file map (`fonts.sh` → `client.registerFont`) lives ONLY in the
// Playwright fidelity driver, never the running app. Once `registerFont`
// ingests bytes they live worker-side / wasm-side in the engine's
// `BytesResolver`; `fontRegistered` replies `{ family }` only — there is
// NO read-back door that returns a registered face's bytes.
//
// So in v1 this provider returns `null` for every family — the HONEST
// no-bytes door, not a fake (serving Inter-as-Helvetica would lie; the
// preview would show the wrong face as "the document's"). The door is
// real, gated, and budgeted; it simply has no bytes to serve yet.
//
// THE PRECISE FOLLOW-UP THAT MAKES IT SERVE REAL BYTES (core + client):
// a worker→main read on the engine's font registry —
// `client.fontFaceBytes(family, style?) → Uint8Array | null`, backed by a
// new `requestFontFaceBytes` wire pair the worker answers from the
// engine `BytesResolver` (the same store `registerFont` fills). That is a
// CORE change (a new MainToWorker/WorkerToMain message + a `BytesResolver`
// accessor). When it lands, `getFontFace` calls it and wraps the bytes;
// nothing in the door/gate/budget/manifest changes. Tracked as the W-06
// residual in plugin-web/BREAKAGE_LOG.md.

import type { BundleAssetProvider } from "@paged-media/plugin-sdk";

/**
 * Build the editor's asset provider. v1: the honest null-path door.
 * Returns `null` for every face because document face bytes are not
 * reachable on the main thread (see the file header for the verdict +
 * the exact core/client read that would expose them).
 *
 * It is wired into `loadBundle({ assetSource })` so the door + the gate
 * + the budget are all LIVE — a bundle's `getFontFace` call goes through
 * the real SDK path, the capability gate enforces
 * `capabilities.assets: ["fonts"]`, and `supports("assets.fonts@1")`
 * answers true. The bundle then degrades honestly (the substitution
 * badge stays) until the engine read lands and this provider serves
 * real bytes.
 */
export function createEditorAssetSource(): BundleAssetProvider {
  return {
    async getFontFace(_family: string, _style?: string) {
      // No main-thread access to document face bytes (header note).
      // Returning null keeps the preview honest — it substitutes and
      // badges, never shows a wrong face as the document's.
      return null;
    },
  };
}
