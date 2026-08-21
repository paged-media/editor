# showcase — the generated artifacts

Everything in this directory is **output**. It is produced by

```bash
cd ~/paged/editor/apps/canvas
npx playwright test --project=showcase
```

and the generator lives in `tests/showcase/` — read its README for what
the document is and why it exists.

| file | what it is |
| --- | --- |
| `showcase.paged` | the live document. Plugin frames keep their `x-paged:<id>` metadata envelopes and their `paged/<plugin>/…` container parts, so reopening it in the editor rehydrates them |
| `showcase.idml` | the baked twin — every native page item, none of the `paged/` namespace. What a reader without the plugins sees, and what InDesign opens |
| `showcase.pdf` | the same document through the engine's own PDF writer |
| `showcase.coverage.json` | which registry rows each page demonstrates, resolved against `state/registry/features` at build time |
| `pages/page-NN.png` | one render per page |

The artifacts are committed rather than gitignored, deliberately: a
reference document you have to build before you can look at it is not
much of a reference. They are also the only place the *rendered result*
of the whole stack is visible without running anything.

`showcase.coverage.json` is worth opening first. It is the document's
claim about itself, and it was checked — a page that names a registry
row which does not exist, or one the registry does not mark `shipped`,
fails the build rather than printing a bigger number.
