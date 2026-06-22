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

// Gallery pixel-parity — the kit Select (brand kit kit.jsx `PK.Select`):
// h30, radius 6, hairline border, 12.5px sans value, `ui-chevron-down`
// 13px on the right; `soft` renders the value muted (placeholder-ish
// selects). A real native <select> underneath (keyboard + a11y for
// free) with `appearance: none` and the chevron overlaid.

import type { ReactNode, SelectHTMLAttributes } from "react";
import { Icon } from "@paged-media/shell";

export interface KitSelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "className"
> {
  /** Muted value text (the kit's `soft` variant). */
  soft?: boolean;
  /** Extra classes on the wrapper. */
  className?: string;
  children: ReactNode;
}

export function KitSelect({
  soft,
  className = "",
  children,
  disabled,
  ...rest
}: KitSelectProps) {
  return (
    <span className={`relative inline-flex w-full ${className}`}>
      <select
        {...rest}
        disabled={disabled}
        className="w-full h-[30px] appearance-none rounded-[6px] border border-input bg-background pl-2.5 pr-7 text-[12.5px] overflow-hidden text-ellipsis whitespace-nowrap disabled:opacity-55"
        style={{
          fontFamily: "var(--font-sans)",
          color: soft || disabled ? "var(--pg-muted-fg)" : "var(--pg-fg)",
        }}
      >
        {children}
      </select>
      <Icon
        name="ui-chevron-down"
        size={13}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
        style={{ color: "var(--pg-muted-fg)" }}
      />
    </span>
  );
}
