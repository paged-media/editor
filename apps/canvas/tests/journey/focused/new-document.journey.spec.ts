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

// Journey: File ▸ New from scratch.
//
// The simplest production step — a designer creates a new document — and
// the first proof that the oracle reads an empty context correctly: a
// blank canvas shows no object/text controls, exactly as InDesign does.

import { expect, test } from "@playwright/test";

import { EMPTY_DOC } from "../driver/context-contract";
import { Designer } from "../driver/designer";

test.describe("journey · new document", () => {
  test("File ▸ New mints a blank Letter page with an empty context @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @level:edge", async ({
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
