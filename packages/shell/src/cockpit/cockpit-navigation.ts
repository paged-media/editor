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

// Cockpit — filmstrip/document-map navigation hand-off. The camera
// fit math (page layout + fit) lives app-side; the app registers a
// navigator from inside the provider tree (CanvasAppIntegration) and
// the shell's chrome calls it. Same module-level pattern as the
// export-dialog notifier.

export type PageNavigator = (pageIndices: number[]) => void;

let navigator: PageNavigator | null = null;

export function setCockpitPageNavigator(fn: PageNavigator | null): void {
  navigator = fn;
}

export function navigateToPages(pageIndices: number[]): void {
  navigator?.(pageIndices);
}
