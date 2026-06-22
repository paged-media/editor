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

// Concept 3 — PDF export command. The DIALOG owns the option form
// and the export loop (progress + cancel); this command only opens
// it, so palette/menu/keybinding all converge on one code path.

import type { CommandContribution } from "../../registries";
import { notifyExportPdfDialog } from "../../chrome/ExportPdfDialog";

export const PAGED_FILE_EXPORT_PDF = "paged.file.exportPdf";

export function buildExportPdfCommand(): CommandContribution {
  return {
    id: PAGED_FILE_EXPORT_PDF,
    title: "Export PDF…",
    category: "File",
    handler: () => {
      notifyExportPdfDialog("open");
    },
  };
}
