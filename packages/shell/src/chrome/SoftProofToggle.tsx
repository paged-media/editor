// Concept 2 — the soft-proof toggle (InDesign "Proof Colors"): a
// view-state control at the foot of the tool rail, sibling to the
// screen-mode selector. Flips the output-condition simulation on/off
// via `setProofSetup`; the proof PROFILE + paper-white detail live
// in the Colour Settings panel — this is the one-click switch. The
// last-used (else first-registered) profile is the toggle's target;
// with no registered profile the toggle stays disabled.

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { useCanvasClient } from "../state/canvas-client-context";

export function SoftProofToggle() {
  const client = useCanvasClient();
  const [proofOn, setProofOn] = useState(false);
  const [profiles, setProfiles] = useState<string[]>([]);
  const lastProfile = useRef<string | null>(null);

  useEffect(() => {
    const refresh = () =>
      void client
        .documentMeta()
        .then((m) => {
          setProofOn(m.proofProfileName != null);
          if (m.proofProfileName) lastProfile.current = m.proofProfileName;
        })
        .catch(() => {});
    refresh();
    const off = client.subscribe((msg) => {
      if (msg.kind === "documentLoaded" || msg.kind === "mutationApplied") refresh();
      if (msg.kind === "colorProfileRegistered") {
        setProfiles((prev) =>
          prev.includes(msg.payload.name) ? prev : [...prev, msg.payload.name],
        );
      }
    });
    return off;
  }, [client]);

  const target = lastProfile.current ?? profiles[0] ?? null;
  const disabled = !proofOn && target === null;

  const toggle = () => {
    void client
      .mutate({
        op: "setProofSetup",
        args: {
          profileName: proofOn ? null : target,
          simulatePaperWhite: false,
          intent: null,
        },
      })
      .catch(() => {});
  };

  return (
    <button
      type="button"
      data-soft-proof={proofOn ? "on" : "off"}
      title={
        disabled
          ? "Proof Colours — register an output profile first (Colour Settings)"
          : proofOn
            ? "Proof Colours: on — click to turn off"
            : `Proof Colours: simulate ${target ?? "output"}`
      }
      disabled={disabled}
      onClick={toggle}
      style={{
        ...btnStyle,
        background: proofOn ? "#1f2937" : "#fff",
        color: proofOn ? "#fff" : "#374151",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      ◑
    </button>
  );
}

const btnStyle: CSSProperties = {
  width: 30,
  height: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d4d4d8",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 12,
  padding: 0,
};
