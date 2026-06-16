// Journey: File ▸ New from scratch.
//
// The simplest production step — a designer creates a new document — and
// the first proof that the oracle reads an empty context correctly: a
// blank canvas shows no object/text controls, exactly as InDesign does.

import { expect, test } from "@playwright/test";

import { EMPTY_DOC } from "../driver/context-contract";
import { Designer } from "../driver/designer";

test.describe("journey · new document", () => {
  test("File ▸ New mints a blank Letter page with an empty context", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // The engine minted a 1-page US Letter document.
    const handle = await designer.handle();
    expect(handle.pageCount).toBe(1);
    expect(handle.pageSizesPt[0]).toEqual([612, 792]);

    // The oracle: nothing selected → no object/text/stroke sections.
    await designer.expectContext(EMPTY_DOC);

    // Visual: the blank page renders (a clean white Letter sheet).
    await designer.contentCheckpoint("blank-letter");
  });
});
