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

// The header's collaboration seam: one Share button, disabled with an
// honest tooltip until there is a multiplayer backend.
//
// It used to be the kit's whole cluster — three placeholder avatar
// seats, Share, Comments and Notifications — every control inert. Four
// dead controls on the most valuable strip of the screen cost the width
// that pushed the header off a 1440 px display, and taught nothing a
// single Share seam does not. The others return with their backend.

const SOON = "Sharing and collaboration are coming soon";

export function ShareButton() {
  return (
    <button
      type="button"
      disabled
      data-collab-share
      title={SOON}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 30,
        padding: "0 13px",
        borderRadius: "var(--radius-lg)",
        border: "none",
        cursor: "default",
        background: "var(--pg-primary)",
        color: "var(--pg-primary-fg)",
        fontFamily: "var(--font-sans)",
        fontSize: 13,
        fontWeight: 600,
        opacity: 0.45,
        flexShrink: 0,
      }}
    >
      Share
    </button>
  );
}
