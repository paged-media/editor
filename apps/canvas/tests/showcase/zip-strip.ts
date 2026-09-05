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

// A dependency-free ZIP entry filter, for ONE purpose: reducing an
// `.idml` the exporter wrote to the entries InDesign reads.
//
// The exporter carries every source-archive entry through, so an
// `.idml` written from a loaded `.paged` still holds the container's
// native model part (`paged/core/model/document.pgm`) and the plugin
// parts — and the engine's own load sniff prefers that native part over
// the IDML parts. Rendering such a twin proves nothing about IDML: the
// parity gate compared the model with itself for a whole campaign and
// reported zero differing pages while the IDML parts carried no table,
// no picture, no section and no guide. Stripping the twin to its IDML
// entries before the load is what makes the comparison about IDML.
//
// Entries are copied verbatim (local header, data, any data descriptor)
// and the central directory is rebuilt with the new offsets; nothing is
// re-compressed, so a stripped package is exactly the exporter's bytes
// minus the dropped entries. ZIP64 is not handled — an annual is far
// below the 4 GiB / 65535-entry line, and the parser throws rather than
// guessing if it ever meets one.

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_DESCRIPTOR = 0x08074b50;
const FLAG_DATA_DESCRIPTOR = 0x0008;

/** The entry prefixes and names that make up an IDML package. */
export const IDML_ENTRY_PREFIXES = [
  "mimetype",
  "designmap.xml",
  "META-INF/",
  "Resources/",
  "XML/",
  "MasterSpreads/",
  "Spreads/",
  "Stories/",
] as const;

export function isIdmlEntry(name: string): boolean {
  return IDML_ENTRY_PREFIXES.some((p) =>
    p.endsWith("/") ? name.startsWith(p) : name === p,
  );
}

interface CentralEntry {
  /** The central-directory record, verbatim. */
  record: Buffer;
  name: string;
  localOffset: number;
  compressedSize: number;
  flags: number;
}

function findEocd(buf: Buffer): number {
  // The EOCD is at least 22 bytes and may carry a comment of up to 64K.
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  throw new Error("zip-strip: no end-of-central-directory record");
}

function readCentralDirectory(buf: Buffer): CentralEntry[] {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error("zip-strip: ZIP64 archives are not supported");
  }
  const entries: CentralEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new Error(`zip-strip: bad central-directory signature at ${p}`);
    }
    const flags = buf.readUInt16LE(p + 8);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const size = 46 + nameLen + extraLen + commentLen;
    entries.push({
      record: buf.subarray(p, p + size),
      name,
      localOffset,
      compressedSize,
      flags,
    });
    p += size;
  }
  return entries;
}

/** The whole local record of one entry: header, name, extra, data and
 *  — when the writer streamed sizes — the trailing data descriptor. */
function localRecord(buf: Buffer, e: CentralEntry): Buffer {
  const p = e.localOffset;
  if (buf.readUInt32LE(p) !== SIG_LOCAL) {
    throw new Error(`zip-strip: bad local-header signature for ${e.name}`);
  }
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  let end = p + 30 + nameLen + extraLen + e.compressedSize;
  if (e.flags & FLAG_DATA_DESCRIPTOR) {
    // 12 bytes, or 16 when the optional signature is present.
    end += buf.readUInt32LE(end) === SIG_DESCRIPTOR ? 16 : 12;
  }
  return buf.subarray(p, end);
}

/**
 * The archive reduced to the entries `keep` accepts — by default the
 * IDML package entries — with everything else dropped.
 */
export function stripZip(
  buf: Buffer,
  keep: (name: string) => boolean = isIdmlEntry,
): Buffer {
  const kept = readCentralDirectory(buf).filter((e) => keep(e.name));
  const locals: Buffer[] = [];
  const records: Buffer[] = [];
  let offset = 0;
  for (const e of kept) {
    const local = localRecord(buf, e);
    const record = Buffer.from(e.record);
    record.writeUInt32LE(offset, 42);
    locals.push(local);
    records.push(record);
    offset += local.length;
  }
  const cdSize = records.reduce((n, r) => n + r.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(kept.length, 8);
  eocd.writeUInt16LE(kept.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...records, eocd]);
}
