# ADR 221 — Claude reaches the editor through one same-origin proxy

- **Status:** Accepted, 2026-10-11.
- **Amends:** ADR 211 (the editor has no backend), for one route.
- **Scope:** `apps/canvas/functions/api/ai/[[path]].ts`, `apps/canvas/vite.config.ts` (dev proxy),
  `packages/shell/src/ai/`, `packages/shell/src/components/cockpit/ai-assistant.tsx`,
  `packages/shell/src/chrome/NewFromBriefDialog.tsx`, `packages/shell/src/chrome/CommandPalette.tsx`,
  `apps/canvas/src/panels/script-editor.tsx`, `apps/canvas/src/object-model.ts`,
  `.github/workflows/playground.yml`; the agent itself is `@paged-media/ai` (plugin-sdk ADR 325).

## Context

The editor carried three places that promised AI and did nothing: the AI Assistant card in the
Properties panel, the command palette's assistant row, and (implicitly) the Script panel, which
only a developer could use. The model chosen for all of them is Claude Haiku 5.5
(`claude-haiku-5-5`): fast and cheap enough to run on every suggestion click.

Three constraints shape where the model call can happen:

- The editor runs in the browser. An Anthropic API key shipped to the page is a key given to
  everyone who opens it.
- The network wall (ADR 218) is `connect-src 'self'`. A call to `api.anthropic.com` would need
  the wall widened at build time, and would still need a key in the page.
- The editor has no backend (ADR 211), and the editor-server is being replaced.

## Decision

**The model is reached through one same-origin route, `/api/ai/v1/messages`, served by a
Cloudflare Pages Function on the playground project.** The browser never holds a key and the
wall is unchanged.

**The proxy is not a relay.** The client sends a mode (`x-paged-ai-mode`: `script`, `assist`,
`complete`, `document`) and the conversation, nothing else. The function rebuilds every other
part of the request from the mode with the same code the CLI uses (`@paged-media/ai`): the
system prompt (authoring guide plus the engine catalog), the tools, the model, the effort level
and the token cap. Mid-conversation `system` turns and block types the agent never produces
(documents, server tools) are refused. The platform key can therefore only run paged's own
agent.

**Cost is bounded on the server:** same-origin requests only, a per-IP limit on model turns per
hour, and a daily spend cap in dollars, metered from each streamed reply's `usage` and kept in a
KV namespace. Without a key the route answers 503 `ai_unavailable`; without the KV namespace it
also answers 503 (a deployment must opt out of the cap explicitly with `AI_ALLOW_UNCAPPED=1`).
Every surface shows the 503's message rather than failing silently.

**The agent runs in the page, not on the server.** Tools execute where the document is: each
script Claude writes runs through `client.executeScript`, the same undoable door as the Script
panel. Only model turns cross the network. This keeps the proxy stateless and means nothing
Claude does to a document is invisible: scripts appear in the Script panel, and every write is
an ordinary undo step.

**Three surfaces use it:**

- The Script panel's Ask bar (`script` mode). The panel is promoted out of the developer set:
  with Claude writing the script it no longer takes a developer to use it.
- The AI Assistant card (`assist` mode). The diagnosis line is computed locally from the
  collections the Publication health panel reads, with no model call. A suggestion or a typed
  request runs the agent on the selection. Undo reverts exactly Claude's steps: the card reads
  the top of the undo stack before and after the run (an undo immediately redone, since the
  engine has no read for it), and refuses to revert when anything was edited afterwards, rather
  than undoing the user's own work.
- File ▸ New from a brief… (`document` mode): a blank page of the chosen size, then the agent
  builds the document page by page.

Scripts can also ask Claude for text: the editor registers a typed command, `paged.ai.complete`,
in its object registry, and a script reaches it through the protocol-71 host bridge
(`JSON.parse(await paged.invoke("paged.ai.complete", { prompt }))`). No engine change was
needed.

**Attribution:** every surface carries a small "Powered by Claude" mark (`PoweredByClaude`). It
is drawn from the published Claude logo, not the house icon registries. The house rule that
icons are clean-room line glyphs, never third-party sets, does not apply to another company's
mark used to attribute its service. The spark keeps its brand colour; the wordmark takes the
text colour so it reads on the dark default theme. The source is listed in `NOTICE`.

**Turnstile was considered and deferred.** A bot challenge in front of the route would add
friction for scripted abuse, but its widget is a cross-origin iframe inside a cross-origin-isolated
page (COEP `credentialless`), which needs its own verification first. The spend cap is what
bounds cost; Turnstile would only reduce how fast an abuser reaches it.

## Consequences

- A deployment without the Pages secret and KV binding shows "AI unavailable" everywhere and
  works otherwise unchanged. Local development uses a dev-only middleware with the
  developer's own `ANTHROPIC_API_KEY`.
- The deploy now runs from `apps/canvas` so wrangler picks up `functions/`.
- `@paged-media/ai` is vendored in `packages/ai` (a byte-for-byte copy of plugin-sdk `97d40f5`)
  until its first npm publish; then the copy is deleted and the package pinned like every other
  `@paged-media` package (`packages/ai/README.md` says how). Change it upstream, never here.
- Haiku 5.5 has no server-side refusal fallback: a declined request ends the run, and each
  surface says Claude declined.

## Verification

`apps/canvas/tests/ai-script.spec.ts`, `ai-assistant.spec.ts` and `ai-new-from-brief.spec.ts`
run the real browser SDK, agent loop, worker and Boa against a stubbed `/api/ai` that streams
canned turns. The proxy's own contract (rebuilt requests, refusals, metering) is tested in
`@paged-media/ai`.
