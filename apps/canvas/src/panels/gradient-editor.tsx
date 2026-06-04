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

import { GradientRamp, useCanvasClient, type RampStop } from "@paged-media/shell";
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
      if (msg.kind === "mutationApplied" || msg.kind === "undoApplied" || msg.kind === "redoApplied") {
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
    setStops((prev) => prev.map((s, j) => (j === i ? { ...s, locationPct: pct } : s)));
  const moveMidpoint = (i: number, pct: number) =>
    setStops((prev) => prev.map((s, j) => (j === i ? { ...s, midpointPct: pct } : s)));
  const addStop = (pct: number) => {
    const next: RampStop = {
      stopColorRef: stops[0]?.stopColorRef ?? swatches[0]?.selfId ?? "Color/Black",
      resolvedRgbHex: "#808080",
      locationPct: pct,
      midpointPct: null,
    };
    const nextStops = [...stops, next];
    setStops(nextStops);
    commit(nextStops, kind);
  };
  const removeSelected = () => {
    if (selected === null || stops.length <= 2) return;
    const nextStops = stops.filter((_, i) => i !== selected);
    setSelected(null);
    setStops(nextStops);
    commit(nextStops, kind);
  };
  const setStopSwatch = (ref: string) => {
    if (selected === null) return;
    const nextStops = stops.map((s, i) =>
      i === selected ? { ...s, stopColorRef: ref } : s,
    );
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
      <div className="text-xs text-muted-foreground px-1 pt-2" data-gradient-editor="empty">
        No gradients in this document.
      </div>
    );
  }

  return (
    <div className="border-t border-input mt-2 pt-2 flex flex-col gap-2" data-gradient-editor="ready">
      <div className="flex items-center gap-2">
        <select
          className="flex-1 text-xs border border-input rounded"
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
        <select
          className="text-xs border border-input rounded"
          data-gradient-type
          value={kind}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
        </select>
        <button
          type="button"
          className="text-xs border border-input rounded px-1.5"
          data-action="reverse-gradient"
          title="Reverse"
          onClick={reverse}
        >
          ⇄
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

      {selected !== null && stops[selected] && (
        <div className="flex items-center gap-2 text-xs" data-gradient-stop-editor>
          <span className="text-muted-foreground">Stop colour</span>
          <select
            className="flex-1 border border-input rounded"
            data-action="stop-swatch"
            value={stops[selected].stopColorRef}
            onChange={(e) => setStopSwatch(e.target.value)}
          >
            {swatches.map((s) => (
              <option key={s.selfId} value={s.selfId}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="border border-input rounded px-1.5 hover:text-red-600"
            data-action="remove-stop"
            disabled={stops.length <= 2}
            onClick={removeSelected}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
