# ADR 210 — One token file bridges the brand system to the UI substrate

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `packages/shell/src/styles/`, `packages/shell/tailwind.config.ts`,
  `packages/shell/src/components/ui/`, `packages/shell/src/icons/`, and every panel and
  chrome component that takes its colours from them

## Context

The editor's colours, type and spacing come from a design system kept in a separate brand
repository. The token file's header names that system's `colors_and_type.css` as "the source
of truth" and says a design refresh edits only this one file
(`packages/shell/src/styles/theme.css:20-24`).

The shell's widgets were set up on Tailwind and shadcn-style primitives over Radix on
2026-05-27 (commit `7acb799`). The repository does not record why. The commit message does
say what the token file is for: a bridge to the shadcn variable names, so that one
semantic-token edit propagates through every primitive.

Dark is the default theme. The theme provider gives the reason: dark is the primary surface
for "long design sessions", and light is the toggle for colour and proof judgement
(`packages/shell/src/state/theme-context.tsx:30-32`). A later commit (`46483fe`) records
what literal colours cost: components that still hardcoded light-theme colours were broken
on the dark default.

## Decision

`packages/shell/src/styles/theme.css` is the one file that carries the design tokens;
chrome and panels are to take colour, type and rhythm from it.

- Each theme has two layers. The first is `--paged-*` HSL channels, bridged onto the shadcn
  variable names (`--background`, `--primary`, `--border` and the rest). The second is
  resolved tokens for chrome, status signals, canvas overlays, fonts, spacing and motion
  (`--pg-*`, `--chrome-*`, `--status-*`, `--overlay-*`).
- `:root` holds the light theme and `.dark` the dark one. `ThemeProvider` toggles the `dark`
  class on `<html>`, defaults to dark, and stores the choice under `paged.theme`.
- The shell's Tailwind config maps its colour and font names to those variables; the app's
  config spreads the shell's.
- The widget substrate is ten primitives in `packages/shell/src/components/ui/` over Radix
  packages, with `cmdk`, `class-variance-authority` and `tailwind-merge`.
- Fonts are three `@fontsource` packages imported by `globals.css`. Icons are glyphs in
  three in-repo registries, resolved by name and drawn in `currentColor`.
- Chrome and panels do not hardcode colours. Colours that are document content (a swatch
  chip, an ink) stay literal.

## Evidence

- `packages/shell/src/styles/theme.css:20-36` — the header: source of truth, two layers, dark
  default; `:38-81` — channels and the shadcn bridge; `:160` — the `.dark` block
- `packages/shell/tailwind.config.ts:40-110`, `apps/canvas/tailwind.config.ts:28-33` — font
  and colour names read the variables; the app spreads the shell's config
- `packages/shell/package.json:24-44`, `packages/shell/components.json:1-21` — the Radix,
  `cmdk` and fontsource dependencies; the shadcn configuration
- `packages/shell/src/state/theme-context.tsx:39-49`, `:62-67` — storage key, default, toggle
- `packages/shell/src/styles/globals.css:25-37`, `:110-113` — font imports; the rules that
  re-apply overlay tokens, because an SVG presentation attribute cannot resolve `var()`
- `packages/shell/src/icons/Icon.tsx:26-29` — an icon is a name resolved to an original glyph
- `apps/canvas/tests/styleguide-panels.spec.ts:20-28`, `apps/canvas/tests/theme.spec.ts:20-24`
  — tests of the no-literal-colour rule and of the dark default
- `CLAUDE.md:113-137` — the rules as stated for contributors

## Alternatives considered

A third-party icon set was used and removed: commit `46483fe` replaced the `lucide-react`
icons in the primitives with the in-repo registry and dropped the dependency from the shell.
The same commit replaced Tailwind palette classes in panels with token classes.

## Consequences

A new chrome colour is added as a token in both `:root` and `.dark`, not as a literal. The
token set is a copy: nothing in this repository compares `theme.css` with the brand system's
file.

The no-literal-colour rule is tested by sample: the spec opens six panels, one per panel
archetype, and scans inline styles. `apps/canvas/tests/styleguide-icons.spec.ts` checks the
glyph registries, and `apps/canvas/tests/overlay-tokens.spec.ts` the overlay tokens. Literals
remain as `var()` fallbacks, as in `packages/shell/src/chrome/EditContextBreadcrumb.tsx:75`.

Some text names things that are gone. `packages/shell/src/styles/theme.css:23` and
`CLAUDE.md:126` refer to a dockview theme bridge; there is no `dockview-theme.css` and no
dockview dependency
([ADR 002](002-cockpit-over-dockview.md)). `packages/shell/components.json:20` still says
`"iconLibrary": "lucide"`, which the shell no longer depends on; `apps/devtools/package.json:28`
still lists `lucide-react`.

## Related

- [ADR 002](002-cockpit-over-dockview.md) — the layout substrate that replaced dockview
- [ADR 204](204-declarative-property-panels.md) — the catalog leaves drawn with these tokens
- [ADR 207](207-honest-seams.md) — the disabled, neutral rendering of an unbacked control
