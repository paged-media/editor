# ADR 214 — Every operation is proven by one invariant: model, pixels, byte-identical undo

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `apps/canvas/tests/e2e/harness/` (`op-sandwich.ts`, `doc-op-pass.ts`, `pixel-diff.ts`, `model-dump.ts`) and the operation suites under `apps/canvas/tests/e2e/`

## Context

`docs/reference/testing.md:9-11` states the question this suite answers: whether an operation was
applied to the document that is rendered on the canvas, and not only whether a panel updated
its DOM. The per-panel behaviour specs in `apps/canvas/tests/*.spec.ts` and the fidelity
suite existed already; the suite is described as a complement to them (`docs/reference/testing.md:3-7`).

Commit `5d88079` (2026-06-05) added a harness that answers the question in the same way for
every operation. Its message describes the harness as the invariant that proves an operation
lands in the document rendered on the canvas.

The harness relies on a property of the engine. Its header states that undo restoring the
render byte for byte is an engine guarantee on the CPU renderer, which is single-threaded and
deterministic, and that a violation is an "engine bug, not test flake"
(`apps/canvas/tests/e2e/harness/op-sandwich.ts:32-35`).

## Decision

An operation counts as working when one wrapper, `opSandwich`, passes. The wrapper runs the
same sequence around any operation:

1. Take a page snapshot and, when the caller supplies `dumpModel`, a model dump.
2. Apply the operation. The caller drives the real UI where one exists, otherwise
   `client.mutate` or a gesture.
3. Wait for the worker's reply and require that it lists the page as dirty. A missing page
   id throws.
4. Run the caller's model assertions.
5. Compare the new snapshot with the baseline: at least one pixel changed inside the
   declared region, and none outside the region plus 24 px of slack. An optional control
   page must be byte-identical. An operation declared `noRenderChange` must change no pixel.
6. Undo. The model dump must equal the baseline dump, and the snapshot must equal the
   baseline snapshot byte for byte (tolerance 0 unless the caller sets one).
7. Redo, run the model assertions again, then undo once more so the document is back at the
   baseline for the next test.

Snapshots are requested from the worker at 420 px width by default, through the CPU snapshot
path. `doc-op-pass.ts` runs a curated set of operations through the same wrapper against any
loaded document and classifies each as `pass`, `skip`, `render-stale` or `error`.

## Evidence

- `apps/canvas/tests/e2e/harness/op-sandwich.ts:19-35` — the sequence and the engine guarantee
- `apps/canvas/tests/e2e/harness/op-sandwich.ts:176-225` — baseline, apply, the reply wait, the invalidation throw
- `apps/canvas/tests/e2e/harness/op-sandwich.ts:229-352` — the render check, containment, the control page
- `apps/canvas/tests/e2e/harness/op-sandwich.ts:354-401` — undo (model and pixels), redo
- `apps/canvas/tests/e2e/harness/op-sandwich.ts:60-95` — the options: region, slack, containment, `noRenderChange`, `dumpModel`, `undoPixelTolerance`, `skipUndoPixelCheck`
- `apps/canvas/tests/e2e/harness/doc-op-pass.ts:20-43`, `:54-71` — the document-parameterised pass and its four outcomes
- `apps/canvas/tests/fidelity/canvas-driver.ts:360-385` — snapshots use the CPU path unless `BACKEND=gpu` is set
- `docs/reference/testing.md:20-60`, `:133-155` — the authors' description, the steps for a new operation, the conventions

## Alternatives considered

None recorded in the repository.

## Consequences

A new wire operation is expected to get a sandwich test, driven through the UI where there
is one (`docs/reference/testing.md:133-145`). The convention is not to loosen a threshold to hide a
regression (`docs/reference/testing.md:154-155`).

The suite depends on the engine's CPU renderer being deterministic. An undo that does not
restore the pixels is treated as an engine defect; `docs/engine-findings.md` lists the engine
defects the suite surfaced. `skipUndoPixelCheck` waives the pixel leg of undo only: it takes
a reason string, keeps the model check, and its comment requires a separate `test.fail` that
owns the strict check. It is set at four call sites: `character-ops.spec.ts:162` in
`apps/canvas/tests/e2e`, and `doc-op-pass.ts:798`, `:1020` and `:1084` in the harness.

The invariant is narrower than its name in three ways that the code shows:

- Not every test uses it. 20 of the 85 spec files in `apps/canvas/tests/e2e` call
  `opSandwich`, and two more reach it through `docOpPass`.
- `dumpModel` is optional. Without it, undo is checked on pixels and on the caller's
  `expectRestored` only (`op-sandwich.ts:78-80`, `:361-366`).
- Redo is checked against the model assertions. There is no pixel comparison after redo.

The render check re-samples for up to five seconds before it fails, because one snapshot is
one sample of an asynchronous rebuild (`op-sandwich.ts:248-272`). With `BACKEND=gpu` the
snapshots come from the GPU readback, for which the header claims no guarantee.

## Related

- [ADR 215](215-measured-capability-table.md) — which operations the engine supports at all
- [ADR 216](216-test-tiers.md) — where this suite runs and what it gates
- [ADR 100](https://github.com/paged-media/core/blob/main/docs/adr/100-two-rasterisers-one-trait.md) — the CPU rasteriser this suite reads back
- [ADR 110](https://github.com/paged-media/core/blob/main/docs/adr/110-one-undo-timeline.md) — the undo the invariant exercises
