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

// The single workflow mode a solo profile registers.
//
// WHY A MODE AT ALL, when solo has nothing to switch between: the
// cockpit reads its FIXED LAYOUT off the active mode's `slots` — the
// 262px left panel and the right dock's seeded tabs
// (`CockpitLayout.tsx`, `cockpit-state-context.tsx`). Register no mode
// and `slots` is undefined, which renders no left column and a right
// dock reading "No panel open." A mode is how you say where the panels
// go, not only how you offer a choice.
//
// WHY THE ID IS `"design"`. `WorkflowMode` is a CLOSED union of six
// string literals, duplicated at runtime in `ALL_MODES` for localStorage
// validation, and `DocTitleBar` suppresses the mode badge for exactly
// that literal. Reusing it keeps the union closed, keeps persistence
// valid, and keeps a "Design" badge from appearing in an app that has no
// modes. The cost is that the id is ALSO a storage key — solved by
// `setChromeStorageScope`, without which solo and the ordinary editor
// would overwrite each other's dock state.
//
// The switcher does not render: `PagedShell` gates it on
// `modes.length > 1`, because a control offering one choice can do
// nothing.

import type { ModeContribution } from "@paged-media/shell";

import type { SoloProfile } from "./profiles";

/** The one mode a solo profile registers. */
export function soloMode(profile: SoloProfile): ModeContribution {
  return {
    id: "design",
    title: profile.title,
    icon: "panel-canvas",
    order: 10,
    blurb: profile.blurb,
    slots: profile.slots,
    // No `toolbarLeft`: the six host toolbars are DTP-shaped (page
    // setup, preflight, export). The ContextToolbar falls back to the
    // blurb, and to the edit-context segment when one is active, which
    // is the whole of what solo needs from that bar.
    paletteSuggestions: [...profile.paletteSuggestions],
  };
}
