// SchemaPanelRenderer — the host's renderer for a plugin's DECLARATIVE
// panel (plugin-sdk W3.1, closes plugin-draw B-01).
//
// A bundle registers a `SchemaPanelContribution` through
// `host.contribute.schemaPanel` (NO React crosses the boundary — the
// isolate-ready panel form). The SDK host adapter synthesizes a
// `PanelContribution` whose component delegates to THIS renderer,
// injected via `createBundleHost({ schemaPanelRenderer })` (the same
// host-injection shape as `widgets` / `shell`). The renderer:
//
//   · maps every schema ROW onto a catalog `CompositionNode` — the
//     widget id IS the catalog id, the static props pass through, and
//     the `value` binding maps 1:1 onto the catalog `Binding` (the
//     §11.5 ceiling: literal | selectionProperty + coerce, UNCHANGED);
//   · drives `CompositionRenderer` (the existing catalog walk) so the
//     rows render from the SAME primitive leaves the editor's own
//     panels use — pixel-identical, no rival widget set;
//   · gates each row / section on the schema's `visible` / `enabled`
//     by LOOKING UP the bundle's PUBLISHED bindings (`host.bindings`) —
//     a host-side lookup, NOT an expression language (B-01). The
//     renderer subscribes to `bindings.onDidChange`, so a row's
//     visibility / enablement flips the instant the plugin publishes a
//     new value (e.g. its tool/selection state machine sets
//     `hasSelection`).
//
// `enabled: false` renders the row inside a `data-schema-disabled`
// wrapper that neutralises pointer + opacity — the catalog leaves'
// own no-write-path disable still applies on top (so a row with no
// selection stays disabled regardless).

import { useEffect, useReducer } from "react";

import type { Binding, CompositionNode } from "@paged-media/catalog";

import { CompositionRenderer } from "./render";
import { resolveGate } from "./schema-gate";
import type {
  BindingsSurface,
  PanelSchema,
  PanelSchemaRow,
  PanelSchemaSection,
  SchemaGate,
  WidgetValueBinding,
} from "./schema-panel-types";

/** Map a schema `WidgetValueBinding` onto a catalog `Binding`. The
 *  shapes are structurally identical (panel-schema.ts mirrors the
 *  catalog ceiling); this is the 1:1 bridge. */
function toCatalogBinding(b: WidgetValueBinding): Binding {
  if (b.kind === "literal") return { kind: "literal", value: b.value };
  return { kind: "selectionProperty", scope: b.scope, path: b.path, coerce: b.coerce };
}

/** A schema row → a catalog `CompositionNode`. The widget id is the
 *  catalog id; the value binding (if any) is the node's primary
 *  `"value"` binding. */
function rowToNode(row: PanelSchemaRow): CompositionNode {
  return {
    catalogId: row.widget,
    props: { ...(row.props ?? {}) },
    bindings: row.value ? { value: toCatalogBinding(row.value) } : {},
  };
}

/** Subscribe to the bundle's published bindings; re-render on any
 *  change so the gates stay live. */
function useBindingsTick(bindings: BindingsSurface): void {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const d = bindings.onDidChange(() => tick());
    return () => d.dispose();
  }, [bindings]);
}

function gate(g: SchemaGate | undefined, bindings: BindingsSurface): boolean {
  return resolveGate(g, (name) => bindings.get(name));
}

function SchemaRow({
  row,
  bindings,
}: {
  row: PanelSchemaRow;
  bindings: BindingsSurface;
}) {
  if (!gate(row.visible, bindings)) return null;
  const enabled = gate(row.enabled, bindings);
  const node = rowToNode(row);
  const rendered = <CompositionRenderer composition={node} />;
  if (enabled) return rendered;
  // Disabled gate — neutralise pointer + dim. The leaf's own
  // no-write-path disable still applies underneath.
  return (
    <div
      data-schema-disabled="true"
      style={{ opacity: 0.5, pointerEvents: "none" }}
    >
      {rendered}
    </div>
  );
}

function SchemaSection({
  section,
  bindings,
}: {
  section: PanelSchemaSection;
  bindings: BindingsSurface;
}) {
  if (!gate(section.visible, bindings)) return null;
  // Each row is gated INDIVIDUALLY (its own visible/enabled), so we
  // render rows directly rather than handing them to the catalog
  // section leaf's own walk — but we wrap them in the same section
  // chrome the catalog leaf uses (kicker title above a hairline) so a
  // schema section reads identical to a native one.
  const rows = section.rows.map((row, i) => (
    <SchemaRow key={`${row.widget}-${i}`} row={row} bindings={bindings} />
  ));
  if (section.title === undefined) {
    return (
      <div className="flex flex-col gap-[9px]" data-schema-section="">
        {rows}
      </div>
    );
  }
  return (
    <div
      className="-mx-3 border-t border-input px-3 pt-2"
      data-schema-section={section.title}
    >
      <div className="pg-label mb-2">{section.title}</div>
      <div className="flex flex-col gap-[9px]">{rows}</div>
    </div>
  );
}

/**
 * Render a plugin's declarative schema panel. Injected into
 * `createBundleHost({ schemaPanelRenderer })` so a schema panel
 * registered via `host.contribute.schemaPanel` renders from the
 * catalog with its visibility/enablement driven by the bundle's
 * published bindings.
 */
export function SchemaPanelRenderer({
  schema,
  bindings,
}: {
  schema: PanelSchema;
  bindings: BindingsSurface;
}) {
  useBindingsTick(bindings);
  return (
    <div
      className="flex flex-col gap-[9px] p-3"
      data-schema-panel={schema.id}
    >
      {schema.sections.map((section, i) => (
        <SchemaSection
          key={`section-${i}`}
          section={section}
          bindings={bindings}
        />
      ))}
    </div>
  );
}
