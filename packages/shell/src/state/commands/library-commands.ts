// Concept 2 — swatch-library commands: import an Adobe Swatch
// Exchange (`.ase`) file as swatches + a colour group (ONE undoable
// `importSwatchLibrary` mutation, parsed engine-side), and export
// the document's swatches back to `.ase` (core serialises losslessly
// from the raw channels; this side only triggers the download).

import type { PagedEditor } from "../paged-editor";
import type { CommandContribution } from "../../registries";

export const PAGED_LIBRARY_IMPORT_ASE = "paged.library.importAse";
export const PAGED_LIBRARY_EXPORT_ASE = "paged.library.exportAse";

export function buildImportAseCommand(options: {
  pickFile: () => Promise<File | null>;
  setStatus: (s: string) => void;
}): CommandContribution {
  return {
    id: PAGED_LIBRARY_IMPORT_ASE,
    title: "Import swatches (.ase)…",
    category: "File",
    handler: async (paged) => {
      const editor = paged as PagedEditor;
      const file = await options.pickFile();
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const groupName = file.name.replace(/\.ase$/i, "");
      const reply = await editor.client.mutate({
        op: "importSwatchLibrary",
        args: { bytes: Array.from(bytes), groupName },
      });
      options.setStatus(
        reply.kind === "mutationApplied"
          ? `imported swatch library “${groupName}”`
          : `swatch import failed`,
      );
    },
  };
}

export function buildExportAseCommand(options: {
  setStatus: (s: string) => void;
}): CommandContribution {
  return {
    id: PAGED_LIBRARY_EXPORT_ASE,
    title: "Save swatches (.ase)…",
    category: "File",
    handler: async (paged) => {
      const editor = paged as PagedEditor;
      const bytes = await editor.client.exportSwatchLibrary();
      const blob = new Blob([bytes.slice()], {
        type: "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "swatches.ase";
      a.click();
      URL.revokeObjectURL(url);
      options.setStatus("exported swatches.ase");
    },
  };
}

/** Shared helper for panel code: import raw `.ase` bytes (a bundled
 *  library fetch or a picked file) as ONE undoable operation. */
export async function importAseBytes(
  client: PagedEditor["client"],
  bytes: Uint8Array,
  groupName: string,
): Promise<boolean> {
  const reply = await client.mutate({
    op: "importSwatchLibrary",
    args: { bytes: Array.from(bytes), groupName },
  });
  return reply.kind === "mutationApplied";
}
