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

// Cockpit — renders a registered panel contribution into a fixed
// slot. The exact contract dockview's PanelRouter used: resolve the
// id at render time, pass `{ paged, api }`. Plugin/bundle panels
// registered later resolve the same way — the registry stays the
// single source of truth.

import { usePaged } from "../state/paged-editor";
import { useRegistries } from "../state/registries-context";

export function PanelHost({ id }: { id: string }) {
  const paged = usePaged();
  const { panels } = useRegistries();
  const contribution = panels.get(id);
  if (!contribution) {
    return (
      <div className="pg-ui-xs" style={{ padding: 12, opacity: 0.6 }}>
        Panel <code>{id}</code> not registered.
      </div>
    );
  }
  const Component = contribution.component;
  return <Component paged={paged} api={{ id }} />;
}
