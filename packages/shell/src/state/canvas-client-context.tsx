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

import {
  createContext,
  useContext,
  type PropsWithChildren,
} from "react";

// Step 3b: cross-package type-only imports. Resolved at typecheck;
// no runtime dep. Step 3-bindings (future) will extract
// apps/canvas/src/channel/{client,protocol,camera} into a shared
// @paged-media/canvas-bindings package and these paths normalize.
//
// eslint-disable-next-line import/no-relative-parent-imports
import type { CanvasClient } from "@paged-media/client";

const Context = createContext<CanvasClient | null>(null);

/**
 * Owns the single CanvasClient instance. The canvas app creates the
 * client in its entry point and passes it down through this provider
 * — the shell never constructs one, because the worker boot lives
 * outside the shell's responsibility surface.
 */
export function CanvasClientProvider({
  client,
  children,
}: PropsWithChildren<{ client: CanvasClient }>) {
  return <Context.Provider value={client}>{children}</Context.Provider>;
}

/**
 * Returns the active CanvasClient. Throws when called outside the
 * provider — every shell-side hook depends on it, so missing
 * setup is a programmer error worth surfacing loudly.
 */
export function useCanvasClient(): CanvasClient {
  const client = useContext(Context);
  if (!client) {
    throw new Error("useCanvasClient called outside CanvasClientProvider");
  }
  return client;
}

/**
 * Same as `useCanvasClient` but tolerates a missing provider —
 * returns `null` when nothing is wired up yet. Useful for the
 * brief window during mount where the client hasn't been created.
 */
export function useOptionalCanvasClient(): CanvasClient | null {
  return useContext(Context);
}
