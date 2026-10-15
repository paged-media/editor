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

// Journey: the canvas worker stays alive while the GPU path waits on the
// browser.
//
// The worker serialises its messages, but its render loop, gesture drain and
// debounced resolver (`runResolveJson`) call the engine from timers. Through
// canvas-wasm 0.71.11, `initGpu` and `renderPageVelloPng` were async wasm
// methods that held the engine object borrowed across their awaits, so any
// of those timers landing inside the wait threw "recursive use of an object
// detected which would lead to unsafe aliasing in rust" — uncaught in the
// worker scope, which the client treats as fatal. On an idle machine the
// waits are milliseconds and the timers mostly miss them; on a loaded one
// they do not. Each test below holds a wait open on purpose.
//
// Runs only in the `journeys-gpu` project (real Chrome, WebGPU over Metal).

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { Designer } from "../driver/designer";

type CanvasHandle = {
  gpuActive?: boolean | null;
  handle: { pageIds: string[] } | null;
  client: {
    camera: {
      read(): { scale: number; tx: number; ty: number };
      write(cam: { scale: number; tx: number; ty: number }): void;
    };
    requestVelloPng(pageId: string, dpi: number): Promise<Uint8Array | null>;
    exportPaged(): Promise<Uint8Array>;
  };
};

/** Collect every sign of a dead worker the page can see. */
function watchWorkerFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("console", (m) => {
    if (/canvas worker failed|recursive use of an object/.test(m.text())) {
      failures.push(m.text());
    }
  });
  page.on("pageerror", (e) => failures.push(String(e)));
  return failures;
}

async function gpuActive(page: Page): Promise<boolean> {
  return page
    .waitForFunction(
      () => {
        const v = (globalThis as unknown as { __canvas?: CanvasHandle }).__canvas
          ?.gpuActive;
        return v === true || v === false ? { v } : null;
      },
      null,
      { timeout: 20_000 },
    )
    .then(async (h) => ((await h.jsonValue()) as { v: boolean }).v);
}

/** Prepend `shim` to the canvas worker module (Vite serves it as
 *  `/src/worker/worker.ts?worker_file…`). The returned probe reports
 *  whether the shimmed module was served. */
async function shimWorker(context: BrowserContext, shim: string): Promise<() => boolean> {
  let served = false;
  await context.route(/\/src\/worker\/worker\.ts\?worker_file/, async (route) => {
    const response = await route.fetch();
    served = true;
    await route.fulfill({ response, body: shim + (await response.text()) });
  });
  return () => served;
}

test.describe("journey · GPU re-entrancy", () => {
  test("the worker survives its resolver timer while initGpu waits on the adapter @feat:the-renderer.gpu-backend @level:edge", async ({
    page,
    context,
  }) => {
    // Every load registers the default italic face; the `fontRegistered`
    // reply arms the worker's 300 ms resolver, and only then does the
    // viewport mount and run `initGpu`. Slowing the adapter request past
    // 300 ms puts the timer inside the wait every time.
    const served = await shimWorker(
      context,
      `{
  const gpu = self.navigator.gpu;
  if (gpu) {
    const request = gpu.requestAdapter.bind(gpu);
    gpu.requestAdapter = (options) =>
      new Promise((resolve) => setTimeout(resolve, 1500)).then(() => request(options));
  }
}
`,
    );
    const failures = watchWorkerFailures(page);

    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const active = await gpuActive(page);
    const exported = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasHandle }).__canvas;
      return (await c.client.exportPaged()).length;
    });

    expect(served(), "the slow-adapter shim reached the worker").toBe(true);
    expect(failures, "no worker failure while initGpu waited").toEqual([]);
    expect(exported, "the worker still answers").toBeGreaterThan(0);
    expect(active, "the WebGPU backend engaged once the adapter answered").toBe(true);
  });

  test("a GPU readback leaves the render loop free to present @feat:the-renderer.gpu-backend @level:edge", async ({
    page,
  }) => {
    const failures = watchWorkerFailures(page);

    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    expect(await gpuActive(page), "this lane needs the WebGPU backend").toBe(true);

    // Keep the camera moving so every render tick presents, and read pages
    // back through the GPU meanwhile: each readback waits on `mapAsync`.
    const out = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasHandle }).__canvas;
      const pageId = c.handle!.pageIds[0];
      const base = c.client.camera.read();
      let n = 0;
      const pan = setInterval(() => {
        n++;
        c.client.camera.write({ ...base, tx: base.tx + (n % 7), ty: base.ty + (n % 5) });
      }, 2);
      const pngs: Array<number[] | null> = [];
      try {
        for (let i = 0; i < 10; i++) {
          const batch = await Promise.all(
            [150, 300].map((dpi) => c.client.requestVelloPng(pageId, dpi)),
          );
          for (const png of batch) pngs.push(png ? Array.from(png.slice(0, 4)) : null);
        }
      } finally {
        clearInterval(pan);
      }
      return { pngs, exported: (await c.client.exportPaged()).length };
    });

    expect(failures, "no worker failure while readbacks waited").toEqual([]);
    expect(out.exported, "the worker still answers").toBeGreaterThan(0);
    for (const head of out.pngs) {
      expect(head, "every readback returned a PNG").toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });
});
