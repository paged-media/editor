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

// The faces the editor SHIPS, registered by name.
//
// The editor bundles Inter and hands its bytes to every load as the
// default face — the one an unresolved family falls back to. The engine
// cannot tell those bytes ARE Inter: a fallback carries no family name.
// So a document that names Inter (every document the editor makes) was
// reported as substituting it — `FontSummary.isMissing`, the Missing
// fonts count, the substitution highlight — for a face that is right
// there. Registering the bundled face under its family before a load
// makes the engine resolve it as what it is.
//
// A family the session registered itself (a test's corpus face, a
// user's font) is left alone: the registry is a list, and a second
// "Inter" with other bytes would compete with the one that was asked for.

import type { CanvasClient, FontScope } from "@paged-media/client";

/** The family `fetchDefaultFont` serves (`/fonts/Inter.ttf`). */
export const BUNDLED_FAMILY = "Inter";

/**
 * Tracks which document-scope families this client registered, so the
 * bundled face is added only where nobody registered that family yet.
 * Wire `noteRegistered` / `noteCleared` into the client's registerFont
 * and clearFontRegistry, and call `ensure` before every load.
 */
export class BundledFaces {
  private readonly registered = new Set<string>();

  constructor(
    private readonly fetchFont: () => Promise<Uint8Array | undefined>,
  ) {}

  noteRegistered(family: string, scope?: FontScope): void {
    if (scope === "sceneLayer") return;
    this.registered.add(family.toLowerCase());
  }

  noteCleared(scope?: FontScope): void {
    if (scope === "sceneLayer") return;
    this.registered.clear();
  }

  async ensure(client: CanvasClient): Promise<void> {
    if (this.registered.has(BUNDLED_FAMILY.toLowerCase())) return;
    const bytes = await this.fetchFont();
    // No bytes: the load still gets no default either, and warns.
    if (!bytes) return;
    await client.registerFont(BUNDLED_FAMILY, bytes, null);
  }
}
