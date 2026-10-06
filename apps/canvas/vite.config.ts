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

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, sep } from "node:path";
import { createReadStream, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import {
  DATA_ORIGINS_ENV,
  connectSrc,
  parseDataOrigins,
  rewriteHeadersCsp,
} from "./src/boot/network-policy";

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
const CORPUS_ENVATO = resolveCorpusSubdir("idml");

// paged.data's DuckDB-WASM query engine. The package ships it in its own
// `bin/` (duckdb-engine.wasm, duckdb-browser-eh.worker.js, duckdb-browser.mjs —
// staged by plugin-data's scripts/vendor-duckdb.sh), next to the data-js engine,
// and the bundle loads every file relative to its own module (`../bin/<file>`).
//
//   DATA_BIN     the installed package's bin/ — the source of truth, served by
//                `duckdbDistRoute` in dev and copied into `dist/bin/` by
//                `dataBundleBin` in a build.
//   DUCKDB_DIST  a sibling plugin-data checkout's vendor/duckdb-wasm/dist —
//                dev-only FALLBACK for a package that predates the shipped
//                engine (@paged-media/data <= 0.1.0-canary.9 imported the dist
//                from vendor/ and shipped no DuckDB). Locally plugin repos live
//                under ~/paged/plugins/; a direct sibling is probed second.
//                Nothing in CI checks plugin-data out; there the package is
//                the only source.
const DATA_BIN = resolve(__dirname, "node_modules", "@paged-media", "data", "bin");
const DUCKDB_DIST = (() => {
  const candidates = [
    resolve(__dirname, "..", "..", "..", "plugins", "plugin-data"),
    resolve(__dirname, "..", "..", "..", "plugin-data"),
  ];
  for (const dir of candidates) {
    try {
      if (statSync(dir).isDirectory())
        return resolve(dir, "vendor", "duckdb-wasm", "dist");
    } catch {
      // try next candidate
    }
  }
  return resolve(candidates[0], "vendor", "duckdb-wasm", "dist");
})();

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
      // credentialless (lock-step with public/_headers) so the docs playground
      // can embed the dev server cross-origin; still crossOriginIsolated for SAB.
      res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
      // Opt in to cross-origin embedding (a COEP parent blocks the iframe otherwise).
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
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
// real network surface (corpus/fonts/wasm under `/`, swatch blob: reads). A
// deployment may add EXACT data origins at build time through
// `PAGED_DATA_ORIGINS` (ADR 218): a consented remote data source on such an
// origin is reachable; nothing else is. A header CSP cannot follow runtime
// consent grants, so this is a reviewed, build-time list — never `https:`.
// We scope the policy to `connect-src` only (no `default-src`) so script/style/
// img execution is untouched — minimal blast radius, just the egress wall. The
// floor, the parsing and the `_headers` rewrite live in
// src/boot/network-policy.ts (tested by scripts/network-policy.test.mjs).
const DATA_ORIGINS = parseDataOrigins(process.env[DATA_ORIGINS_ENV]);
const CONNECT_SRC = connectSrc(DATA_ORIGINS);
// Dev adds the Vite HMR WebSocket (client live-reload) — without it `pnpm dev`
// and the Playwright runs lose hot updates.
const CONNECT_SRC_DEV = `${CONNECT_SRC} ws://127.0.0.1:* ws://localhost:*`;

const networkConnectSrcPolicy = {
  name: "network-connect-src-policy",
  configureServer(server: import("vite").ViteDevServer) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("Content-Security-Policy", CONNECT_SRC_DEV);
      next();
    });
  },
  // Build only: inject the policy as a `<meta>` so a static host that ignores
  // `_headers` still ships the wall. Skipped in dev (the header above is the
  // single source — two policies would intersect and drop the HMR socket).
  transformIndexHtml(html: string, ctx: { server?: unknown }) {
    if (ctx.server) return html;
    return html.replace(
      "</title>",
      `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CONNECT_SRC}" />`,
    );
  },
  // Build only: `public/_headers` carries the floor (committed, reviewed);
  // when the build admits data origins, the copy in the output carries the
  // same policy as the `<meta>` — the two must never disagree (they
  // intersect, so a stale floor would silently block the listed origins).
  writeBundle(options: { dir?: string }) {
    if (DATA_ORIGINS.length === 0 || !options.dir) return;
    const file = resolve(options.dir, "_headers");
    if (!existsSync(file)) return;
    writeFileSync(file, rewriteHeadersCsp(readFileSync(file, "utf8"), CONNECT_SRC));
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
        const rel = decodeURIComponent(
          req.url.slice("/fonts/".length).split("?")[0],
        );
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
        const mime =
          ext === "ttf"
            ? "font/ttf"
            : ext === "otf"
              ? "font/otf"
              : "application/octet-stream";
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
 * `corpus/idml/packs/<name>/template.idml` — note the *raw* Envato
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
 *        generated/<base>  -> corpus/idml/generated/<base>.idml
 *        samples/<base>    -> corpus/idml/samples/<base>.idml
 *        packs/<name>      -> corpus/idml/packs/<name>/template.idml
 *   (legacy `file/<name>` with no group still resolves a pack.)
 */
function corpusIdmlRoute(): import("vite").Plugin {
  // Resolve the corpus ROOT directly. It used to be
  // `resolve(CORPUS_ENVATO, "..")` — derived from the envato path — and
  // that broke the moment envato moved one level deeper into
  // `vendor/envato`: the root silently became `corpus/vendor`, the
  // generated/samples routes pointed at directories that do not exist,
  // the corpus picker rendered nothing, and the failure surfaced as
  // `getByLabel('Load corpus IDML')` not found. Deriving one path from
  // another is exactly the coupling the restructure exists to remove.
  const CORPUS_ROOT = resolveCorpusSubdir(".");
  const PACKS_DIR = resolve(CORPUS_ENVATO, "packs");
  // Assets are grouped by FORMAT since the corpus grew past IDML.
  const GENERATED_DIR = resolve(CORPUS_ROOT, "idml", "generated");
  const SAMPLES_DIR = resolve(CORPUS_ROOT, "idml", "samples");
  const MANIFEST = resolve(CORPUS_ENVATO, "manifest.json");
  const STAGE_RANK: Record<string, number> = { smoke: 0, gated: 1, skip: 2 };
  const GROUP_RANK: Record<string, number> = {
    generated: 0,
    sample: 1,
    pack: 2,
  };
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
        const rest = decodeURIComponent(
          req.url.slice("/corpus/idml/".length).split("?")[0],
        );

        if (rest === "list") {
          const entries: Array<{
            id: string;
            label: string;
            group: string;
            stage?: string;
          }> = [];
          // generated/* + samples/* — flat dirs of <base>.idml
          for (const base of listIdml(GENERATED_DIR)) {
            entries.push({
              id: `generated/${base}`,
              label: base,
              group: "generated",
            });
          }
          for (const base of listIdml(SAMPLES_DIR)) {
            entries.push({
              id: `samples/${base}`,
              label: base,
              group: "sample",
            });
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
                if (
                  !statSync(resolve(PACKS_DIR, name, "template.idml")).isFile()
                )
                  continue;
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
              (STAGE_RANK[a.stage ?? ""] ?? 1) -
                (STAGE_RANK[b.stage ?? ""] ?? 1) ||
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
          const [group, name] =
            parts.length === 2 ? parts : ["packs", parts[0]];
          const bad = (s: string) =>
            s === "" || s.includes("..") || s.includes("\\");
          let abs: string | null = null;
          if (bad(name)) {
            res.statusCode = 400;
            return res.end("bad name");
          }
          if (group === "generated")
            abs = resolve(GENERATED_DIR, `${name}.idml`);
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

/**
 * Serve paged.data's DuckDB-WASM files as RAW assets with the correct MIME
 * type, from the installed package's `bin/` first and the sibling vendor dist
 * second (see DATA_BIN / DUCKDB_DIST). paged.data boots its query engine by
 * spawning a Worker from `duckdb-browser-*.worker.js`, which then
 * nested-fetches the `duckdb-*.wasm` module (and, for the old vendor coi
 * variant, a `*.pthread.worker.js`). Vite's dev server
 * resolves the worker's top-level URL through its module graph, but the
 * worker's OWN nested `fetch`/`importScripts` for the pthread script + the
 * wasm fall through to the SPA fallback → it hands back `index.html`, and the
 * worker chokes on "Unexpected token '<'" (it expected JS/wasm). This
 * middleware intercepts any request whose path ends in one of the vendored
 * DuckDB filenames and streams the raw bytes with the right Content-Type,
 * BEFORE the SPA fallback runs. It stays graceful when neither directory has
 * the file (the file isn't there → `next()`, the bundle reports
 * `duckdb-missing` honestly). Flat-name guard mirrors `fontsRoute`.
 *
 * The worker is served same-origin, so it inherits the COOP/COEP cross-origin
 * isolation the `crossOriginIsolation` plugin sets — the SharedArrayBuffer
 * the DuckDB pthread runtime needs is available.
 */
// The VENDOR dist's browser API entry (`duckdb-browser.mjs`, the module an old
// bundle dynamically imports via `@vite-ignore`) carries ONE bare specifier:
// `import { … } from "apache-arrow"`. Served raw (the `@vite-ignore` dist is
// outside Vite's module graph), the browser can't resolve a bare specifier →
// it fetches `/apache-arrow`, hits the SPA fallback, gets `index.html`, and
// the module load fails. We rewrite that one specifier to a virtual ESM module
// id (below) that Vite DOES transform — `export * from "apache-arrow"` resolved
// through the editor's `apache-arrow` alias + dep-optimizer. Same-origin, no
// CDN, no bare specifier left for the browser. The package's own
// `bin/duckdb-browser.mjs` has apache-arrow inlined and is served untouched.
const DUCKDB_ARROW_VIRTUAL = "/@id/__x00__virtual:duckdb-apache-arrow";

function duckdbDistRoute(): import("vite").Plugin {
  // Match the vendored DuckDB dist artifacts the worker boot needs: the
  // browser worker bootstraps, the pthread worker, and the wasm modules.
  // `.map` sourcemaps are matched too so the worker's lazy sourcemap fetch
  // doesn't trip the SPA fallback either.
  const isDuckDbAsset = (name: string): boolean =>
    /^duckdb-(browser|coi|eh|mvp|engine)[\w.-]*\.(js|cjs|mjs|wasm)(\.map)?$/.test(
      name,
    );
  // The API-entry modules that carry the bare `apache-arrow` import (NOT the
  // worker IIFEs, which are self-contained). These get a body rewrite.
  const needsArrowRewrite = (name: string): boolean =>
    /^duckdb-browser\.(c?js|mjs)$/.test(name);
  const mimeFor = (name: string): string => {
    if (name.endsWith(".wasm")) return "application/wasm";
    if (name.endsWith(".map") || name.endsWith(".json"))
      return "application/json";
    // .js / .cjs / .mjs — a worker script must be served as JS (a `<`-leading
    // HTML body is the exact failure this route fixes).
    return "text/javascript";
  };
  const VIRTUAL_ID = "virtual:duckdb-apache-arrow";
  const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_ID;
  return {
    name: "static-suffix:duckdb-wasm-dist",
    // Virtual ESM the rewritten dist imports instead of the bare specifier —
    // Vite transforms its graph (apache-arrow via the editor alias).
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) return `export * from "apache-arrow";`;
      return null;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const pathOnly = decodeURIComponent(req.url.split("?")[0]);
        const base = pathOnly.split("/").pop() ?? "";
        if (!isDuckDbAsset(base)) return next();
        // Package bin/ first, the vendor dist second. The basename is a
        // flat, regex-checked name, so neither lookup can escape its dir.
        let abs: string | null = null;
        let fromVendor = false;
        for (const dir of [DATA_BIN, DUCKDB_DIST]) {
          const candidate = resolve(dir, base);
          if (!candidate.startsWith(dir)) continue;
          try {
            if (statSync(candidate).isFile()) {
              abs = candidate;
              fromVendor = dir === DUCKDB_DIST;
              break;
            }
          } catch {
            // not in this dir
          }
        }
        if (!abs) return next();
        res.setHeader("Content-Type", mimeFor(base));
        res.setHeader("Cache-Control", "no-cache");
        // Same-origin worker scripts must be embeddable under COEP.
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        if (fromVendor && needsArrowRewrite(base)) {
          // Read + rewrite the single bare `apache-arrow` specifier to the
          // virtual module URL. Small files (~30 KiB); read fully, not streamed.
          const src = readFileSync(abs, "utf8");
          const rewritten = src.replace(
            /(["'])apache-arrow\1/g,
            `"${DUCKDB_ARROW_VIRTUAL}"`,
          );
          return res.end(rewritten);
        }
        createReadStream(abs).pipe(res);
      });
    },
  };
}

/**
 * BUILD output: copy the installed @paged-media/data package's `bin/` into
 * `dist/bin/`. The bundle loads its engines with runtime-relative URLs
 * (`new URL("../bin/<file>", import.meta.url)` — data_js.js + data_js_bg.wasm,
 * and DuckDB's duckdb-browser.mjs, duckdb-browser-eh.worker.js,
 * duckdb-engine.wasm, and the json/parquet extensions in duckdb-ext/<engine>/
 * <platform>/). Vite cannot see those (they are computed, not literal), so it
 * bundles the code into `dist/assets/*.js` and leaves the files behind;
 * from `assets/`, `../bin/` is `dist/bin/`. Without this a built editor has no
 * data engine and no DuckDB at all — the dev route above only covers `vite dev`.
 *
 * Only the package's own files are copied (no vendor/ fallback in a build), so
 * a build is exactly as complete as the published package. Missing DuckDB
 * files are a warning, not an error: the plugin degrades to "duckdb-missing",
 * and REQUIRE_REAL_DUCKDB=1 journeys turn that into a failure.
 */
function dataBundleBin(): import("vite").Plugin {
  const DUCKDB_FILES = [
    "duckdb-engine.wasm",
    "duckdb-browser-eh.worker.js",
    "duckdb-browser.mjs",
  ];
  return {
    name: "paged-data-bundle-bin",
    apply: "build",
    generateBundle() {
      let names: string[] = [];
      try {
        // Recursive: DuckDB's extensions live in bin/duckdb-ext/<engine>/<platform>/.
        names = (readdirSync(DATA_BIN, { recursive: true }) as string[])
          .map((n) => n.split(sep).join("/"))
          .filter((n) => !n.endsWith(".d.ts"));
      } catch {
        this.warn(`@paged-media/data has no bin/ at ${DATA_BIN} — paged.data will not boot in this build`);
        return;
      }
      for (const name of names) {
        const abs = resolve(DATA_BIN, name);
        if (!statSync(abs).isFile()) continue;
        this.emitFile({ type: "asset", fileName: `bin/${name}`, source: readFileSync(abs) });
      }
      const missing = DUCKDB_FILES.filter((f) => !names.includes(f));
      for (const ext of ["json", "parquet"])
        if (!names.some((n) => n.startsWith("duckdb-ext/") && n.endsWith(`/${ext}.duckdb_extension.wasm`)))
          missing.push(`duckdb-ext/…/${ext}.duckdb_extension.wasm`);
      if (missing.length)
        this.warn(
          `@paged-media/data ships no ${missing.join(", ")} — DuckDB will report duckdb-missing in this build ` +
            "(publish the package with scripts/vendor-duckdb.sh, or install a local tarball)",
        );
    },
  };
}

export default defineConfig({
  // The page learns which data origins its wall admits, so the consent
  // dialog can say when a consented origin stays unreachable (ADR 218).
  define: {
    __PAGED_DATA_ORIGINS__: JSON.stringify(DATA_ORIGINS),
  },
  // apps/canvas/ lives one extra level deep than web/ — adjust the
  // workspace root so node_modules + the Cargo target dir resolve.
  root: resolve(__dirname),
  plugins: [
    react(),
    crossOriginIsolation,
    networkConnectSrcPolicy,
    fontsRoute(),
    corpusIdmlRoute(),
    duckdbDistRoute(),
    dataBundleBin(),
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
        // under corpus/idml/generated/* and corpus/idml/samples/*, not just the
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
    // One React only: a plugin bundle consumed through a local link:
    // override resolves imports from ITS realpath (its own node_modules),
    // which would mount panel components against a second React instance
    // and break hooks. Harmless for registry installs (already deduped).
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // Decision-B: the wasm loader ships in @paged-media/canvas-wasm.
    // Keep it out of the dep pre-bundle so the worker's dynamic import
    // + `?url` wasm asset resolve through Vite's module graph intact.
    // @paged-media/pdf ships the same shape (the pdf-import wasm mapper +
    // pdf.js worker, both loaded via `?url`); esbuild's dep-optimizer can't
    // read a `?url` import, so exclude it too and let Vite resolve the assets.
    // @paged-media/doc likewise (bin/docx_js_bg.wasm via `?url`), and
    // @paged-media/slide (bin/slide_js_bg.wasm via `?url`).
    //
    // @paged-media/plugin-sdk for a different reason, and it is worth
    // stating because it will bite the next canary bump: the SDK's
    // React-optional fallbacks (`schema-panel.tsx`, `widgets-fallback.tsx`)
    // do a TOP-LEVEL `await import("react")`, which its own tsup build
    // emits verbatim at target es2022. Vite's dep-optimizer compiles
    // pre-bundled deps down to the browserslist floor (chrome87 …), where
    // top-level await does not exist, so pre-bundling it fails the dev
    // server outright. Excluding it lets Vite serve the module through
    // the normal graph, where the app's own es2022 target applies.
    // @paged-media/data ships the same wasm shape as pdf/doc, but loads
    // its glue via a RUNTIME-relative dynamic import ("../bin/data_js.js",
    // @vite-ignore). Pre-bundled, the importer lives in .vite/deps and the
    // relative path 404s ("data-js wasm not built" — how the six data
    // journeys went dark when the link: override left, 2026-08-18); the
    // link era masked it because linked packages skip pre-bundling.
    exclude: [
      "@paged-media/canvas-wasm",
      "@paged-media/pdf",
      "@paged-media/doc",
      "@paged-media/slide",
      "@paged-media/data",
      "@paged-media/plugin-sdk",
    ],
    // Pre-bundle apache-arrow at server startup. The DuckDB-WASM API entry's
    // bare `apache-arrow` import is rewritten to a virtual module (see
    // duckdbDistRoute) that pulls in apache-arrow; if Vite first discovers it
    // mid-test (when the data panel boots DuckDB), the dep-optimizer kicks off
    // a server-wide reload that races the in-flight worker boot and the source
    // never reaches "ready" on a COLD first run. Optimizing it up front removes
    // that reload — the boot is then deterministic on both lanes.
    include: ["apache-arrow"],
  },
  worker: {
    format: "es",
  },
});
