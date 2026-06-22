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

// K-2 / S-06 — the document importer + exporter registries (closes
// plugin-sheets S-06 ↔ plugin-image I-05; the platform RFI Wave 3 IO).
//
// An IMPORTER claims file extensions / MIME types; the open + drag-drop
// flow consults this registry by extension and routes a matching file's
// bytes to the importer's `import()` INSTEAD of the default IDML loader —
// the plugin owns what the file becomes (load into its own engine, lower
// a range, …; it does not replace the document unless it chooses to). An
// EXPORTER produces bytes on demand; the export panel lists the
// registered exporters and pulls on save.
//
// These contribution shapes mirror @paged-media/plugin-api's
// ImporterContribution / ExporterContribution 1:1, so a bundle's
// contract-typed registration is assignable here (asserted through the
// editor's plugin-api-compat.ts dev link).

import type { Disposable } from "./types";

/** A file handed to an importer — bytes already read at the host
 *  boundary (the contract never leaks a DOM `File`). */
export interface ImportRequest {
  name: string;
  bytes: Uint8Array;
  mimeType: string;
}

export interface ImporterContribution {
  id: string;
  title: string;
  /** Extensions handled, leading dot, lowercased (`[".xlsx"]`). */
  extensions: readonly string[];
  mimeTypes?: readonly string[];
  import(file: ImportRequest): void | Promise<void>;
}

export interface ExportResult {
  bytes: Uint8Array;
  fileName: string;
}

export interface ExporterContribution {
  id: string;
  title: string;
  /** The extension the produced file carries, leading dot (`".xlsx"`). */
  extension: string;
  mimeType?: string;
  export(): Promise<ExportResult | null> | ExportResult | null;
}

export type ImporterRegistryEvent =
  | { kind: "registered"; contribution: ImporterContribution }
  | { kind: "unregistered"; id: string };
export type ExporterRegistryEvent =
  | { kind: "registered"; contribution: ExporterContribution }
  | { kind: "unregistered"; id: string };

export interface ImporterRegistry {
  register(contribution: ImporterContribution): Disposable;
  unregister(id: string): void;
  list(): ImporterContribution[];
  /** First importer whose extensions (then MIME types) match the given
   *  file. null = none → the caller falls back to the default IDML load. */
  resolve(fileName: string, mimeType?: string): ImporterContribution | null;
  /** The union of all registered extensions, for a file-picker `accept`. */
  acceptExtensions(): string[];
  onChange(handler: (event: ImporterRegistryEvent) => void): Disposable;
}

export interface ExporterRegistry {
  register(contribution: ExporterContribution): Disposable;
  unregister(id: string): void;
  list(): ExporterContribution[];
  onChange(handler: (event: ExporterRegistryEvent) => void): Disposable;
}

/** Lowercased extension incl. the leading dot (`"BUDGET.XLSX"` → `".xlsx"`),
 *  or `""` when the name has none. */
export function fileExtension(name: string): string {
  const slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  const base = slash >= 0 ? name.slice(slash + 1) : name;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}

/** Default in-memory `ImporterRegistry` — keyed by `id`. A duplicate id is
 *  rejected loudly (a bug). Two importers may claim the SAME extension;
 *  `resolve` returns the first registered (multi-plugin contention policy
 *  ships at P7, like edit contexts). */
export function createImporterRegistry(): ImporterRegistry {
  const byId = new Map<string, ImporterContribution>();
  const listeners = new Set<(e: ImporterRegistryEvent) => void>();
  const emit = (e: ImporterRegistryEvent) => {
    for (const fn of listeners) fn(e);
  };
  return {
    register(contribution) {
      if (byId.has(contribution.id)) {
        throw new Error(
          `ImporterRegistry: id "${contribution.id}" already registered`,
        );
      }
      byId.set(contribution.id, contribution);
      emit({ kind: "registered", contribution });
      return {
        dispose() {
          if (byId.delete(contribution.id)) {
            emit({ kind: "unregistered", id: contribution.id });
          }
        },
      };
    },
    unregister(id) {
      if (byId.delete(id)) emit({ kind: "unregistered", id });
    },
    list: () => Array.from(byId.values()),
    resolve(fileName, mimeType) {
      const ext = fileExtension(fileName);
      if (ext) {
        for (const imp of byId.values()) {
          if (imp.extensions.some((e) => e.toLowerCase() === ext)) return imp;
        }
      }
      if (mimeType) {
        for (const imp of byId.values()) {
          if (imp.mimeTypes?.includes(mimeType)) return imp;
        }
      }
      return null;
    },
    acceptExtensions() {
      const set = new Set<string>();
      for (const imp of byId.values()) {
        for (const e of imp.extensions) set.add(e.toLowerCase());
      }
      return Array.from(set);
    },
    onChange(handler) {
      listeners.add(handler);
      return { dispose: () => void listeners.delete(handler) };
    },
  };
}

/** Default in-memory `ExporterRegistry` — keyed by `id`. */
export function createExporterRegistry(): ExporterRegistry {
  const byId = new Map<string, ExporterContribution>();
  const listeners = new Set<(e: ExporterRegistryEvent) => void>();
  const emit = (e: ExporterRegistryEvent) => {
    for (const fn of listeners) fn(e);
  };
  return {
    register(contribution) {
      if (byId.has(contribution.id)) {
        throw new Error(
          `ExporterRegistry: id "${contribution.id}" already registered`,
        );
      }
      byId.set(contribution.id, contribution);
      emit({ kind: "registered", contribution });
      return {
        dispose() {
          if (byId.delete(contribution.id)) {
            emit({ kind: "unregistered", id: contribution.id });
          }
        },
      };
    },
    unregister(id) {
      if (byId.delete(id)) emit({ kind: "unregistered", id });
    },
    list: () => Array.from(byId.values()),
    onChange(handler) {
      listeners.add(handler);
      return { dispose: () => void listeners.delete(handler) };
    },
  };
}
