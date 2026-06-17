// Journey: character typography depth.
//
// A designer selects a heading and works the Character panel's deeper
// controls — case, baseline shift, kerning method, super/subscript,
// underline/strikethrough, ligatures, horizontal/vertical scale, skew.
// Each is a real setElementProperty on the selected story range.

import { expect, test } from "@playwright/test";

import { mutate } from "../../e2e/harness/ui";
import { Designer } from "../driver/designer";

test.describe("journey · typography depth", () => {
  test("work the Character panel's deeper controls @feat:typography.capitalization @feat:typography.baseline-shift @feat:typography.tracking-kerning @feat:typography.position-super-subscript @feat:typography.underline-strikethru @feat:typography.ligatures-opentype @feat:typography.scale-skew @feat:typography.vertical-scale @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const { storyId } = await designer.addTextFrame({ x0: 70, y0: 90, x1: 480, y1: 200 });
    expect(storyId).toBeTruthy();
    await designer.placeCaret(storyId!, 0);
    const heading = "Spring Collection";
    await designer.typeText(heading);
    await expect
      .poll(() => designer.storyChars(storyId!), { timeout: 6000 })
      .toBeGreaterThanOrEqual(heading.length);
    await designer.selectText(storyId!, 0, heading.length);

    const range = {
      kind: "storyRange",
      id: { story_id: storyId, start: 0, end: heading.length },
    };
    const failed: string[] = [];
    const set = async (path: string, value: unknown) => {
      const r = (await mutate(page, {
        op: "setElementProperty",
        args: { elementId: range, path, value },
      })) as { kind?: string };
      if (r.kind !== "mutationApplied") failed.push(path);
    };

    await set("characterCase", { type: "text", value: "AllCaps" });
    await set("characterBaselineShift", { type: "length", value: 3 });
    await set("characterKerningMethod", { type: "text", value: "Optical" });
    await set("characterPosition", { type: "text", value: "Superscript" });
    await set("characterUnderline", { type: "bool", value: true });
    await set("characterStrikethru", { type: "bool", value: true });
    await set("characterLigatures", { type: "bool", value: true });
    await set("characterHorizontalScale", { type: "length", value: 120 });
    await set("characterVerticalScale", { type: "length", value: 110 });
    await set("characterSkew", { type: "length", value: 10 });

    expect(failed, `character props that failed: ${failed.join(", ")}`).toEqual([]);
  });
});
