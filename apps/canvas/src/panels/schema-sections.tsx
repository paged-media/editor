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

// ADR 323 — the shared body of every schema-driven options panel (style
// options, document setup, margins and columns, swatch / text variable /
// section / guide options): sections of `PropertyField`s over explicit
// object addresses.
//
//   · the LAYOUT (which path sits in which section, its label, which
//     document collection a ref picks from) is the panel's; the TYPE,
//     range, access and widget of every field come from the target's
//     schema row (`host.objects.schema(address)`), never from the path
//     name;
//   · each field writes through `host.objects`: one target = one `set`,
//     several targets (all pages, …) = ONE `batch` = one undo step;
//   · every field offers "Bind to data…" and the binding badge (the
//     shared `ObjectFieldFrame`);
//   · rows the schema names for the target that no section lays out are
//     still rendered, under "More", so a new catalog row is never
//     invisible. A style row counts only when its `appliesTo` names the
//     family (a seam that publishes no `appliesTo` adds nothing there).
//   · a path the engine's seam refuses renders disabled with the refusal
//     as its title — never a guessed write.

import { useEffect, useState } from "react";

import {
  CockpitSection,
  PropertyField,
  useObjectModel,
  type ShellPropertySchema,
} from "@paged-media/shell";
import type { CollectionName } from "@paged-media/client";

export interface FieldSpec {
  path: string;
  label: string;
  /** A ref / colour picked from a document collection. */
  collection?: CollectionName;
}

export interface SectionSpec {
  title: string;
  fields: readonly FieldSpec[];
}

/** The schema rows of an address (empty while loading or without a model). */
export function useSchemaRows(address: string | null): readonly ShellPropertySchema[] {
  const model = useObjectModel();
  const [rows, setRows] = useState<readonly ShellPropertySchema[]>([]);
  useEffect(() => {
    if (!model || !address) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void model.objects
      .schema(address)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [model, address]);
  return rows;
}

const LABEL_SKIP = new Set(["labels", "labels[key]"]);

/** Writable rows of the target no section lays out. */
export function unlaidRows(
  rows: readonly ShellPropertySchema[],
  sections: readonly SectionSpec[],
  family?: string,
): ShellPropertySchema[] {
  const laid = new Set(sections.flatMap((s) => s.fields.map((f) => f.path)));
  return rows.filter((r) => {
    if (laid.has(r.path) || LABEL_SKIP.has(r.path)) return false;
    if (r.access === "readOnly" || r.access === "derived") return false;
    if (family) return (r.appliesTo ?? []).includes(family);
    return true;
  });
}

function humanize(path: string): string {
  const s = path.replace(/([a-z])([A-Z])/g, "$1 $2");
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function SchemaSections({
  targets,
  schemaKind: kindProp,
  sections,
  family,
  testId,
}: {
  /** The addresses every field writes (one = `set`, several = one batch).
   *  Absent: the element selection (one batch over it). */
  targets?: readonly string[];
  /** The kind whose rows type the fields when `targets` is absent. */
  schemaKind?: string;
  sections: readonly SectionSpec[];
  /** Style family: filters the "More" rows by their `appliesTo`. */
  family?: string;
  testId?: string;
}) {
  const schemaKind = targets?.[0] ?? kindProp;
  const rows = useSchemaRows(schemaKind ?? null);
  const more = targets ? unlaidRows(rows, sections, family) : [];
  return (
    <div data-schema-sections={testId ?? ""} data-target={targets?.join(" ") ?? "selection"}>
      {sections.map((section) => (
        <CockpitSection key={section.title} title={section.title}>
          <div className="flex flex-col gap-1.5 pb-2" data-options-section={section.title}>
            {section.fields.map((f) => (
              <PropertyField
                key={f.path}
                path={f.path}
                label={f.label}
                targets={targets}
                schemaKind={schemaKind}
                style={f.collection ? "collection" : undefined}
                collection={f.collection}
              />
            ))}
          </div>
        </CockpitSection>
      ))}
      {more.length > 0 && (
        <CockpitSection title="More" defaultOpen={false}>
          <div className="flex flex-col gap-1.5 pb-2" data-options-section="More">
            {more.map((r) => (
              <PropertyField
                key={r.path}
                path={r.path}
                label={r.title ?? humanize(r.path)}
                targets={targets}
                schemaKind={schemaKind}
              />
            ))}
          </div>
        </CockpitSection>
      )}
    </div>
  );
}
