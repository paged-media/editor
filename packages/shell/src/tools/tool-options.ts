// Concept 1 (toolbar) — tool-options contract.
//
// Several tools carry options surfaced on DOUBLE-CLICK of the rail
// slot (InDesign behaviour): Polygon (sides, star inset), Pencil/
// Smooth (fidelity), Eraser (width), Eyedropper (which attributes to
// pick up), Free-Transform constraints. These are TOOL-SCOPED app
// settings — NOT document mutations. They write a small per-tool
// settings store keyed by `toolId`, never `paged.mutate`.
//
// The popover that renders a spec + the `tool-settings` store land in
// Phase 3; this file pins the type so the registry can reference it.

/** One field in a tool's options popover. */
export type ToolOptionField =
  | {
      kind: "number";
      key: string;
      label: string;
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
    }
  | { kind: "toggle"; key: string; label: string }
  | {
      kind: "select";
      key: string;
      label: string;
      options: Array<{ value: string; label: string }>;
    };

/**
 * A tool's double-click options surface. Pure composition over
 * tool-scoped settings (app-state). `toolId` is the settings
 * namespace, usually the owning tool's id.
 */
export interface ToolOptionsSpec {
  toolId: string;
  fields: ToolOptionField[];
}

/** Concrete per-tool values, keyed by `field.key`. Persisted in the
 *  tool-settings store under the spec's `toolId`. */
export type ToolSettings = Record<string, number | boolean | string>;
