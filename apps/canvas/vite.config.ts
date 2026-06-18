import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { createReadStream, readFileSync, readdirSync, statSync } from "node:fs";

// Resolve a corpus subdir, preferring a copy colocated in the editor
// (`editor/corpus/<name>`) but falling back to the sibling workspace
// checkout (`~/paged/corpus/<name>`) used in local side-by-side dev,
// where `corpus` is a peer of `editor` rather than nested inside it.
function resolveCorpusSubdir(name: string): string {
  const candidates = [
    resolve(__dirname, "..", "..", "corpus", name), // editor/corpus/<name>
    resolve(__dirname, "..", "..", "..", "corpus", name), // ~/paged/corpus/<name>
  ];
  for (const dir of candidates) {
    try {
      if (statSync(dir).isDirectory()) return dir;
    } catch {
      // try next candidate
    }
  }
  return candidates[0]; // colocated path; the route 404s if it's absent
}

const CORPUS_FONTS = resolveCorpusSubdir("fonts");
const CORPUS_ENVATO = resolveCorpusSubdir("envato");

// SharedArrayBuffer requires cross-origin isolation. Set the two
// COOP / COEP headers Vite's dev server needs so the worker can
// allocate a SAB for the camera transform. Production hosts must
// serve the same headers — without them, `new SharedArrayBuffer(...)`
// throws `SecurityError`.
const crossOriginIsolation = {
  name: "cross-origin-isolation-headers",
  configureServer(server: import("vite").ViteDevServer) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      next();
    });
  },
};

// D-03 network wall. The editor mediates plugin network access through the
// `host.network` consent door, but a same-realm (or worker) bundle could call
// `window.fetch` directly and bypass the in-process door entirely. The browser
// CSP `connect-src` is the only hard wall against that: it bounds EVERY fetch /
// XHR / WebSocket the page (and its workers) can make, no matter who issues it.
//
// The floor admits only same-origin + local-bytes schemes — the editor app's
// real network surface (corpus/fonts/wasm under `/`, swatch blob: reads). NO
// external origin is reachable, which is exact today: every first-party bundle
// declares `capabilities.network: false`, so the consented set is empty. We
// scope the policy to `connect-src` only (no `default-src`) so script/style/img
// execution is untouched — minimal blast radius, just the egress wall. Keep this
// in lock-step with `public/_headers` (the authoritative production header).
const CONNECT_SRC_FLOOR = "connect-src 'self' blob: data:";
// Dev adds the Vite HMR WebSocket (client live-reload) — without it `pnpm dev`
// and the Playwright runs lose hot updates.
const CONNECT_SRC_DEV = `${CONNECT_SRC_FLOOR} ws://127.0.0.1:* ws://localhost:*`;

const networkConnectSrcPolicy = {
  name: "network-connect-src-policy",
  configureServer(server: import("vite").ViteDevServer) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("Content-Security-Policy", CONNECT_SRC_DEV);
      next();
    });
  },
  // Build only: inject the floor as a `<meta>` so a static host that ignores
  // `_headers` still ships the wall. Skipped in dev (the header above is the
  // single source — two policies would intersect and drop the HMR socket).
  transformIndexHtml(html: string, ctx: { server?: unknown }) {
    if (ctx.server) return html;
    return html.replace(
      "</title>",
      `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CONNECT_SRC_FLOOR}" />`,
    );
  },
};

/**
 * Serve `/fonts/<name>` from `<repo>/corpus/fonts/<name>`. Lets the
 * canvas auto-fetch a default font when the user drops an IDML so
 * the editor demo shows real glyphs in dev. Path traversal blocked
 * by a flat name check.
 */
function fontsRoute(): import("vite").Plugin {
  return {
    name: "static-prefix:/fonts/",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith("/fonts/")) return next();
        const rel = decodeURIComponent(req.url.slice("/fonts/".length).split("?")[0]);
        if (rel.includes("/") || rel.includes("..") || rel === "") {
          res.statusCode = 400;
          return res.end("bad path");
        }
        const abs = resolve(CORPUS_FONTS, rel);
        try {
          if (!statSync(abs).isFile()) {
            return next();
          }
        } catch {
          return next();
        }
        const ext = abs.split(".").pop()?.toLowerCase() ?? "";
        const mime = ext === "ttf" ? "font/ttf" : ext === "otf" ? "font/otf" : "application/octet-stream";
        res.setHeader("Content-Type", mime);
        res.setHeader("Cache-Control", "no-cache");
        createReadStream(abs).pipe(res);
      });
    },
  };
}

/**
 * Dev-only: browse + load the staged Envato fidelity corpus from the
 * running editor. The loadable IDML for each pack is
 * `corpus/envato/packs/<name>/template.idml` — note the *raw* Envato
 * `.zip` bundles often ship only an `.indd`, which the engine can't
 * parse, so we deliberately serve the staged `template.idml` that the
 * Playwright fidelity suite already relies on (manifest.json). Mirrors
 * `fontsRoute`'s flat-name guard. Not wired in production (no corpus
 * there) — the `CorpusPicker` control self-hides when /list is empty.
 *
 * Three fixture groups are exposed so the whole corpus is loadable from
 * the editor's header (`generated/*` feature fixtures, `samples/*`, and
 * the envato `packs/*`):
 *
 *   GET /corpus/idml/list              -> [{ id, label, group, stage? }]
 *   GET /corpus/idml/file/<group>/<x>  -> the IDML bytes
 *        generated/<base>  -> corpus/generated/<base>.idml
 *        samples/<base>    -> corpus/samples/<base>.idml
 *        packs/<name>      -> corpus/envato/packs/<name>/template.idml
 *   (legacy `file/<name>` with no group still resolves a pack.)
 */
function corpusIdmlRoute(): import("vite").Plugin {
  const CORPUS_ROOT = resolve(CORPUS_ENVATO, "..");
  const PACKS_DIR = resolve(CORPUS_ENVATO, "packs");
  const GENERATED_DIR = resolve(CORPUS_ROOT, "generated");
  const SAMPLES_DIR = resolve(CORPUS_ROOT, "samples");
  const MANIFEST = resolve(CORPUS_ENVATO, "manifest.json");
  const STAGE_RANK: Record<string, number> = { smoke: 0, gated: 1, skip: 2 };
  const GROUP_RANK: Record<string, number> = { generated: 0, sample: 1, pack: 2 };
  // List the *.idml basenames in a flat dir (generated / samples).
  const listIdml = (dir: string): string[] => {
    try {
      return readdirSync(dir)
        .filter((f) => f.endsWith(".idml"))
        .map((f) => f.slice(0, -".idml".length));
    } catch {
      return [];
    }
  };
  return {
    name: "static-prefix:/corpus/idml/",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith("/corpus/idml/")) return next();
        const rest = decodeURIComponent(req.url.slice("/corpus/idml/".length).split("?")[0]);

        if (rest === "list") {
          const entries: Array<{
            id: string;
            label: string;
            group: string;
            stage?: string;
          }> = [];
          // generated/* + samples/* — flat dirs of <base>.idml
          for (const base of listIdml(GENERATED_DIR)) {
            entries.push({ id: `generated/${base}`, label: base, group: "generated" });
          }
          for (const base of listIdml(SAMPLES_DIR)) {
            entries.push({ id: `samples/${base}`, label: base, group: "sample" });
          }
          // packs/* — <name>/template.idml, stage from the fidelity manifest
          const stageByName = new Map<string, string>();
          try {
            const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
              packs?: Array<{ name?: string; stage?: string }>;
            };
            for (const p of manifest.packs ?? []) {
              if (p.name) stageByName.set(p.name, p.stage ?? "gated");
            }
          } catch {
            // manifest is optional — fall back to scanning the dir
          }
          try {
            for (const name of readdirSync(PACKS_DIR)) {
              try {
                if (!statSync(resolve(PACKS_DIR, name, "template.idml")).isFile()) continue;
              } catch {
                continue; // not a pack dir / no staged idml
              }
              entries.push({
                id: `packs/${name}`,
                label: name,
                group: "pack",
                stage: stageByName.get(name) ?? "gated",
              });
            }
          } catch {
            // no packs dir
          }
          entries.sort(
            (a, b) =>
              (GROUP_RANK[a.group] ?? 3) - (GROUP_RANK[b.group] ?? 3) ||
              (STAGE_RANK[a.stage ?? ""] ?? 1) - (STAGE_RANK[b.stage ?? ""] ?? 1) ||
              a.label.localeCompare(b.label),
          );
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-cache");
          return res.end(JSON.stringify(entries));
        }

        if (rest.startsWith("file/")) {
          const id = rest.slice("file/".length);
          const parts = id.split("/");
          // Accept "<group>/<name>" or legacy "<name>" (defaults to a pack).
          const [group, name] = parts.length === 2 ? parts : ["packs", parts[0]];
          const bad = (s: string) => s === "" || s.includes("..") || s.includes("\\");
          let abs: string | null = null;
          if (bad(name)) {
            res.statusCode = 400;
            return res.end("bad name");
          }
          if (group === "generated") abs = resolve(GENERATED_DIR, `${name}.idml`);
          else if (group === "samples" || group === "sample")
            abs = resolve(SAMPLES_DIR, `${name}.idml`);
          else if (group === "packs" || group === "pack")
            abs = resolve(PACKS_DIR, name, "template.idml");
          if (!abs) {
            res.statusCode = 400;
            return res.end("bad group");
          }
          try {
            if (!statSync(abs).isFile()) {
              res.statusCode = 404;
              return res.end("no such fixture");
            }
          } catch {
            res.statusCode = 404;
            return res.end("no such fixture");
          }
          res.setHeader("Content-Type", "application/octet-stream");
          res.setHeader("Cache-Control", "no-cache");
          return createReadStream(abs).pipe(res);
        }

        return next();
      });
    },
  };
}

export default defineConfig({
  // apps/canvas/ lives one extra level deep than web/ — adjust the
  // workspace root so node_modules + the Cargo target dir resolve.
  root: resolve(__dirname),
  plugins: [
    react(),
    crossOriginIsolation,
    networkConnectSrcPolicy,
    fontsRoute(),
    corpusIdmlRoute(),
  ],
  server: {
    // Pin to IPv4 so Playwright's `127.0.0.1` health-check resolves.
    // Node ≥20 may resolve `localhost` to IPv6 first, in which case
    // Vite's default "localhost" bind misses 127.0.0.1.
    host: "127.0.0.1",
    fs: {
      allow: [
        resolve(__dirname),
        resolve(__dirname, "..", ".."),
        // Corpus root (resolved to the sibling `~/paged/corpus` in
        // side-by-side dev, or `editor/corpus` if colocated) so the
        // fidelity driver + ad-hoc `/@fs/` loads can fetch fixtures
        // under corpus/generated/* and corpus/samples/*, not just the
        // envato packs the /corpus/idml/ route serves.
        resolve(CORPUS_ENVATO, ".."),
        // Sibling plugin checkouts (the pnpm `link:` chain): their
        // bundles ship wasm artifacts (sheet-js, image-js, DuckDB) the
        // dev server must serve via /@fs/ — without this the engine
        // boot 403s (the K-1 live-validation e2e surfaced it).
        resolve(__dirname, "..", "..", ".."),
        "/tmp",
        // System CMYK ICC profile dir — the fidelity suite fetches
        // CoatedFOGRA39.icc via /@fs/ to match `pdftoppm`'s output.
        "/Library/Application Support/Adobe/Color/Profiles",
      ],
    },
  },
  resolve: {
    alias: {
      // The vendored DuckDB-WASM dist (paged.data's query engine, loaded
      // from plugin-data/vendor via a @vite-ignore dynamic import) imports
      // "apache-arrow" as a bare specifier. Vite resolves that relative to
      // the dist's own location (plugin-data/vendor), where it isn't
      // installed — so pin it to the editor's copy. Without this the bundle
      // reports duckdb-missing and data binding can't drive.
      "apache-arrow": resolve(__dirname, "node_modules/apache-arrow"),
    },
  },
  optimizeDeps: {
    // Decision-B: the wasm loader ships in @paged-media/canvas-wasm.
    // Keep it out of the dep pre-bundle so the worker's dynamic import
    // + `?url` wasm asset resolve through Vite's module graph intact.
    exclude: ["@paged-media/canvas-wasm"],
  },
  worker: {
    format: "es",
  },
});
