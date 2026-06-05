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
