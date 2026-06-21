// Draw & fill a frame — the whole thing is this script driving the real editor.
//   paged.run(...)  runs a paged.* snippet in the engine (the document API)
//   editor.*        drives the UI (commands/menus, panels, selection, mutate)
//   demo.*          narrates + paces (showInfo suspends until you click Next)

await editor.runCommand("paged.file.new");
await demo.wait(800);

await demo.showInfo(
  "Driven by a script",
  "Everything you see is this script: paged.* for the document, editor.* for the UI, demo.* to narrate.",
  { cta: "Start", index: 1, total: 4 },
);

await editor.openPanel("paged.properties");

const pageId = editor.pageIds()[0];
const reply = await editor.mutate({
  op: "insertTextFrame",
  args: { pageId, bounds: [160, 120, 360, 420] }, // [top, left, bottom, right] in pt
});
const frame = reply.payload.createdId;
await editor.select([frame], "replace");
await demo.showInfo(
  "Drew a frame",
  "editor.mutate inserted a text frame; editor.select drove the Properties panel to it.",
  { index: 2, total: 4 },
);

await editor.mutate({
  op: "setElementProperty",
  args: { elementId: frame, path: "frameFillColor", value: { type: "colorRef", value: "Color/Black" } },
});
await demo.showInfo("Filled it", "A property write — the same channel the Swatches panel uses.", {
  index: 3,
  total: 4,
});

await editor.mutate({
  op: "setElementProperty",
  args: { elementId: frame, path: "frameBounds", value: [200, 280, 400, 580] },
});
await demo.showInfo(
  "Moved it",
  "That's the whole loop — real document, real UI, narrated by the script. Now go read the scripting reference.",
  { cta: "Done", index: 4, total: 4 },
);
