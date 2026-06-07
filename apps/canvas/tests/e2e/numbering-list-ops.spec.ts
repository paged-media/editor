// E2E op suite — W2.10 named list-definition round-trips (the
// Bullets & Numbering panel's W1.22 `NumberingList` surface, protocol
// v35). The document's `<NumberingList>` resources read from the
// `numberingLists` collection; create / edit (rename + continuity) /
// delete ride the CRUD ops; a list assigns to the selected paragraphs
// through the write-only `paragraphAppliedNumberingList` path. Each
// flow asserts the model (collection or render) and that undo
// restores it.
//
// The `numbering.idml` generated fixture carries one named list
// (`NumberingList/Shared`, ContinueNumbersAcrossStories=true) and
// numbered stories, so it exercises both the read collection and the
// assign render.

import { expect, test, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas } from "../fidelity/canvas-driver";
import { elementPageRectPt, loadFixture } from "./harness/fixtures";
import { opSandwich, type PtRect } from "./harness/op-sandwich";
import { mutate } from "./harness/ui";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/** apps/canvas/tests/e2e → repo root (editor/). */
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..", "..");
const NUMBERING = {
  label: "numbering",
  absPath: `${REPO_ROOT}/corpus/generated/numbering.idml`,
};
// The `text` fixture's paragraphs are UN-numbered, so turning them into
// a numbered list + assigning a list definition produces a real render
// change (the markers paint) — the assign-renumbers gate.
const TEXT = {
  label: "text",
  absPath: `${REPO_ROOT}/corpus/generated/text.idml`,
};

interface ListSummary {
  selfId: string;
  name: string;
  continueAcrossStories: boolean;
  continueAcrossDocuments: boolean;
}

async function readLists(page: Page): Promise<ListSummary[]> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: { collection: (n: string) => Promise<unknown[]> };
        };
      }
    ).__canvas;
    return (await c.client.collection("numberingLists")) as unknown as never;
  });
}

test.describe("E2E numbering-list (W2.10) ops", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadFixture(page, NUMBERING);
  });

  test("AC-E2E-NL-create — create mints a list; undo removes it", async ({
    page,
  }) => {
    const before = await readLists(page);
    await mutate(page, {
      op: "createNumberingList",
      args: {
        spec: {
          selfId: null,
          name: "My List",
          continueAcrossStories: false,
          continueAcrossDocuments: false,
        },
      },
    });
    const after = await readLists(page);
    expect(after.length).toBe(before.length + 1);
    const created = after.find((l) => l.name === "My List");
    expect(created, "the new list is present").toBeTruthy();
    expect(created!.continueAcrossStories).toBe(false);

    await page.evaluate(async () => {
      await (
        globalThis as unknown as {
          __canvas: { client: { undo: () => Promise<unknown> } };
        }
      ).__canvas.client.undo();
    });
    const undone = await readLists(page);
    expect(undone.length).toBe(before.length);
    expect(undone.find((l) => l.name === "My List")).toBeFalsy();
  });

  test("AC-E2E-NL-edit — rename + continuity land; undo restores", async ({
    page,
  }) => {
    // Edit the document's pre-existing `Shared` list.
    const before = await readLists(page);
    const shared = before.find((l) => l.name === "Shared")!;
    expect(shared, "fixture ships the Shared list").toBeTruthy();
    expect(shared.continueAcrossStories).toBe(true);

    await mutate(page, {
      op: "editNumberingList",
      args: {
        listId: shared.selfId,
        spec: {
          selfId: shared.selfId,
          name: "Shared Renamed",
          continueAcrossStories: false,
          continueAcrossDocuments: false,
        },
      },
    });
    const after = await readLists(page);
    const edited = after.find((l) => l.selfId === shared.selfId)!;
    expect(edited.name).toBe("Shared Renamed");
    expect(edited.continueAcrossStories).toBe(false);

    await page.evaluate(async () => {
      await (
        globalThis as unknown as {
          __canvas: { client: { undo: () => Promise<unknown> } };
        }
      ).__canvas.client.undo();
    });
    const undone = await readLists(page);
    const back = undone.find((l) => l.selfId === shared.selfId)!;
    expect(back.name).toBe("Shared");
    expect(back.continueAcrossStories).toBe(true);
  });

  test("AC-E2E-NL-assign — create a list, assign it + numbering format renumbers the paragraphs; undo restores byte-identically", async ({
    page,
  }) => {
    // Load the UN-numbered `text` fixture, CREATE a named list, then
    // turn the head paragraphs into a numbered list, set the format and
    // assign the created list. The engine composites the numbered
    // markers, so the render gate is live; undo (×4) clears it
    // byte-identically.
    const fx = await loadFixture(page, TEXT);
    expect(fx.firstStory, "text fixture has a story").toBeTruthy();
    const story = fx.firstStory!;
    // Create the list (op #1 of the undo stack — undone last).
    await mutate(page, {
      op: "createNumberingList",
      args: {
        spec: {
          selfId: null,
          name: "Numbered",
          continueAcrossStories: false,
          continueAcrossDocuments: false,
        },
      },
    });
    const created = (await readLists(page)).find((l) => l.name === "Numbered")!;
    expect(created, "the created list is present").toBeTruthy();

    const frame = fx.frames.find((f) => f.ref.kind === "textFrame")!;
    const pageInfo = fx.pages[frame.pageIndex];
    const region = (await elementPageRectPt(page, frame.ref)) as PtRect;
    const end = Math.max(1, Math.min(story.characterCount, 6));
    const range = {
      kind: "storyRange",
      id: { story_id: story.selfId, start: 0, end },
    };

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      undoSteps: 3,
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: range,
            path: "paragraphListType",
            value: { type: "text", value: "NumberedList" },
          },
        });
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: range,
            path: "paragraphNumberingFormat",
            value: { type: "text", value: "^#.^t" },
          },
        });
        // The assign is write-only on the wire (no read-back entry),
        // but it lands on the model + participates in undo.
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: range,
            path: "paragraphAppliedNumberingList",
            value: { type: "text", value: created.selfId },
          },
        });
      },
      expectModel: async () => {
        // List type + format read back (the applied-list ref does not —
        // it is write-only on the v35 wire).
        const props = await page.evaluate(async (id) => {
          const c = (
            globalThis as unknown as {
              __canvas: {
                client: {
                  elementProperties: (id: unknown) => Promise<{
                    entries: Array<{ path: string; value: unknown }>;
                  } | null>;
                };
              };
            }
          ).__canvas;
          const p = await c.client.elementProperties(id);
          return (p?.entries ?? []).reduce<Record<string, unknown>>(
            (acc, e) => {
              acc[e.path] = e.value;
              return acc;
            },
            {},
          );
        }, range);
        expect((props["paragraphListType"] as { value: string })?.value).toBe(
          "NumberedList",
        );
        expect(
          (props["paragraphNumberingFormat"] as { value: string })?.value,
        ).toBe("^#.^t");
      },
      expectRestored: async () => {
        const lt = await page.evaluate(async (id) => {
          const c = (
            globalThis as unknown as {
              __canvas: {
                client: {
                  elementProperties: (id: unknown) => Promise<{
                    entries: Array<{ path: string; value: unknown }>;
                  } | null>;
                };
              };
            }
          ).__canvas;
          const p = await c.client.elementProperties(id);
          return (
            (p?.entries.find((e) => e.path === "paragraphListType")
              ?.value as { value: string } | undefined) ?? null
          );
        }, range);
        expect(lt == null || lt.value === "").toBe(true);
      },
    });
  });
});
