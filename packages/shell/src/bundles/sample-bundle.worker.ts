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

// Canonical first-party bundle for smoke-testing the loader. Runs
// entirely inside a Web Worker. Registers one command + one
// keybinding + one menu item; exposed via `sampleBundleManifest()`
// for the shell's test harnesses.
//
// Pattern that every Worker-side bundle will follow:
//   1. Provide a `paged` API surface (commands / keybindings /
//      menus) that posts registration messages.
//   2. Track command handlers locally so the `invoke` message can
//      dispatch them.
//   3. On `activate`, register contributions, then signal `ready`.
//   4. On `deactivate`, drop the handlers.

import type { BundleToShell, ShellToBundle } from "./protocol";

// Worker globals — `self` is the DedicatedWorkerGlobalScope.
// Cast once at the boundary so the rest of the file is typed.
const worker = self as unknown as DedicatedWorkerGlobalScope;

const handlers = new Map<
  string,
  (payload?: unknown) => unknown | Promise<unknown>
>();

function post(msg: BundleToShell) {
  worker.postMessage(msg);
}

const paged = {
  commands: {
    register(c: {
      id: string;
      title: string;
      category?: string;
      handler: (payload?: unknown) => unknown | Promise<unknown>;
    }) {
      handlers.set(c.id, c.handler);
      post({
        kind: "registerCommand",
        id: c.id,
        title: c.title,
        category: c.category,
      });
    },
  },
  keybindings: {
    register(c: { key: string; command: string }) {
      post({ kind: "registerKeybinding", key: c.key, commandId: c.command });
    },
  },
  menus: {
    register(c: {
      path: string;
      command: string;
      order?: number;
      group?: string;
    }) {
      post({
        kind: "registerMenuItem",
        path: c.path,
        commandId: c.command,
        order: c.order,
        group: c.group,
      });
    },
  },
  log(level: "info" | "warn" | "error", message: string) {
    post({ kind: "log", level, message });
  },
};

function activate(): void {
  paged.commands.register({
    id: "paged.sample.hello",
    title: "Sample: Hello from Bundle",
    category: "Sample",
    handler: () => {
      paged.log("info", "sample bundle handler ran");
      return { ok: true, message: "Hello from the sample bundle" };
    },
  });
  paged.keybindings.register({
    key: "cmd+shift+h",
    command: "paged.sample.hello",
  });
  paged.menus.register({
    path: "Tools/Sample bundle hello",
    command: "paged.sample.hello",
    order: 10,
  });
}

worker.onmessage = async (event: MessageEvent) => {
  const msg = event.data as ShellToBundle;
  switch (msg.kind) {
    case "activate": {
      try {
        activate();
        post({ kind: "ready" });
      } catch (err) {
        post({
          kind: "log",
          level: "error",
          message: `activate threw: ${String((err as Error).message ?? err)}`,
        });
      }
      break;
    }
    case "invoke": {
      const handler = handlers.get(msg.commandId);
      if (!handler) {
        post({
          kind: "invokeResult",
          requestId: msg.requestId,
          ok: false,
          error: `unknown command: ${msg.commandId}`,
        });
        break;
      }
      try {
        const value = await handler(msg.payload);
        post({
          kind: "invokeResult",
          requestId: msg.requestId,
          ok: true,
          value,
        });
      } catch (err) {
        post({
          kind: "invokeResult",
          requestId: msg.requestId,
          ok: false,
          error: String((err as Error).message ?? err),
        });
      }
      break;
    }
    case "deactivate": {
      handlers.clear();
      break;
    }
  }
};
