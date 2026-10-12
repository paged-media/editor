// paged.draw, live — the real editor in your browser, driven by this script,
// hands-free. Every step goes through the same code a click would: the wire
// ops the panels use, and the paged.draw plugin's own commands.

const step = (title, body, index) => demo.showInfo(title, body, { autoMs: 3600, index, total: 5 });

await editor.runCommand("paged.file.new");
// The new document's page list arrives a moment after the command returns.
let pageId;
for (let i = 0; i < 50 && !(pageId = editor.pageIds()[0]); i++) await demo.wait(100);
if (!pageId) throw new Error("the new document has no page");

// Every insert must land: a rejected op is an error, not a silent no-op.
const make = async (op) => {
  const reply = await editor.mutate(op);
  if (reply.kind !== "mutationApplied") throw new Error(`${op.op} was not applied (${reply.kind})`);
  return reply.payload.createdId;
};
await step("paged.draw, live", "This is the editor itself, running in this tab. A script is about to draw with it.", 1);

// Two swatches, named so the script can use them by id.
for (const [selfId, name, rgb] of [
  ["Color/Rose", "Rose", [244, 127, 192]],
  ["Color/Violet", "Violet", [169, 139, 245]],
]) {
  await editor.mutate({
    op: "createSwatch",
    args: { spec: { selfId, name, space: "RGB", value: rgb, model: "Process", alternateSpace: null, alternateValue: [], tint: null, alpha: null } },
  });
}
const fill = (elementId, color) =>
  editor.mutate({ op: "setElementProperty", args: { elementId, path: "frameFillColor", value: { type: "colorRef", value: color } } });

// A dome: two corner anchors and a smooth top, closed. Each anchor carries
// its two handles (left = coming in, right = going out), in page points.
const domeId = await make({
  op: "insertPath",
  args: {
    pageId,
    open: false,
    anchors: [
      { anchor: [100, 250], left: [100, 250], right: [100, 250] },
      { anchor: [205, 90], left: [120, 90], right: [290, 90] },
      { anchor: [310, 250], left: [310, 250], right: [310, 250] },
    ],
  },
});
await fill(domeId, "Color/Rose");
await editor.select([domeId], "replace");
await step("A curve, by its anchors", "Three anchors, one of them smooth: a closed vector path, filled from a swatch.", 2);

// A rectangle, rounded live by the plugin's corner command.
const cardId = await make({ op: "insertFrame", args: { pageId, bounds: [90, 360, 250, 540] } });
await fill(cardId, "Color/Violet");
await editor.select([cardId], "replace");
await editor.runCommand("media.paged.draw.command.cornersRounded");
await step("Live corners", "Draw ▸ Corners ▸ Rounded: the corners stay live, and InDesign reads them as its own.", 3);

// Two overlapping shapes, united by Pathfinder.
const a = await make({ op: "insertFrame", args: { pageId, bounds: [320, 90, 440, 250] } });
const b = await make({ op: "insertFrame", args: { pageId, bounds: [340, 190, 460, 350] } });
await fill(a, "Color/Rose");
await fill(b, "Color/Violet");
await editor.select([a, b], "replace");
await demo.wait(900);
await editor.runCommand("media.paged.draw.command.pathfinderUnite");
await step("Pathfinder", "Two overlapping shapes, united into one path by Draw ▸ Pathfinder ▸ Unite.", 4);

await editor.select([], "replace");
await step(
  "Your turn",
  "Everything here is still editable: pick a tool and draw. The script is in the panel on the right; change it and run it again.",
  5,
);
