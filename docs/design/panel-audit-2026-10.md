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

## Open in the plugin repos

These need changes in each plugin and a canary release. The order inside each list is
by impact.

### paged.draw

- **Notes.** Nine panels end in a 150–300-word technical note full of internal terms.
  Replace each with one line, plus an "About" disclosure; the detail belongs in the docs.
  The panels are: Appearance, Graphic styles, Symbols, Live paint, Pattern, Repeat,
  Blend, Objects on path and Path options.
- **Duplicates.**
  - The Stroke and Fill panels duplicate the host's.
  - Draw properties edits the same recipe fields as the six recipe panels.
  - Pick one home for each.
- **Icons.** `panel-stroke` is used three times, and `panel-object-styles` and
  `panel-effects` overlap with the host's panels. Give each panel its own glyph.
- **Deletes.** Graphic styles and Symbols delete without confirmation, and neither delete
  can be undone.
- **Selection hints.**
  - Objects on path needs the path to be the last object selected, and nothing shows
    which object that is.
  - "+ Blend" is disabled unless exactly two objects are selected, and nothing says so.
- **Labels.**
  - Some controls show raw enum values ("grid", "easeIn").
  - Title Case appears in headings ("Live Paint", "Objects on Path").

### paged.image

- **Header.** The Image panel opens with developer diagnostics: the bundle id and
  version, the engine state, and the header "PAGED.IMAGE — LEVELS / CURVES / WHITE
  BALANCE".
- **Feedback.** Apply, Reset and the status line sit below about 30 sections, so a
  refusal is out of sight.
- **Scope.** The panel holds its own Layers, Brush, Type, Retouch, Paths and Channels
  sections. They overlap the host's Layers panel and Image properties.
- **Image properties.** It uses the `panel-layers` icon, and it shows all ten adjustment
  groups for every layer.
- **Colours.** One select has an inline white background.
- **Tokens.** The histogram reads `--pg-surface-2`, which the host now defines as an
  alias.

### paged.sheet

- **Grid.** The grid viewport is fixed at 480 px, wider than the dock. Size it from the
  panel.
- **Workbook.** One long column of controls; split it into collapsible sections.
- **Naming.** The verb "Lower" (to frame) should become "Place on page" everywhere,
  matching the menu.
- **Duplicates.**
  - Formatting and iterative calculation live both in Workbook and in Sheet properties.
  - Find appears in Workbook and again in Grid.
- **Datasets.**
  - The empty state says "no data-provider registry is wired in this host".
  - Rows show provider ids.
- **Feedback.** Copy and paste refusals reach only the log.

### paged.web

- **Empty state.** It points at the "Insert web frame" command; it needs an inline
  button.
- **Feedback.** "Make web frame" refusals reach only the log.
- **Duplicate source.** Web properties exposes the raw `html`/`css`/`vars` beside the
  Web frame panel's unsaved draft, so the two can conflict. Drop the Source section.
- **Variables.** Three places hold variables: Variables, Bound data and Bound values.

### paged.data

- **Bindings.**
  - It renders its whole set of controls before any source exists.
  - "Wire demo binding" ships in the product.
  - Authoring always binds `q_all` over the first source, so saved queries can't be
    bound.
- **Dead clicks.**
  - About nine controls only `log.warn`.
  - Two of them are menu rows: "Apply a data set…" and "Merge records…".
- **Dataset preview.** It previews no rows. "Run batch" produces no pages in the editor.
- **Mono values.** `font: var(--font-mono)` is used as a shorthand, which is invalid, so
  values never render in mono. Use `fontFamily`.
- **Icons.** Every panel uses `panel-canvas`.

### paged.doc

- **Outline.** Outline entries can't be clicked, so the outline can't navigate.
- **File picker.** "Place Word document…" does nothing when the host has no file picker.
- **Glyphs and tokens.**
  - Text glyphs stand in for icons ("▦", "●", "¶").
  - `rgba(…)` is hard-coded.
  - `--status-warning` was undefined (now aliased).

## Needs a contract change

- **Messages.** A way for plugins to show the user a message (`host.notify` or an inline
  status primitive). Every plugin routes refusals to `host.log.warn`, which the user
  never sees.
- **Shared primitives.** The kit's input primitives exposed through `plugin-api`, so that
  plugin panels stop hand-rolling controls.
