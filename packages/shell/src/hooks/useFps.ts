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

// FPS counter, sampled on the main thread.
//
// Even though the worker owns rendering, the main thread's rAF
// fires once per compositor frame the browser presents. That's the
// number a user perceives as "frame rate". The worker may be busy
// (long Vello scene build) without main thread knowing — so this
// metric is best read as "main-thread responsiveness", not
// strictly worker render rate. Good enough for a HUD.

import { useEffect, useState } from "react";

const WINDOW_SAMPLES = 60;

export function useFps(): number {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let deltas: number[] = [];

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (dt > 0 && dt < 200) {
        // Drop pathological deltas (tab hidden, long GC pause)
        // so they don't poison the rolling average.
        deltas.push(dt);
        if (deltas.length > WINDOW_SAMPLES) deltas.shift();
      }
      // Throttle React updates to ~4 Hz so the HUD doesn't
      // re-render every frame.
      if (deltas.length > 0 && (deltas.length % 15 === 0 || fps === 0)) {
        const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        setFps(Math.round(1000 / avg));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return fps;
}
