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

// Panel-gallery pass — the colour wheel (brand kit color-wheel.jsx,
// typed and engine-wired). A perceptual HSV wheel that stays in
// sync across HEX · RGB · CMYK · HSL, with colour-theory harmonies
// drawn on the wheel and a one-click "add the palette as swatches".
//
// Canonical output is the mixer's `MixerValue` (RGB space) so the
// wheel composes with `ColorMixer` and the existing swatch path;
// the CMYK/HSL fields are naive UI conversions (color-space.ts) —
// the CMM-accurate preview stays the mixer's `useColorCompute`.
//
// StrictMode-safe dragging: pointer capture on the wheel/track
// elements (no window listeners registered inside pointerdown —
// a leaked pair would double-fire after a StrictMode remount).

import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Icon } from "@paged-media/shell";
import type { SwatchSpec } from "@paged-media/client";

import {
  cmykToRgb,
  hexToRgb,
  luminance,
  rgbToCmyk,
  rgbToHex,
  rgbToHsl,
  valueToSwatchSpec,
  type MixerValue,
} from "./color-space";
import { hsbToRgb, rgbToHsb } from "./hsb";
import { HARMONY_NAMES, harmonySet, type HarmonyName } from "./harmonies";

type FieldModel = "HEX" | "RGB" | "CMYK" | "HSL";

export interface ColorWheelProps {
  /** Seed colour (initial only — the wheel owns its state). */
  value?: MixerValue | null;
  /** Wheel diameter in px. Default 220 (fits the 320px dock). */
  size?: number;
  /** Live colour change (drag / field edits). RGB space. */
  onChange?: (next: MixerValue) => void;
  /** Final colour (pointer-up / field commit). RGB space. */
  onCommit?: (next: MixerValue) => void;
  /** "Add to Swatches" for the CURRENT colour (the swatch chip's
   *  context). Hidden when absent. */
  onAddSwatch?: (spec: SwatchSpec) => void;
  /** The harmony palette as ready RGB SwatchSpecs (named by hex).
   *  Drives the "+ Add to Swatches" button; hidden when absent. */
  onPalette?: (specs: SwatchSpec[]) => void;
}

/** Internal HSV state (the wheel's native space; ≡ hsb.ts HSB). */
interface Hsv {
  h: number;
  s: number;
  v: number;
}

const DEFAULT_HSV: Hsv = { h: 263, s: 74, v: 86 };

function seedHsv(value: ColorWheelProps["value"]): Hsv {
  if (!value) return DEFAULT_HSV;
  const rgb =
    value.space === "RGB"
      ? value.value
      : value.space === "CMYK"
        ? cmykToRgb(value.value)
        : null;
  if (!rgb) return DEFAULT_HSV;
  const [h, s, b] = rgbToHsb(rgb);
  return { h: Math.round(h), s: Math.round(s), v: Math.round(b) };
}

const r2 = Math.round;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

const CONIC =
  "conic-gradient(from 0deg, hsl(0,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),hsl(180,100%,50%),hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%))";

export function ColorWheel({
  value,
  size = 220,
  onChange,
  onCommit,
  onAddSwatch,
  onPalette,
}: ColorWheelProps) {
  const [hsv, setHsv] = useState<Hsv>(() => seedHsv(value));
  const [harmony, setHarmony] = useState<HarmonyName>("Triadic");
  const [model, setModel] = useState<FieldModel>("HEX");
  const [copied, setCopied] = useState("");
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<"wheel" | "track" | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const R = size / 2;
  const rgb = hsbToRgb([hsv.h, hsv.s, hsv.v]);
  const hex = rgbToHex(rgb).toUpperCase();
  const cmyk = rgbToCmyk(rgb);
  const hsl = rgbToHsl(rgb);

  const toMixer = (c: Hsv): MixerValue => ({
    space: "RGB",
    value: hsbToRgb([c.h, c.s, c.v]),
    tint: 100,
  });

  const update = useCallback(
    (next: Hsv, phase: "change" | "commit") => {
      setHsv(next);
      const mixer: MixerValue = {
        space: "RGB",
        value: hsbToRgb([next.h, next.s, next.v]),
        tint: 100,
      };
      onChange?.(mixer);
      if (phase === "commit") onCommit?.(mixer);
    },
    [onChange, onCommit],
  );

  // ── harmony set ───────────────────────────────────────────────
  const harm = harmonySet([hsv.h, hsv.s, hsv.v], harmony);
  const harmRgb = harm.map((c) => hsbToRgb(c));
  const isMono = harmony === "Monochromatic";

  // ── wheel geometry ────────────────────────────────────────────
  const pos = (h: number, s: number): [number, number] => {
    const rad = (h * Math.PI) / 180;
    const rr = (s / 100) * R;
    return [R + Math.sin(rad) * rr, R - Math.cos(rad) * rr];
  };

  const hsFromPoint = (clientX: number, clientY: number): Hsv => {
    const rect = wheelRef.current!.getBoundingClientRect();
    const dx = clientX - rect.left - R;
    const dy = clientY - rect.top - R;
    let h = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (h < 0) h += 360;
    const s = clamp((Math.hypot(dx, dy) / R) * 100, 0, 100);
    return { ...hsv, h: r2(h), s: r2(s) };
  };

  const vFromPoint = (clientY: number): Hsv => {
    const rect = trackRef.current!.getBoundingClientRect();
    const v = clamp((1 - (clientY - rect.top) / rect.height) * 100, 0, 100);
    return { ...hsv, v: r2(v) };
  };

  const onWheelPointer =
    (kind: "down" | "move" | "up") =>
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (kind === "down") {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        draggingRef.current = "wheel";
        update(hsFromPoint(e.clientX, e.clientY), "change");
      } else if (kind === "move") {
        if (draggingRef.current !== "wheel") return;
        update(hsFromPoint(e.clientX, e.clientY), "change");
      } else {
        if (draggingRef.current !== "wheel") return;
        draggingRef.current = null;
        update(hsFromPoint(e.clientX, e.clientY), "commit");
      }
    };

  const onTrackPointer =
    (kind: "down" | "move" | "up") =>
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (kind === "down") {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        draggingRef.current = "track";
        update(vFromPoint(e.clientY), "change");
      } else if (kind === "move") {
        if (draggingRef.current !== "track") return;
        update(vFromPoint(e.clientY), "change");
      } else {
        if (draggingRef.current !== "track") return;
        draggingRef.current = null;
        update(vFromPoint(e.clientY), "commit");
      }
    };

  // ── field edits ───────────────────────────────────────────────
  const setRgbChannels = (r: number, g: number, b: number) => {
    const [h, s, v] = rgbToHsb([
      clamp(r, 0, 255),
      clamp(g, 0, 255),
      clamp(b, 0, 255),
    ]);
    update({ h: r2(h), s: r2(s), v: r2(v) }, "commit");
  };

  const copy = (txt: string, key: string) => {
    try {
      void navigator.clipboard.writeText(txt);
    } catch {
      /* clipboard unavailable (permissions) — the chip still flashes */
    }
    setCopied(key);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(""), 900);
  };

  const [selX, selY] = pos(hsv.h, hsv.s);
  const labelOn = luminance(rgb) > 0.45 ? "#111" : "#fff";

  return (
    <div
      data-color-wheel
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* wheel + value track */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "stretch",
          justifyContent: "center",
          padding: "2px 0",
        }}
      >
        <div
          ref={wheelRef}
          data-wheel-disc
          onPointerDown={onWheelPointer("down")}
          onPointerMove={onWheelPointer("move")}
          onPointerUp={onWheelPointer("up")}
          onPointerCancel={onWheelPointer("up")}
          style={{
            position: "relative",
            width: size,
            height: size,
            borderRadius: "50%",
            cursor: "crosshair",
            touchAction: "none",
            background: CONIC,
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          {/* white saturation veil */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 50% 50%, #fff 0%, rgba(255,255,255,0) 70%)",
              pointerEvents: "none",
            }}
          />
          {/* value dim */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "#000",
              opacity: 1 - hsv.v / 100,
              pointerEvents: "none",
            }}
          />
          {/* harmony polygon + markers (main marker doubles as the
              selection handle at offset 0) */}
          <svg
            width={size}
            height={size}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            {!isMono && harm.length > 1 && (
              <polygon
                points={harm.map((c) => pos(c[0], c[1]).join(",")).join(" ")}
                fill="none"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
            )}
            {harm.map((c, i) => {
              const [x, y] = isMono && i === 0 ? [selX, selY] : pos(c[0], c[1]);
              const main = i === 0;
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={main ? 10 : 7}
                  fill={rgbToHex(hsbToRgb(c))}
                  stroke="#fff"
                  strokeWidth={main ? 3 : 2}
                  style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))" }}
                />
              );
            })}
          </svg>
        </div>
        {/* value (brightness) track */}
        <div
          ref={trackRef}
          data-wheel-value-track
          onPointerDown={onTrackPointer("down")}
          onPointerMove={onTrackPointer("move")}
          onPointerUp={onTrackPointer("up")}
          onPointerCancel={onTrackPointer("up")}
          style={{
            position: "relative",
            width: 14,
            borderRadius: 999,
            cursor: "ns-resize",
            touchAction: "none",
            background: `linear-gradient(to top, #000, ${rgbToHex(
              hsbToRgb([hsv.h, hsv.s, 100]),
            )})`,
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: -3,
              right: -3,
              top: `${(1 - hsv.v / 100) * 100}%`,
              height: 6,
              transform: "translateY(-50%)",
              borderRadius: 3,
              background: "#fff",
              boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>

      {/* preview chip + model tabs + fields */}
      <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
        <button
          type="button"
          data-wheel-chip
          title={
            onAddSwatch ? "Copy hex · double-click adds a swatch" : "Copy hex"
          }
          onClick={() => copy(hex, "sw")}
          onDoubleClick={() =>
            onAddSwatch?.(valueToSwatchSpec(toMixer(hsv), hex.replace("#", "")))
          }
          style={{
            position: "relative",
            width: 48,
            height: 48,
            borderRadius: 10,
            background: hex,
            border: "1px solid var(--pg-border)",
            cursor: "pointer",
            color: labelOn,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            paddingBottom: 5,
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            flexShrink: 0,
          }}
        >
          {copied === "sw" ? "copied" : ""}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              border: "1px solid var(--pg-border)",
              borderRadius: 6,
              overflow: "hidden",
              marginBottom: 8,
            }}
          >
            {(["HEX", "RGB", "CMYK", "HSL"] as FieldModel[]).map((m, i) => (
              <button
                key={m}
                type="button"
                data-wheel-model={m}
                data-active={model === m ? "true" : "false"}
                onClick={() => setModel(m)}
                style={{
                  flex: 1,
                  height: 25,
                  border: "none",
                  borderRight: i < 3 ? "1px solid var(--pg-border)" : "none",
                  background:
                    model === m ? "var(--chrome-slot-active)" : "var(--pg-bg)",
                  color:
                    model === m
                      ? "var(--chrome-icon-active)"
                      : "var(--pg-muted-fg)",
                  fontSize: 10.5,
                  fontWeight: model === m ? 600 : 500,
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {m}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            {model === "HEX" && (
              <WheelField
                label="HEX"
                w={88}
                value={hex}
                onCommit={(v) => {
                  const r = hexToRgb(v);
                  if (r) setRgbChannels(r[0], r[1], r[2]);
                }}
              />
            )}
            {model === "RGB" && (
              <>
                <WheelField
                  label="R"
                  value={String(rgb[0])}
                  onCommit={(v) => setRgbChannels(+v || 0, rgb[1], rgb[2])}
                />
                <WheelField
                  label="G"
                  value={String(rgb[1])}
                  onCommit={(v) => setRgbChannels(rgb[0], +v || 0, rgb[2])}
                />
                <WheelField
                  label="B"
                  value={String(rgb[2])}
                  onCommit={(v) => setRgbChannels(rgb[0], rgb[1], +v || 0)}
                />
              </>
            )}
            {model === "CMYK" &&
              (["C", "M", "Y", "K"] as const).map((ch, i) => (
                <WheelField
                  key={ch}
                  label={ch}
                  w={40}
                  value={String(cmyk[i])}
                  onCommit={(v) => {
                    const next = [...cmyk] as number[];
                    next[i] = +v || 0;
                    const [r, g, b] = cmykToRgb(next);
                    setRgbChannels(r, g, b);
                  }}
                />
              ))}
            {model === "HSL" && (
              <>
                <WheelField
                  label="H"
                  value={String(hsl[0])}
                  onCommit={(v) =>
                    update(
                      { ...hsv, h: (((+v || 0) % 360) + 360) % 360 },
                      "commit",
                    )
                  }
                />
                <WheelField label="S" value={String(hsl[1])} readOnly />
                <WheelField label="L" value={String(hsl[2])} readOnly />
              </>
            )}
            <button
              type="button"
              title="Copy"
              data-wheel-copy
              onClick={() =>
                copy(
                  model === "HEX"
                    ? hex
                    : model === "RGB"
                      ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
                      : model === "CMYK"
                        ? `cmyk(${cmyk[0]}%, ${cmyk[1]}%, ${cmyk[2]}%, ${cmyk[3]}%)`
                        : `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`,
                  "cp",
                )
              }
              style={{
                marginTop: 1,
                width: 26,
                height: 26,
                borderRadius: 6,
                border: "1px solid var(--pg-border)",
                background: "var(--pg-bg)",
                color:
                  copied === "cp"
                    ? "var(--status-approved)"
                    : "var(--pg-muted-fg)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon
                name={copied === "cp" ? "ui-check" : "ui-component"}
                size={13}
              />
            </button>
          </div>
        </div>
      </div>

      {/* harmony picker */}
      <div>
        <div className="pg-label" style={{ marginBottom: 8 }}>
          Harmony
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 5,
            marginBottom: 10,
          }}
        >
          {HARMONY_NAMES.map((k) => (
            <button
              key={k}
              type="button"
              data-wheel-harmony={k}
              data-active={harmony === k ? "true" : "false"}
              onClick={() => setHarmony(k)}
              style={{
                height: 25,
                padding: "0 9px",
                borderRadius: 6,
                border: `1px solid ${
                  harmony === k ? "var(--pg-primary)" : "var(--pg-border)"
                }`,
                background:
                  harmony === k ? "var(--pg-primary-soft)" : "var(--pg-bg)",
                color:
                  harmony === k ? "var(--pg-primary)" : "var(--pg-muted-fg)",
                fontSize: 10.5,
                fontWeight: harmony === k ? 600 : 500,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              {k}
            </button>
          ))}
        </div>
        {/* harmony swatch strip */}
        <div
          data-wheel-palette
          style={{
            display: "flex",
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid var(--pg-border)",
          }}
        >
          {harmRgb.map((r, i) => {
            const hx = rgbToHex(r).toUpperCase();
            const t = luminance(r) > 0.45 ? "#111" : "#fff";
            return (
              <button
                key={i}
                type="button"
                title={hx}
                data-wheel-palette-swatch={i}
                onClick={() => setRgbChannels(r[0], r[1], r[2])}
                style={{
                  flex: 1,
                  height: 52,
                  background: hx,
                  border: "none",
                  borderLeft: i ? "1px solid rgba(0,0,0,0.15)" : "none",
                  cursor: "pointer",
                  color: t,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  paddingBottom: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 8.5,
                  letterSpacing: "0.01em",
                }}
              >
                {i === 0 && (
                  <Icon
                    name="ui-check"
                    size={11}
                    style={{
                      marginBottom: "auto",
                      marginTop: 6,
                      opacity: 0.85,
                    }}
                  />
                )}
                {hx}
              </button>
            );
          })}
        </div>
      </div>

      {onPalette && (
        <button
          type="button"
          data-wheel-add-palette
          onClick={() =>
            onPalette(
              harmRgb.map((r) =>
                valueToSwatchSpec(
                  { space: "RGB", value: r, tint: 100 },
                  rgbToHex(r).toUpperCase().replace("#", ""),
                ),
              ),
            )
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            height: 34,
            borderRadius: 8,
            border: "none",
            background: "var(--pg-primary)",
            color: "var(--pg-primary-fg)",
            fontFamily: "var(--font-sans)",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Icon name="ui-plus" size={14} /> Add to Swatches
        </button>
      )}
    </div>
  );
}

/** Channel field — mono, centred, label below (kit `Field`). */
function WheelField({
  label,
  value,
  w = 46,
  readOnly,
  onCommit,
}: {
  label: string;
  value: string;
  w?: number;
  readOnly?: boolean;
  onCommit?: (raw: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        alignItems: "center",
      }}
    >
      <input
        defaultValue={value}
        key={value}
        readOnly={readOnly}
        data-wheel-field={label}
        onKeyDown={(e) => {
          if (e.key === "Enter")
            onCommit?.((e.target as HTMLInputElement).value);
        }}
        onBlur={(e) => {
          if (e.target.value !== value) onCommit?.(e.target.value);
        }}
        style={{ ...fieldStyle, width: w, opacity: readOnly ? 0.6 : 1 }}
      />
      <span
        style={{
          fontSize: 9.5,
          color: "var(--pg-muted-fg)",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
    </div>
  );
}

const fieldStyle: CSSProperties = {
  textAlign: "center",
  border: "1px solid var(--pg-border)",
  borderRadius: 6,
  background: "var(--pg-bg)",
  color: "var(--pg-fg)",
  padding: "6px 4px",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  outline: "none",
};
