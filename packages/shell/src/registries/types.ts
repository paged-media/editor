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

// Cross-registry shared types. Kept in their own module so each
// registry file can be read top-down without forward references.

/**
 * Returned by every `register` call so callers can clean up at
 * unmount time. Stable shape — the matching `dispose()` is the
 * only API surface this exposes.
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Initial dock edge for a panel. Users may rearrange after mount;
 * this is initial-placement-only.
 */
export type DockEdge = "left" | "right" | "top" | "bottom" | "center";

/**
 * Predicate evaluated against application state to decide whether
 * a contribution is visible / enabled.
 *
 * The string form (e.g. `"selection.hasType('TextFrame')"`) is the
 * future bundle-friendly DSL; today only the function form is
 * implemented. The string variant resolves to the always-false
 * predicate so contributions that use the DSL are inert until the
 * evaluator lands.
 */
export type VisibilityPredicate =
  | string
  | ((state: unknown) => boolean);
