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

// createLocalBindingsSurface — an EDITOR-SIDE `BindingsSurface` for
// schema panels the host app owns itself (demo/consumer panels, specs).
// Plugin bundles get theirs from the plugin-sdk host adapter; this is
// the same tiny publish/get/onDidChange store without a bundle behind
// it, so the editor can drive `SchemaPanelRenderer` (gates, the B-01
// list widget's `selectionBinding` publish-back) first-party.

import type { BindingsSurface } from "./schema-panel-types";

export function createLocalBindingsSurface(): BindingsSurface {
  const values = new Map<string, unknown>();
  const listeners = new Set<(name: string) => void>();
  const notify = (name: string) => {
    // Copy before iterating — a listener may dispose itself mid-walk.
    for (const l of [...listeners]) l(name);
  };
  return {
    publish(name, value) {
      values.set(name, value);
      notify(name);
    },
    get(name) {
      return values.get(name);
    },
    delete(name) {
      values.delete(name);
      notify(name);
    },
    onDidChange(listener) {
      listeners.add(listener);
      return {
        dispose() {
          listeners.delete(listener);
        },
      };
    },
  };
}
