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

// Claude in a film (ADR 224): the reply a film shows is a real one, recorded
// once and replayed in every take, so a take can be repeated and the film's
// disclosure ("Claude replies recorded live and replayed") stays true.
//
//   AI_TAPE=record  the page talks to the dev server's /api/ai proxy (started
//                   with ANTHROPIC_API_KEY in its environment), and every
//                   streamed reply is saved with the time each chunk arrived;
//   otherwise       the saved replies are streamed back at the same pace, in
//                   the same order. A call with no tape left fails the take.
//
// Tapes live in the website's media package: <media>/tapes/<film>/<n>.json.

import type { Page } from "@playwright/test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Tape {
  url: string;
  request: string;
  status: number;
  contentType: string;
  /** ms after the request was sent, and the text that arrived. */
  chunks: Array<{ t: number; text: string }>;
}

export async function aiTape(page: Page, mediaRoot: string, film: string): Promise<"record" | "replay"> {
  // AI_TAPE_DIR points a rehearsal at scratch tapes; a take recorded that way
  // is marked in take.json and must never be published.
  const dir = process.env.AI_TAPE_DIR ?? join(mediaRoot, "tapes", film);
  if (process.env.AI_TAPE === "record") {
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) if (f.endsWith(".json")) throw new Error(`${dir} already has tapes: remove them to record again`);
    let n = 0;
    await page.exposeBinding("__filmTape", (_src, tape: Tape) => {
      writeFileSync(join(dir, `${String(n++).padStart(2, "0")}.json`), `${JSON.stringify(tape, null, 1)}\n`);
    });
    await page.addInitScript(() => {
      const real = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!url.includes("/api/ai/")) return real(input, init);
        const t0 = performance.now();
        const res = await real(input, init);
        const chunks: Array<{ t: number; text: string }> = [];
        const dec = new TextDecoder();
        const [mine, theirs] = res.body!.tee();
        void (async () => {
          const reader = mine.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push({ t: Math.round(performance.now() - t0), text: dec.decode(value, { stream: true }) });
          }
          (window as unknown as { __filmTape(t: unknown): void }).__filmTape({
            url,
            request: typeof init?.body === "string" ? init.body : "",
            status: res.status,
            contentType: res.headers.get("content-type") ?? "text/event-stream",
            chunks,
          });
        })();
        return new Response(theirs, { status: res.status, headers: res.headers });
      };
    });
    return "record";
  }

  if (!existsSync(dir)) throw new Error(`no tapes for "${film}": record them once with AI_TAPE=record`);
  const tapes = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Tape);
  await page.addInitScript((list: Tape[]) => {
    const real = window.fetch.bind(window);
    let next = 0;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("/api/ai/")) return real(input, init);
      const tape = list[next++];
      if (!tape) throw new Error(`film tape: call ${next} to ${url} has no recording`);
      const enc = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(ctrl) {
          const t0 = performance.now();
          for (const c of tape.chunks) {
            const wait = c.t - (performance.now() - t0);
            if (wait > 0) await new Promise((r) => setTimeout(r, wait));
            ctrl.enqueue(enc.encode(c.text));
          }
          ctrl.close();
        },
      });
      return new Response(body, { status: tape.status, headers: { "content-type": tape.contentType } });
    };
  }, tapes);
  return "replay";
}
