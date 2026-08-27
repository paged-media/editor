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

// Ch.15 The Darkroom — p87–p94, the paged.image chapter. The opener
// states the chapter's law (a correction is session state; the loop —
// adjust → export → replaceImageBytes — is what makes it permanent);
// the p88–89 spread is the kernel contact sheet plus the 128-kernel
// roster read from the plugin's own registry; p90 selections, p91
// retouch, p92 paint + raster type, p93 PSD, p94 the loop written out
// with the honesty block. Every module that runs a kernel is
// `needsGpu` — WGSL with no CPU fallback, degraded to stated notes on
// an adapterless lane.

import { annualChapter } from "../chapter";
import { p } from "../names-annual";

import { build as opener } from "../pages/210-darkroom/01-opener";
import { build as contactSheet } from "../pages/210-darkroom/02-contact-sheet";
import { build as selections } from "../pages/210-darkroom/03-selections";
import { build as retouch } from "../pages/210-darkroom/04-retouch";
import { build as paintType } from "../pages/210-darkroom/05-paint-type";
import { build as psd } from "../pages/210-darkroom/06-psd";
import { build as loop } from "../pages/210-darkroom/07-loop";

annualChapter({
  id: "210-darkroom",
  title: "Ch.15 The Darkroom",
  modules: [
    { id: "dk-opener", pages: [p(87)], build: opener },
    {
      id: "dk-contact-sheet",
      pages: [p(88), p(89)],
      build: contactSheet,
      needsGpu: true,
    },
    { id: "dk-selections", pages: [p(90)], build: selections, needsGpu: true },
    { id: "dk-retouch", pages: [p(91)], build: retouch, needsGpu: true },
    { id: "dk-paint-type", pages: [p(92)], build: paintType, needsGpu: true },
    { id: "dk-psd", pages: [p(93)], build: psd, needsGpu: true },
    { id: "dk-loop", pages: [p(94)], build: loop, needsGpu: true },
  ],
});
