#!/usr/bin/env node
// Placing a pasteboard item next to a page (packages/shell/src/state/
// spread-pages.ts): the pure halves of the selection chrome on the
// pasteboard. The overlay and the gestures are covered by the Playwright
// spec `apps/canvas/tests/e2e/pasteboard-chrome.spec.ts`, which runs on
// the pinned engine; this covers the page summaries' `pageOrigin` /
// `spreadId` (engine 0.71.13) with a fixture page list, and the fallback
// an older worker takes.
//
// Run: `node --experimental-strip-types scripts/spread-pages.test.mjs`
// (root `test:spread-pages` npm script).

import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const S = await import(
  pathToFileURL(resolvePath(here, "..", "packages", "shell", "src", "state", "spread-pages.ts")).href
);

// Two spreads: a single right-hand page, then a facing pair. InDesign
// centres a spread's coordinates, so a right-hand page sits at
// (0, -h/2) and a left-hand one at (-w, -h/2).
const PAGES = [
  { selfId: "p1", index: 1, sizePt: [612, 792], spreadId: "s1", pageOrigin: [0, -396] },
  { selfId: "p2", index: 2, sizePt: [612, 792], spreadId: "s2", pageOrigin: [-612, -396] },
  { selfId: "p3", index: 3, sizePt: [612, 792], spreadId: "s2", pageOrigin: [0, -396] },
];
const SIZES = new Map(PAGES.map((p) => [p.selfId, p.sizePt]));
const sizeOf = (id) => SIZES.get(id) ?? null;

/** A pasteboard rectangle, spread space. */
const pasteboard = (spreadId, bounds, tx = 0, ty = 0) => ({
  id: { kind: "rectangle", id: "r" },
  pageId: null,
  spreadId,
  bounds,
  itemTransform: [1, 0, 0, 1, tx, ty],
});

/** A client that records what it is asked. */
function fakeClient({ pages, spreads = [], marquee = [], geometry = [] }) {
  const asked = [];
  return {
    asked,
    async collection(name) {
      asked.push(`collection:${name}`);
      return name === "pages" ? pages : name === "spreads" ? spreads : [];
    },
    async marqueeHits(pageId) {
      asked.push(`marquee:${pageId}`);
      return marquee;
    },
    async elementGeometry(ids) {
      asked.push(`geometry:${ids.length}`);
      return geometry;
    },
  };
}

test("the page summaries place every page of every spread", () => {
  const known = S.spreadPagesFromSummaries(PAGES);
  assert.deepEqual(known.get("s1"), [{ pageId: "p1", origin: [0, -396] }]);
  assert.deepEqual(known.get("s2"), [
    { pageId: "p2", origin: [-612, -396] },
    { pageId: "p3", origin: [0, -396] },
  ]);
});

test("page summaries without the fields place nothing", () => {
  const old = PAGES.map(({ spreadId, pageOrigin, ...rest }) => rest);
  assert.equal(S.spreadPagesFromSummaries(old).size, 0);
});

test("with the page summaries' origins, no marquee is asked for", async () => {
  const client = fakeClient({ pages: PAGES });
  const found = await S.probeSpreadPages(client, "s2");
  assert.deepEqual(client.asked, ["collection:pages"]);
  assert.deepEqual(found.get("s2")?.map((p) => p.pageId), ["p2", "p3"]);
});

test("a pasteboard item on a spread whose pages hold nothing is placed by the summaries", () => {
  const known = S.spreadPagesFromSummaries(PAGES);
  // Left of the facing pair's left page, spread space: x -700..-650.
  const [placed] = S.placeOnPages([pasteboard("s2", [0, -700, 50, -650])], known, sizeOf);
  assert.equal(placed.pageId, "p2", "the nearest page of its spread");
  // Spread → page space: minus the page's origin.
  assert.deepEqual(placed.itemTransform, [1, 0, 0, 1, 612, 396]);
  assert.deepEqual(placed.pageOrigin, [-612, -396]);
});

test("nearest page: below the right page of a pair", () => {
  const known = S.spreadPagesFromSummaries(PAGES);
  const [placed] = S.placeOnPages([pasteboard("s2", [0, 100, 50, 200], 0, 500)], known, sizeOf);
  assert.equal(placed.pageId, "p3");
  assert.deepEqual(placed.itemTransform, [1, 0, 0, 1, 0, 896]);
});

test("an item of a spread no page is known for stays pageless", () => {
  const item = pasteboard("s9", [0, 0, 10, 10]);
  const [kept] = S.placeOnPages([item], S.spreadPagesFromSummaries(PAGES), sizeOf);
  assert.equal(kept, item);
});

test("an older worker: the spread's page-owned items place it through a marquee", async () => {
  const old = PAGES.map(({ spreadId, pageOrigin, ...rest }) => rest);
  const client = fakeClient({
    pages: old,
    spreads: [
      { selfId: "s1", label: "1", pageCount: 1 },
      { selfId: "s2", label: "2–3", pageCount: 2 },
    ],
    marquee: [{ kind: "rectangle", id: "a" }],
    geometry: [
      {
        id: { kind: "rectangle", id: "a" },
        pageId: "p3",
        spreadId: "s2",
        bounds: [0, 0, 10, 10],
        itemTransform: null,
        pageOrigin: [0, -396],
      },
    ],
  });
  const found = await S.probeSpreadPages(client, "s2");
  assert.deepEqual(client.asked, [
    "collection:pages",
    "collection:spreads",
    "marquee:p2",
    "geometry:1",
  ]);
  assert.deepEqual(found.get("s2"), [{ pageId: "p3", origin: [0, -396] }]);
});

test("learned and found origins merge per page", () => {
  const learned = S.learnSpreadPages(S.NO_SPREAD_PAGES, [
    { id: { kind: "rectangle", id: "a" }, pageId: "p2", spreadId: "s2", bounds: [0, 0, 1, 1], pageOrigin: [-612, -396] },
  ]);
  const merged = S.mergeSpreadPages(learned, new Map([["s2", [{ pageId: "p3", origin: [0, -396] }]]]));
  assert.deepEqual(merged.get("s2")?.map((p) => p.pageId).sort(), ["p2", "p3"]);
  assert.equal(S.mergeSpreadPages(learned, new Map()), learned);
});
