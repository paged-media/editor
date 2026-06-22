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
