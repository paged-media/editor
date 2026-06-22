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

import { useEffect, useState } from "react";
import { InspectorClient } from "./inspector";

interface Props {
  client: InspectorClient;
  pageIndex: number;
  epoch: number;
}

export function RenderPane(props: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setError(null);
      const png = props.client.renderPage(props.pageIndex, 144);
      // wasm-bindgen returns a Uint8Array backed by `ArrayBufferLike`;
      // TS strict can't prove it isn't a SharedArrayBuffer. Cast via
      // BlobPart — the runtime value is always a plain ArrayBuffer.
      const blob = new Blob([png as unknown as BlobPart], { type: "image/png" });
      const next = URL.createObjectURL(blob);
      setUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return next;
      });
      return () => {
        URL.revokeObjectURL(next);
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    return undefined;
  }, [props.client, props.pageIndex, props.epoch]);

  return (
    <div className="render-pane">
      {error ? (
        <div className="error">{error}</div>
      ) : url ? (
        <img src={url} alt={`Page ${props.pageIndex + 1}`} />
      ) : (
        <div className="empty">Rendering…</div>
      )}
    </div>
  );
}
