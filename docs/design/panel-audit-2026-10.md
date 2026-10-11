# Panel audit — October 2026

All 107 user-facing panels (87 host, 20 plugin) were opened in the 320 px right dock,
with a document loaded, and reviewed against the design system. The plugin panels were
also read in source at each plugin's `main`.

## Fixed in the host

These fixes apply to every panel, so they fixed most of the plugin findings without
plugin changes.

| Problem | Fix |
|---|---|
| Opening a panel activated a tab that was out of sight in the tab strip. | The right dock scrolls the active tab into view; the wheel scrolls the strip. |
| Plugin panels draw raw `<input>`/`<select>`/`<button>`, which rendered as light OS widgets on the dark theme. Inline styles made disabled buttons look live. | `[data-panel-host]` wraps every panel. `globals.css` gives class-less native controls the theme's look. Disabled is dimmed and inert even over inline styles. `color-scheme` follows the theme. |
| Plugins reference `--status-ok`, `--status-warn`, `--status-warning`, `--status-error-fg` and `--pg-surface-2`, none of which existed, so their hex fallbacks always rendered. | Aliases in `theme.css`, mapped to the existing status tokens. |
| Schema-driven plugin panels labelled rows with raw keys ("fileName", "recordCount", "radiusPt", "blendMode"). | `humanizePath` labels rows that declare no label and have no schema title ("File name", "Radius (pt)"). |
| Rows bound to the selected entry of an empty list drew "No entries" above a block of dead inputs (about 30 in Sheet properties). | A row whose explicit address resolves to nothing renders nothing. A section left empty says "Nothing to edit here yet." |
| Plugin rows of buttons ran off the dock (26 controls in Image). | In plugin panels, an inline flex row wraps when it runs out of width. |
| Character, Paragraph, Text Frame and Object overflowed at 320 px. | The number and length inputs shrink to their cell (`min-w-0 max-w-full`). No panel overflows now. |
| A plugin's frame panel (Workbook, Web frame) was disabled until the user was already inside the feature. | `panelBelongsHere` offers it at the document root. Only another content type's context withholds it. |
| Plugin panels were listed in Window under ids like "paged.draw". | Plugins ▸ ‹plugin› holds each plugin's commands and panels. |
| The host's data labels disagreed with the panels: "Connect source…", "Field mapping…", and "Generate pages…" (which generates no pages). | Menu and Data-mode pills now use the panel titles: Data sources, Bindings, Dataset preview. |
| Two stale host stubs ("Data suite (preview)" and "Generated pages") sat beside the live data panels. | No longer offered in Window; still registered. |
| The default dock spent its second tab on the "coming soon" Library card. | The Design mode defaults to Properties, Swatches and Layers; Library left the panel rail. |
| Raw ids shown as names: masters "$ID/None", spreads "u630080", the active page "u6bd223", and the Master Options picker. | `displayName`, "Spread n", "Page n", and the object's own `name`. |
| Keyboard shortcuts listed both ⌘ and ⌃ for every command. | One chord per command, the platform's, like the menus. |
| Export Center broke apart in the dock. | Rows wrap; the narrow layout has tighter gutters. |
| The Align panel used `ui-rows` for both "align top" and "align bottom". | New object-alignment glyphs (`ui-obj-align-*`), shared with the control bar. |

## Fixed in the plugin repos

Each plugin was fixed on a `ux/panels-2026-10` branch from its `main`, with that repo's
tests passing. The editor's specs follow those builds.

### paged.draw

- **Notes.** Nine panels end in a one-sentence intro, plus a collapsed "About" written in
  plain words. The audit codes, op names, paths and capitals are gone.
- **Duplicates: merged into the host.** "Vector stroke" and "Vector fill" are no longer
  contributed. Every row they carried is a core frame property, and the host now
  carries them:
  - the Stroke panel's "Dashes & arrows" section is live: dash pattern, start and end
    arrowheads;
  - corners are in Object Options;
  - the gradient's angle and length are in Gradients.

  "All draw settings" is now "Draw settings". The vector context raises it, and the
  host's Properties panel shows it inline for artwork draw made or annotated.
- **Icons.** Every draw panel has its own glyph.
- **Deletes.** Graphic styles and Symbols confirm in the panel ("Confirm delete").
- **Selection hints.** Objects on path names its target path; "+ Blend" and "+ On path"
  say why they are disabled; refusals show in the panel.
- **Labels.** Words instead of raw values; sentence-case headings.

### paged.image

- **Header.** It is a plain "Image adjustments" title. The diagnostics sit in a
  collapsed "Diagnostics" block.
- **Feedback.** A sticky action bar holds Use selected frame, Live, Apply, Reset and the
  status line.
- **Scope.** Layers, Brush, Type, Retouch, Paths and Channels are collapsible sections,
  each with one plain sentence and its notes under "About".
- **Image properties.** It has its own icon. The ten adjustment groups show only for
  adjustment layers. The stored layer doesn't record which adjustment it is, so the
  groups can't be narrowed further.
- **Colours.** No inline white select background; swatches sit beside the selects.

### paged.sheet

- **Grid.** It sizes from the panel's measured width.
- **Workbook.** Collapsible sections, with only "Place on page" open by default.
- **Naming.** "Place on page" replaces "Lower" everywhere a user reads it.
- **One home per setting.** Formatting and iterative calculation live in Sheet
  properties, and find and replace in the Grid panel. Pointers sit in their old places.
- **Datasets.** A plain empty state; human names; "Use" and "Update".
- **Feedback.** Copy, paste and fill refusals and successes show in the Grid panel.
- **Deletes.** Destructive actions confirm in the panel.

### paged.web

- **Titles.** The panels are "Web source" and "Web frame properties".
- **Empty state.** An inline "Insert web frame" button; refusals show inline.
- **Duplicate source.** The raw html/css/vars rows are gone from the properties panel.
- **Variables.** Merged into one section, with a pointer between the two panels.
- **Layout.** Option rows wrap, the preview sits above "Save to document", and no
  hard-coded hex colours remain in chrome.

### paged.data

- **Bindings.**
  - A first-step empty state with "Open Data sources".
  - The demo controls are removed.
  - A "Records from" query picker replaces the hard-wired `q_all`.
  - A "Bind to data…" draft shows before any source exists.
- **Dead clicks.** Each one is disabled with a reason or shows inline, including the two
  menu rows.
- **Dataset preview.** It previews rows. "Plan batch" says that no pages are made here.
- **Mono values.** Fixed with `fontFamily`.
- **Icons.** Every panel has its own.
- **Names.** Command and menu names match the panel titles.
- **Status line.** It shows the message, not the engine's state name.
- **Data overview.** The property panel was "Data objects": five lists that read only
  "No entries". It now has:
  - an intro sentence;
  - in each empty section, a line naming the panel where that kind is made;
  - an "Open in …" on every row, which raises the owning panel;
  - the picked item's settings below, with readable labels.

### paged.doc

- **Outline.** Headings navigate: a click takes the user to the heading's text and
  selects it, through `host.viewport.revealText`, below.
- **File picker.** "Insert Word document…" is disabled, with the reason, when the host
  has no file picker.
- **Glyphs and tokens.** Text glyphs, hard-coded colours and undefined tokens are
  replaced.
- **Lists.** Long lists cap with "Show all".
- **Naming.** One verb, "Insert", everywhere.

## Plugin API: revealing text

`host.viewport.revealText({ storyId, start, end }, { select })`, behind the
`supports("viewport.revealText@1")` probe (plugin-api 0.2.49-canary.0, plugin-sdk
0.2.50-canary.0):

- it moves the camera to where the range is laid out, and selects it by default;
- it answers `false` for an unknown story, a range that is not laid out, or a host
  without the door.

The editor backs it in `apps/canvas/src/plugin-pages.ts`.

## Still open

- **User messages.** A way for plugins to show the user a message (`host.notify` or an
  inline status primitive). The plugins now show refusals in their own panels, each in
  its own way.
- **Shared primitives.** The kit's input primitives exposed through `plugin-api`.
- **Doc plugin size.** paged.doc's wasm built from `main` is 8.64 MB, over its manifest's
  8 MiB budget.
