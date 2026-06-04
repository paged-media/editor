// Concept 2 — Document Colour Settings: the working-space / intent /
// BPC surface (InDesign's Color Settings) plus the soft-proof setup.
// All writes are whole-state, non-undoable app configuration:
// `setColorSettings` forces a full repaint (AC-3 — switching the
// CMYK working space visibly changes the canvas), `setProofSetup`
// toggles the output-condition simulation.
//
// Profiles are ASSETS registered over the wire (never baked into
// the wasm): "Add profile…" registers a user-picked .icc under its
// filename; the document's designmap-declared working space
// auto-activates when a matching name is registered before load.
// No CMYK profiles ship bundled yet (licence-verified ECI artefacts
// pending — see NOTICE).

import { useCallback, useEffect, useState } from "react";

import { useCanvasClient } from "@paged-media/shell";

const INTENTS = [
  "Perceptual",
  "RelativeColorimetric",
  "Saturation",
  "AbsoluteColorimetric",
] as const;

export function ColorSettingsPanel() {
  const client = useCanvasClient();
  const [profiles, setProfiles] = useState<string[]>([]);
  const [cmykProfile, setCmykProfile] = useState<string>("");
  const [intent, setIntent] = useState<string>("RelativeColorimetric");
  const [bpc, setBpc] = useState(true);
  const [proofOn, setProofOn] = useState(false);
  const [proofProfile, setProofProfile] = useState<string>("");
  const [paperWhite, setPaperWhite] = useState(false);

  const refresh = useCallback(() => {
    void client
      .documentMeta()
      .then((m) => {
        setCmykProfile(m.cmykProfileName ?? "");
        setIntent(m.renderingIntent ?? "RelativeColorimetric");
        setBpc(m.blackPointCompensation ?? true);
        setProofOn(m.proofProfileName != null);
        setProofProfile(m.proofProfileName ?? "");
        setPaperWhite(m.proofSimulatePaperWhite ?? false);
      })
      .catch(() => {});
  }, [client]);

  useEffect(() => {
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
  }, [client, refresh]);

  const writeSettings = (next: {
    cmykProfile?: string;
    intent?: string;
    bpc?: boolean;
  }) => {
    void client
      .mutate({
        op: "setColorSettings",
        args: {
          cmykProfileName: (next.cmykProfile ?? cmykProfile) || null,
          rgbPolicy: null,
          intent: next.intent ?? intent,
          bpc: next.bpc ?? bpc,
        },
      })
      .catch(() => {});
  };

  const writeProof = (next: {
    on?: boolean;
    profile?: string;
    paperWhite?: boolean;
  }) => {
    const on = next.on ?? proofOn;
    const profile = next.profile ?? proofProfile;
    void client
      .mutate({
        op: "setProofSetup",
        args: {
          profileName: on && profile ? profile : null,
          simulatePaperWhite: next.paperWhite ?? paperWhite,
          intent: null,
        },
      })
      .catch(() => {});
  };

  const addProfile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".icc,.icm";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const name = file.name.replace(/\.(icc|icm)$/i, "");
      const bytes = new Uint8Array(await file.arrayBuffer());
      await client.registerColorProfile(name, bytes);
    };
    input.click();
  };

  return (
    <div className="p-3 text-sm flex flex-col gap-3" data-color-settings="ready">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Working spaces
      </div>
      <label className="flex items-center gap-2 text-xs">
        <span className="w-12 text-muted-foreground">CMYK</span>
        <select
          className="flex-1 border border-input rounded"
          data-setting="cmyk-profile"
          value={cmykProfile}
          onChange={(e) => {
            setCmykProfile(e.target.value);
            writeSettings({ cmykProfile: e.target.value });
          }}
        >
          <option value="">(document default / naive)</option>
          {/* The designmap-declared name surfaces even when its
              bytes aren't registered yet. */}
          {cmykProfile && !profiles.includes(cmykProfile) && (
            <option value={cmykProfile}>{cmykProfile}</option>
          )}
          {profiles.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <span className="w-12 text-muted-foreground">Intent</span>
        <select
          className="flex-1 border border-input rounded"
          data-setting="intent"
          value={intent}
          onChange={(e) => {
            setIntent(e.target.value);
            writeSettings({ intent: e.target.value });
          }}
        >
          {INTENTS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          data-setting="bpc"
          checked={bpc}
          onChange={(e) => {
            setBpc(e.target.checked);
            writeSettings({ bpc: e.target.checked });
          }}
        />
        Black-point compensation
      </label>
      <button
        type="button"
        className="text-xs border border-input rounded px-2 py-1 self-start"
        data-action="add-profile"
        onClick={addProfile}
      >
        Add profile (.icc)…
      </button>

      <div className="text-[10px] uppercase tracking-wide text-muted-foreground border-t border-input pt-2">
        Proof colours
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          data-setting="proof-on"
          checked={proofOn}
          onChange={(e) => {
            setProofOn(e.target.checked);
            writeProof({ on: e.target.checked });
          }}
        />
        Simulate output condition
      </label>
      <label className="flex items-center gap-2 text-xs">
        <span className="w-12 text-muted-foreground">Device</span>
        <select
          className="flex-1 border border-input rounded"
          data-setting="proof-profile"
          value={proofProfile}
          onChange={(e) => {
            setProofProfile(e.target.value);
            writeProof({ profile: e.target.value, on: true });
          }}
        >
          <option value="">(choose a registered profile)</option>
          {profiles.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          data-setting="paper-white"
          checked={paperWhite}
          onChange={(e) => {
            setPaperWhite(e.target.checked);
            writeProof({ paperWhite: e.target.checked });
          }}
        />
        Simulate paper white
      </label>
    </div>
  );
}
