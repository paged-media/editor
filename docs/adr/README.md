# Architecture decision records

An ADR records one load-bearing decision that has already been made: what was decided, what
in the code shows it, and what it obliges other code to do. It is a record, not a proposal.
When the code stops matching a record, the body is left as it is and a dated amendment is
added at the end.

ADR numbers are unique across the paged-media repositories, so a number names the same
record wherever it is cited. New records in this repository use 200–299. Records 002, 023
and 024 predate that scheme and keep their numbers. Records 200–217 were written on
2026-10-02 from the code as it stood, for decisions made earlier; their status says so.

| ADR | Title | Status |
|---|---|---|
| [002](002-cockpit-over-dockview.md) | Shell substrate: custom Cockpit, replacing Dockview | Accepted (amended 2026-10-02) |
| [023](023-shared-panels-binding-providers.md) | Shared panels: the host owns the panel, plugins provide the values | Accepted (amended 2026-10-02) |
| [024](024-context-sensitivity-is-a-core-concept.md) | Context-sensitivity is a core concept of paged | Accepted (amended 2026-10-02) |
| [200](200-engine-as-npm-wasm-packages.md) | The engine is consumed as published npm wasm packages | Accepted, recorded retroactively 2026-10-02 |
| [201](201-plugins-as-pinned-packages.md) | First-party plugins are compiled in as pinned published packages | Accepted, recorded retroactively 2026-10-02 |
| [202](202-render-worker-owns-the-canvas.md) | The render worker owns the canvas; main thread and engine talk over a sequenced channel and shared memory | Accepted, recorded retroactively 2026-10-02 |
| [203](203-shell-is-a-registry-host.md) | The shell is an app-agnostic registry host: the app declares, the shell renders | Accepted, recorded retroactively 2026-10-02 |
| [204](204-declarative-property-panels.md) | Property panels are declarative compositions over a curated catalogue | Accepted, recorded retroactively 2026-10-02 |
| [205](205-client-packaged-as-write-sdk.md) | The editor's wasm client is packaged as the write SDK | Accepted, recorded retroactively 2026-10-02 |
| [206](206-package-layering-lint-zones.md) | Package layering is enforced by lint zones that have their own tests | Accepted, recorded retroactively 2026-10-02 |
| [207](207-honest-seams.md) | Unbacked UI ships as a visible, inert seam | Accepted, recorded retroactively 2026-10-02 |
| [208](208-tools-are-data-plus-gesture-handler.md) | Tools are data plus a gesture handler | Accepted, recorded retroactively 2026-10-02 |
| [209](209-command-is-the-action-primitive.md) | The command is the single action primitive | Accepted, recorded retroactively 2026-10-02 |
| [210](210-design-token-bridge.md) | One token file bridges the brand system to the UI substrate | Accepted, recorded retroactively 2026-10-02 |
| [211](211-no-backend.md) | The editor has no backend: documents are local files | Accepted, recorded retroactively 2026-10-02 |
| [212](212-one-automation-surface.md) | One automation surface for tests, demos and the playground | Accepted, recorded retroactively 2026-10-02 |
| [213](213-solo-mode.md) | Solo mode is a filter over the same app | Accepted, recorded retroactively 2026-10-02 |
| [214](214-operation-sandwich.md) | Every operation is proven by one invariant: model, pixels, byte-identical undo | Accepted, recorded retroactively 2026-10-02 |
| [215](215-measured-capability-table.md) | The capability table is measured, not declared | Accepted, recorded retroactively 2026-10-02 |
| [216](216-test-tiers.md) | Test tiers, and where each one gates | Accepted, recorded retroactively 2026-10-02 |
| [217](217-showcase-reference-document.md) | The showcase: one reference document built through the real editor | Accepted, recorded retroactively 2026-10-02 |

Decisions made in other repositories that this editor's code rests on are listed in
[`../README.md`](../README.md). Comments in the source also cite ADR 025 (the journal) and
ADR 031 (failing loudly on a broken contract); those two records are not published.
