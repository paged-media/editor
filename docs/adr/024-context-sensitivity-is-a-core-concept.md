# ADR 024 — Context-sensitivity is a core concept of paged

- **Status:** ACCEPTED (2026-08-07)
- **Supersedes:** nothing. **Extends:**
  [ADR 023](023-shared-panels-binding-providers.md) (shared panels / binding
  providers), which solved the VALUE lane of this same principle before
  the principle itself was written down.
- **Applies to:** the editor shell, the plugin contract, and **every**
  plugin that exposes content to the canvas.

## The rule

**When the editing context changes, the whole editing surface changes
with it.** Panels, tools, menus, toolbars, and the values inside panels
all reflect what the user is currently editing.

Stated negatively, which is how it was originally put and is the
clearer form:

> It simply makes no sense to have options, tools and panels that are
> not actually available in the current context.

This is not a nicety and not a per-plugin choice. A surface that offers
what it cannot do is lying about itself, and the user pays for the lie
twice: once discovering the control does nothing, and again never quite
trusting the rest of the surface afterwards.

## What a context is

The document is a **paged document** — a native document type with its
own pages, layers, styles and swatches. That is the HOST context, and it
is the default.

A plugin content type (a vector graphic, a raster image, a spreadsheet,
a web frame, a Word document) is a **second kind of content living
inside a frame** in that document, with its own model — including,
usually, its own layers. Entering one is entering a different editing
world that happens to be embedded in the first.

Entry is uniform: **double-click the frame** (the one-entry-gesture rule,
`plugin-sdk: DESIGN.md` §19). Exit is Esc, or picking a tool the context does not
own.

## What must follow the context

| Surface | What it must show |
|---|---|
| **Panel VALUES** | the entered content's values (ADR 023 binding providers) |
| **Panel SET** | the panels that make sense for this content |
| **Layers panel** | **the entered content's OWN layers**, not the document's |
| **Tools / rail** | the tools this content can actually be edited with |
| **Toolbar** | the actions that apply here |
| **Menus** | the commands that apply here |

### The Layers panel, specifically

The host document has layers. A plugin content type has layers of its
own. **Inside a plugin content type, the Layers panel shows THAT
content's layers.** One panel, one place to look, and its contents
follow where you are.

Rejected alternative: showing the document's layers with the content
type's nested underneath as children. It reads well in the abstract and
fails in the concrete, because the provider serving the collection would
have to synthesize a row for a core-owned layer it does not own and
cannot speak for — and the panel would then display two authorities'
rows with nothing distinguishing them. **The breadcrumb answers "where
am I"; the Layers panel answers "what is in here".** That division keeps
each surface truthful about what it knows.

## Why this is a CORE concept and not a plugin concern

Because a plugin cannot deliver it alone, and because a single
non-conforming plugin breaks it for the whole product. A user learns
"the surface follows what I am editing" from the product, not from a
plugin; the first context that leaves a stale rail on screen teaches
them the opposite, and they carry that lesson everywhere.

So the platform has to make conformance the easy path and
non-conformance visible.

## State of the world at acceptance (audited 2026-08-07)

Entry is uniform — 5 of 5 content plugins on `doubleClick`. The rest of
the surface is not:

| Context | `toolIds` | `panelIds` | Adapts the surface? |
|---|---|---|---|
| draw `vectorGraphic` | 3 of 19 tools | 1 of 10 panels | **yes** |
| image `rasterImage` | 11 of 11 | 1 of 1 | **yes** |
| doc `wordDocument` | **host text tools** | 1 | **yes** |
| web `webFrame` | **`[]` — none apply** | 1 | **yes** |
| sheets `sheet` | **`[]` — none apply** | 1 | **yes** |
| data — | **no context at all** | — | **no** |
| publish | n/a — owns no canvas content | — | n/a (correctly) |

**CLOSED 2026-08-07 — 5 of 5 content plugins now declare both.** The
three that declared nothing (sheets, web, doc) were fixed after the
editor stopped collapsing a declared-EMPTY `toolIds` into
"unrestricted", which is what made the honest answer sayable at all.

**paged.doc is the case that proves the rule is not "plugins get an
empty rail."** A DOCX lowers to NATIVE content — real host text frames,
stories and styles — so the editor genuinely owns the caret and the
HOST'S text tools are the right ones. A spreadsheet and a web frame are
the opposite: nothing on the canvas rail acts on them, so the honest
declaration is empty. Same rule, three different answers, which is why
it is "declare what applies" rather than "declare nothing".

*(Corrected 2026-08-07 from a first draft that credited web with two
`panelIds`; it declares one. Draw's 3-of-19 is a deliberate narrowing,
not a shortfall — its other 16 tools are document-level and work on a
plain selection. plugin-data is the sharper finding the first pass
missed: it stamps binding envelopes onto frames it creates, so it IS
content-bearing, and it registers no context, no objectType and no
tools at all.)*

### What landed against this ADR (2026-08-07)

- **`PagedEditor.editContext`** — the ROOT CAUSE. That handle reaches
  every command handler, panel and `when` predicate, so without it a
  predicate could not ask what it was inside. Everything below was cheap
  once it existed.
- **`CommandRegistry.invoke` honours `when`** — the gate at `invoke`
  rather than per surface, so palette, menu, keybinding, toolbar and a
  plugin's `runCommand` are covered by one check. The menu bar evaluates
  it too and no longer drops the field in `groupByTopLevel`.
- **`Object ▸ Group / Ungroup / Send to back` stopped editing the
  document from inside a context** — the destructive finding.
- **Leaving a context by tool is derived**, in the controller, instead
  of wired into four entry points of which one was correct.
- **A declared-empty `toolIds` means "nothing applies"** instead of
  collapsing into "unrestricted" — the change that made the honest
  answer sayable, and immediately consumed by sheets and web.
- **paged.image answers the host Layers and Character panels** (ADR 023
  phase D), the fourth consumer and the first with a non-empty
  `writablePaths`.

### Still not wired

- **The context toolbar** is driven by the workflow MODE
  (`useWorkflowMode`), never by the edit-context stack. A mode is a
  workspace-level choice; a context is a content-level fact. They are
  different axes and only one is wired.
- **The Window menu** lists every registered panel in every context.
- **The "17 core-only panels" finding, RE-SCOPED after reading them
  (2026-08-07).** The audit reported that 17 panels use raw
  `useCollection` and "write the host document from inside any context",
  with only 3 of 71 panel files on the ADR-023 seam. The count is
  correct; the framing conflated *acts on the host document* with
  *is wrong*, and migrating on that basis would have made things worse.

  Pages, Links, Master Pages, Spreads, Separations and most of the rest
  are DOCUMENT-LEVEL surfaces. A Pages panel that manages the document's
  pages while you happen to be inside an image frame is behaving
  correctly — the document did not stop existing because you entered a
  frame. Separations reads the document's swatches because separations
  are about the document's inks; serving it a workbook palette would be
  the defect, not the fix.

  The genuine residual is narrower: a panel is wrong only when it reads
  a collection **some plugin actually serves** and would want the
  plugin's answer. Today the served collections are `layers` (draw,
  image) and `swatches` (sheets). The Layers panel already uses the
  seam. That leaves the Table panel and `FillStrokeCluster`, and NEITHER
  is a clear defect:

  · **Table** reads host swatches to colour host IDML tables — right for
    what it edits. Its real problem is that it is *offered at all*
    inside a sheet, where the context scopes selection to the frame and
    there is no host table to edit. That is a panel-applicability
    question, not a binding one.

  · **`FillStrokeCluster`** resolves the document's Black swatch for the
    `D` default pair and writes `setDocumentDefaults`. Both are
    document-level and correct as reads; the open question is whether
    `D` should fire inside a plugin context at all — and the answer
    differs per context (a vector graphic creates page items; a raster
    image does not), which makes it a product decision rather than a
    bug.

  **So: no blanket migration.** What is actually owed is panel
  APPLICABILITY (which panels apply inside which context), which is the
  same lane the Window menu now uses and wants a per-panel answer rather
  than a sweep.
- **Tool restriction is v1 depth** — non-context tools are dimmed but
  the rail is not otherwise reorganised.
- **plugin-data** is content-bearing (it stamps binding envelopes onto
  frames it creates) and registers no context, no objectType and no
  tools at all.

## Decision

1. **The rule above is normative for paged**, and applies to the host
   surface and every plugin equally.
2. **Declaring the surface becomes part of declaring a context.** A
   plugin that registers an edit context states which tools and panels
   that context uses. The contract should make this required rather than
   optional, so a context that adapts nothing is a compile error rather
   than a review finding. Forcing a value is about forcing the AUTHOR TO
   DECIDE, not about forbidding a broad surface.

   **Corrected 2026-08-07:** this clause originally called an explicit
   empty list "this context restricts nothing". That is backwards, and
   the implementation went the other way for good reason. An explicit
   `[]` means **no tool applies here** — the statement a spreadsheet and
   a web frame need to make. "Restricts nothing" is what OMITTING the
   field means. Collapsing the two is exactly the bug the editor had,
   and writing the collapse into the decision would have enshrined it.
3. **The toolbar and the menu bar gain context-awareness.** Both are
   editor work, tracked in the internal gap register.
4. ~~**Existing non-conforming contexts are brought up**~~ — **DONE
   2026-08-07.** sheets `[]`, web `[]`, doc the host text tools.
5. **A context that cannot adapt a surface says so.** The honest form of
   "this panel does not apply here" is for the panel to be absent or to
   state its emptiness — never a live-looking control over content it
   cannot address. This is the same rule ADR 023 applies to values
   (`absent` vs `decline` vs a read-only declaration), applied to the
   rest of the surface.

## Consequences

- Entering a context becomes a heavier, more visible event. That is
  intended: it IS a mode change, and pretending otherwise is what
  produced surfaces that quietly do not apply.
- Plugins carry more declaration. Cheap, and it is the declaration that
  lets the host reason about the surface without asking the plugin.
- Some existing behaviour changes — a user who enters a sheet today
  keeps the raster rail and will stop keeping it. This is a fix, not a
  regression, but it is user-visible and should ship with the rest of
  these changes rather than alone.
- **The unsolved case, named rather than buried:** a plugin whose
  natural activation window is not "the user is inside this frame" has
  no way to express that. paged.image is the worked example — its
  providers would ideally activate on "I hold this raster frame", which
  it knows from ingest rather than from a gesture. It lives with the
  frame boundary and declines inside the providers. If a second plugin
  hits this, the answer is probably a context that can activate on
  plugin-owned state, not a second entry gesture (the one-entry-gesture rule settled that).

## What this ADR does NOT decide

- **How** the toolbar and menus consume context — whether a context
  contributes toolbar segments and menu items directly, or whether the
  host filters existing contributions by an applicability predicate. The
  second is likelier (it degrades better and keeps plugins out of host
  chrome IDs, as ADR 023 §"panelIds" argues), but it wants a real
  consumer before it is designed.
- Whether workflow MODES and edit CONTEXTS eventually unify. They are
  different axes today and this ADR does not merge them.
- Anything about nested contexts beyond what the shell's stack already
  does.

## Amendment — 2026-10-02

Checked against the code at `28dc764`, with the contract at plugin-sdk `d90f727` and the six
content plugins at their pinned commits. The rule and the decision stand. Three items of "What
landed against this ADR" were re-checked and are in the code: `PagedEditor.editContext`
(`packages/shell/src/state/paged-editor.tsx:182`, `:241-242`), the `when` gate in
`CommandRegistry.invoke` (`packages/shell/src/registries/command.ts:131-145`), and the
distinction between an omitted and an empty `toolIds`
(`packages/shell/src/state/edit-context-stack.tsx:76-92`, `:159`). The text above no longer
matches the code in six places.

**1. plugin-data registers an edit context.** The table row for data ("no context at all") and
the last "Still not wired" bullet say it registers none.

- `plugin-data: packages/data-bundle/src/activate.ts:169-181` — registers `dataBinding` with
  `entry: "doubleClick"`, `toolIds: []` and `panelIds: [BINDINGS_PANEL_ID]`, matched by the
  plugin's own metadata envelope on the element (`:177`).
- `plugin-data: packages/data-bundle/manifest.json:55-60` — the manifest declares it.

The manifest still contributes no object type and no tool. With this, six of six content
plugins declare a context with both lists, where the text says "5 of 5":
`plugin-draw: packages/draw-bundle/src/edit-context.ts:57-59`,
`plugin-image: glue/src/activate.ts:692-710`,
`plugin-sheets: packages/sheet-bundle/src/activate.ts:302`, `:309`,
`plugin-web: packages/web-bundle/src/edit-context.ts:88-89`,
`plugin-doc: packages/doc-bundle/src/activate.ts:286-287`.

**2. The context toolbar follows the context.** The first "Still not wired" bullet says it is
driven by the workflow mode only.

- `packages/shell/src/chrome/ContextToolbar.tsx:65-66`, `:76-77` — while a context is active
  its segment replaces the mode's left segment.
- `packages/shell/src/chrome/ContextToolbar.tsx:121-139` — the segment names the context and
  the titles of the tools in its `toolIds`, or says that no canvas tool applies.

No contribution surface was added for this (`:50-64`), so the first item under "What this ADR
does NOT decide" is still undecided.

**3. The Window menu no longer offers every panel in every context.** The second "Still not
wired" bullet says it does.

- `packages/shell/src/PagedShell.tsx:611` — each Window menu item carries
  `when: (state) => panelBelongsHere(state, p.id)`.
- `packages/shell/src/registries/types.ts:85-120` — `panelBelongsHere` is false only when a
  context other than the active one lists the panel in its `panelIds`.
- `packages/shell/src/chrome/MenuBar.tsx:233-238` — the menu bar disables an item whose `when`
  is false.

**4. The tool rail hides, it does not only dim.** The fourth "Still not wired" bullet says
non-context tools are dimmed and the rail is not otherwise reorganised.

- `packages/shell/src/chrome/ToolRail.tsx:507-514` — a rail slot whose face tool is outside the
  active context's `toolIds` is not rendered.
- `packages/shell/src/chrome/applicability.ts:133-138`, `:152` — Select, Direct Select, Hand and
  Zoom are exempt and stay on the rail.
- `packages/shell/src/chrome/ToolRail.tsx:259-261` — picking a tool outside the list commits the
  context first.
- `packages/shell/src/chrome/applicability.ts:59`, `:82`, `:97-113` — one module defines three
  states (`here`, `elsewhere`, `absent`) and two treatments: hidden on a surface that is scanned,
  greyed on the menu bar. `scripts/applicability-guard.mjs` (`package.json:21`) checks which
  chrome surfaces import it.

**5. The contract does not make the declaration required.** Decision 2 says the contract
should make `toolIds` and `panelIds` required. Both are optional in
`plugin-sdk: packages/plugin-api/src/host.ts:166`, `:187`. The editor treats an omitted `toolIds`
as unrestricted and an empty one as "no tool applies"
(`packages/shell/src/state/edit-context-stack.tsx:76-92`,
`packages/shell/src/chrome/ToolRail.tsx:246-252`). Three comments still give the earlier
meaning, that an empty list restricts nothing, and are stale:
`plugin-sdk: packages/plugin-api/src/host.ts:163-165`,
`packages/shell/src/registries/edit-context.ts:72` and
`packages/shell/src/chrome/ToolRail.tsx:243-244`.

**6. Entry has one declared gesture and two host paths.** "What a context is" says entry is
uniform: double-click the frame.

- `plugin-sdk: packages/plugin-api/src/host.ts:154` — `entry` is the one-member union
  `"doubleClick"`; the six manifests that declare an edit context all use it.
- `packages/shell/src/state/use-edit-context-entry.tsx:187` — the only call in the editor that
  enters a context.
- `apps/canvas/src/ui/ViewportCanvas.tsx:1275-1278` — reached from the canvas double-click.
- `apps/canvas/src/ui/ViewportCanvas.tsx:960-973` — also reached from a click with the Type tool
  on an element that a registered object type claims by its metadata; the owning plugin's
  context is entered instead of text editing. This path is limited to object types
  (`packages/shell/src/state/use-edit-context-entry.tsx:148-154`, `:200-207`). It is not an
  `entry` value that a plugin declares. It applies to the object types that plugin-web,
  plugin-sheets and plugin-doc register (`plugin-web: packages/web-bundle/src/activate.ts:132`,
  `plugin-sheets: packages/sheet-bundle/src/activate.ts:281-286`,
  `plugin-doc: packages/doc-bundle/src/activate.ts:252-259`).

The editor's structural copy of the contribution type still accepts `entry: "command"`
(`packages/shell/src/registries/edit-context.ts:70`); the double-click router skips any other
value (`:274`), and that is the only place the editor's source reads the field.
