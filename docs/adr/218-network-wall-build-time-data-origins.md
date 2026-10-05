# ADR 218 — The network wall admits exact data origins listed at build time

- **Status:** Accepted, 2026-10-05.
- **Scope:** `apps/canvas/src/boot/network-policy.ts`, `apps/canvas/vite.config.ts`,
  `apps/canvas/public/_headers`, `apps/canvas/src/plugin-consent.ts`,
  `apps/canvas/src/ConsentDialog.tsx`, `scripts/network-policy.test.mjs`

## Context

The editor ships one hard network wall: `Content-Security-Policy: connect-src 'self' blob: data:`,
as a response header in `public/_headers` and as an injected `<meta>` (ADR 211). Every fetch,
XHR and WebSocket the page and its workers make passes through it, whoever makes it.

Behind the wall sits a softer gate. `host.network` asks the user to consent per origin before a
plugin reaches it. paged.data uses it for remote data sources: it fetches a CSV, JSON or
Parquet URL only for an origin the host reports as consented. With the wall at `'self'`, a
consented origin is still blocked, so remote sources never work in the browser.

The request was for the wall to follow the consent grants. A header policy cannot do that:

- The policy is fixed when the document loads. A `<meta>` policy added later only adds a
  further policy, and policies intersect; nothing can widen the wall after load.
- Widening the wall to `https:` would make the consent gate the only control, and that gate
  is advisory: it is honoured by code that asks it. The page also fetches on behalf of
  document content that is not plugin code: the engine can follow links in a document, and
  DuckDB-WASM reads a URL from SQL alone (`read_csv('https://…')`), so a document's saved
  query could reach the network. With `https:` an opened document could make requests
  without anyone consenting. This is the auto-fetch-on-open threat the wall exists for.
- A host network door that fetches for the plugin (`host.network.fetch`) would run in the same
  page under the same wall. To follow runtime grants it has to fetch from outside the page:
  through a same-origin server proxy (this editor has no backend, ADR 211) or through a
  helper document on a separate origin with its own policy, reached by `postMessage`. Both
  need a new plugin door, a hosted component and a review of the broker as an egress path.

## Decision

The wall stays a static policy, and a deployment may extend it with exact data origins chosen
at build time.

- `PAGED_DATA_ORIGINS` (comma or space separated) lists the origins. Each entry must be an
  exact origin: `https://host[:port]`, or `http://` on a loopback host for local work. A
  wildcard, a bare scheme, a path, a query or credentials fail the build. The wall never
  becomes `https:`.
- One module, `src/boot/network-policy.ts`, builds the policy. `vite.config.ts` uses it for
  the dev header, the injected `<meta>` and, when origins are listed, the `_headers` copy in
  the build output. The header and the `<meta>` intersect, so they must always carry the same
  list. The committed `public/_headers` keeps the floor.
- Admitting an origin does not replace consent. A listed origin is reached only after the
  user consents to it in the editor, because the plugin's own gate still runs first.
- The consent dialog says, per origin, when this build's wall does not admit it: allowing it
  records the user's consent, but requests to it stay blocked. The build passes the list to
  the page as `__PAGED_DATA_ORIGINS__`.
- With no list, the policy is the floor, exactly as before.

## Consequences

- A self-hosted or managed deployment can make known data services work by listing them,
  as a reviewed configuration change rather than a code change.
- The public editor build lists nothing, so its remote data sources stay blocked. paged.data
  reports the failed fetch as a diagnostic on the source.
- Following arbitrary runtime grants remains open. It needs a plugin door
  (`host.network.fetch`, "no plugin door") and a broker outside the page's policy (host UI
  and infrastructure). That is recorded as the D-03 residual in the plugin-platform RFI.
- paged.data guards every query with DuckDB's own parser: exactly one SELECT over imported
  tables, with no file or URL table functions. Without that guard, listing an origin would
  also admit SQL-driven reads of it.

## Evidence

- `scripts/network-policy.test.mjs` (`pnpm test:network-policy`, CI `checks` job): parsing,
  rejection of anything wider than an exact origin, the `_headers` rewrite, and the lock-step
  between the committed floor and the module.
- `tests/e2e/network-consent.spec.ts` AC-NET-1: an external fetch trips `connect-src` on the
  default build.
