import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import type {
  GradientSummary,
  SwatchSummary,
  Value,
} from "@paged-media/client";

import { useCanvasClient } from "../state/canvas-client-context";
import { useBindings } from "../catalog/binding-hook";
import { useRegistries } from "../state/registries-context";
import {
  useFormattingAffects,
  type FillStrokeWell,
} from "../state/formatting-affects-context";
import { contentSelectionInactive } from "../state/commands/tool-commands";

// Concept 1 (T3) — the fill/stroke/apply foot cluster. NOT a tool: a
// small composition over Concept 2's colour model. The wells read +
// write `frameFillColor` / `frameStrokeColor` through the SAME path
// the Color / Swatches panels use (`useBindings` → `setElementProperty`),
// so there is zero bespoke colour code here.
//
// Editor-ops (protocol v24) — the two formerly blocked-on-core seams
// are live:
//   - with NOTHING selected the wells read/write the DOCUMENT
//     defaults (`setDocumentDefaults`, whole-triple, not undoable —
//     InDesign's "no selection = future objects" semantics); new
//     shapes pick the defaults up engine-side;
//   - `[gradient]` applies the last-used (else the document's first)
//     `Gradient/<id>` ref through the SAME colorRef path a swatch
//     takes (IDML's FillColor accepts either).

const NONE: Value = { type: "colorRef", value: null };

/** The document-default triple, mirrored from `documentMeta`. */
interface DocDefaults {
  fill: string | null;
  stroke: string | null;
  weight: number | null;
}

function colorRef(id: string | null): Value {
  return { type: "colorRef", value: id };
}

function unwrapColorRef(v: Value | null): string | null {
  if (!v || v.type !== "colorRef") return null;
  return (v.value as string | null) ?? null;
}

export function FillStrokeCluster() {
  const { activeWell, setActiveWell, affects, toggleAffects } =
    useFormattingAffects();

  // Fill path follows the J toggle (container frame vs. the text
  // inside it); stroke stays frame-level (text stroke isn't a path).
  const fillBinding = useMemo(
    () =>
      affects === "text"
        ? { value: { kind: "selectionProperty" as const, scope: "content" as const, path: "characterFillColor" as const } }
        : { value: { kind: "selectionProperty" as const, scope: "element" as const, path: "frameFillColor" as const } },
    [affects],
  );
  const strokeBinding = useMemo(
    () => ({ value: { kind: "selectionProperty" as const, scope: "element" as const, path: "frameStrokeColor" as const } }),
    [],
  );

  const fill = useBindings(fillBinding).value;
  const stroke = useBindings(strokeBinding).value;

  // Editor-ops — document defaults (protocol v24). Loaded from
  // `documentMeta`, refreshed on every applied mutation (the
  // `setDocumentDefaults` write itself replies `mutationApplied`).
  const client = useCanvasClient();
  const [docDefaults, setDocDefaults] = useState<DocDefaults | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void client
        .documentMeta()
        .then((m) => {
          if (cancelled) return;
          setDocDefaults({
            fill: m.defaultFillColor ?? null,
            stroke: m.defaultStrokeColor ?? null,
            weight: m.defaultStrokeWeight ?? null,
          });
        })
        .catch(() => {});
    load();
    const off = client.subscribe((m) => {
      if (
        m.kind === "documentLoaded" ||
        m.kind === "mutationApplied" ||
        m.kind === "undoApplied" ||
        m.kind === "redoApplied"
      ) {
        load();
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [client]);

  const writeDefault = (well: FillStrokeWell, ref: string | null) => {
    const d = docDefaults ?? { fill: null, stroke: null, weight: null };
    const next: DocDefaults = { ...d, [well]: ref };
    setDocDefaults(next); // optimistic; the subscriber re-loads
    void client
      .mutate({
        op: "setDocumentDefaults",
        args: {
          fillColor: next.fill,
          strokeColor: next.stroke,
          strokeWeight: next.weight,
        },
      })
      .catch(() => {});
  };

  // Selection-backed value when a commit path exists; the document
  // default otherwise (the wells are never inert).
  const fillRef = fill.onCommit
    ? unwrapColorRef(fill.value)
    : docDefaults?.fill ?? null;
  const strokeRef = stroke.onCommit
    ? unwrapColorRef(stroke.value)
    : docDefaults?.stroke ?? null;
  const fillHex = useColorHex(fillRef);
  const strokeHex = useColorHex(strokeRef);

  // Remember the last solid colour / gradient applied, for the
  // `[colour]` / `[gradient]` buttons.
  const lastSolid = useRef<string | null>(null);
  const lastGradient = useRef<string | null>(null);
  useEffect(() => {
    if (!fillRef) return;
    if (fillRef.startsWith("Gradient/")) lastGradient.current = fillRef;
    else lastSolid.current = fillRef;
  }, [fillRef]);

  // Editor-ops — the gradient list backs the `[gradient]` button
  // (apply target fallback + enablement).
  const [gradients, setGradients] = useState<GradientSummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void client
        .collection<GradientSummary>("gradients")
        .then((list) => {
          if (!cancelled) setGradients([...list]);
        })
        .catch(() => {});
    load();
    const off = client.subscribe((m) => {
      if (m.kind === "documentLoaded" || m.kind === "mutationApplied") load();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [client]);

  const active = activeWell === "fill" ? fill : stroke;
  // A well always has a write path now: the selection when one
  // exists, the document defaults otherwise.
  const canApply = active.onCommit != null || docDefaults != null;

  const applyTo = (well: FillStrokeWell, id: string | null) => {
    const binding = well === "fill" ? fill : stroke;
    if (binding.onCommit) binding.onCommit(colorRef(id));
    else writeDefault(well, id);
  };
  const apply = (id: string | null) => applyTo(activeWell, id);

  const applyGradient = () => {
    const id = lastGradient.current ?? gradients[0]?.selfId ?? null;
    if (id) apply(id);
  };

  const swap = () => {
    if (fill.onCommit && stroke.onCommit) {
      const fv = fill.value ?? NONE;
      const sv = stroke.value ?? NONE;
      fill.onCommit(sv);
      stroke.onCommit(fv);
      return;
    }
    // No selection — swap the document defaults (single write).
    if (!fill.onCommit && !stroke.onCommit && docDefaults) {
      const next: DocDefaults = {
        ...docDefaults,
        fill: docDefaults.stroke,
        stroke: docDefaults.fill,
      };
      setDocDefaults(next);
      void client
        .mutate({
          op: "setDocumentDefaults",
          args: {
            fillColor: next.fill,
            strokeColor: next.stroke,
            strokeWeight: next.weight,
          },
        })
        .catch(() => {});
    }
  };

  // `D` default pair: no fill, black stroke (leaves stroke untouched
  // when the document has no Black swatch). Resolved lazily so a D
  // press right after document load doesn't race the swatches fetch.
  const blackId = useRef<string | null>(null);
  const resolveBlack = async (): Promise<string | null> => {
    if (blackId.current) return blackId.current;
    try {
      const list = await client.collection<SwatchSummary>("swatches");
      blackId.current =
        list.find((s) => /black/i.test(s.name))?.selfId ?? null;
    } catch {
      /* keep null — stroke stays untouched */
    }
    return blackId.current;
  };
  useEffect(() => {
    void resolveBlack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const applyDefault = () => {
    void resolveBlack().then((black) => {
      if (fill.onCommit || stroke.onCommit) {
        fill.onCommit?.(NONE);
        if (black) stroke.onCommit?.(colorRef(black));
        return;
      }
      // No selection — one whole-triple defaults write (two
      // sequential `writeDefault`s would clobber each other's
      // optimistic state).
      const d = docDefaults ?? { fill: null, stroke: null, weight: null };
      const next: DocDefaults = {
        ...d,
        fill: null,
        stroke: black ?? d.stroke,
      };
      setDocDefaults(next);
      void client
        .mutate({
          op: "setDocumentDefaults",
          args: {
            fillColor: next.fill,
            strokeColor: next.stroke,
            strokeWeight: next.weight,
          },
        })
        .catch(() => {});
    });
  };

  // X / D / J chrome keys — registered HERE (not the tool class) so the
  // handlers close over the live bindings; text-suppressed like tool
  // shortcuts. Refs keep the registered handlers current.
  const swapRef = useRef(swap);
  swapRef.current = swap;
  const defaultRef = useRef(applyDefault);
  defaultRef.current = applyDefault;
  const toggleAffectsRef = useRef(toggleAffects);
  toggleAffectsRef.current = toggleAffects;

  const registries = useRegistries();
  useEffect(() => {
    const disposables = [
      registries.commands.register({
        id: "paged.fillStroke.swap",
        title: "Swap Fill and Stroke",
        category: "Colour",
        handler: () => swapRef.current(),
      }),
      registries.commands.register({
        id: "paged.fillStroke.default",
        title: "Default Fill and Stroke",
        category: "Colour",
        handler: () => defaultRef.current(),
      }),
      registries.commands.register({
        id: "paged.fillStroke.toggleAffects",
        title: "Toggle Formatting Affects Container/Text",
        category: "Colour",
        handler: () => toggleAffectsRef.current(),
      }),
      registries.keybindings.register({
        key: "x",
        command: "paged.fillStroke.swap",
        when: contentSelectionInactive,
      }),
      registries.keybindings.register({
        key: "d",
        command: "paged.fillStroke.default",
        when: contentSelectionInactive,
      }),
      registries.keybindings.register({
        key: "j",
        command: "paged.fillStroke.toggleAffects",
        when: contentSelectionInactive,
      }),
    ];
    return () => {
      for (const d of disposables) d.dispose();
    };
  }, [registries]);

  const [picker, setPicker] = useState<{ left: number; top: number } | null>(
    null,
  );
  const wellsRef = useRef<HTMLDivElement | null>(null);

  const openPicker = (well: FillStrokeWell) => {
    setActiveWell(well);
    const rect = wellsRef.current?.getBoundingClientRect();
    if (rect) setPicker({ left: rect.right + 6, top: rect.top });
  };

  return (
    <div style={clusterStyle} data-fill-stroke-cluster="ready">
      {/* Overlapping fill (front) + stroke (back) wells. */}
      <div ref={wellsRef} style={{ position: "relative", width: 30, height: 30 }}>
        <Well
          kind="stroke"
          hex={strokeHex}
          isNone={strokeRef === null}
          active={activeWell === "stroke"}
          style={{ right: 0, bottom: 0 }}
          onOpen={() => openPicker("stroke")}
          ring
        />
        <Well
          kind="fill"
          hex={fillHex}
          isNone={fillRef === null}
          active={activeWell === "fill"}
          style={{ left: 0, top: 0 }}
          onOpen={() => openPicker("fill")}
        />
      </div>

      {/* Swap (X) + default (D). */}
      <div style={miniRow}>
        <button
          type="button"
          title="Swap fill and stroke (X)"
          data-fs-swap
          onClick={swap}
          style={miniBtn}
        >
          ⇄
        </button>
        <button
          type="button"
          title="Default fill and stroke (D)"
          data-fs-default
          disabled={!fill.onCommit && !stroke.onCommit && !docDefaults}
          onClick={applyDefault}
          style={miniBtn}
        >
          ▣
        </button>
      </div>

      {/* Apply: [colour] · [gradient (disabled)] · [None]. */}
      <div style={miniRow}>
        <button
          type="button"
          title="Apply last colour"
          data-fs-apply-color
          disabled={!canApply}
          onClick={() => apply(lastSolid.current)}
          style={{ ...miniBtn, background: "#374151", color: "#fff" }}
        >
          ◼
        </button>
        <button
          type="button"
          title={
            gradients.length > 0
              ? "Apply last gradient"
              : "No gradient swatches in this document"
          }
          data-fs-apply-gradient
          disabled={!canApply || gradients.length === 0}
          onClick={applyGradient}
          style={{
            ...miniBtn,
            ...(gradients.length > 0
              ? { background: "linear-gradient(135deg, #111827, #e5e7eb)" }
              : { opacity: 0.4, cursor: "not-allowed" }),
          }}
        />
        <button
          type="button"
          title="Apply None"
          data-fs-apply-none
          disabled={!canApply}
          onClick={() => apply(null)}
          style={miniBtn}
        >
          <NoneGlyph />
        </button>
      </div>

      {/* J — formatting affects container vs. text. */}
      <button
        type="button"
        title={`Formatting affects: ${affects} (J)`}
        data-fs-affects={affects}
        onClick={toggleAffects}
        style={{
          ...miniBtn,
          width: 30,
          fontSize: 10,
          background: affects === "text" ? "#1f2937" : "#fff",
          color: affects === "text" ? "#fff" : "#374151",
        }}
      >
        {affects === "text" ? "T" : "□"}
      </button>

      {!canApply && (
        <div style={hintStyle} title="Waiting for the document to load">
          —
        </div>
      )}

      {picker &&
        createPortal(
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 50 }}
              onClick={() => setPicker(null)}
              aria-hidden
            />
            <SwatchPicker
              style={{ position: "fixed", left: picker.left, top: picker.top, zIndex: 51 }}
              onPick={(id) => {
                apply(id);
                setPicker(null);
              }}
              onNone={() => {
                apply(null);
                setPicker(null);
              }}
            />
          </>,
          document.body,
        )}
    </div>
  );
}

function Well({
  kind,
  hex,
  isNone,
  active,
  style,
  onOpen,
  ring,
}: {
  kind: FillStrokeWell;
  hex: string | null;
  isNone: boolean;
  active: boolean;
  style: CSSProperties;
  onOpen: () => void;
  ring?: boolean;
}) {
  return (
    <button
      type="button"
      data-well={kind}
      data-active={active ? "true" : "false"}
      title={`${kind === "fill" ? "Fill" : "Stroke"} — click to choose a colour`}
      onClick={onOpen}
      style={{
        position: "absolute",
        width: 20,
        height: 20,
        border: active ? "2px solid #1f2937" : "1px solid #9ca3af",
        borderRadius: 3,
        padding: 0,
        cursor: "pointer",
        // Stroke well reads as a hollow square (ring); fill is solid.
        background: isNone ? "#fff" : hex ?? "#d1d5db",
        boxShadow: ring ? "inset 0 0 0 4px #fff" : undefined,
        ...style,
      }}
    >
      {isNone && <NoneOverlay />}
    </button>
  );
}

function useColorHex(ref: string | null): string | null {
  const client = useCanvasClient();
  const [hex, setHex] = useState<string | null>(null);
  useEffect(() => {
    if (!ref) {
      setHex(null);
      return;
    }
    let cancelled = false;
    const load = () =>
      void client
        .colorPreview(ref)
        .then((p) => {
          if (!cancelled) setHex(p?.rgbHex ?? null);
        })
        .catch(() => {
          if (!cancelled) setHex(null);
        });
    load();
    const off = client.subscribe((m) => {
      if (
        m.kind === "mutationApplied" ||
        m.kind === "undoApplied" ||
        m.kind === "redoApplied"
      ) {
        load();
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [client, ref]);
  return hex;
}

function SwatchPicker({
  style,
  onPick,
  onNone,
}: {
  style?: CSSProperties;
  onPick: (id: string) => void;
  onNone: () => void;
}) {
  const client = useCanvasClient();
  const [swatches, setSwatches] = useState<SwatchSummary[]>([]);
  const [hexes, setHexes] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void client
      .collection<SwatchSummary>("swatches")
      .then((list) => {
        if (cancelled) return;
        setSwatches([...list]);
        void Promise.all(
          list.map((s) =>
            client
              .colorPreview(s.selfId)
              .then((p) => [s.selfId, p?.rgbHex ?? "#ffffff"] as const)
              .catch(() => [s.selfId, "#ffffff"] as const),
          ),
        ).then((pairs) => {
          if (!cancelled) setHexes(Object.fromEntries(pairs));
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <div style={{ ...pickerStyle, ...style }} role="menu" data-swatch-picker="ready">
      <button
        type="button"
        title="None"
        data-swatch-none
        onClick={onNone}
        style={swatchChip}
      >
        <NoneGlyph />
      </button>
      {swatches.map((s) => (
        <button
          key={s.selfId}
          type="button"
          title={s.name}
          data-swatch-id={s.selfId}
          onClick={() => onPick(s.selfId)}
          style={{ ...swatchChip, background: hexes[s.selfId] ?? "#d1d5db" }}
        />
      ))}
    </div>
  );
}

function NoneOverlay() {
  return (
    <svg viewBox="0 0 20 20" width="100%" height="100%" aria-hidden>
      <line x1={3} y1={17} x2={17} y2={3} stroke="#ef4444" strokeWidth={1.6} />
    </svg>
  );
}
function NoneGlyph() {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden>
      <rect x={1.5} y={1.5} width={13} height={13} rx={2} fill="none" stroke="#9ca3af" />
      <line x1={3} y1={13} x2={13} y2={3} stroke="#ef4444" strokeWidth={1.4} />
    </svg>
  );
}

const clusterStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
};

const miniRow: CSSProperties = { display: "flex", gap: 2 };

const miniBtn: CSSProperties = {
  width: 14,
  height: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d4d4d8",
  borderRadius: 3,
  background: "#fff",
  color: "#374151",
  cursor: "pointer",
  padding: 0,
  fontSize: 9,
  lineHeight: 1,
};

const hintStyle: CSSProperties = {
  fontSize: 10,
  opacity: 0.5,
};

const pickerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, 18px)",
  gap: 4,
  padding: 8,
  maxWidth: 160,
  maxHeight: 220,
  overflowY: "auto",
  borderRadius: 6,
  border: "1px solid #d4d4d8",
  background: "#fff",
  boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
};

const swatchChip: CSSProperties = {
  width: 18,
  height: 18,
  border: "1px solid #d4d4d8",
  borderRadius: 3,
  padding: 0,
  cursor: "pointer",
};
