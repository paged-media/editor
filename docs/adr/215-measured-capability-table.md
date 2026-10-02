# ADR 215 — The capability table is measured, not declared

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `apps/canvas/tests/e2e/harness/capabilities.ts`, `apps/canvas/tests/e2e/capability-matrix.spec.ts`, and the readers `scripts/seam-guard.mjs` and `apps/canvas/tests/showcase/ledger.ts`

## Context

The engine publishes its mutation operations as a TypeScript union, `Mutation`, in the type
file of `@paged-media/canvas-wasm`. That says which operations can be sent. It does not say
which ones the engine applies. `scripts/seam-guard.mjs:37-43` makes this distinction and
names an operation that is in the type file and, by its account, answers `notImplemented`.

The editor needs the second answer in several places: to decide whether a control may be
labelled as waiting for the engine, to count what a reference document exercises, and to
feed a feature registry outside this repository.

A first table was seeded on 2026-06-05 by probing each operation. On 2026-08-09 a recapture
found that the table had drifted 21 protocol versions without a failing run: it listed 94
operations while the engine declared 117, because the probe checked only the operations the
table listed (`apps/canvas/tests/e2e/harness/capabilities.ts:31`, `:49-56`).

## Decision

Engine support per wire operation is recorded in one checked-in table, and two tests keep it
true: one measures each row against a running engine, one enumerates the engine's own list.

- `CAPABILITIES` holds one row per operation: `op`, `status` (`supported` or `unsupported`)
  and an optional note. At the pinned commit it has 118 rows, 116 of them `supported`.
- The probe test loads three generated fixtures and builds one mutation per operation.
  Probes that edit or delete a resource create their own scratch resource first. The
  mutation goes through `client.mutate` and is classified by the reply: `mutationApplied`
  is `supported`, anything else `unsupported`. The probe then undoes what it did.
- The run fails when a classification differs from the table in either direction, when a
  probed operation is missing from the table, or when a table row was never probed.
- The cover test reads the `Mutation` union from the installed package's type file and
  fails for every operation that is not in the table. `batch` is exempt as an envelope. The
  list of known unclassified operations may only shrink, and is empty.
- An operation is not classified from guessed arguments. The header gives the reason: a
  wrong guess reports `unsupported` when the engine does support the operation, and "false
  evidence here propagates straight into the capability registry".
- Other checks read the table and not the type file: the seam guard, and the operation axis
  of the showcase ledger.

## Evidence

- `apps/canvas/tests/e2e/harness/capabilities.ts:19-29`, `:106-256` — purpose, statuses, the table
- `apps/canvas/tests/e2e/harness/capabilities.ts:49-72`, `:90-96` — the drift, why nothing is guessed, how the gap was closed
- `apps/canvas/tests/e2e/capability-matrix.spec.ts:20-35`, `:63-101` — the probe design; classification by reply kind
- `apps/canvas/tests/e2e/capability-matrix.spec.ts:2180-2219`, `:2271-2292` — the probe loop and the comparison with the table
- `apps/canvas/tests/e2e/capability-matrix.spec.ts:2295-2384` — the cover test, the `batch` exemption, the shrink-only list
- `scripts/seam-guard.mjs:26-43`, `:139-149`, `:164` — a seam that names a `supported` operation fails; why the table and not the type file
- `apps/canvas/tests/showcase/ledger.ts:27-31`, `:50-53` — the ledger's operation universe is this table

## Alternatives considered

Deriving support from the type file alone: rejected in `scripts/seam-guard.mjs:37-43`.
Classifying new operations with guessed arguments: rejected in `capabilities.ts:66-72`.

One test for both questions: rejected. The cover test is separate so that a new, unclassified
operation can be reported without failing the classification run
(`capability-matrix.spec.ts:2316-2319`).

## Consequences

Moving the engine pin to a version with a new operation fails the cover test until the
operation has a row, and the probe test then fails until the row has a probe
(`capability-matrix.spec.ts:2286-2290`). Both tests are in `apps/canvas/tests/e2e` and run in CI
with the behaviour suite ([ADR 216](216-test-tiers.md)).

"Measured" means the engine accepted the mutation. The header defines `supported` as "op
applies, model changes, undo restores" (`capabilities.ts:28`); the probe checks the reply
kind and does not assert a model change or the result of undo. Those are asserted by the
suites of [ADR 214](214-operation-sandwich.md), for the operations they cover.

The two `unsupported` rows carry notes saying that the engine operation is live and that the
generated fixtures hold no conditions to probe (`capabilities.ts:136-137`). In that case
their probes return `null`, the loop records a skipped prerequisite, and skipped results are
not compared (`capability-matrix.spec.ts:1584-1598`, `:2201-2208`, `:2274`).
`scripts/seam-guard.mjs:38-41` gives a different account of one of the two: that it answers
`notImplemented`.

`docs/reference/testing.md:83-85` still describes the first seed (five stubs, "the other 55 wire ops
are live"). Comments in `capabilities.ts` and the spec name a script in a repository that is
not public as the registry-side reader; that reader cannot be seen from this repository.

## Related

- [ADR 207](207-honest-seams.md) — the seams the seam guard checks against this table
- [ADR 217](217-showcase-reference-document.md) — the ledger that counts operations against it
- [ADR 200](200-engine-as-npm-wasm-packages.md) — the installed package the cover test reads
- [ADR 005](https://github.com/paged-media/core/blob/main/docs/adr/005-wire-recipe.md), [ADR 019](https://github.com/paged-media/core/blob/main/docs/adr/019-capability-catalog-one-contract.md) — the engine's generated operation contract
