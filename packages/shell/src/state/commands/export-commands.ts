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
