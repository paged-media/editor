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

// Boot-time cross-origin-isolation assertion (W0.17).
//
// The render worker allocates a SharedArrayBuffer for the camera + gesture
// transforms. A SAB can only be constructed when the page is cross-origin
// isolated (`globalThis.crossOriginIsolated === true`), which the host must
// arrange by serving COOP `same-origin` + COEP `require-corp` on the document
// and every subresource (see public/_headers + vite.config.ts).
//
// If those headers are missing in a PRODUCTION deploy, the app boots and then
// dies deep inside the worker with an opaque `new SharedArrayBuffer(...)`
// SecurityError — far from the real cause (a misconfigured static host). This
// module fails FAST and LOUD at boot so the misconfiguration is obvious.
//
// Kept framework-agnostic + side-effect-free on import: call
// `assertCrossOriginIsolated()` once from the app entry.

export interface CrossOriginIsolationReport {
  /** Whether the page is cross-origin isolated (SAB is usable). */
  isolated: boolean;
  /** Whether SharedArrayBuffer exists as a global at all. */
  hasSharedArrayBuffer: boolean;
  /** True for a Vite production build (`import.meta.env.PROD`). */
  isProd: boolean;
}

/** A loud, multi-line banner so the warning isn't lost in console noise. */
function banner(report: CrossOriginIsolationReport): string {
  return [
    "",
    "███ CROSS-ORIGIN ISOLATION MISSING ███",
    "",
    "  crossOriginIsolated === false — SharedArrayBuffer is unavailable.",
    "  The render worker WILL throw SecurityError allocating the camera SAB.",
    "",
    "  Fix: serve these response headers on the document AND every",
    "  subresource (they are already wired for dev + in public/_headers):",
    "",
    "    Cross-Origin-Opener-Policy:   same-origin",
    "    Cross-Origin-Embedder-Policy: require-corp",
    "",
    `  (SharedArrayBuffer global present: ${report.hasSharedArrayBuffer})`,
    "",
  ].join("\n");
}

/**
 * Inspect the ambient environment. Pure — does not log or throw — so it can be
 * unit-tested without a browser. `env` defaults to the real globals; tests
 * inject a fake.
 */
export function inspectCrossOriginIsolation(env?: {
  crossOriginIsolated?: boolean;
  hasSharedArrayBuffer?: boolean;
  isProd?: boolean;
}): CrossOriginIsolationReport {
  const isolated =
    env?.crossOriginIsolated ??
    (typeof globalThis !== "undefined" &&
      (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated ===
        true);
  const hasSharedArrayBuffer =
    env?.hasSharedArrayBuffer ??
    (typeof globalThis !== "undefined" &&
      typeof (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer !==
        "undefined");
  // `import.meta.env.PROD` is true only in a Vite production build.
  const isProd = env?.isProd ?? Boolean(import.meta.env?.PROD);
  return { isolated, hasSharedArrayBuffer, isProd };
}

/**
 * Assert cross-origin isolation at boot. In a production build, a missing
 * isolation prints a loud banner via `onWarn` (default: console.error). In dev
 * the message is softer (the Vite plugin sets the headers, but e.g. a custom
 * proxy could still strip them). Returns the report for callers/tests.
 *
 * Does NOT throw: a hard throw here would blank the screen with no UI to even
 * show the diagnosis. The worker's own SAB allocation is the real failure
 * point; this just makes the cause legible first.
 */
export function assertCrossOriginIsolated(opts?: {
  env?: Parameters<typeof inspectCrossOriginIsolation>[0];
  onWarn?: (message: string, report: CrossOriginIsolationReport) => void;
}): CrossOriginIsolationReport {
  const report = inspectCrossOriginIsolation(opts?.env);
  if (report.isolated) return report;

  const warn =
    opts?.onWarn ??
    ((message: string) => {
      // eslint-disable-next-line no-console
      (report.isProd ? console.error : console.warn)(message);
    });
  warn(banner(report), report);
  return report;
}
