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

// Panel-gallery pass — the 3×3 reference-point selector (Object /
// Frame Fitting). Pure UI state for now: the engine has no
// reference-point convention on `frameTransform` yet, so panels
// mount it disabled (honest seam) until that lands; the component
// is already write-capable via `onChange` for that day.

/** Cell indices run row-major: 0 = top-left … 8 = bottom-right. */
export function ReferencePointGrid({
  value = 0,
  onChange,
  disabled,
}: {
  value?: number;
  onChange?: (index: number) => void;
  disabled?: boolean;
}) {
  const inert = disabled || onChange == null;
  return (
    <div
      role="radiogroup"
      aria-label="Reference point"
      data-reference-point
      data-seam={inert ? "true" : undefined}
      style={{
        display: "inline-grid",
        gridTemplateColumns: "repeat(3, 12px)",
        gridTemplateRows: "repeat(3, 12px)",
        gap: 2,
        padding: 5,
        borderRadius: 6,
        border: "1px solid var(--pg-border)",
        background: "var(--pg-bg)",
        opacity: inert ? 0.55 : 1,
      }}
    >
      {Array.from({ length: 9 }, (_, i) => {
        const on = i === value;
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={inert}
            data-reference-cell={i}
            onClick={() => onChange?.(i)}
            style={{
              width: 12,
              height: 12,
              padding: 0,
              borderRadius: 2,
              border: on
                ? "1px solid var(--pg-primary)"
                : "1px solid var(--chrome-divider)",
              background: on ? "var(--pg-primary)" : "transparent",
              cursor: inert ? "default" : "pointer",
            }}
          />
        );
      })}
    </div>
  );
}
