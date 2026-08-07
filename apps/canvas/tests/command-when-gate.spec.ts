/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// ADR 024 — `CommandRegistry.invoke` HONOURS `when`.
//
// WHY THIS FILE EXISTS AT ALL. `when` was declared on five contribution
// types with the comment "Disabled commands appear greyed", and read by
// exactly one registry (keybindings). `invoke` went straight to the
// handler, and the command palette's own header claimed that invoking
// through the registry made "visibility predicates apply uniformly".
// Neither was true, and nothing failed — because nothing tested it.
//
// The gate belongs at `invoke` rather than in each surface: palette,
// menu, keybinding, toolbar and a plugin's `runCommand` all funnel
// through here, so gating once is what makes the declaration mean the
// same thing everywhere instead of in whichever caller remembered.

import { expect, test } from "@playwright/test";

import { createCommandRegistry } from "@paged-media/shell";

/** A registry over a mutable fake editor — the shape a `when`
 *  predicate really receives (`PagedEditor`, of which the active edit
 *  context is now one slice). */
function registryOver(state: { editContext: { type: string } | null }) {
  return createCommandRegistry(() => state);
}

test.describe("CommandRegistry — the `when` gate", () => {
  test("AC-CMD-WHEN-1 — a command with no predicate runs @level:happy", async () => {
    // The CONTROL. Without it every assertion below would pass against
    // a registry that simply never invokes anything.
    const state = { editContext: null as { type: string } | null };
    const registry = registryOver(state);
    let ran = 0;
    registry.register({
      id: "t.plain",
      title: "Plain",
      handler: () => {
        ran += 1;
      },
    });
    await registry.invoke("t.plain");
    expect(ran, "an ungated command still runs").toBe(1);
  });

  test("AC-CMD-WHEN-2 — a false predicate stops the handler @level:edge", async () => {
    const state = { editContext: null as { type: string } | null };
    const registry = registryOver(state);
    let ran = 0;
    registry.register({
      id: "t.gated",
      title: "Gated",
      when: (s) => !(s as typeof state).editContext,
      handler: () => {
        ran += 1;
      },
    });

    await registry.invoke("t.gated");
    expect(ran, "applicable → runs").toBe(1);

    // The state the whole ADR turns on: the user stepped inside a
    // plugin content type.
    state.editContext = { type: "rasterImage" };
    await registry.invoke("t.gated");
    expect(ran, "inapplicable → the handler is NOT reached").toBe(1);
  });

  test("AC-CMD-WHEN-3 — a refusal RESOLVES, it does not throw @level:edge", async () => {
    // A command that does not apply right now is an ordinary answer to
    // an ordinary question. Throwing would turn every stale menu click
    // — and a menu can be open across a context change — into an error.
    const state = { editContext: { type: "sheet" } as { type: string } | null };
    const registry = registryOver(state);
    registry.register({
      id: "t.never",
      title: "Never",
      when: () => false,
      handler: () => "should not reach here",
    });
    await expect(registry.invoke("t.never")).resolves.toBeUndefined();
  });

  test("AC-CMD-WHEN-4 — a THROWING predicate disables rather than admits @level:edge", async () => {
    // A predicate that cannot decide has not established the command is
    // safe to offer. Defaulting to enabled is how a broken guard
    // silently becomes a live command.
    const registry = registryOver({ editContext: null });
    let ran = 0;
    registry.register({
      id: "t.boom",
      title: "Boom",
      when: () => {
        throw new Error("predicate blew up");
      },
      handler: () => {
        ran += 1;
      },
    });
    await registry.invoke("t.boom");
    expect(ran, "a throwing guard closes the gate").toBe(0);
  });

  test("AC-CMD-WHEN-5 — observers see nothing, because nothing ran @level:edge", async () => {
    // The Actions panel records invocations for replay. A refused
    // command must not enter that log: replaying it later would run a
    // step the user never performed.
    const state = { editContext: { type: "webFrame" } as { type: string } | null };
    const registry = registryOver(state);
    const seen: string[] = [];
    registry.observe?.((e) => seen.push(e.phase));
    registry.register({
      id: "t.observed",
      title: "Observed",
      when: () => false,
      handler: () => {},
    });
    await registry.invoke("t.observed");
    expect(seen, "no started/settled pair for a refusal").toHaveLength(0);
  });
});
