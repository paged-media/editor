# ADR 216 — Test tiers, and where each one gates

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `apps/canvas/playwright.config.ts`, `apps/canvas/tests/`, `scripts/*.mjs`, `.github/workflows/tests.yml`, `showcase-nightly.yml`, `protocol-version.yml`

## Context

The editor's tests need different machines. Comparing a page with InDesign's output needs a
4.4 GB corpus of document packs with their reference PDFs, `pdftoppm` and a diff binary built
from the engine repository; the CI runner has none of them
(`apps/canvas/playwright.config.ts:40-47`). The WebGPU lane needs real Chrome and a Metal
flag, so it cannot run on the Linux CI runners (`:150-154`). The config pins one worker to
keep snapshots deterministic (`:68-71`).

No file in the repository describes all tiers; `README.md:135-137` and `CONTRIBUTING.md:46-47`
still describe panel specs plus fidelity. This record assembles the model from the Playwright
config and the workflow files.

## Decision

Verification is split into tiers with different oracles. The static guards and the two
Playwright tiers on the deterministic CPU path run on a push to `main` and on matching pull
requests; the other tiers are local, nightly or advisory.

| Tier | What it is | Where it runs |
|---|---|---|
| Static guards | ESLint zones and ten Node scripts under `scripts/` | `checks` job |
| Behaviour | project `chromium`: all specs except `journey/**` and `showcase/**` | `playwright` job |
| Journeys | project `journeys`: 80 spec files (44 for plugins), one of them ignored | `playwright` job |
| Journeys on WebGPU | project `journeys-gpu` | local only, macOS |
| Fidelity | `tests/fidelity.spec.ts` against InDesign reference PDFs | local only |
| Corpus mode | `tests/e2e/extensive-corpus.spec.ts` over real documents | local only, opt-in |
| Showcase | project `showcase` ([ADR 217](217-showcase-reference-document.md)) | nightly on macOS; not on push |

- `tests.yml` runs on a push to `main`, on pull requests that touch listed paths, and by
  hand. Its `playwright` job runs `--project=chromium --project=journeys` in three shards on
  Linux against the Vite dev server, with `PAGED_CI_LEAN=1`, which drops the fidelity and
  corpus specs from collection.
- A journey asserts an `ExpectedContext` after an action: tool, inspector mode, sections,
  selection, open panels, edit context, overlay handles. Every field is optional. The step
  under test uses real pointer and keyboard input; setup uses `mutate` or a script.
- Tests name the features they prove in their titles (`@feat:<id>`, `@level:<depth>`). A
  guard checks every tag against a vendored id list. The merged Playwright JSON is uploaded
  as the artifact `playwright-results`; a feature registry outside this repository pulls it.
- The guards that extract ids from source (surface coverage, seams, solo profiles, feature
  ids, the client catalogue) abort when an extractor finds fewer items than a floor. Surface
  coverage and the feature-id guard also fail when a listed exemption is no longer needed.

## Evidence

- `apps/canvas/playwright.config.ts:40-63`, `:108-116`, `:144-164`, `:190-196` — the lean list and the projects `chromium`, `journeys-gpu` ("LOCAL LANE, GATING NOTHING") and `journeys`
- `.github/workflows/tests.yml:43-66`, `:89-198` — the triggers and the `checks` job
- `.github/workflows/tests.yml:460-484`, `:487-531` — the Playwright step and why both projects must be named; two further journey runs, manual only and `continue-on-error`
- `.github/workflows/tests.yml:586-615` — the merged JSON artifact; why results are pulled and not pushed
- `apps/canvas/tests/journey/driver/context-contract.ts:19-31`, `apps/canvas/tests/journey/driver/designer.ts:20-24`, `:416-424` — the oracle, the hybrid driver, the visual checkpoint that skips under `CI`
- `apps/canvas/tests/e2e/extensive-corpus.spec.ts:19-39`, `:186` — corpus mode registers no test unless `E2E_PACKS` is set
- `scripts/feat-vocabulary-guard.mjs:26-62`, `scripts/surface-coverage.mjs:39-49`, `scripts/check-plugin-pins.mjs:107-114` — vendored vocabulary, floors, the two-way ratchet, `SKIPPED`

## Alternatives considered

Full-DOM snapshots as the journey oracle: rejected in `context-contract.ts:24-26`. Reading the
feature vocabulary across repositories with a token: rejected because such a check "degrades
to a skip" (`scripts/feat-vocabulary-guard.mjs:28-31`). Pushing results through a registry-owned
action: tried, and it failed at set-up (`.github/workflows/tests.yml:596-607`).

## Consequences

A green `tests.yml` run says nothing about WebGPU rendering, fidelity against InDesign, real
corpus documents or journey pixels. The journey checkpoints skip when `CI` is set unless
`JOURNEY_VISUAL=1`, and the 24 committed baselines are all `-darwin`. Whether a failing run
blocks a merge is a repository setting that the source does not show. The Playwright job is
not self-contained: it checks out a separate fixtures repository (sparse, with a token),
`core` at its default branch to build the fixture generator, and `plugin-doc` from source
(`tests.yml:257-303`, `:396-397`).

Two guards do not prove what their step name suggests. `test:thresholds` exits 0 with a skip
message when the corpus files are absent, and the `checks` job checks out only the editor
(`scripts/fidelity-thresholds-schema.test.mjs:28-42`). `check-plugin-pins.mjs` prints
`SKIPPED` and exits 0 without sibling checkouts, as `protocol-version.yml:50-59` says.
`test:journal` is defined in `package.json` and no workflow runs it.

Two comments contradict the workflows. `playwright.config.ts:226-228` says the showcase is
"Not part of any CI lane"; `showcase-nightly.yml` runs it every night.
`playwright.config.ts:187-189` says CI commits Linux baselines; none is committed.

## Related

- [ADR 214](214-operation-sandwich.md), [ADR 215](215-measured-capability-table.md), [ADR 024](024-context-sensitivity-is-a-core-concept.md) — the oracles of the behaviour tier; the principle the journey oracle tests
- [ADR 206](206-package-layering-lint-zones.md), [ADR 207](207-honest-seams.md), [ADR 213](213-solo-mode.md) — three of the static guards
- [ADR 105](https://github.com/paged-media/core/blob/main/docs/adr/105-fidelity-gate.md), [ADR 308](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/308-plugin-wasm.md) — the engine's own fidelity gate; the wasm budget checked in the `checks` job
