// IDML file intake — drag-drop zone + the `<input type="file">` the
// Playwright suite drives via `page.setInputFiles`. Extracted from
// PagedShell so the Header can mount the compact variant.

import { useCallback } from "react";

export interface FileDropProps {
  onFile: (file: File) => void;
  compact?: boolean;
}

export function FileDrop(props: FileDropProps) {
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) props.onFile(file);
    },
    [props],
  );
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      style={props.compact ? compactDropStyle : dropStyle}
    >
      {props.compact ? "" : "Drop an IDML file here, or "}
      <input
        type="file"
        accept=".idml,application/vnd.adobe.indesign-idml-package"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) props.onFile(file);
        }}
        style={{ marginLeft: props.compact ? 0 : 8, fontSize: 12 }}
      />
    </div>
  );
}

const dropStyle: React.CSSProperties = {
  border: "2px dashed var(--chrome-divider)",
  padding: 16,
  borderRadius: "var(--radius-lg)",
  textAlign: "center",
  color: "var(--pg-muted-fg)",
};

const compactDropStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
};
