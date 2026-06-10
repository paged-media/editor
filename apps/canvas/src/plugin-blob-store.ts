// K-4 / S-08 — the editor's OPFS-backed `BlobStore` that backs
// `host.blob`. Persistent per-plugin BINARY storage for payloads too
// large for the KV `host.storage` (paged.sheet's multi-MB workbook bytes,
// image decode spill). The SDK adapter owns namespacing (it passes the
// plugin id), the capability gate, and the quota — this only does scoped
// IO under an OPFS subdirectory per plugin (`plugin-blobs/<id>/<key>`).
//
// OPFS lives in the ORIGIN, persists across reloads, and is main-thread
// writable in the editor's target (Chromium). When OPFS is unavailable
// (older browser / denied), every method degrades to the empty answer and
// `supports("storage.blob@1")` still reads true (a backend IS injected) —
// the bundle's own try/catch handles a failed persist honestly.

import type { BlobStore } from "@paged-media/plugin-sdk";

/** Keys are opaque strings; encode them into safe single-segment file
 *  names (no path separators reach OPFS). */
const fileName = (key: string): string => encodeURIComponent(key);
const keyName = (file: string): string => decodeURIComponent(file);

type DirHandle = FileSystemDirectoryHandle & {
  // entries() is in the OPFS spec but not always in the TS DOM lib.
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

async function pluginDir(
  pluginId: string,
  create: boolean,
): Promise<DirHandle | null> {
  const storage = navigator.storage as StorageManager & {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  };
  if (!storage?.getDirectory) return null;
  try {
    const root = await storage.getDirectory();
    const blobs = await root.getDirectoryHandle("plugin-blobs", { create });
    return (await blobs.getDirectoryHandle(pluginId, { create })) as DirHandle;
  } catch {
    // create:false on a not-yet-created tree, or OPFS access denied.
    return null;
  }
}

export function createEditorBlobStore(): BlobStore {
  return {
    async write(pluginId, key, bytes) {
      const dir = await pluginDir(pluginId, true);
      if (!dir) throw new Error("OPFS unavailable — cannot persist blob");
      const fh = await dir.getFileHandle(fileName(key), { create: true });
      const writable = await fh.createWritable();
      try {
        // Copy into a fresh buffer — createWritable may detach the input.
        await writable.write(bytes.slice());
      } finally {
        await writable.close();
      }
    },

    async read(pluginId, key) {
      const dir = await pluginDir(pluginId, false);
      if (!dir) return null;
      try {
        const fh = await dir.getFileHandle(fileName(key));
        const file = await fh.getFile();
        return new Uint8Array(await file.arrayBuffer());
      } catch {
        return null; // absent
      }
    },

    async delete(pluginId, key) {
      const dir = await pluginDir(pluginId, false);
      if (!dir) return;
      try {
        await dir.removeEntry(fileName(key));
      } catch {
        /* already absent */
      }
    },

    async keys(pluginId) {
      const dir = await pluginDir(pluginId, false);
      if (!dir) return [];
      const out: string[] = [];
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === "file") out.push(keyName(name));
      }
      return out;
    },

    async used(pluginId) {
      const dir = await pluginDir(pluginId, false);
      if (!dir) return 0;
      let total = 0;
      for await (const [, handle] of dir.entries()) {
        if (handle.kind === "file") {
          const file = await (handle as FileSystemFileHandle).getFile();
          total += file.size;
        }
      }
      return total;
    },
  };
}
