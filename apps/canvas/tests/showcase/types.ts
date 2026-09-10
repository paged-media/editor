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

// The contract every showcase page module implements.
//
// One module per spread, each authoring its own pages and reporting
// what it exercised. The report is not decoration: `showcase.spec.ts`
// turns it into `showcase.coverage.json`, which is checked against
// `state/registry/features/*.yaml` — so a page that claims a registry
// row it did not touch fails the build, and a row that does not exist
// fails it too.

import type { Page } from "@playwright/test";

import type { ShowcaseDoc } from "./driver";

export interface PageContext {
  /** The Playwright page — for the rare module that needs raw access. */
  readonly page: Page;
  /** The authoring driver. Prefer this over `page` wherever it reaches. */
  readonly doc: ShowcaseDoc;
  /** Zero-based indices of the pages this module owns. */
  readonly pageIndexes: number[];
  /** Engine page ids for `pageIndexes`, in the same order. */
  readonly pageIds: string[];
}

export interface PageReport {
  /** Human title, used in the colophon and the console log. */
  readonly title: string;
  /**
   * Registry rows this spread demonstrates, as `family.row` ids exactly
   * as they appear in `state/registry/features/<family>.yaml`. Claim
   * only what the page VISIBLY exercises — the coverage gate resolves
   * every id and fails on one that does not exist.
   */
  readonly covers: string[];
  /**
   * Element ids the page created, so the spec can assert each moved
   * pixels. A module that returns none is asserting nothing.
   */
  readonly elements: string[];
  /**
   * Anything that did not work on this run and why — a missing GPU
   * adapter, an engine wasm that could not load. Non-empty notes are
   * printed and land in the colophon; they never fail the build on
   * their own, because the honest record of a degraded lane is worth
   * more than a red that says only "skipped".
   */
  readonly notes?: string[];
}

export type PageBuilder = (ctx: PageContext) => Promise<PageReport>;

/** One entry in the showcase's page plan. */
export interface SpreadSpec {
  /** Zero-based page indexes this module owns. */
  readonly pages: number[];
  /** Module id, used for logging and the artifact names. */
  readonly id: string;
  readonly build: PageBuilder;
  /**
   * True when the module needs a live WebGPU adapter (paged.image's
   * kernels are GPU-only WGSL). On a CPU lane the spec still runs the
   * module but downgrades its pixel assertion to a note.
   */
  readonly needsGpu?: boolean;
  /**
   * True when the module's doors leave no mark on a finished page BY
   * DESIGN — a bench that works on a scratch page and removes it, or
   * writes properties whose whole meaning is invisibility (nonprinting,
   * hidden, locked). The runner's cross-module pixel gate cannot judge
   * such a module, so the module carries its own oracle instead: it
   * renders its scratch page under each door and asserts the document
   * returns to its page count with nothing stray left behind. Weaker
   * gates are a smell; this one is applied where the work happens.
   */
  readonly selfGated?: boolean;
  /**
   * True when the module must author one mutation at a time.
   *
   * The runner batches a module's ops into one mutation by default —
   * the engine rebuilds the whole document per mutation, so on a book
   * this size that is the difference between a chapter in minutes and
   * a chapter in hours. Deferred mode holds the invariant that no READ
   * sees a document missing the module's queued writes (every read
   * flushes, `page.evaluate` included), but a module that drives the
   * EDITOR'S UI — clicking a panel, dragging on canvas — acts on what
   * the app is showing, which a queued write has not reached. Those
   * modules opt out here.
   */
  readonly unbatched?: boolean;
}
