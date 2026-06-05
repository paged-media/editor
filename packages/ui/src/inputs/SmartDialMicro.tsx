// Gallery pixel-parity — the kit Smart Dial's MICRO row
// (brand kit smart-dial.jsx, `micro` mode): a 26px rotary arc +
// label + editable mono value with unit, one row. Ported as a
// controlled component; drag (vertical) adjusts, Shift = fine,
// Alt = coarse, wheel steps, click value to type. Disabled renders
// at 45% — the Object panel mounts it as the rotation SEAM until
// the engine's rotation/scale decompose primitive lands.
//
// StrictMode-safe dragging: pointer capture on the dial element —
// no window listeners registered inside pointerdown.

import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

// Polar helper — angle in degrees measured CLOCKWISE from top.
function pol(cx: number, cy: number, r: number, a: number): [number, number] {
  const t = (a * Math.PI) / 180;
  return [cx + r * Math.sin(t), cy - r * Math.cos(t)];
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = pol(cx, cy, r, a0);
  const [x1, y1] = pol(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
const START = 225;
const SWEEP = 270; // 90° gap centred at the bottom

export interface SmartDialMicroProps {
  label: string;
  /** `null` = mixed (em-dash value). */
  value: number | null;
  min: number;
  max: number;
  unit?: string;
  precision?: number;
  /** Show a leading "+" on positive values (rotation). */
  signed?: boolean;
  disabled?: boolean;
  onChange?: (value: number) => void;
  onCommit?: (value: number) => void;
}

export function SmartDialMicro({
  label,
  value,
  min,
  max,
  unit = "",
  precision = 0,
  signed,
  disabled,
  onChange,
  onCommit,
}: SmartDialMicroProps) {
  const inert = disabled || onChange == null;
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const fmt = (v: number) =>
    precision ? v.toFixed(precision) : String(Math.round(v));

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const dragRef = useRef<{ y0: number; v0: number } | null>(null);

  const v = value ?? 0;
  const fr = (v - min) / (max - min);
  const hp = pol(13, 13, 10, START + Math.max(0.001, fr) * SWEEP);

  const onPointer =
    (kind: "down" | "move" | "up") =>
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (inert) return;
      if (kind === "down") {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { y0: e.clientY, v0: v };
      } else if (kind === "move") {
        if (!dragRef.current) return;
        const mult = e.shiftKey ? 0.25 : e.altKey ? 4 : 1;
        onChange?.(
          clamp(
            dragRef.current.v0 +
              (-(e.clientY - dragRef.current.y0) / 120) * (max - min) * mult,
          ),
        );
      } else {
        if (!dragRef.current) return;
        dragRef.current = null;
        onCommit?.(clamp(v));
      }
    };

  // Wheel steps need a non-passive listener (preventDefault).
  const dialRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = dialRef.current;
    if (!el || inert) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const m = e.shiftKey ? 0.1 : e.altKey ? 10 : 1;
      const next = clamp(v + (e.deltaY < 0 ? m : -m));
      onChange?.(next);
      onCommit?.(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inert, v, min, max]);

  const grad = `paged-sd-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <div
      data-smart-dial={label}
      data-seam={inert ? "true" : undefined}
      // A disabled seam dial isn't "mixed" — only a live dial with
      // an unresolved value carries the sentinel.
      data-mixed={!inert && value === null ? "" : undefined}
      className="flex items-center gap-[9px] py-[2px]"
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <div
        ref={dialRef}
        onPointerDown={onPointer("down")}
        onPointerMove={onPointer("move")}
        onPointerUp={onPointer("up")}
        onPointerCancel={onPointer("up")}
        title={inert ? undefined : "Drag to adjust"}
        className="w-[26px] h-[26px] shrink-0"
        style={{
          cursor: inert ? "default" : "ns-resize",
          touchAction: "none",
        }}
      >
        <svg
          width="26"
          height="26"
          style={{ display: "block", overflow: "visible" }}
        >
          <defs>
            <linearGradient id={grad} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#4aa3ff" />
              <stop offset="1" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          <path
            d={arc(13, 13, 10, START, START + SWEEP)}
            fill="none"
            stroke="var(--pg-border)"
            strokeWidth={3}
            strokeLinecap="round"
          />
          {value !== null && (
            <>
              <path
                d={arc(13, 13, 10, START, START + Math.max(0.001, fr) * SWEEP)}
                fill="none"
                stroke={`url(#${grad})`}
                strokeWidth={3}
                strokeLinecap="round"
              />
              <circle
                cx={hp[0]}
                cy={hp[1]}
                r={3}
                fill="#fff"
                stroke="#8b5cf6"
                strokeWidth={1.6}
              />
            </>
          )}
        </svg>
      </div>
      <span
        className="flex-1 whitespace-nowrap text-xs"
        style={{ color: "var(--pg-muted-fg)" }}
      >
        {label}
      </span>
      {editing && !inert ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const n = Number.parseFloat(draft);
            if (Number.isFinite(n)) {
              const next = clamp(n);
              onChange?.(next);
              onCommit?.(next);
            }
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-[50px] text-right rounded-[5px] px-1 py-px text-xs outline-none"
          style={{
            border: "1px solid var(--pg-primary)",
            background: "var(--pg-bg)",
            color: "var(--pg-fg)",
            fontFamily: "var(--font-mono)",
          }}
        />
      ) : (
        <button
          type="button"
          disabled={inert}
          onClick={() => {
            if (inert || value === null) return;
            setDraft(fmt(value));
            setEditing(true);
          }}
          className="inline-flex items-baseline gap-[2px] rounded-[5px] border-0 bg-transparent px-[3px] py-px"
          style={{ cursor: inert ? "default" : "text" }}
        >
          <span
            className="text-[12.5px]"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--pg-fg)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value === null
              ? "—"
              : (signed && value > 0 ? "+" : "") + fmt(value)}
          </span>
          {unit && (
            <span
              className="text-[10px]"
              style={{ color: "var(--pg-muted-fg)" }}
            >
              {unit}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
