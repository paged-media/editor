// SDK Phase 5 / panel-gallery pass — Info panel.
//
// The gallery's readout shape over the singleton `DocumentMeta`:
// label · mono tabular value rows with hairline separators. Same
// six fields (the spec hooks key off the row labels); richer
// Document / Active page / Output sections arrive as the meta
// surface grows (per-page size, colour profile reads).

import { useDocumentMeta } from "@paged-media/shell";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-1.5 border-b border-input last:border-b-0"
      data-info-row={label}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="pg-value text-xs" data-info-value>
        {value}
      </span>
    </div>
  );
}

export function InfoPanel() {
  const meta = useDocumentMeta();
  if (!meta) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-info-panel="loading"
      >
        Loading document info…
      </div>
    );
  }
  return (
    <div className="p-3 flex flex-col" data-info-panel="ready">
      <Row label="Document" value={meta.documentName || "—"} />
      <Row label="Pages" value={String(meta.pageCount)} />
      <Row
        label="Active page"
        value={meta.activePage ? String(meta.activePage) : "—"}
      />
      <Row label="Units" value={meta.units || "—"} />
      <Row label="Color mode" value={meta.colorMode || "—"} />
      <Row label="Dirty" value={meta.dirty ? "yes" : "no"} />
    </div>
  );
}
