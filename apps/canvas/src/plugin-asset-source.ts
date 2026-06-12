// The editor's host-injected ASSET SOURCE for the plugin SDK (W-06).
//
// `host.assets.getFontFace(family, style?)` is the capability-gated,
// READ-ONLY door that serves a font face's BYTES so a bundle
// (paged.web) can compose a real `@font-face` in its preview. The SDK
// owns the door, the gate, and the budget; the editor's only job is to
// provide a `BundleAssetProvider` rooted at the REAL font mechanism.
//
// SERVED FOR REAL since protocol v43 (the W-06 wire pair): the worker
// answers `requestFontFaceBytes { family, style? }` from the engine's
// font registry — the same store `registerFont` fills, plus the
// document-load default face. What is honestly servable is exactly
// what the ENGINE holds: wire-registered faces. IDML packages
// reference fonts by NAME only (Fonts/Font_*.xml carries no bytes), so
// an unregistered document family still answers `found:false` → null —
// the bundle keeps its substitution badge for those, never shown a
// wrong face as "the document's".

import type { CanvasClient } from "@paged-media/client";
import type { BundleAssetProvider } from "@paged-media/plugin-sdk";
import type { FontFaceAsset } from "@paged-media/plugin-api";

/** Container formats the SDK door accepts (`FontFaceFormat`). */
const KNOWN_FORMATS = new Set(["truetype", "opentype", "woff", "woff2"]);

/**
 * Build the editor's asset provider over the live engine client (the
 * same thunk idiom as the bundle loader — resolved at call time so the
 * provider survives client reloads). Serves the bytes of any face the
 * ENGINE's registry holds; `null` for everything else (the honest
 * no-bytes answer the preview substitutes + badges on).
 */
export function createEditorAssetSource(
  getClient: () => CanvasClient | null,
): BundleAssetProvider {
  return {
    async getFontFace(
      family: string,
      style?: string,
    ): Promise<FontFaceAsset | null> {
      const client = getClient();
      if (!client) return null;
      try {
        const reply = await client.send({
          kind: "requestFontFaceBytes",
          payload: { family, style: style ?? null },
        });
        if (reply.kind !== "fontFaceBytes" || !reply.payload.found) {
          return null;
        }
        const p = reply.payload;
        const format = KNOWN_FORMATS.has(p.format) ? p.format : "truetype";
        return {
          bytes: Uint8Array.from(p.bytes),
          format: format as FontFaceAsset["format"],
          postscriptName: p.postscriptName ?? undefined,
          family: p.family,
          style: p.style ?? undefined,
        };
      } catch {
        return null;
      }
    },
  };
}
