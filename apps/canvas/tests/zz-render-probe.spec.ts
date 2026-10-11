import { test } from "@playwright/test";
import { loadIdml, openCanvas } from "./fidelity/canvas-driver";
import { FIXTURE } from "./ai-fixtures";
test("render probe", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openCanvas(page);
  await loadIdml(page, FIXTURE);

  await page.waitForTimeout(800);
  await page.screenshot({ path: "/private/tmp/claude-501/-Users-drietsch-paged/af5ad762-fb58-4ce6-bc34-910dbd109dd8/scratchpad/probe-before.png" });
  const out = await page.evaluate(async () => {
    const c = (globalThis as any).__canvas.client;
    const pid = (await c.executeScript("console.log(JSON.parse(paged.pages())[0].selfId)")).output[0].replace(/^\[\w+\] /, "");
    return (await c.executeScript(`const f = paged.insertFrame("${pid}", [50,50,500,500]); console.log(f, paged.set(f, "frameFillColor", "swatch:Color/Black"), paged.get(f,"frameFillColor"));`)).output;
  });
  console.log("OUT", JSON.stringify(out));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/private/tmp/claude-501/-Users-drietsch-paged/af5ad762-fb58-4ce6-bc34-910dbd109dd8/scratchpad/probe-after.png" });
});
