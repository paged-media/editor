// Concept 3 — the PDF export dialog (File ▸ Export PDF…).
//
// A controlled React form, NOT a catalog composition: the fields are
// interdependent (X-4 requires an output-intent profile; the Export
// button gates on validation) and the dialog OWNS the export loop —
// it drives `client.exportPdf` page by page, renders the determinate
// progress bar, and surfaces Cancel through an AbortController. The
// command (`paged.file.exportPdf`) only opens it via the module
// emitter below (the CommandPalette `notifyPalette` pattern).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExportPdfWireOptions } from "@paged-media/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useCanvasClient } from "../state/canvas-client-context";
import { useDocument } from "../state/document-context";

type DialogAction = "open" | "close";
const listeners = new Set<(action: DialogAction) => void>();

/** Open/close the export dialog from anywhere (command handlers). */
export function notifyExportPdfDialog(action: DialogAction): void {
  for (const fn of listeners) fn(action);
}

/** Persisted last-used options (schema drift falls back to defaults). */
const OPTIONS_KEY = "paged.exportPdf.options.v1";

interface FormState {
  standard: "pdf17" | "pdfx4";
  outputIntentProfile: string; // "" = active working space
  colorPolicy: "preserveNumbers" | "convertToDestination";
  allPages: boolean;
  pageFrom: string; // 1-based in the UI
  pageTo: string;
  useDocumentBleed: boolean;
  bleedPt: string; // uniform custom bleed
  cropMarks: boolean;
  registrationMarks: boolean;
  colorBars: boolean;
  downsample: "off" | "300" | "150";
}

const DEFAULTS: FormState = {
  standard: "pdfx4",
  outputIntentProfile: "",
  colorPolicy: "preserveNumbers",
  allPages: true,
  pageFrom: "1",
  pageTo: "1",
  useDocumentBleed: true,
  bleedPt: "0",
  cropMarks: false,
  registrationMarks: false,
  colorBars: false,
  downsample: "off",
};

function loadSaved(): FormState {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<FormState>) };
  } catch {
    return DEFAULTS;
  }
}

type Phase =
  | { kind: "idle" }
  | { kind: "exporting"; done: number; total: number }
  | { kind: "error"; message: string }
  | { kind: "done"; pages: number; diagnostics: string[] };

const fieldRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
};
const labelStyle: React.CSSProperties = { width: 130, opacity: 0.8 };

export function ExportPdfDialog() {
  const client = useCanvasClient();
  const { handle } = useDocument();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(loadSaved);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [docName, setDocName] = useState("document");
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [profileActive, setProfileActive] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const [pageCount, setPageCount] = useState(1);

  // Module-emitter subscription (the notifyPalette pattern).
  useEffect(() => {
    const fn = (action: DialogAction) => {
      setOpen(action === "open");
      if (action === "open") setPhase({ kind: "idle" });
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  // Registered profile names — the X-4 output-intent choices.
  useEffect(() => {
    const off = client.subscribe((msg) => {
      if (msg.kind === "colorProfileRegistered") {
        const name = (msg.payload as { name: string }).name;
        setProfiles((prev) => (prev.includes(name) ? prev : [...prev, name]));
      }
    });
    return off;
  }, [client]);

  // Seed document name / active profile / page count on open.
  useEffect(() => {
    if (!open || !handle) return;
    let cancelled = false;
    void client.documentMeta().then((meta) => {
      if (cancelled) return;
      setDocName(meta.documentName || "document");
      setActiveProfile(meta.cmykProfileName ?? null);
      setProfileActive(meta.cmykProfileActive ?? false);
      setPageCount(meta.pageCount);
      setForm((f) => ({
        ...f,
        pageTo: f.allPages ? String(meta.pageCount) : f.pageTo,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [open, handle, client]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      try {
        localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
      } catch {
        /* quota — last-used options are a convenience only */
      }
      return next;
    });
  }, []);

  // X-4 needs an output intent with REAL bytes behind it: an
  // explicitly selected registered profile, or a working space the
  // worker reports as active (cmykProfileName alone can be a bare
  // designmap declaration with no bytes — not exportable).
  const x4ProfileMissing =
    form.standard === "pdfx4" &&
    form.outputIntentProfile === "" &&
    !profileActive;

  const rangeInvalid = useMemo(() => {
    if (form.allPages) return false;
    const from = Number(form.pageFrom);
    const to = Number(form.pageTo);
    return (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 1 ||
      to < from ||
      to > pageCount
    );
  }, [form.allPages, form.pageFrom, form.pageTo, pageCount]);

  const exporting = phase.kind === "exporting";
  const canExport = handle != null && !exporting && !x4ProfileMissing && !rangeInvalid;

  const onExport = useCallback(async () => {
    const options: ExportPdfWireOptions = {
      standard: form.standard,
      outputIntentProfile:
        form.outputIntentProfile === "" ? null : form.outputIntentProfile,
      outputCondition:
        form.standard === "pdfx4"
          ? (form.outputIntentProfile || activeProfile) ?? null
          : null,
      colorPolicy: form.colorPolicy,
      pageFrom: form.allPages ? null : Number(form.pageFrom) - 1,
      pageTo: form.allPages ? null : Number(form.pageTo) - 1,
      cropMarks: form.cropMarks,
      registrationMarks: form.registrationMarks,
      colorBars: form.colorBars,
      pageInfo: false,
      bleedOverridePt: form.useDocumentBleed
        ? null
        : [
            Number(form.bleedPt) || 0,
            Number(form.bleedPt) || 0,
            Number(form.bleedPt) || 0,
            Number(form.bleedPt) || 0,
          ],
      downsamplePpi: form.downsample === "off" ? null : Number(form.downsample),
      title: docName,
    };
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "exporting", done: 0, total: 1 });
    try {
      const { bytes, diagnostics } = await client.exportPdf(options, {
        signal: controller.signal,
        onProgress: (done, total) =>
          setPhase({ kind: "exporting", done, total }),
      });
      const blob = new Blob([bytes.slice()], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${docName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setPhase({ kind: "done", pages: pageCount, diagnostics });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setPhase({ kind: "idle" });
      } else {
        setPhase({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      abortRef.current = null;
    }
  }, [client, form, docName, activeProfile, pageCount]);

  const onCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    } else {
      setOpen(false);
    }
  }, []);

  const statusAttr =
    phase.kind === "exporting"
      ? "exporting"
      : phase.kind === "done"
        ? "done"
        : phase.kind === "error"
          ? "error"
          : "idle";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Block closing via overlay/Escape mid-export; Cancel aborts.
        if (!next && exporting) return;
        setOpen(next);
      }}
    >
      <DialogContent data-export-dialog data-export-status={statusAttr}>
        <DialogHeader>
          <DialogTitle>Export PDF</DialogTitle>
          <DialogDescription>
            Print-grade PDF from the live document — text stays text,
            CMYK and spot inks keep their numbers.
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={fieldRow}>
            <span style={labelStyle}>Conformance</span>
            <select
              data-export-standard
              value={form.standard}
              disabled={exporting}
              onChange={(e) =>
                set("standard", e.target.value as FormState["standard"])
              }
            >
              <option value="pdfx4">PDF/X-4</option>
              <option value="pdf17">PDF 1.7</option>
            </select>
          </div>

          <div style={fieldRow}>
            <span style={labelStyle}>Output intent</span>
            <select
              data-export-profile
              value={form.outputIntentProfile}
              disabled={exporting}
              onChange={(e) => set("outputIntentProfile", e.target.value)}
            >
              <option value="">
                {profileActive && activeProfile
                  ? `Document working space (${activeProfile})`
                  : "Document working space"}
              </option>
              {profiles.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          {x4ProfileMissing && (
            <div
              data-export-validation
              style={{ color: "var(--status-error)", fontSize: 12, marginLeft: 138 }}
            >
              PDF/X-4 requires an output-intent profile — register one in
              Color Settings or switch to PDF 1.7.
            </div>
          )}

          <div style={fieldRow}>
            <span style={labelStyle}>Colour</span>
            <select
              data-export-policy
              value={form.colorPolicy}
              disabled={exporting}
              onChange={(e) =>
                set("colorPolicy", e.target.value as FormState["colorPolicy"])
              }
            >
              <option value="preserveNumbers">Preserve numbers</option>
              <option value="convertToDestination">
                Convert to destination
              </option>
            </select>
          </div>

          <div style={fieldRow}>
            <span style={labelStyle}>Pages</span>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={form.allPages}
                disabled={exporting}
                onChange={(e) => set("allPages", e.target.checked)}
              />
              All ({pageCount})
            </label>
            {!form.allPages && (
              <>
                <Input
                  data-export-page-from
                  style={{ width: 56 }}
                  value={form.pageFrom}
                  disabled={exporting}
                  onChange={(e) => set("pageFrom", e.target.value)}
                />
                <span>–</span>
                <Input
                  data-export-page-to
                  style={{ width: 56 }}
                  value={form.pageTo}
                  disabled={exporting}
                  onChange={(e) => set("pageTo", e.target.value)}
                />
              </>
            )}
          </div>
          {rangeInvalid && (
            <div style={{ color: "var(--status-error)", fontSize: 12, marginLeft: 138 }}>
              Range must be within 1–{pageCount}.
            </div>
          )}

          <div style={fieldRow}>
            <span style={labelStyle}>Bleed</span>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={form.useDocumentBleed}
                disabled={exporting}
                onChange={(e) => set("useDocumentBleed", e.target.checked)}
              />
              Use document bleed
            </label>
            {!form.useDocumentBleed && (
              <>
                <Input
                  style={{ width: 64 }}
                  value={form.bleedPt}
                  disabled={exporting}
                  onChange={(e) => set("bleedPt", e.target.value)}
                />
                <span style={{ opacity: 0.7 }}>pt (all sides)</span>
              </>
            )}
          </div>

          <div style={fieldRow}>
            <span style={labelStyle}>Marks</span>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={form.cropMarks}
                disabled={exporting}
                onChange={(e) => set("cropMarks", e.target.checked)}
              />
              Crop
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={form.registrationMarks}
                disabled={exporting}
                onChange={(e) => set("registrationMarks", e.target.checked)}
              />
              Registration
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={form.colorBars}
                disabled={exporting}
                onChange={(e) => set("colorBars", e.target.checked)}
              />
              Colour bars
            </label>
          </div>

          <div style={fieldRow}>
            <span style={labelStyle}>Downsample images</span>
            <select
              value={form.downsample}
              disabled={exporting}
              onChange={(e) =>
                set("downsample", e.target.value as FormState["downsample"])
              }
            >
              <option value="off">Off (preserve)</option>
              <option value="300">to 300 ppi</option>
              <option value="150">to 150 ppi</option>
            </select>
          </div>

          {phase.kind === "exporting" && (
            <div data-export-progress style={{ marginTop: 4 }}>
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                Exporting page {phase.done} / {phase.total}…
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: "rgba(127,127,127,0.25)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${phase.total > 0 ? (phase.done / phase.total) * 100 : 0}%`,
                    background: "var(--pg-primary)",
                    transition: "width 120ms",
                  }}
                />
              </div>
            </div>
          )}
          {phase.kind === "error" && (
            <div
              data-export-error
              style={{ color: "var(--status-error)", fontSize: 12 }}
            >
              Export failed: {phase.message}
            </div>
          )}
          {phase.kind === "done" && phase.diagnostics.length > 0 && (
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Exported with {phase.diagnostics.length} finding(s):{" "}
              {phase.diagnostics.join("; ")}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            data-export-cancel
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            data-export-confirm
            disabled={!canExport}
            onClick={() => void onExport()}
          >
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
