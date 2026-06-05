// Concept 2 — the gradient EDITOR (expert leaf under the Gradients
// panel's composition apply-picker). Reads stop detail through
// protocol 25's `gradientDetail` (stops as swatch REFS + resolved
// hex + midpoints), edits locally (drag thumbs/midpoints, add/
// remove stops, change a stop's swatch, linear/radial, reverse),
// and commits the WHOLE gradient as one `editGradient` mutation.
// The stop-colour picker offers existing swatches only — stops
// reference swatches, never inline colours (concept C7). Angle
// stays per-frame (`frameGradientFillAngle` via the Gradient tool /
// selection property), not part of the gradient resource.

import { useCallback, useEffect, useState } from "react";

import {
  GradientRamp,
  Icon,
  useCanvasClient,
  type RampStop,
} from "@paged-media/shell";
import type {
  GradientDetail,
  GradientSummary,
  SwatchSummary,
} from "@paged-media/client";

export function GradientEditor() {
  const client = useCanvasClient();
  const [gradients, setGradients] = useState<GradientSummary[]>([]);
  const [swatches, setSwatches] = useState<SwatchSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GradientDetail | null>(null);
  const [stops, setStops] = useState<RampStop[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [kind, setKind] = useState<string>("linear");

  const refreshLists = useCallback(() => {
    void client
      .collection<GradientSummary>("gradients")
      .then((g) => {
        setGradients([...g]);
        setActiveId((cur) => cur ?? g[0]?.selfId ?? null);
      })
      .catch(() => setGradients([]));
    void client
      .collection<SwatchSummary>("swatches")
      .then((s) => setSwatches([...s]))
      .catch(() => setSwatches([]));
  }, [client]);

  const loadDetail = useCallback(
    (id: string | null) => {
      if (!id) {
        setDetail(null);
        setStops([]);
        return;
      }
      void client
        .gradientDetail(id)
        .then((d) => {
          setDetail(d);
          setStops(
            d?.stops.map((s) => ({
              stopColorRef: s.stopColorRef,
              resolvedRgbHex: s.resolvedRgbHex,
              locationPct: s.locationPct,
              midpointPct: s.midpointPct ?? null,
            })) ?? [],
          );
          setKind(d?.kind ?? "linear");
          setSelected(null);
        })
        .catch(() => setDetail(null));
    },
    [client],
  );

  useEffect(() => {
    refreshLists();
    const off = client.subscribe((msg) => {
      if (msg.kind === "documentLoaded") {
        setActiveId(null);
        refreshLists();
      }
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        refreshLists();
      }
    });
    return off;
  }, [client, refreshLists]);

  useEffect(() => loadDetail(activeId), [activeId, loadDetail]);

  // Commit the locally edited stop table as ONE editGradient.
  const commit = useCallback(
    (nextStops: RampStop[], nextKind: string) => {
      if (!detail) return;
      void client
        .mutate({
          op: "editGradient",
          args: {
            gradientId: detail.selfId,
            spec: {
              selfId: detail.selfId,
              name: detail.name,
              kind: nextKind === "radial" ? "Radial" : "Linear",
              stops: [...nextStops]
                .sort((a, b) => a.locationPct - b.locationPct)
                .map((s) => ({
                  stopColor: s.stopColorRef,
                  locationPct: s.locationPct,
                  midpointPct: s.midpointPct,
                })),
            },
          },
        })
        .catch(() => {});
    },
    [client, detail],
  );

  const moveStop = (i: number, pct: number) =>
    setStops((prev) =>
      prev.map((s, j) => (j === i ? { ...s, locationPct: pct } : s)),
    );
  const moveMidpoint = (i: number, pct: number) =>
    setStops((prev) =>
      prev.map((s, j) => (j === i ? { ...s, midpointPct: pct } : s)),
    );
  const addStop = (pct: number) => {
    const next: RampStop = {
      stopColorRef:
        stops[0]?.stopColorRef ?? swatches[0]?.selfId ?? "Color/Black",
      resolvedRgbHex: "#808080",
      locationPct: pct,
      midpointPct: null,
    };
    const nextStops = [...stops, next];
    setStops(nextStops);
    commit(nextStops, kind);
  };
  const reverse = () => {
    const nextStops = stops.map((s) => ({
      ...s,
      locationPct: 100 - s.locationPct,
      midpointPct: s.midpointPct === null ? null : 100 - s.midpointPct,
    }));
    setStops(nextStops);
    commit(nextStops, kind);
  };
  const setType = (t: string) => {
    setKind(t);
    commit(stops, t);
  };

  if (gradients.length === 0) {
    return (
      <div
        className="text-xs text-muted-foreground px-1 pt-2"
        data-gradient-editor="empty"
      >
        No gradients in this document.
      </div>
    );
  }

  // Per-row edits (the gallery stop rows): swatch + position per
  // stop, committed as one editGradient like every other edit.
  const setStopSwatchAt = (i: number, ref: string) => {
    const nextStops = stops.map((s, j) =>
      j === i ? { ...s, stopColorRef: ref } : s,
    );
    setStops(nextStops);
    commit(nextStops, kind);
  };
  const setStopLocationAt = (i: number, pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    const nextStops = stops.map((s, j) =>
      j === i ? { ...s, locationPct: clamped } : s,
    );
    setStops(nextStops);
    commit(nextStops, kind);
  };
  const removeStopAt = (i: number) => {
    if (stops.length <= 2) return;
    const nextStops = stops.filter((_, j) => j !== i);
    setSelected(null);
    setStops(nextStops);
    commit(nextStops, kind);
  };

  return (
    <div
      className="border-t border-input mt-2 pt-2 flex flex-col gap-2"
      data-gradient-editor="ready"
    >
      <select
        className="w-full text-xs h-[30px] px-2 rounded-[6px] border border-input bg-background"
        data-gradient-select
        value={activeId ?? ""}
        onChange={(e) => setActiveId(e.target.value || null)}
      >
        {gradients.map((g) => (
          <option key={g.selfId} value={g.selfId}>
            {g.name}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        {/* Gallery type segments + the reverse icon button. */}
        <div
          className="inline-flex flex-1 overflow-hidden rounded-[6px] border border-input"
          role="group"
          data-gradient-type
        >
          {(["linear", "radial"] as const).map((t, i) => {
            const active = kind === t;
            return (
              <button
                key={t}
                type="button"
                data-gradient-kind={t}
                data-active={active ? "true" : "false"}
                onClick={() => setType(t)}
                className="flex-1 text-xs h-[27px] border-0 cursor-pointer"
                style={{
                  borderRight: i === 0 ? "1px solid var(--pg-border)" : "none",
                  background: active
                    ? "var(--chrome-slot-active)"
                    : "var(--pg-bg)",
                  color: active
                    ? "var(--chrome-icon-active)"
                    : "var(--pg-muted-fg)",
                }}
              >
                {t === "linear" ? "Linear" : "Radial"}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="w-[30px] h-[29px] rounded-[6px] border border-input bg-background text-muted-foreground hover:text-foreground flex items-center justify-center"
          data-action="reverse-gradient"
          title="Reverse"
          onClick={reverse}
        >
          <Icon name="ui-return" size={14} />
        </button>
      </div>

      <GradientRamp
        stops={stops}
        kind={kind}
        selectedIndex={selected}
        onSelectStop={setSelected}
        onMoveStop={moveStop}
        onMoveMidpoint={moveMidpoint}
        onAddStop={addStop}
        onCommit={() => commit(stops, kind)}
      />

      {/* The gallery STOPS rows — chip · swatch select · position %. */}
      <div className="pg-label">Stops</div>
      <div className="flex flex-col gap-1" data-gradient-stop-rows>
        {stops.map((s, i) => (
          <div
            key={`${s.stopColorRef}-${i}`}
            className="flex items-center gap-2"
            data-gradient-stop-row={i}
            data-selected={selected === i ? "true" : undefined}
          >
            <span
              className="w-[18px] h-[18px] rounded-[5px] border border-input shrink-0"
              style={{ background: s.resolvedRgbHex }}
              title={s.resolvedRgbHex}
            />
            <select
              className="flex-1 min-w-0 text-xs h-[26px] px-1 rounded-[6px] border border-input bg-background"
              data-action="stop-swatch"
              value={s.stopColorRef}
              onChange={(e) => setStopSwatchAt(i, e.target.value)}
            >
              {swatches.map((sw) => (
                <option key={sw.selfId} value={sw.selfId}>
                  {sw.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={100}
              defaultValue={Math.round(s.locationPct)}
              key={`loc-${i}-${Math.round(s.locationPct)}`}
              data-stop-location
              className="w-[52px] text-xs h-[26px] px-1 text-center rounded-[6px] border border-input bg-background pg-value"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setStopLocationAt(
                    i,
                    Number.parseFloat((e.target as HTMLInputElement).value) ||
                      0,
                  );
                }
              }}
              onBlur={(e) => {
                const v = Number.parseFloat(e.target.value);
                if (Number.isFinite(v) && Math.round(s.locationPct) !== v) {
                  setStopLocationAt(i, v);
                }
              }}
            />
            <button
              type="button"
              className="w-[22px] h-[22px] rounded border-0 bg-transparent text-muted-foreground hover:text-foreground disabled:opacity-40"
              data-action="remove-stop"
              title={
                stops.length <= 2 ? "A gradient keeps ≥2 stops" : "Remove stop"
              }
              disabled={stops.length <= 2}
              onClick={() => removeStopAt(i)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
