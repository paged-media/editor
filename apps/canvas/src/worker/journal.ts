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


// The render worker's journal buffer (ADR 025 §2).
//
// A SECOND ring, in a second realm. The worker cannot share the shell's buffer
// — different thread, different module instance — so it keeps its own and the
// main thread DRAINS it on demand.
//
// Drain rather than stream, deliberately. Streaming every entry across a
// structured-clone boundary would put the instrumentation on the hot side of
// exactly the path it is meant to observe. Draining moves the cost to the
// moment somebody actually looks (panel open, export) and leaves the render
// loop paying one array push.
//
// The whole worker->main journal path is a TS-ONLY side-channel, invented the
// same way `velloPngReply` and the frame tap already are: it never touches
// `channel.rs`, so it costs zero engine wire surface and no protocol bump.
//
// NOTE the imports come from `@paged-media/client/journal`, not the barrel:
// the worker may not import the shell (eslint zone (a)), and the barrel would
// drag the SAB primitives in behind one function.

import { JournalBuffer } from "@paged-media/client/journal";

/** 512 entries: the worker's traffic is machine-paced and aggregated, so it
 *  needs far less room than the shell's user-paced 2048. */
export const workerJournal = new JournalBuffer({
  origin: "worker",
  capacity: 512,
});

/** Entries lost to the ring since the last drain, so the main thread can fold
 *  them into the uncaptured ledger rather than silently under-reporting. */
export function drainWorkerJournal(): {
  entries: ReturnType<JournalBuffer["entries"]>;
  ledger: ReturnType<JournalBuffer["getLedger"]>;
  epochWallMs: number;
} {
  const ledger = { ...workerJournal.getLedger() };
  return {
    // `take()` flushes pending aggregates first, so an in-flight window is not
    // silently missing from the drain.
    entries: workerJournal.take(),
    ledger,
    epochWallMs: workerJournal.epochWallMs,
  };
}
