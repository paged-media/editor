// A guided tour — editor.* drives the shell (panels, modes), demo.* narrates.
// A pure-UI script: no document edits, just steering the editor and explaining it.

await editor.runCommand("paged.file.new");
await demo.wait(600);

await demo.showInfo("The cockpit", "paged is a programmable editor. This tour is a script clicking through it.", {
  cta: "Next",
  index: 1,
  total: 4,
});

await editor.openPanel("paged.layers");
await demo.showInfo("Panels", "editor.openPanel('paged.layers') opened the Layers panel — any registered panel by id.", {
  index: 2,
  total: 4,
});

await demo.highlight('[data-tool-slot="select"]');
await demo.showInfo("Spotlight", "demo.highlight() dims the editor and points at a target — here, the Select tool.", { index: 3, total: 5 });
await demo.highlight(null);

await editor.setMode("content");
await demo.showInfo("Workflow modes", "editor.setMode('content') switched the whole cockpit to the Content workflow.", {
  index: 4,
  total: 5,
});

await editor.setMode("design");
await editor.openPanel("paged.properties");
await demo.showInfo("Back to design", "Every menu item, panel, tool and mode is scriptable — so a demo is just a script.", {
  cta: "Done",
  index: 5,
  total: 5,
});
