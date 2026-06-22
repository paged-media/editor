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

// Concept 2 — Color panel: composition chrome (fill picker + tint
// scrub) + the live MIXER (CMYK/RGB/Lab/HSB channels, hex, gamut
// warning, ephemeral apply / add-to-swatches).
//
// Mixer semantics mirror InDesign's Color panel vs Swatches split:
// "Apply" creates (or reuses) an UNNAMED swatch from the mixed
// channels and applies its ref to the selection through the same
// `frameFillColor` colorRef path a swatch click takes — the
// mixed-selection sentinel + multi-select fan-out come from the
// binding layer for free. "+ Add to Swatches" promotes the same
// channels to a named entry via `createSwatch`.
//
// W2.5 (2026-06-07) — document-default write. With NOTHING selected
// (`frameFillColor` has no commit path), Apply writes the created
// swatch as the DOCUMENT DEFAULT fill via `setDocumentDefaults`
// (whole-triple, not undoable) — matching InDesign's "set the default
// fill when no object is selected" behaviour. The panel reads the
// current default off `documentMeta()` so the readout reflects it.

import { useEffect, useState } from "react";

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  cockpitActions,
  useBindings,
  useCanvasClient,
  useDocumentMeta,
} from "@paged-media/shell";
import { ColorMixer, type MixerValue } from "@paged-media/ui";
import type { ColorPreview, SwatchSpec, Value } from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";
import { colorComposition } from "./color.composition";

const FILL_BINDING = {
  value: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameFillColor" as const,
  },
};

function unwrapColorRef(v: Value | null): string | null {
  if (!v) return null;
  if (v.type !== "colorRef") return null;
  return (v.value as string | null) ?? null;
}

export function ColorPanel() {
  const client = useCanvasClient();
  const resolved = useBindings(FILL_BINDING);
  const meta = useDocumentMeta();
  // W2.5 — with nothing selected the binding has no commit path; the
  // panel then targets the document-default fill instead.
  const hasSelection = resolved.value.onCommit != null;
  const docDefaultFill = meta?.defaultFillColor ?? null;
  // The readout reflects the selection's fill when one exists, else the
  // document default.
  const fillRef = hasSelection
    ? unwrapColorRef(resolved.value.value)
    : docDefaultFill;
  const [preview, setPreview] = useState<ColorPreview | null>(null);
  // Mixer state — local channel values being authored. Seeds from
  // a neutral default; deliberately NOT slaved to the selection's
  // swatch (the mixer authors a NEW colour; the readout below
  // reflects the applied one).
  const [mix, setMix] = useState<MixerValue>({
    space: "CMYK",
    value: [0, 0, 0, 100],
    tint: 100,
  });

  // Ephemeral apply: create an unnamed swatch from the channels and
  // apply its ref. With a selection it commits through the SAME
  // `frameFillColor` path a swatch pick takes; with NOTHING selected
  // (W2.5) it writes the swatch as the document-default fill via
  // `setDocumentDefaults` (whole-triple — the other two members are
  // preserved from the current meta).
  const applyMix = (v: MixerValue) => {
    const spec: SwatchSpec = {
      selfId: null,
      name: null,
      space: v.space,
      value: [...v.value],
      model: "Process",
      alternateSpace: null,
      alternateValue: [],
      tint: v.tint < 100 ? v.tint : null,
      alpha: null,
    };
    void client
      .mutate({ op: "createSwatch", args: { spec } })
      .then(async () => {
        // The created swatch is the newest entry; resolve its id
        // from the collection (createSwatch doesn't echo createdId
        // — swatches aren't elements).
        const swatches = await client.collection<{ selfId: string }>(
          "swatches",
        );
        const last = swatches[swatches.length - 1];
        if (!last) return;
        if (hasSelection) {
          resolved.value.onCommit?.({ type: "colorRef", value: last.selfId });
        } else {
          // W2.5 — no selection: write the document-default fill,
          // preserving the existing stroke/weight defaults.
          await client
            .mutate({
              op: "setDocumentDefaults",
              args: {
                fillColor: last.selfId,
                strokeColor: meta?.defaultStrokeColor ?? null,
                strokeWeight: meta?.defaultStrokeWeight ?? null,
              },
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  };

  const addSwatch = (spec: SwatchSpec) => {
    void client
      .mutate({
        op: "createSwatch",
        args: { spec: { ...spec, name: spec.name ?? "New swatch" } },
      })
      .catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    if (!fillRef) {
      setPreview(null);
      return;
    }
    void client.colorPreview(fillRef).then((p) => {
      if (cancelled) return;
      setPreview(p);
    });
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        if (!fillRef) return;
        void client.colorPreview(fillRef).then((p) => {
          if (cancelled) return;
          setPreview(p);
        });
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [client, fillRef]);

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div
        className="p-3 flex flex-col gap-3"
        data-color-panel="ready"
        data-target={hasSelection ? "selection" : "document-default"}
      >
        {!hasSelection ? (
          <div
            className="text-[11px]"
            style={{ color: "var(--pg-muted-fg)" }}
            data-doc-default-hint
          >
            No selection — Apply sets the document default fill.
          </div>
        ) : null}
        <CompositionRenderer composition={colorComposition} />
        {/* Concept 2 — the mixer (expert child; hybrid pattern). */}
        <div className="border-t border-input pt-3">
          <ColorMixer
            value={mix}
            onChange={setMix}
            onApply={applyMix}
            onAddSwatch={addSwatch}
          />
        </div>
        {/* Panel-gallery pass — hand off to the colour wheel (the
            harmony-palette author; same swatch pipeline). */}
        <button
          type="button"
          data-open-color-wheel
          onClick={() => cockpitActions.openPanel?.("paged.color-wheel")}
          className="text-xs text-left text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Open color wheel
        </button>
        {preview ? (
          <div
            className="border-t border-input pt-3 flex flex-col gap-1 text-xs"
            data-color-preview
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-6 h-6 border border-input rounded"
                style={{ background: preview.rgbHex }}
                data-color-swatch
              />
              <span className="font-medium">{preview.name}</span>
              <span className="text-muted-foreground">{preview.model}</span>
            </div>
            <div className="grid grid-cols-[5rem_1fr] gap-x-2">
              <span className="text-muted-foreground">RGB</span>
              <span data-color-rgb>{preview.rgbHex}</span>
              {preview.cmyk ? (
                <>
                  <span className="text-muted-foreground">CMYK</span>
                  <span data-color-cmyk>
                    {preview.cmyk.map((v) => `${v.toFixed(0)}%`).join(" / ")}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">CMYK</span>
                  <span className="text-muted-foreground">—</span>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </CatalogRegistryProvider>
  );
}
