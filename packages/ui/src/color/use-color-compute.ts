// Concept 2 — debounced live colour compute for the mixer. Slider
// state resolves through the document's ACTIVE colour management
// (working space, intent, standard-Lab) via `requestColorCompute`
// — no throwaway swatch, no naive client-side approximation. Each
// request carries a seq; stale replies (a fast scrub outrunning the
// worker round-trip) are dropped so the preview chip never rewinds.

import { useEffect, useRef, useState } from "react";

import { useCanvasClient } from "@paged-media/shell";

import type { MixerValue } from "./color-space";

export interface ColorComputeResult {
  rgbHex: string;
  cmyk: [number, number, number, number] | null;
  outOfGamut: boolean;
  /** True while a request is in flight (the chip can dim). */
  pending: boolean;
}

const DEBOUNCE_MS = 40;

export function useColorCompute(value: MixerValue | null): ColorComputeResult {
  const client = useCanvasClient();
  const [result, setResult] = useState<ColorComputeResult>({
    rgbHex: "#808080",
    cmyk: null,
    outOfGamut: false,
    pending: false,
  });
  const seqRef = useRef(0);

  useEffect(() => {
    if (!value) return;
    const seq = ++seqRef.current;
    setResult((r) => ({ ...r, pending: true }));
    const timer = setTimeout(() => {
      void client
        .colorCompute({
          space: value.space,
          value: value.value,
          tint: value.tint < 100 ? value.tint : null,
        })
        .then((reply) => {
          if (seqRef.current !== seq) return; // stale
          setResult({ ...reply, pending: false });
        })
        .catch(() => {
          if (seqRef.current !== seq) return;
          setResult((r) => ({ ...r, pending: false }));
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, value?.space, JSON.stringify(value?.value), value?.tint]);

  return result;
}
