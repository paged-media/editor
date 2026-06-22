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

import { type CSSProperties } from "react";

import { useToolSettings } from "../state/tool-settings-context";
import type { ToolOptionField, ToolOptionsSpec } from "../tools/tool-options";

// Concept 1 (T8) — the double-click tool-options popover. Renders a
// spec's fields against the tool-settings store (app-state). Single-
// property writes; no document mutation.

export function ToolOptionsPopover({
  spec,
  style,
}: {
  spec: ToolOptionsSpec;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{ ...popoverStyle, ...style }}
      role="dialog"
      aria-label="Tool options"
      data-tool-options={spec.toolId}
    >
      {spec.fields.map((field) => (
        <Field key={field.key} toolId={spec.toolId} field={field} />
      ))}
    </div>
  );
}

function Field({ toolId, field }: { toolId: string; field: ToolOptionField }) {
  const settings = useToolSettings();
  const current = settings.getValue(toolId, field.key);

  if (field.kind === "number") {
    const value = typeof current === "number" ? current : field.min ?? 0;
    return (
      <label style={rowStyle}>
        <span style={labelStyle}>{field.label}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <input
            type="number"
            value={value}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            onChange={(e) =>
              settings.set(toolId, field.key, Number(e.target.value))
            }
            style={inputStyle}
            data-tool-option={field.key}
          />
          {field.unit && <span style={unitStyle}>{field.unit}</span>}
        </span>
      </label>
    );
  }

  if (field.kind === "toggle") {
    const value = typeof current === "boolean" ? current : false;
    return (
      <label style={rowStyle}>
        <span style={labelStyle}>{field.label}</span>
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => settings.set(toolId, field.key, e.target.checked)}
          data-tool-option={field.key}
        />
      </label>
    );
  }

  // select
  const value =
    typeof current === "string" ? current : field.options[0]?.value ?? "";
  return (
    <label style={rowStyle}>
      <span style={labelStyle}>{field.label}</span>
      <select
        value={value}
        onChange={(e) => settings.set(toolId, field.key, e.target.value)}
        style={inputStyle}
        data-tool-option={field.key}
      >
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const popoverStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minWidth: 220,
  padding: 12,
  borderRadius: 6,
  border: "1px solid var(--chrome-divider)",
  background: "var(--elevated)",
  boxShadow: "var(--shadow-pop)",
  fontSize: 12,
  color: "var(--chrome-menu-text)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const labelStyle: CSSProperties = { flex: 1 };

const inputStyle: CSSProperties = {
  width: 72,
  padding: "2px 4px",
  border: "1px solid var(--chrome-divider)",
  borderRadius: 4,
  fontSize: 12,
};

const unitStyle: CSSProperties = { opacity: 0.6 };
