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

// ADR 323 §4 — the core UI closure, on the real engine. The core ops that
// had no panel, tool or command get one through the TYPED CORE COMMANDS
// (`host.objects.invoke("core.<op>")`) and a form generated from the
// command's args schema; the core properties that had no schema-driven
// field get one. Each family: the UI write lands (read back through
// `__canvas.objects`, the one shared registry), it is ONE undo step, and
// the property fields offer "Bind to data…".
//
//   CUI-1  Run command… (any typed core command) + every menu door;
//   CUI-2  Insert ▸ Field / Hyperlink, Text Fields panel (field value,
//          setFieldValue);
//   CUI-3  Path section (step and repeat, close path …);
//   CUI-4  Pages list move page, Masters create / rename / delete;
//   CUI-5  Text variables, gradients, cell / table styles create / delete;
//   CUI-6  Conditions eye (setConditionVisible), Conditional text,
//          Condition Options;
//   CUI-7  Color group / numbering list / master options panels;
//   CUI-8  Text Frame Options page growth (story flowGrow);
//   CUI-9  Group transform; paragraph rules through host.objects;
//   CUI-10 Table panel indexed row height / column width, delete table;
//   CUI-11 Attributes ▸ Labels (labels[key], x-paged only).

import { expect, test, type Locator, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadIdml, openCanvas, openPanel } from "./fidelity/canvas-driver";
import { loadViaReactPath, screenPoint } from "./e2e/harness/viewport";
import { bindToData, fieldOf, objGet, objQuery, undoOnce } from "./e2e/harness/objects";
import { selectElements, setCaret } from "./e2e/harness/ui";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = pathResolve(__dirname, "..", "..", "..");
const fixture = (name: string) => `${ROOT}/corpus/idml/generated/${name}.idml`;

interface CanvasCommands {
  __canvas: {
    registries: {
      commands: { invoke(id: string, payload?: unknown): Promise<unknown> };
      menus: { list(): { path: string; command: string }[] };
    };
    debugContext(): { commands: string[] };
    objects: {
      invoke(command: string, args: unknown): Promise<unknown>;
      commands(): Promise<{ id: string; owner: string }[]>;
    };
  };
}

async function runCommand(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (cmd) => (globalThis as unknown as CanvasCommands).__canvas.registries.commands.invoke(cmd),
    id,
  );
}

/** The generated form, once its schema has loaded. */
async function dialogFor(page: Page, op: string): Promise<Locator> {
  const d = page.locator(`[data-core-command-dialog="${op}"][data-ready="true"]`);
  await expect(d).toBeVisible();
  return d;
}

async function fillArg(dialog: Locator, name: string, value: string): Promise<void> {
  const arg = dialog.locator(`[data-core-command-arg="${name}"]`);
  const tag = await arg.evaluate((el) => el.tagName);
  if (tag === "SELECT") await arg.selectOption(value);
  else await arg.fill(value);
}

async function runDialog(page: Page, dialog: Locator): Promise<void> {
  await dialog.locator("[data-core-command-run]").click();
  const error = page.locator("[data-core-command-error]");
  await expect(dialog.or(error).first()).toBeHidden({ timeout: 15_000 }).catch(async () => {
    throw new Error(`the command was refused: ${await error.textContent()}`);
  });
}

async function count(page: Page, selector: string): Promise<number> {
  return (await objQuery(page, selector)).length;
}

/** `{ kind, id }` of the first element the selector names. */
async function elementOf(page: Page, selector: string): Promise<{ kind: string; id: string }> {
  const [address] = await objQuery(page, selector);
  expect(address, `${selector} names an element`).toBeTruthy();
  const [kind, id] = [address!.slice(0, address!.indexOf(":")), address!.slice(address!.indexOf(":") + 1)];
  return { kind, id };
}

test.describe("ADR 323 §4 — core UI closure: typed commands and schema fields", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
  });

  test("CUI-1 — Run command… runs any typed core command from its args schema as one undo step; every op entry has a command and its menu door @feat:editor-shell.command-palette @feat:editor-shell.menus @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("markers"));
    const ids = await page.evaluate(() => (globalThis as unknown as CanvasCommands).__canvas.debugContext().commands);
    for (const op of ["insertField", "insertHyperlink", "pathPointInsert", "pathfinderFaces", "createGradient", "deleteCellStyle", "movePage", "createMaster", "attachTextToPath", "createTextVariable"]) {
      expect(ids, `paged.core.${op} is registered`).toContain(`paged.core.${op}`);
    }
    const menus = await page.evaluate(() => (globalThis as unknown as CanvasCommands).__canvas.registries.menus.list());
    const paths = menus.map((m) => m.path);
    expect(paths).toContain("Edit/Run command…");
    expect(paths).toContain("Object/Insert field…");
    expect(paths).toContain("Object/Insert hyperlink…");
    expect(paths).toContain("Layout/Move page…");

    const before = await count(page, "textVariable");
    await runCommand(page, "paged.core.runCommand");
    const picker = page.locator("[data-core-command-picker]");
    await expect(picker).toBeVisible();
    await picker.selectOption("createTextVariable");
    const dialog = await dialogFor(page, "createTextVariable");
    // The fields are the command's args schema.
    await expect(dialog.locator("[data-core-command-field]")).toHaveCount(4);
    await fillArg(dialog, "name", "Issue");
    await fillArg(dialog, "contents", "No. 7");
    await runDialog(page, dialog);
    await expect.poll(() => count(page, "textVariable")).toBe(before + 1);
    await undoOnce(page);
    await expect.poll(() => count(page, "textVariable")).toBe(before);

    // A refusal stays in the form with its reason.
    await runCommand(page, "paged.core.deleteTextVariable");
    const del = await dialogFor(page, "deleteTextVariable");
    await fillArg(del, "variableId", "textVariable:TextVariable/nope");
    await del.locator("[data-core-command-run]").click();
    await expect(page.locator("[data-core-command-error]")).toBeVisible();
    await del.locator("[data-core-command-cancel]").click();
    await expect(del).toBeHidden();
  });

  test("CUI-2 — Insert ▸ Field at the caret (prefilled), the Text Fields panel's value field and Set value…, Insert ▸ Hyperlink: each one undo step @feat:data.bind.field-mapping @feat:cross-references-hyperlinks.hyperlinks @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("markers"));
    const story = (await elementOf(page, "story")).id;
    await setCaret(page, story, 0);
    expect(await count(page, "field")).toBe(0);
    await runCommand(page, "paged.core.insertField");
    const dialog = await dialogFor(page, "insertField");
    // The caret prefilled the story and the offset.
    await expect(dialog.locator('[data-core-command-arg="storyId"]')).toHaveValue(`story:${story}`);
    await expect(dialog.locator('[data-core-command-arg="offset"]')).toHaveValue("0");
    await fillArg(dialog, "field", JSON.stringify({ placeholder: { plugin: "media.paged.data", key: "name", value: "Ann" } }));
    await runDialog(page, dialog);
    await expect.poll(() => count(page, "field")).toBe(1);
    const [field] = await objQuery(page, "field");
    expect(await objGet(page, field!, "value")).toBe("Ann");

    // The Text Fields panel: the field's value as a PropertyField.
    await openPanel(page, "paged.text-fields");
    const panel = page.locator('[data-object-options-panel="field"]');
    await expect(panel).toHaveAttribute("data-options-target", field!);
    const value = fieldOf(panel, "value");
    await expect(value).toHaveAttribute("data-value-type", "text");
    const input = value.locator("input, textarea").first();
    await input.fill("Bob");
    await input.press("Enter");
    await expect.poll(() => objGet(page, field!, "value")).toBe("Bob");
    await undoOnce(page);
    await expect.poll(() => objGet(page, field!, "value")).toBe("Ann");

    // Set value… = core.setFieldValue, prefilled from the field's address.
    await panel.locator('[data-cockpit-action="field-set-value"]').click();
    const set = await dialogFor(page, "setFieldValue");
    await expect(set.locator('[data-core-command-arg="offset"]')).toHaveValue("0");
    await fillArg(set, "value", "Cy");
    await runDialog(page, set);
    await expect.poll(() => objGet(page, field!, "value")).toBe("Cy");
    await undoOnce(page);
    await expect.poll(() => objGet(page, field!, "value")).toBe("Ann");
    // The field binds by its own address (story + marker offset).
    expect((await bindToData(page, value, "value")).selector).toBe(field);

    // Insert ▸ Hyperlink over a range.
    await setCaret(page, story, 2, 5);
    await runCommand(page, "paged.core.insertHyperlink");
    const link = await dialogFor(page, "insertHyperlink");
    await expect(link.locator('[data-core-command-arg="start"]')).toHaveValue("2");
    await expect(link.locator('[data-core-command-arg="end"]')).toHaveValue("5");
    await fillArg(link, "url", "https://paged.media");
    await runDialog(page, link);
    await undoOnce(page);
  });

  test("CUI-3 — the Path section: Step and repeat (duplicateElements) prefilled with the selection, one undo step; every path verb has a button @feat:editor-shell.panels.pathfinder @feat:frames-paths.path.close @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("geometry"));
    const frames = await count(page, "frame");
    const item = await elementOf(page, "frame");
    await selectElements(page, [item]);
    await openPanel(page, "paged.pathfinder");
    const section = page.locator("[data-path-commands]");
    for (const op of ["pathPointInsert", "pathPointRemove", "pathPointSet", "closePath", "joinPaths", "outlineStroke", "offsetPath", "pathfinderFaces", "attachTextToPath", "detachTextFromPath", "applyOpacityMask", "releaseOpacityMask", "duplicateElements"]) {
      await expect(section.locator(`[data-core-command-button="${op}"]`)).toBeEnabled();
    }
    await section.locator('[data-core-command-button="duplicateElements"]').click();
    const dialog = await dialogFor(page, "duplicateElements");
    await expect(dialog.locator('[data-core-command-arg="elementIds"]')).toHaveValue(`${item.kind}:${item.id}`);
    await expect(dialog.locator('[data-core-command-arg="offset"]')).toHaveValue("12, 12");
    await runDialog(page, dialog);
    await expect.poll(() => count(page, "frame")).toBe(frames + 1);
    await undoOnce(page);
    await expect.poll(() => count(page, "frame")).toBe(frames);
  });

  test("CUI-4 — Pages list moves a page (core.movePage); Masters create / rename / delete through the typed commands, each one undo step @feat:editor-shell.panels.pages-list @feat:editor-shell.panels.master-pages @feat:master-spreads-overrides.apply-master-op @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("masters"));
    const pages = await objQuery(page, "page");
    expect(pages.length).toBeGreaterThanOrEqual(2);
    await openPanel(page, "paged.pages-list");
    const list = page.locator('[data-pages-list-panel="ready"]');
    await list.locator("[data-page-list] [data-list-row], [data-page-list] > * > *").nth(1).click();
    await list.locator('[data-toolbar-btn="move-page-earlier"]').click();
    await expect.poll(async () => (await objQuery(page, "page"))[0]).toBe(pages[1]);
    await undoOnce(page);
    await expect.poll(() => objQuery(page, "page")).toEqual(pages);

    await openPanel(page, "paged.master-pages");
    const masters = page.locator('[data-master-pages-panel="ready"]');
    const before = await count(page, "master");
    const listed = await objQuery(page, "master");
    await masters.locator('[data-cockpit-action="master-new"]').click();
    const create = await dialogFor(page, "createMaster");
    // The new master takes the document's page size.
    await expect(create.locator('[data-core-command-arg="widthPt"]')).not.toHaveValue("");
    await fillArg(create, "name", "C-Feature");
    await runDialog(page, create);
    await expect.poll(() => count(page, "master")).toBe(before + 1);
    const fresh = (await objQuery(page, "master")).find((a) => !listed.includes(a))!;

    await openPanel(page, "paged.master-options");
    const options = page.locator('[data-object-options-panel="master"]');
    await options.locator('[data-options-picker="master"]').selectOption(fresh);
    await expect(options).toHaveAttribute("data-options-target", fresh);
    await options.locator('[data-cockpit-action="master-rename"]').click();
    const rename = await dialogFor(page, "renameMaster");
    await expect(rename.locator('[data-core-command-arg="master"]')).toHaveValue(fresh);
    await fillArg(rename, "name", "Renamed");
    await runDialog(page, rename);
    await expect.poll(() => objGet(page, fresh, "name")).toBe("Renamed");
    await undoOnce(page);
    await expect.poll(() => objGet(page, fresh, "name")).toBe("C-Feature");
    await options.locator('[data-cockpit-action="master-delete"]').click();
    await expect.poll(() => count(page, "master")).toBe(before);
    await undoOnce(page);
    await expect.poll(() => count(page, "master")).toBe(before + 1);
    await undoOnce(page);
    await expect.poll(() => count(page, "master")).toBe(before);
  });

  test("CUI-5 — text variables, gradients, cell and table styles: New… (generated form) and Delete (direct invoke), each one undo step @feat:sections-numbering-variables.text-variables @feat:color-swatches.gradients @feat:styles.cell.crud @feat:styles.table.crud @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("markers"));
    await openPanel(page, "paged.text-variables");
    const tv = page.locator('[data-object-options-panel="textVariable"]');
    const vars = await count(page, "textVariable");
    const listed = await objQuery(page, "textVariable");
    await tv.locator('[data-cockpit-action="text-variable-new"]').click();
    const create = await dialogFor(page, "createTextVariable");
    await fillArg(create, "name", "Edition");
    await runDialog(page, create);
    await expect.poll(() => count(page, "textVariable")).toBe(vars + 1);
    // Delete the new one (a variable still placed in the text is refused
    // by core — "delete its instances first").
    const fresh = (await objQuery(page, "textVariable")).find((a) => !listed.includes(a))!;
    await tv.locator('[data-options-picker="textVariable"]').selectOption(fresh);
    await tv.locator('[data-cockpit-action="text-variable-delete"]').click();
    await expect.poll(() => count(page, "textVariable")).toBe(vars);
    await undoOnce(page);
    await expect.poll(() => count(page, "textVariable")).toBe(vars + 1);
    await undoOnce(page);
    await expect.poll(() => count(page, "textVariable")).toBe(vars);

    await loadIdml(page, fixture("gradients"));
    await openPanel(page, "paged.gradient-options");
    const gr = page.locator('[data-object-options-panel="gradient"]');
    const grads = await count(page, "gradient");
    await gr.locator('[data-cockpit-action="gradient-new"]').click();
    await runDialog(page, await dialogFor(page, "createGradient"));
    await expect.poll(() => count(page, "gradient")).toBe(grads + 1);
    await undoOnce(page);
    await expect.poll(() => count(page, "gradient")).toBe(grads);

    await loadIdml(page, fixture("tables"));
    for (const family of ["cell", "table"] as const) {
      await openPanel(page, `paged.${family}-styles`);
      const panel = page.locator(`[data-${family}-styles-panel="ready"]`);
      const n = await count(page, `style:${family}`);
      await panel.locator(`[data-cockpit-action="${family}-style-new"]`).click();
      const op = family === "cell" ? "createCellStyle" : "createTableStyle";
      await runDialog(page, await dialogFor(page, op));
      await expect.poll(() => count(page, `style:${family}`)).toBe(n + 1);
      // Delete the new one (the last row), then undo both.
      await panel.locator(`[data-cockpit-action="${family}-style-delete"]`).last().click();
      await expect.poll(() => count(page, `style:${family}`)).toBe(n);
      await undoOnce(page);
      await expect.poll(() => count(page, `style:${family}`)).toBe(n + 1);
      await undoOnce(page);
      await expect.poll(() => count(page, `style:${family}`)).toBe(n);
    }
  });

  test("CUI-6 — Conditions: the eye runs core.setConditionVisible (one undo step); Conditional text names appliedConditions on the text selection; Condition Options' visible field @feat:editor-shell.panels.conditions @feat:conditional-text.condition-ops @feat:conditional-text.applied-conditions @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("conditions"));
    const [cond] = await objQuery(page, "condition");
    const before = await objGet(page, cond!, "visible");
    await openPanel(page, "paged.conditions");
    const panel = page.locator('[data-conditions-panel="ready"]');
    await panel.locator(`[data-condition-toggle="${cond!.slice("condition:".length)}"]`).click();
    await expect.poll(() => objGet(page, cond!, "visible")).toBe(!before);
    await undoOnce(page);
    await expect.poll(() => objGet(page, cond!, "visible")).toBe(before);

    const story = (await elementOf(page, "story")).id;
    await setCaret(page, story, 0, 3);
    const applied = fieldOf(panel.locator("[data-conditional-text]"), "appliedConditions");
    await expect(applied).toHaveAttribute("data-value-type", "ref");
    expect((await bindToData(page, applied, "appliedConditions")).selector).toMatch(/^story/);

    await openPanel(page, "paged.condition-options");
    const options = page.locator('[data-object-options-panel="condition"]');
    await expect(fieldOf(options, "visible")).toHaveAttribute("data-value-type", "bool");
  });

  test("CUI-7 — Color Group, Numbering List and Master options: schema-driven fields on their addresses, one undo step, Bind to data… @feat:color-swatches.color-groups @feat:styles.bullets-numbering @feat:editor-shell.panels.master-pages @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("swatches"));
    await openPanel(page, "paged.color-group-options");
    const cg = page.locator('[data-object-options-panel="colorGroup"]');
    const group = (await cg.getAttribute("data-options-target"))!;
    expect(group).toMatch(/^colorGroup:/);
    const name = fieldOf(cg, "name");
    const before = await objGet(page, group, "name");
    const input = name.locator("input").first();
    await input.fill("Brand 2");
    await input.press("Enter");
    await expect.poll(() => objGet(page, group, "name")).toBe("Brand 2");
    await undoOnce(page);
    await expect.poll(() => objGet(page, group, "name")).toBe(before);
    expect((await bindToData(page, name, "name")).selector).toBe(group);

    await loadIdml(page, fixture("numbering"));
    await openPanel(page, "paged.numbering-list-options");
    const nl = page.locator('[data-object-options-panel="numberingList"]');
    const list = (await nl.getAttribute("data-options-target"))!;
    expect(list).toMatch(/^numberingList:/);
    for (const p of ["name", "continueAcrossStories", "continueAcrossDocuments"]) {
      await expect(fieldOf(nl, p)).toHaveAttribute("data-value-type", /.+/);
    }

    await openPanel(page, "paged.master-options");
    const ms = page.locator('[data-object-options-panel="master"]');
    await expect(fieldOf(ms, "name")).toHaveAttribute("data-value-type", "text");
  });

  test("CUI-8 — Text Frame Options ▸ Page growth: story flowGrow on the selected frame's story, one undo step, Bind to data… @feat:editor-shell.panels.text-frame-options @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("markers"));
    const frame = await elementOf(page, "textFrame");
    await selectElements(page, [frame]);
    await openPanel(page, "paged.text-frame-options");
    const section = page.locator("[data-flow-grow]");
    await expect(section).toBeVisible();
    const story = (await section.getAttribute("data-flow-grow"))!;
    expect(story).toMatch(/^story:/);
    const max = fieldOf(section, "flowGrowMaxPages");
    await expect(max).toHaveAttribute("data-value-type", "number");
    const before = await objGet(page, story, "flowGrowMaxPages");
    const input = max.locator("input").first();
    await input.fill("7");
    await input.press("Enter");
    await expect.poll(() => objGet(page, story, "flowGrowMaxPages")).toBe(7);
    await undoOnce(page);
    await expect.poll(() => objGet(page, story, "flowGrowMaxPages")).toEqual(before);
    for (const p of ["flowGrow", "flowGrowCopyFrameOptions"]) {
      await expect(fieldOf(section, p)).toHaveAttribute("data-value-type", "bool");
    }
    expect((await bindToData(page, max, "flowGrowMaxPages")).selector).toBe(story);
  });

  test("CUI-9 — a group's own transform (groupTransform) on the Transform panel; paragraph rules write through host.objects as one undo step @feat:editor-shell.panels.object-transform @feat:frames-paths.groups @feat:editor-shell.panels.paragraph @feat:styles.paragraph-rules @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("geometry-groups"));
    const group = await elementOf(page, "group");
    await selectElements(page, [group]);
    await openPanel(page, "paged.object-transform");
    const section = page.locator("[data-group-transform]");
    await expect(section).toHaveAttribute("data-group-transform", `group:${group.id}`);
    const field = fieldOf(section, "groupTransform");
    await expect(field).toHaveAttribute("data-value-type", "transform");
    // A page item binds durably by its oid label (frame[label.x-paged:oid…]).
    expect((await bindToData(page, field, "groupTransform")).selector).toMatch(/^frame\[/);

    await loadIdml(page, fixture("markers"));
    const story = (await elementOf(page, "story")).id;
    await setCaret(page, story, 0, 3);
    await openPanel(page, "paged.paragraph");
    const row = page.locator('[data-rule-row="rule-above"]');
    await expect(row).toHaveAttribute("data-property-field", "paragraphRuleAbove");
    const range = `story:${story}@0..3`;
    const before = await objGet(page, range, "paragraphRuleAbove");
    const pill = row.locator('[data-toggle-switch="rule-above"]');
    await expect(pill).toBeEnabled();
    await pill.click();
    await expect.poll(() => objGet(page, range, "paragraphRuleAbove")).not.toEqual(before);
    await undoOnce(page);
    await expect.poll(() => objGet(page, range, "paragraphRuleAbove")).toEqual(before);
  });

  test("CUI-10 — Table panel: the selected row's height and column's width as indexed fields (rows[i].height / columns[i].width), one undo step; Delete table @feat:editor-shell.panels.table @feat:tables.row-col-sizing @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const fx = await loadViaReactPath(page, "tables");
    const p0 = fx.pages[0]!;
    const hit = await page.evaluate(
      async ({ pageId, w, h }) => {
        const c = (globalThis as unknown as {
          __canvas: { client: { send(m: unknown): Promise<{ kind: string; payload?: { storyId?: string | null; tableContext?: { tableId: string; row: number; col: number } | null } }> } };
        }).__canvas;
        for (let gy = 0.04; gy < 0.97; gy += 0.03) {
          for (let gx = 0.04; gx < 0.97; gx += 0.03) {
            const r = await c.client.send({ kind: "hitTest", payload: { pageId, docPoint: [w * gx, h * gy], filter: "any" } });
            if (r.kind === "hitResult" && r.payload?.tableContext && r.payload.storyId) return { gx, gy, ...r.payload.tableContext };
          }
        }
        return null;
      },
      { pageId: p0.pageId, w: p0.widthPt, h: p0.heightPt },
    );
    expect(hit).not.toBeNull();
    const pt = await screenPoint(page, p0.widthPt * hit!.gx, p0.heightPt * hit!.gy);
    await page.mouse.click(pt.x, pt.y);
    await openPanel(page, "paged.table");
    const indexed = page.locator("[data-table-indexed-fields]");
    await expect(indexed).toHaveAttribute("data-table-indexed-fields", /^table:/);
    const table = (await indexed.getAttribute("data-table-indexed-fields"))!;
    const row = hit!.row;
    const col = hit!.col;
    const panel = page.locator('[data-table-panel="ready"]');
    const rowPath = `rows[${row}].height`;
    const height = fieldOf(panel, rowPath);
    await expect(height).toHaveAttribute("data-value-type", "length");
    const before = await objGet(page, table, rowPath);
    expect(typeof before).toBe("number");
    const input = height.locator("input").first();
    await input.click({ clickCount: 3 });
    await input.press("ControlOrMeta+a");
    await input.pressSequentially("44");
    await input.press("Enter");
    await expect.poll(() => objGet(page, table, rowPath)).toBe(44);
    await undoOnce(page);
    await expect.poll(() => objGet(page, table, rowPath)).toEqual(before);
    await expect(fieldOf(panel, `columns[${col}].width`)).toHaveAttribute("data-value-type", "length");
    expect((await bindToData(page, height, rowPath)).selector).toMatch(/^table/);
    await openPanel(page, "paged.table");

    const tables = await count(page, "table");
    await panel.locator('[data-cockpit-action="delete-table"]').click();
    await expect.poll(() => count(page, "table")).toBe(tables - 1);
    await undoOnce(page);
    await expect.poll(() => count(page, "table")).toBe(tables);
  });

  test("CUI-11 — Attributes ▸ Labels: an x-paged label added and edited as labels[key], one undo step each; foreign keys stay read-only @feat:editor-shell.panels.attributes @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, fixture("markers"));
    const frame = await elementOf(page, "textFrame");
    const address = `${frame.kind}:${frame.id}`;
    await selectElements(page, [frame]);
    await openPanel(page, "paged.attributes");
    const section = page.locator('[data-section="Labels"]');
    await expect(section).toHaveAttribute("data-labels-target", address);
    await section.locator("[data-label-new-key]").fill("x-paged:acme.demo");
    await section.locator("[data-label-add]").click();
    await expect.poll(() => objGet(page, address, "labels[x-paged:acme.demo]")).toBe('{"v":1,"data":{}}');
    const field = fieldOf(section, "labels[x-paged:acme.demo]");
    await expect(field).toHaveAttribute("data-value-type", "text");
    const input = field.locator("input, textarea").first();
    await input.fill('{"v":1,"data":{"k":"v"}}');
    await input.press("Enter");
    await expect.poll(() => objGet(page, address, "labels[x-paged:acme.demo]")).toBe('{"v":1,"data":{"k":"v"}}');
    await undoOnce(page);
    await expect.poll(() => objGet(page, address, "labels[x-paged:acme.demo]")).toBe('{"v":1,"data":{}}');
    await undoOnce(page);
    await expect.poll(async () => (await objGet(page, address, "labels[x-paged:acme.demo]")) ?? null).toBeNull();
  });
});
