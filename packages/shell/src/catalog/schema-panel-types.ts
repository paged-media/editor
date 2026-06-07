// Local STRUCTURAL mirror of the plugin-api schema-panel contract
// (`@paged-media/plugin-api` `PanelSchema` / `BindingsSurface` / …).
//
// Why a mirror, not an import: `@paged-media/shell` is one layer below
// `apps/canvas` in the consumer chain and does NOT depend on
// `@paged-media/plugin-api` (only `apps/canvas` links it). The shell
// renders the schema; the bundle host (in apps/canvas) injects this
// renderer into `createBundleHost({ schemaPanelRenderer })`. The
// INJECTION POINT (apps/canvas `main.tsx`) asserts this renderer
// satisfies the real `SchemaPanelRenderer` type — so the structural
// mirror can't drift silently (a contract change fails the editor's
// typecheck at the seam, exactly the plugin-api-compat discipline).
//
// Keep these shapes byte-identical to plugin-api/src/panel-schema.ts +
// the `BindingsSurface` slice of host.ts.

import type { PropertyPath, Value } from "@paged-media/client";

export type WidgetValueBinding =
  | { kind: "literal"; value: Value }
  | {
      kind: "selectionProperty";
      scope?: "element" | "content";
      path: PropertyPath;
      coerce?: "pt" | "px" | "%";
    };

export interface BindingRef {
  bind: string;
  negate?: boolean;
}

export type SchemaGate = boolean | BindingRef;

export interface PanelSchemaRow {
  widget: string;
  props?: Record<string, unknown>;
  value?: WidgetValueBinding;
  visible?: SchemaGate;
  enabled?: SchemaGate;
}

export interface PanelSchemaSection {
  title?: string;
  collapsible?: boolean;
  rows: PanelSchemaRow[];
  visible?: SchemaGate;
}

export interface PanelSchema {
  id: string;
  title: string;
  icon?: string;
  defaultDock?: "left" | "right" | "top" | "bottom" | "center";
  defaultGroup?: string;
  sections: PanelSchemaSection[];
}

/** The publish-bindings door the renderer subscribes to (the
 *  `BindingsSurface` slice it uses). */
export interface BindingsSurface {
  publish(name: string, value: unknown): void;
  get(name: string): unknown;
  delete(name: string): void;
  onDidChange(listener: (name: string) => void): { dispose(): void };
}

export interface SchemaPanelRendererProps {
  schema: PanelSchema;
  bindings: BindingsSurface;
}
