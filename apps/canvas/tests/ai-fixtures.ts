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

// Shared by the Claude specs (ADR 221): a fixture document, a canned
// "run this script, then summarise" conversation as the proxy's SSE, and
// a read of the frame the script changes.

import type { Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;
export const TEXT_FRAME_ID = "ua365e1";

export const SCRIPT = `if (!paged.set("textFrame:${TEXT_FRAME_ID}", "frameOpacity", 40)) throw new Error("refused");
console.log("opacity set");`;

function sse(events: Array<[string, unknown]>): string {
  return events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
}

const start = (id: string) => ["message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model: "claude-haiku-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }] as [string, unknown];
const end = (stop: string) => [
  ["message_delta", { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } }],
  ["message_stop", { type: "message_stop" }],
] as Array<[string, unknown]>;

/** A model turn that calls run_script with `source`. */
export function toolTurn(source: string, id = "msg_tool"): string {
  return sse([
    start(id),
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: `toolu_${id}`, name: "run_script", input: {} } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ source }) } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ...end("tool_use"),
  ]);
}

/** A closing model turn that says `text`. */
export function textTurn(text: string, id = "msg_text"): string {
  return sse([
    start(id),
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ...end("end_turn"),
  ]);
}

export const TOOL_TURN = toolTurn(SCRIPT, "msg_1");
export const SUMMARY_TURN = textTurn("Set the frame's opacity to 40%.", "msg_2");

export async function opacity(page: Page): Promise<unknown> {
  return page.evaluate(async (id) => {
    const c = (globalThis as unknown as { __canvas: { client: { elementProperties(id: { kind: string; id: string }): Promise<{ entries: Array<{ path: string; value: { value: unknown } }> } | null> } } }).__canvas;
    const props = await c.client.elementProperties({ kind: "textFrame", id });
    return props?.entries.find((e) => e.path === "frameOpacity")?.value.value;
  }, TEXT_FRAME_ID);
}

