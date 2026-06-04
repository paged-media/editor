// Concept 2 — the colour mixer: the load-bearing shared component
// behind `paged.color`, the Swatches panel's new-swatch / edit
// popovers, and any picker that needs to AUTHOR a colour rather
// than choose an existing swatch.
//
// Canonical state is `{space, value[], tint}` in the wire's
// SwatchSpec vocabulary; HSB is a derived, UI-only tab over RGB.
// The live preview chip + the out-of-gamut warning triangle come
// from `requestColorCompute` (the document's ACTIVE colour
// management — working space, intent, standard-Lab — not a naive
// client-side approximation). `value: null` renders the MIXED
// sentinel (heterogeneous multi-selection): em-dash channels and a
// split chip; the first edit seeds a neutral default and the commit
// write-replaces across the selection (the binding fan-out).

import { useMemo, useState, type CSSProperties } from "react";

import { NumberInput } from "../inputs/NumberInput";

import {
  defaultValue,
  hexToRgb,
  SPACE_CHANNELS,
  valueToSwatchSpec,
  type MixerValue,
} from "./color-space";
import { hsbToRgb, rgbToHsb } from "./hsb";
import { useColorCompute } from "./use-color-compute";

import type { SwatchSpec } from "@paged-media/client";

type MixerTab = MixerValue["space"] | "HSB";

export interface ColorMixerProps {
  /** Canonical state; `null` = the mixed sentinel. */
  value: MixerValue | null;
  /** Live channel edits (scrubbing). */
  onChange?: (next: MixerValue) => void;
  /** Final value (pointer-up / blur / Enter). */
  onCommit?: (next: MixerValue) => void;
  /** "Add to Swatches" — receives the ready SwatchSpec. Hidden when
   *  absent. */
  onAddSwatch?: (spec: SwatchSpec) => void;
  /** "Apply" — apply the mixed colour to the selection (the Color
   *  panel's ephemeral-apply). Hidden when absent. */
  onApply?: (next: MixerValue) => void;
  /** Show the tint slider (default true). */
  showTint?: boolean;
  /** Compact layout (popover/foot-cluster embeds). */
  compact?: boolean;
}

export function ColorMixer(props: ColorMixerProps) {
  const { value, onChange, onCommit, onAddSwatch, onApply } = props;
  const showTint = props.showTint ?? true;
  const [tab, setTab] = useState<MixerTab>(value?.space ?? "CMYK");

  const compute = useColorCompute(value);
  const mixed = value === null;

  // The channels the active tab shows. HSB derives from RGB.
  const channels = useMemo(() => {
    if (tab === "HSB") {
      return [
        { key: "h", label: "H", min: 0, max: 360, precision: 0 },
        { key: "s", label: "S", min: 0, max: 100, precision: 0 },
        { key: "b", label: "B", min: 0, max: 100, precision: 0 },
      ];
    }
    return SPACE_CHANNELS[tab];
  }, [tab]);

  const displayed: number[] = useMemo(() => {
    if (!value) return channels.map(() => 0);
    if (tab === "HSB") {
      const rgb =
        value.space === "RGB" ? value.value : hexToRgb(compute.rgbHex) ?? [128, 128, 128];
      return rgbToHsb(rgb);
    }
    if (tab === value.space) return value.value;
    // Tab differs from the canonical space (user is switching) —
    // seed from the computed display RGB where possible.
    if (tab === "RGB") return hexToRgb(compute.rgbHex) ?? defaultValue("RGB");
    return defaultValue(tab);
  }, [value, tab, channels, compute.rgbHex]);

  const emit = (
    next: MixerValue,
    phase: "change" | "commit",
  ) => {
    if (phase === "change") onChange?.(next);
    else {
      onChange?.(next);
      onCommit?.(next);
    }
  };

  const setChannel = (idx: number, raw: number, phase: "change" | "commit") => {
    const base: MixerValue =
      value ??
      ({ space: tab === "HSB" ? "RGB" : tab, value: defaultValue(tab === "HSB" ? "RGB" : tab), tint: 100 } as MixerValue);
    if (tab === "HSB") {
      const hsb = [...displayed];
      hsb[idx] = raw;
      emit({ space: "RGB", value: hsbToRgb(hsb), tint: base.tint }, phase);
      return;
    }
    if (base.space !== tab) {
      // Switching space: adopt the displayed channels as the new
      // canonical value, then apply the edit.
      const v = [...displayed];
      v[idx] = raw;
      emit({ space: tab, value: v, tint: base.tint }, phase);
      return;
    }
    const v = [...base.value];
    v[idx] = raw;
    emit({ ...base, value: v }, phase);
  };

  const setHex = (hex: string) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const base = value ?? { space: "RGB" as const, value: defaultValue("RGB"), tint: 100 };
    emit({ space: "RGB", value: rgb, tint: base.tint }, "commit");
  };

  const setTint = (tint: number, phase: "change" | "commit") => {
    const base: MixerValue =
      value ?? { space: "CMYK", value: defaultValue("CMYK"), tint: 100 };
    emit({ ...base, tint }, phase);
  };

  return (
    <div style={rootStyle} data-color-mixer="ready" data-mixer-mixed={mixed || undefined}>
      {/* Space tabs */}
      <div style={tabRow}>
        {(["CMYK", "RGB", "LAB", "HSB", "Gray"] as MixerTab[]).map((t) => (
          <button
            key={t}
            type="button"
            data-mixer-space={t}
            data-active={tab === t ? "true" : "false"}
            onClick={() => setTab(t)}
            style={{
              ...tabBtn,
              background: tab === t ? "#1f2937" : "#fff",
              color: tab === t ? "#fff" : "#374151",
            }}
          >
            {t === "Gray" ? "K" : t}
          </button>
        ))}
        {/* Preview chip + gamut warning */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          {compute.outOfGamut && !mixed && (
            <span
              data-gamut="out"
              title="Out of gamut for the document's CMYK working space"
              style={{ color: "#d97706", fontSize: 12, lineHeight: 1 }}
            >
              ▲!
            </span>
          )}
          <div
            data-mixer-preview
            title={mixed ? "Mixed selection" : compute.rgbHex}
            style={{
              width: 26,
              height: 18,
              borderRadius: 3,
              border: "1px solid #d4d4d8",
              opacity: compute.pending ? 0.6 : 1,
              background: mixed
                ? "linear-gradient(135deg, #fff 48%, #9ca3af 48%, #9ca3af 52%, #fff 52%)"
                : compute.rgbHex,
            }}
          />
        </div>
      </div>

      {/* Channel rows */}
      {channels.map((ch, i) => (
        <div key={ch.key} style={channelRow} data-mixer-channel={ch.key}>
          <span style={channelLabel}>{ch.label}</span>
          {mixed ? (
            <span
              style={{ fontSize: 11, opacity: 0.6, flex: 1, textAlign: "center" }}
              data-mixer-channel-mixed
            >
              —
            </span>
          ) : (
            <NumberInput
              value={displayed[i] ?? 0}
              min={ch.min}
              max={ch.max}
              precision={ch.precision}
              onChange={(v) => setChannel(i, v, "change")}
              onCommit={(v) => setChannel(i, v, "commit")}
            />
          )}
        </div>
      ))}

      {/* Hex (RGB convenience) */}
      <div style={channelRow}>
        <span style={channelLabel}>#</span>
        <input
          data-mixer-hex
          defaultValue={mixed ? "" : compute.rgbHex.replace("#", "")}
          key={mixed ? "mixed" : compute.rgbHex}
          placeholder={mixed ? "—" : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter") setHex((e.target as HTMLInputElement).value);
          }}
          onBlur={(e) => {
            if (e.target.value) setHex(e.target.value);
          }}
          style={hexInput}
        />
      </div>

      {/* Tint */}
      {showTint && (
        <div style={channelRow} data-mixer-tint>
          <span style={channelLabel}>T%</span>
          {mixed ? (
            <span style={{ fontSize: 11, opacity: 0.6 }}>—</span>
          ) : (
            <NumberInput
              value={value?.tint ?? 100}
              min={0}
              max={100}
              precision={0}
              onChange={(v) => setTint(v, "change")}
              onCommit={(v) => setTint(v, "commit")}
            />
          )}
        </div>
      )}

      {/* Footer actions */}
      {(onAddSwatch || onApply) && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {onApply && (
            <button
              type="button"
              data-mixer-apply
              disabled={mixed && !value}
              onClick={() => value && onApply(value)}
              style={footBtn}
            >
              Apply
            </button>
          )}
          {onAddSwatch && (
            <button
              type="button"
              data-mixer-add-swatch
              disabled={mixed}
              onClick={() => value && onAddSwatch(valueToSwatchSpec(value))}
              style={footBtn}
            >
              + Add to Swatches
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const rootStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 200,
};

const tabRow: CSSProperties = {
  display: "flex",
  gap: 2,
  alignItems: "center",
  marginBottom: 2,
};

const tabBtn: CSSProperties = {
  fontSize: 10,
  padding: "2px 6px",
  borderRadius: 3,
  border: "1px solid #d4d4d8",
  cursor: "pointer",
  lineHeight: 1.2,
};

const channelRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const channelLabel: CSSProperties = {
  width: 18,
  fontSize: 10,
  opacity: 0.7,
  textAlign: "right",
};

const hexInput: CSSProperties = {
  flex: 1,
  fontSize: 11,
  padding: "2px 6px",
  border: "1px solid #d4d4d8",
  borderRadius: 3,
  fontFamily: "ui-monospace, monospace",
};

const footBtn: CSSProperties = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 4,
  border: "1px solid #d4d4d8",
  background: "#fff",
  cursor: "pointer",
};
