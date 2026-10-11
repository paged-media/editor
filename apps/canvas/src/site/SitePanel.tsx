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

// The Site panel (`?site=1`, website ADR 855) — paged.media's navigation and
// product facts, docked in the real editor next to the page the visitor is
// reading. Everything here is property rows and actions; the reading is the
// document on the canvas. Data arrives from the parent page (`paged:site`).

import type { PanelProps } from "@paged-media/shell";
import { CockpitBtn, CockpitRow, CockpitSection, CockpitValue, StatusPill } from "@paged-media/shell";
import { siteNavigate, useSiteState } from "./site-state";

const PLAYGROUND = "https://play.paged.media";

export function SitePanel(_props: PanelProps) {
  const { manifest, route, page, pageCount, loading } = useSiteState();
  const current = route ? manifest?.routes[route] : undefined;
  const product = current?.product ?? null;
  const groups = new Map<string, Array<{ route: string; title: string }>>();
  for (const n of manifest?.nav ?? []) {
    const g = n.group ?? "Site";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(n);
  }

  return (
    <div style={{ padding: "0 14px 14px", fontFamily: "var(--font-sans)" }} data-testid="site-panel">
      <CockpitSection title="You are in the editor">
        <div style={{ fontSize: 12.5, color: "var(--pg-muted-fg)", lineHeight: 1.5, marginBottom: 8 }}>
          This page of paged.media is a real document, open in the real editor. Select, edit, undo — nothing is
          saved or sent.
        </div>
        <CockpitRow label="page">
          <CockpitValue>
            {current ? `${current.title} · ${page + 1} of ${pageCount}` : loading ? "opening…" : "—"}
          </CockpitValue>
        </CockpitRow>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <CockpitBtn sm onClick={() => siteNavigate({ read: true })} testId="site-read">
            Read as web page
          </CockpitBtn>
        </div>
      </CockpitSection>

      {product && (
        <CockpitSection title={product.name}>
          <CockpitRow label="role">
            <CockpitValue>{product.role}</CockpitValue>
          </CockpitRow>
          {product.proof.map(([v, l]) => (
            <CockpitRow key={l} label={v}>
              <CockpitValue>{l}</CockpitValue>
            </CockpitRow>
          ))}
          <CockpitRow label="licence">
            <CockpitValue>{product.license}</CockpitValue>
          </CockpitRow>
          {product.packages.map((p) => (
            <CockpitRow key={p.name} label={p.name.replace("@paged-media/", "npm ")}>
              <CockpitValue>{p.version ?? "not yet published"}</CockpitValue>
            </CockpitRow>
          ))}
          <div style={{ margin: "6px 0" }}>
            <StatusPill tone={product.maturity === "coming" ? "draft" : "ready"}>{product.maturity}</StatusPill>
          </div>
          {product.solo && (
            <CockpitBtn sm full onClick={() => window.open(`${PLAYGROUND}/?solo=${product.solo}`, "_blank", "noopener")}>
              Open {product.name} as its own app
            </CockpitBtn>
          )}
        </CockpitSection>
      )}

      {[...groups.entries()].map(([group, items]) => (
        <CockpitSection key={group} title={group} defaultOpen={group !== "More"}>
          {items.map((n) => (
            <button
              key={n.route}
              type="button"
              onClick={() => siteNavigate({ route: n.route })}
              aria-current={n.route === route ? "page" : undefined}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "5px 8px",
                margin: "1px 0",
                border: 0,
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12.5,
                fontFamily: "var(--font-sans)",
                color: n.route === route ? "var(--pg-fg)" : "var(--pg-muted-fg)",
                background: n.route === route ? "var(--pg-muted)" : "transparent",
              }}
            >
              {n.title}
            </button>
          ))}
        </CockpitSection>
      ))}

      {manifest?.links && (
        <CockpitSection title="Elsewhere" defaultOpen={false}>
          {manifest.links.map((l) => (
            <button
              key={l.href}
              type="button"
              onClick={() => siteNavigate({ href: l.href })}
              style={{ display: "block", border: 0, background: "transparent", padding: "4px 0", cursor: "pointer", color: "var(--pg-primary)", fontSize: 12.5, fontFamily: "var(--font-sans)" }}
            >
              {l.title} ↗
            </button>
          ))}
        </CockpitSection>
      )}
    </div>
  );
}
