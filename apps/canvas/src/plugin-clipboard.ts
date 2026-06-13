// K-6 / S-14 — the editor's `ClipboardBackend` over `navigator.clipboard`,
// backing `host.clipboard`. Persistent system-clipboard read/write with a
// rich `{ text?, tabular? }` payload (the sheets grid's range copy/paste
// interchange).
//
// The SDK door (plugin-sdk `host-impl.ts`) owns the capability gate, the
// "full"/"vector"/"none" tier mapping (a "vector" grant never reaches the
// tabular half), and the no-backend honest path. This module owns only the
// raw IO the SDK cannot: laying bytes onto / reading bytes off the OS
// clipboard, and the TSV↔grid transport.
//
// WRITE puts BOTH `text/plain` (TSV — rows joined by \t within a row and \n
// between rows) AND `text/html` (a real `<table>`) on the clipboard via
// `navigator.clipboard.write([new ClipboardItem({...})])`, so a paste into
// Excel / Google Sheets / Word lands a real grid, not a tab-soup line. When
// `ClipboardItem` is unavailable (older engine / no rich-write support) it
// falls back to `writeText(text)` — the TSV still round-trips into a
// spreadsheet, only the rich HTML table is lost.
//
// READ pulls `text/plain` and parses the TSV back into `{ rows }`. (We do
// not parse pasted HTML tables in v1 — the TSV the browser exposes for a
// copied spreadsheet range is the lossless-enough floor; richer HTML-table
// ingest is a forward refinement.)
//
// Both directions are behind a feature/availability check with an honest
// fallback: when there is no `navigator.clipboard` at all, read answers
// `null` and write is a no-op. The browser also REFUSES clipboard access
// without a user gesture / permission — those rejections propagate as a
// throw the SDK door swallows (read → null, write → logged no-op), so this
// module never has to special-case them.

import type { ClipboardBackend } from "@paged-media/plugin-sdk";
import type {
  ClipboardPayload,
  TabularClipboard,
} from "@paged-media/plugin-api";

/** Does the realm expose a system clipboard at all? (Insecure contexts /
 *  older engines have no `navigator.clipboard`.) */
function hasClipboard(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard !== "undefined"
  );
}

/** Is the rich-write path (`ClipboardItem` + `clipboard.write`) available?
 *  Some engines expose `writeText` but not the multi-MIME `write`. */
function hasRichWrite(): boolean {
  return (
    hasClipboard() &&
    typeof navigator.clipboard.write === "function" &&
    typeof ClipboardItem !== "undefined"
  );
}

/** Rows → TSV: tabs between cells, newlines between rows. The spreadsheet
 *  paste interchange every host (Excel/Sheets/Word) understands. */
function rowsToTsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.join("\t")).join("\n");
}

/** TSV → rows: the inverse. Splits on \n then \t. A trailing newline yields
 *  no spurious empty row (Excel appends one on copy); CRLF is tolerated. */
function tsvToRows(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Drop a single trailing newline so a copied range doesn't gain a blank row.
  const body = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  if (body === "") return [];
  return body.split("\n").map((line) => line.split("\t"));
}

/** Escape a cell's text for safe inclusion in the HTML `<table>` body. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Rows → a minimal `<table>` HTML fragment. Excel/Sheets/Word read this
 *  as a real grid on paste (cells become cells, not tab text). */
function rowsToHtmlTable(rows: readonly (readonly string[])[]): string {
  const body = rows
    .map(
      (r) =>
        "<tr>" + r.map((c) => `<td>${escapeHtml(c)}</td>`).join("") + "</tr>",
    )
    .join("");
  return `<table>${body}</table>`;
}

/** Build the editor's clipboard backend over `navigator.clipboard`. When no
 *  clipboard exists, read → null and write → no-op (the honest fallback);
 *  the SDK door reports `supports("clipboard@1")` true regardless (a backend
 *  IS injected — the platform availability is the backend's own concern, and
 *  a denied platform access degrades honestly per call). */
export function createEditorClipboardBackend(): ClipboardBackend {
  return {
    async read(): Promise<ClipboardPayload | null> {
      if (!hasClipboard() || typeof navigator.clipboard.readText !== "function") {
        return null;
      }
      // `readText` may reject (no gesture / permission) — let it propagate;
      // the SDK door turns a thrown read into `null`.
      const text = await navigator.clipboard.readText();
      if (text === "") return null;
      const rows = tsvToRows(text);
      const tabular: TabularClipboard | undefined =
        rows.length > 0 ? { rows } : undefined;
      return {
        text,
        ...(tabular ? { tabular } : {}),
      };
    },

    async write(payload: ClipboardPayload): Promise<void> {
      if (!hasClipboard()) return; // no clipboard — honest no-op

      // The text half: an explicit `text` wins; otherwise derive TSV from the
      // tabular grid (a grid copy always wants a TSV fallback).
      const text =
        payload.text ??
        (payload.tabular ? rowsToTsv(payload.tabular.rows) : "");

      // Rich path: lay down BOTH text/plain AND a text/html <table> so a
      // paste into a spreadsheet lands a real grid. Only when there is a
      // tabular half to make a table from (a plain-text copy needs no HTML).
      if (payload.tabular && hasRichWrite()) {
        const html = rowsToHtmlTable(payload.tabular.rows);
        const item = new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        });
        // May reject (no gesture / permission) — propagate; the SDK door
        // swallows it (logged no-op).
        await navigator.clipboard.write([item]);
        return;
      }

      // Fallback: plain text only (no rich-write support, or a text-only
      // payload). The TSV still round-trips into a spreadsheet.
      if (typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
      }
    },
  };
}
