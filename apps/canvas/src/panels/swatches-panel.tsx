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

// THE Swatches panel — ADR 023 phase C/D, the SECOND host-owned panel
// that retargets, and the one that tests the SCOPE axis.
//
// Concept 2 (unchanged, and deliberately not regressed): the composition
// chrome applies a swatch to the selection; the expert grid below manages
// the collection — chips through the active CMM, space/model/reserved
// badges + gamut flags, the EDIT popover (the shared ColorMixer on a
// lossless raw-channel seed), inline rename, group headers from
// `colorGroups` with per-row assign, delete, and the ~380 bundled
// libraries. All of that still works, over core, exactly as before.
//
// WHAT ADR 023 CHANGES HERE, and why colour is a DIFFERENT proof from
// Layers rather than a second copy of it:
//
//   · Layers is an element COLLECTION addressed by row identity. Its
//     per-row state IS core `PropertyPath`s (`layerName`, `layerVisible`,
//     `layerLocked`), so the panel's capability question is a PATH
//     question and `useCollectionPathOffered` answers it.
//   · Swatches is a DOCUMENT-SCOPED RESOURCE the panel edits directly.
//     It is neither element- nor range-scoped: there is no selection to
//     address, and `readCollection` deliberately takes no target. And
//     core models a swatch's whole MUTABLE surface as STRUCTURAL OPS
//     (`createSwatch` / `editSwatch` / `deleteSwatch`, each carrying a
//     complete `SwatchSpec`) — the `PropertyPath` union has no
//     `swatchName` and no swatch colour. So the capability question here
//     is an OP question, which is why this slice added
//     `useCollectionOpOffered` beside its path-shaped sibling.
//
// There is not one `if (pluginId === …)` in this file and there must
// never be. The only questions asked about providers are capability
// questions, and every one of them answers a boolean.
//
// ONE THING THE SEAM CANNOT CARRY, named rather than papered over: a
// swatch's COLOUR. `SwatchSummary` is `{selfId, name, kind}` — the row
// shape the vocabulary rule obliges a provider to use carries no
// channels — and the chip is resolved through a SEPARATE core RPC
// (`client.colorPreview(selfId)`) that the binding-provider contract has
// no lane for (`readProperty` needs a `PropertyPath`, and core models
// none for a swatch). So a provider row whose id names no document
// swatch gets an UNRESOLVED chip, marked as such
// (`data-swatch-preview="unresolved"`) instead of quietly grey. That is
// a contract-level gap, recorded in the report for this slice, not a
// panel bug.

import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  importAseBytes,
  useActiveBindingProviders,
  useCanvasClient,
  useCollectionOpOffered,
  useProvidedCollection,
  useProviderFirstMutate,
} from "@paged-media/shell";

import type {
  ColorGroupSummary,
  Mutation,
  SwatchSummary,
} from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";
import { swatchesComposition } from "./swatches.composition";
import { SwatchRow } from "./swatch-row";
import { BUNDLED_LIBRARIES } from "../assets/libraries";

export const SWATCHES_PANEL_ID = "paged.swatches";

function SwatchCollection() {
  // The ONE declaration the ADR turns on, twice: two CORE collection
  // names and nothing else. The active plugin edit context may answer
  // either instead of the engine, and this panel never learns which.
  const { rows: swatchRows, provider } =
    useProvidedCollection<SwatchSummary>("swatches");
  const { rows: groupRows } =
    useProvidedCollection<ColorGroupSummary>("colorGroups");
  const swatches = useMemo(() => swatchRows ?? [], [swatchRows]);
  const groups = useMemo(() => groupRows ?? [], [groupRows]);

  const mutate = useProviderFirstMutate();
  const active = useActiveBindingProviders();

  // ------------------------------------------------------- capability
  //
  // Phase A §18.10: "phase C must actually READ `activeProviders()` and
  // disable rather than assume". Over core (no active owner) every gate
  // answers true and the panel is exactly what it was. Over a provider
  // that serves the swatch list but declares only `editSwatch`, "+ New",
  // Libraries and the per-row ✕ disable — because sending them anyway
  // would apply them to the DOCUMENT's swatch list while the panel is
  // showing somebody else's. That is the write-side form of the `absent`
  // lie the contract forbids.
  const canCreate = useCollectionOpOffered("swatches", "createSwatch");
  const canEdit = useCollectionOpOffered("swatches", "editSwatch");
  const canDelete = useCollectionOpOffered("swatches", "deleteSwatch");
  const canImportLibrary = useCollectionOpOffered(
    "swatches",
    "importSwatchLibrary",
  );
  // Group-assign asks the owner of the SWATCHES rows, not of
  // `colorGroups`, and the distinction is load-bearing rather than
  // pedantic: a `ColorGroup`'s members are SWATCH IDS, so the question
  // is "may these rows be put in a group?" — and the authority on these
  // rows is whoever served them. Asking the group collection instead
  // would answer `true` (core owns the groups) and let the panel write a
  // group whose member id names a swatch the document does not carry.
  const canAssignGroup = useCollectionOpOffered("swatches", "editColorGroup");

  // Every write goes provider-first: offer CORE'S OWN OP to the active
  // providers, send it to the engine only if nobody claimed it. The
  // panel speaks one vocabulary; translating it into a plugin's own
  // realm is that plugin's business.
  const run = useCallback(
    async (mutation: Mutation, what: string) => {
      const out = await mutate(mutation);
      if (!out.applied) {
        // A claimed-but-refused write names its owner; an unclaimed one
        // the engine rejected does not. Reporting both is the point — a
        // silent no-op is the class of lie the platform refuses.
        console.warn(
          `paged.swatches: ${what} refused by ${out.provider ?? "the engine"}`,
          out.error,
        );
      }
    },
    [mutate],
  );

  const onAdd = () => {
    void run(
      {
        op: "createSwatch",
        args: {
          spec: {
            name: "New swatch",
            space: "CMYK",
            value: [0, 0, 0, 100],
            model: "Process",
          },
        },
      } as Mutation,
      "createSwatch",
    );
  };

  // Group-assign: move the swatch ref between ColorGroups via
  // editColorGroup (remove from its current group, add to target).
  const assignGroup = (swatchId: string, groupId: string | null) => {
    const current = groups.find((g) => g.members.includes(swatchId));
    const ops: Promise<unknown>[] = [];
    if (current && current.selfId !== groupId) {
      ops.push(
        run(
          {
            op: "editColorGroup",
            args: {
              groupId: current.selfId,
              spec: {
                selfId: current.selfId,
                name: current.name,
                members: current.members.filter((m) => m !== swatchId),
              },
            },
          } as Mutation,
          "editColorGroup",
        ),
      );
    }
    if (groupId && current?.selfId !== groupId) {
      const target = groups.find((g) => g.selfId === groupId);
      if (target) {
        ops.push(
          run(
            {
              op: "editColorGroup",
              args: {
                groupId,
                spec: {
                  selfId: groupId,
                  name: target.name,
                  members: [...target.members, swatchId],
                },
              },
            } as Mutation,
            "editColorGroup",
          ),
        );
      }
    }
    void Promise.all(ops).catch(() => {});
  };

  const groupOf = (swatchId: string): string | null =>
    groups.find((g) => g.members.includes(swatchId))?.selfId ?? null;

  // Render: each group as a header + its member rows, then the
  // ungrouped remainder.
  const grouped = new Set(groups.flatMap((g) => g.members));
  const ungrouped = swatches.filter((s) => !grouped.has(s.selfId));

  const renderRows = (list: SwatchSummary[]) => (
    <ul>
      {list.map((sw) => (
        <SwatchRow
          key={sw.selfId}
          swatch={sw}
          groups={groups}
          groupOf={groupOf(sw.selfId)}
          onAssignGroup={assignGroup}
          onMutate={run}
          canEdit={canEdit}
          canDelete={canDelete}
          canAssignGroup={canAssignGroup}
        />
      ))}
    </ul>
  );

  // "Provided by" — the ADR's own affordance, and DISPLAY ONLY: the user
  // is told which content type they are looking at, and no code reads it.
  const ownerNote = useMemo(() => {
    if (!provider) return null;
    const owner = active.find((p) => p.plugin === provider);
    return owner ? `${provider} · ${owner.contextType}` : provider;
  }, [provider, active]);

  return (
    <div
      className="text-sm border-t border-input mt-2 pt-2"
      data-swatch-collection="ready"
      data-swatches-provider={provider ?? "core"}
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <span
          className="text-xs uppercase tracking-wide text-muted-foreground"
          data-swatches-source
        >
          {ownerNote ?? "Swatches"}
        </span>
        <div className="flex items-center gap-1">
          <LibrariesMenu enabled={canImportLibrary} />
          <button
            type="button"
            className="px-2 py-0.5 rounded hover:bg-muted/60 disabled:opacity-40"
            data-action="add-swatch"
            disabled={!canCreate}
            title={
              canCreate
                ? "New swatch"
                : "The active content type does not own new document swatches"
            }
            onClick={onAdd}
          >
            + New
          </button>
        </div>
      </div>
      {swatches.length === 0 ? (
        <div
          className="px-1 text-xs text-muted-foreground"
          data-swatches="empty"
        >
          No swatches.
        </div>
      ) : (
        <>
          {groups.map((g) => {
            const members = swatches.filter((s) =>
              g.members.includes(s.selfId),
            );
            if (members.length === 0) return null;
            return (
              <div key={g.selfId} data-swatch-group={g.selfId}>
                <div className="px-2 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  ▾ {g.name}
                </div>
                {renderRows(members)}
              </div>
            );
          })}
          {renderRows(ungrouped)}
        </>
      )}
    </div>
  );
}

// Concept 2 — bundled open libraries (the freieFarbe HLC atlas +
// the 376-library OCSC). Each loads its UNMODIFIED original .ase on
// demand and imports as ONE undoable operation; the attribution is
// visible right in the menu (CC BY-ND: ship the original, attribute,
// never re-bake). Portal + fixed position — the dockview panel clips
// overflow.
//
// `importSwatchLibrary` is a DOCUMENT-resource write like `createSwatch`,
// so it is gated by the same capability question: pouring 300 swatches
// into the document while the panel is showing a plugin's palette would
// be the same lie, just louder.
function LibrariesMenu({ enabled }: { enabled: boolean }) {
  const client = useCanvasClient();
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const open = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    setAt(
      rect
        ? { left: rect.left, top: rect.bottom + 4 }
        : { left: 100, top: 100 },
    );
  };

  const load = (id: string) => {
    const lib = BUNDLED_LIBRARIES.find((l) => l.id === id);
    if (!lib) return;
    setBusy(id);
    void lib
      .url()
      .then((url) => fetch(url))
      .then((r) => r.arrayBuffer())
      .then((buf) => importAseBytes(client, new Uint8Array(buf), lib.title))
      .finally(() => {
        setBusy(null);
        setAt(null);
      });
  };

  const list = BUNDLED_LIBRARIES.filter((l) =>
    l.title.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="px-2 py-0.5 rounded hover:bg-muted/60 text-xs disabled:opacity-40"
        data-action="open-libraries"
        disabled={!enabled}
        title={
          enabled
            ? "Bundled swatch libraries"
            : "The active content type does not own the document swatch library"
        }
        onClick={open}
      >
        Libraries ▾
      </button>
      {at &&
        createPortal(
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 60 }}
              onClick={() => setAt(null)}
              aria-hidden
            />
            <div
              data-libraries-menu
              style={{
                position: "fixed",
                left: at.left,
                top: at.top,
                zIndex: 61,
                width: 280,
                maxHeight: 360,
                overflowY: "auto",
                background: "var(--elevated)",
                border: "1px solid var(--chrome-divider)",
                borderRadius: 6,
                boxShadow: "var(--shadow-pop)",
                padding: 8,
                fontSize: 12,
              }}
            >
              <input
                autoFocus
                placeholder="Filter libraries…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full border border-input rounded px-1.5 py-0.5 mb-1 text-xs"
                data-libraries-filter
              />
              {list.slice(0, 50).map((lib) => (
                <button
                  key={lib.id}
                  type="button"
                  data-library-id={lib.id}
                  disabled={busy !== null}
                  onClick={() => load(lib.id)}
                  className="block w-full text-left px-1.5 py-1 rounded hover:bg-muted/60 truncate"
                  title={lib.attribution}
                >
                  {busy === lib.id ? "Loading… " : ""}
                  {lib.title}
                </button>
              ))}
              {list.length > 50 && (
                <div className="px-1.5 py-1 text-muted-foreground">
                  …{list.length - 50} more — refine the filter.
                </div>
              )}
              <div
                className="border-t border-input mt-1 pt-1 text-[10px] text-muted-foreground"
                data-hlc-attribution
              >
                HLC Colour Atlas &amp; OCSC © freieFarbe e.V., CC BY-ND 4.0 —
                originals shipped unmodified, see NOTICE.
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

export function SwatchesPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-swatches-panel="ready">
        <CompositionRenderer composition={swatchesComposition} />
        <SwatchCollection />
      </div>
    </CatalogRegistryProvider>
  );
}
