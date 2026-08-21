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

// The reader half of `build-min-idml.ts` — a pure-Node ZIP reader for
// specs that need to look INSIDE an exported package.
//
// Deliberately dependency-free. `zlib` is built in, this file is ~90
// lines, and the alternative was adding a zip library to the editor's
// dependency tree for test assertions alone. It reads the central
// directory rather than scanning local headers, so it sees the same
// entry list a real unzip does, and it reports each entry's
// compression method — which matters here, because a `.paged` (and
// any IDML) is only a valid UCF package if `mimetype` is the first
// entry AND is STORED. A reader that silently inflated everything
// could not tell you that.
//
// Scope: the two methods IDML/`.paged` actually use — 0 (store) and 8
// (deflate). Anything else throws by name instead of returning wrong
// bytes. No zip64, no encryption; if a paged container ever needs
// them, this fails loudly rather than truncating.

import { inflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  /** 0 = stored, 8 = deflated. */
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  /** Byte offset of the local header — the entry ORDER in the file. */
  localHeaderOffset: number;
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

function findEocd(buf: Buffer): number {
  // The EOCD is at the end, after a comment of up to 64 KiB.
  const min = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error("not a zip: no end-of-central-directory record");
}

/** Every entry, in central-directory order. */
export function zipEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(p) !== CEN_SIG) {
      throw new Error(`corrupt central directory at entry ${i}`);
    }
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    out.push({
      name: buf.subarray(p + 46, p + 46 + nameLen).toString("utf8"),
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      uncompressedSize: buf.readUInt32LE(p + 24),
      localHeaderOffset: buf.readUInt32LE(p + 42),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export function zipEntryNames(buf: Buffer): string[] {
  return zipEntries(buf).map((e) => e.name);
}

/** Read one entry's bytes, or null when the name is not present. */
export function readZipEntry(buf: Buffer, name: string): Buffer | null {
  const entry = zipEntries(buf).find((e) => e.name === name);
  if (!entry) return null;
  const lh = entry.localHeaderOffset;
  // The local header repeats the name/extra lengths, and its extra
  // field can differ in length from the central one — so the payload
  // offset must come from the LOCAL header, not the central record.
  const nameLen = buf.readUInt16LE(lh + 26);
  const extraLen = buf.readUInt16LE(lh + 28);
  const start = lh + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return inflateRawSync(raw);
  throw new Error(
    `entry ${name} uses unsupported compression method ${entry.method}`,
  );
}

export function readZipText(buf: Buffer, name: string): string | null {
  const bytes = readZipEntry(buf, name);
  return bytes === null ? null : bytes.toString("utf8");
}

/**
 * The UCF check Adobe's reader performs: `mimetype` must be the first
 * entry in the archive and must be STORED, never deflated. A `.paged`
 * container has to keep passing this — it is what lets one artifact
 * be both a native paged document and a valid IDML package.
 */
export function assertUcfMimetypeFirst(buf: Buffer, expected: string): void {
  const entries = zipEntries(buf);
  const first = entries
    .slice()
    .sort((a, b) => a.localHeaderOffset - b.localHeaderOffset)[0];
  if (!first || first.name !== "mimetype") {
    throw new Error(
      `UCF: first entry is ${first?.name ?? "(none)"}, expected mimetype`,
    );
  }
  if (first.method !== 0) {
    throw new Error(`UCF: mimetype is compressed (method ${first.method})`);
  }
  const text = readZipEntry(buf, "mimetype")?.toString("utf8");
  if (text !== expected) {
    throw new Error(`UCF: mimetype is ${JSON.stringify(text)}, expected ${expected}`);
  }
}
