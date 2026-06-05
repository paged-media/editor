import { useMemo, useState } from "react";

import { NumberInput, type NumberInputProps } from "./NumberInput";
import { convertLength, type LengthUnit } from "./units";

export interface LengthInputProps extends Omit<
  NumberInputProps,
  "value" | "onChange" | "onCommit"
> {
  /** Value in points (the IDML-native unit). `null` = mixed. */
  valuePt: number | null;
  /** Initial display unit. The user can change it via the picker;
   * the underlying canonical value stays in points. */
  defaultUnit?: LengthUnit;
  /** Show the legacy unit-picker select. Default FALSE — the kit's
   * metric fields carry the unit INSIDE the value ("16 pt"). */
  unitPicker?: boolean;
  /** Hide the in-field unit suffix (compact composite cells). */
  showUnit?: boolean;
  /** Fires whenever the canonical (pt) value changes. */
  onChangePt: (valuePt: number) => void;
  onCommitPt?: (valuePt: number) => void;
}

const UNITS: LengthUnit[] = ["pt", "px", "mm", "cm", "in"];

/**
 * Numeric input displaying in a length unit while the canonical
 * value stays in points (IDML's native unit); the caller only ever
 * sees pt via `onChangePt` / `onCommitPt`. Gallery pixel-parity:
 * the unit renders inside the field as the kit's value suffix
 * ("16 pt"); the explicit unit-picker select is opt-in legacy.
 */
export function LengthInput(props: LengthInputProps) {
  const {
    valuePt,
    defaultUnit = "pt",
    unitPicker = false,
    showUnit = true,
    onChangePt,
    onCommitPt,
    suffix,
    ...rest
  } = props;
  const [unit, setUnit] = useState<LengthUnit>(defaultUnit);

  const displayValue = useMemo(
    () => (valuePt === null ? null : convertLength(valuePt, "pt", unit)),
    [valuePt, unit],
  );

  return (
    <div className="inline-flex items-stretch gap-1 min-w-0">
      <NumberInput
        {...rest}
        suffix={suffix ?? (showUnit && !unitPicker ? unit : undefined)}
        value={displayValue}
        onChange={(next) => onChangePt(convertLength(next, unit, "pt"))}
        onCommit={
          onCommitPt
            ? (next) => onCommitPt(convertLength(next, unit, "pt"))
            : undefined
        }
      />
      {unitPicker && (
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value as LengthUnit)}
          className="text-xs h-[28px] px-1 rounded-[6px] border border-input bg-background text-foreground"
          aria-label="unit"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
