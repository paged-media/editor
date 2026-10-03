# ADR 209 — The command is the single action primitive

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `packages/shell/src/registries/command.ts`, the menu and keybinding registries,
  `packages/shell/src/state/commands/`, `packages/shell/src/actions/`

## Context

The shell has several surfaces that start an action: the menu bar, keybindings, the command
palette, the context toolbar, and commands that plugin bundles register. The menu registry
states the rule and its reason: menu items "are commands underneath", and "Reuse beats
parallel surfaces", so keybindings, palette entries and menu items dispatch to the same
command id (`packages/shell/src/registries/menu.ts:28-31`).

Two later needs were met at the same place. A recorder of user actions needed to see every
invocation, including commands registered after it started
(`packages/shell/src/actions/model.ts:30-35`). And the `when` predicate on a command was
declared and "then never read", so a command could declare itself inapplicable and still run
(`packages/shell/src/registries/command.ts:131-139`).

Tool activation and panel show/hide commands were first built from the props the shell
started with. A tool or panel registered later, by a bundle, got none; the plugin runtime
had to work around that (`packages/shell/src/state/commands/registry-derived.ts:20-27`).

## Decision

Every menu item, keybinding and palette entry resolves to a `CommandContribution`, and
`CommandRegistry.invoke` is the only place a command handler is called.

- A menu item and a keybinding each carry a command id; selecting or pressing calls
  `commands.invoke`.
- `invoke` evaluates the command's `when` predicate first. A command that does not apply is
  refused by returning `undefined`; it is not thrown, and observers see nothing.
- `observe()` reports each invocation as `started` before the handler runs and `settled`
  after it. A throwing observer is caught and logged.
- Tool activation commands, their shortcuts, and panel show and hide commands are derived
  from the tool and panel registries and follow them: registering adds them, disposing
  removes them.
- An action, as recorded by the Actions feature, is a list of command invocations. A step
  with no payload replays against whatever is selected at replay time.

## Evidence

- `packages/shell/src/registries/command.ts:23-41`, `:69-77` — "Canonical action primitive",
  the `CommandContribution` shape, and `observe`
- `packages/shell/src/registries/command.ts:123-166` — `invoke`: the gate, the two handler
  calls, the observer events
- `packages/shell/src/registries/menu.ts:38`, `packages/shell/src/registries/keybinding.ts:167-177`
  — a menu item's `command`; a key press ending in `commands.invoke`
- `packages/shell/src/state/commands/registry-derived.ts:46-121` — the derived commands,
  kept in sync through `onChange`
- `packages/shell/src/actions/model.ts:30-35`, `:37-55`, `:67-72` — what an action is, what
  it cannot contain, replay against the current selection
- `packages/shell/src/actions/actions-context.tsx:159-161`, `apps/canvas/src/main.tsx:1383-1417`
  — the two observers: the recorder and the journal
- `plugin-sdk: packages/plugin-sdk/src/host-impl.ts:1314` — a bundle's command, same registry

## Alternatives considered

Building the tool and panel commands from startup props is the earlier state. Routing direct
manipulation through the registry was not done (`packages/shell/src/actions/model.ts:37-55`).

## Consequences

A plugin's command is listed in the palette, gated by `when` and recorded in the same way
as a built-in one.

A command is not the only way to act. The action model names what never reaches the
registry: canvas gestures, typing, panel field edits, selection, camera, guide and handle
drags, and the undo and redo keystrokes. The recorder counts the gestures and direct edits
it could not capture; the comment calls that count a floor
(`packages/shell/src/actions/model.ts:127-136`).

A click on the tool rail calls `setBaseTool` directly and does not go through `invoke`
(`packages/shell/src/chrome/ToolRail.tsx:254-265`). The action model's comment lists tool
activation among the things the recorder sees (`packages/shell/src/actions/model.ts:30-35`);
that holds for the derived command, which the shortcut and the palette use.

The string form of `when` is typed and inert: it always evaluates to false
(`packages/shell/src/registries/types.ts:38-50`, `:69-82`). The interface comment says a
search for `.handler(` gives one hit (`packages/shell/src/registries/command.ts:70-71`);
there are two, both in `invoke`.

## Related

- [ADR 203](203-shell-is-a-registry-host.md) — the registries
- [ADR 208](208-tools-are-data-plus-gesture-handler.md) — gestures, which bypass commands
- [ADR 212](212-one-automation-surface.md) — `editor.runCommand` calls the same `invoke`
- [ADR 024](024-context-sensitivity-is-a-core-concept.md) — the `when` gate
- ADR 025 — the journal, one of the two observers
