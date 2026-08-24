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
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// ONE declaration of the `__canvas` test handle.
//
// Five spec files each declared `Window.__canvas` in their own
// `declare global` block, each with a different narrow shape — one saw
// `{ready, mode, setMode}`, another `{theme, setTheme}`, a third
// `{registries}`. TypeScript MERGES global interface declarations, so
// those are not five private types: they are five conflicting
// declarations of one property. The first wins, the rest raise TS2717,
// and every use of a member the winner lacks raises TS2339.
//
// That produced nine of the thirteen non-trivial errors in the test
// tree, all from one cause, and none of them from a real defect — which
// is exactly why the tree had never been type-checked: the errors looked
// numerous and turned out to be a single missing file.
//
// WHY AN INDEX SIGNATURE. The real `__canvas` surface is large and
// grows; typing all of it here would be a second, drifting copy of the
// app's own types (the same trap `plugin-contract-is-a-peer` records —
// a second copy of a contract is a different type). The named members
// are the ones specs reach through the GLOBAL, which must typecheck;
// everything else is reached through an explicit local cast
// (`globalThis as unknown as {...}`), the convention most specs already
// use, and those casts are unaffected by what is written here.

export {};

declare global {
  interface PagedTestCanvas {
    ready: boolean;
    mode: string;
    setMode: (m: string) => void;
    theme: "dark" | "light";
    setTheme: (t: "dark" | "light") => void;
    registries: {
      panels: { register(c: unknown): { dispose(): void } };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }

  interface Window {
    __canvas: PagedTestCanvas;
    /** Set by the panel-rail door spec so its teardown can reach the
     *  handle it registered. */
    __railDoorDispose?: () => void;
  }
}
