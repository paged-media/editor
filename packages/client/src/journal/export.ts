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


// The exported journal bundle (ADR 025 §5).
//
// ONE `.json` file — readable in a GitHub issue, diffable, greppable, no new
// dependencies. This module is PURE: it takes facts and returns an object. It
// does not touch the DOM, does not know about Blobs, and does not download
// anything (the app layer hands the result to the existing `downloadBytes`
// door). That is what makes the redaction golden test possible under Node.
//
// ─────────────────────────────────────────────────────────────────────
// WHAT CANNOT BE IN HERE, AND WHY IT IS STRUCTURAL
// ─────────────────────────────────────────────────────────────────────
//
// Document text, file paths, URIs, plugin log text: UNREPRESENTABLE. There is
// no `message` field on an entry, and `data` string values must match
// `IDENT_RE`. Nothing is being "stripped" — there is nowhere for it to sit.
//
// Wall clock: coarsened. Entry `t` is relative-ms from a session epoch, and
// the epoch's wall time is rounded to the hour before it is written, so a
// bundle cannot be aligned to a person's timeline.
//
// Element / story / page ids: PRESENT, and said so out loud. They are
// engine-minted, opaque and document-local. A page index hints at document
// structure. That is a real, small disclosure and it is disclosed rather than
// hidden, because a privacy claim you have to squint at is not a claim.
//
// Two sections are OPT-IN and default OFF:
//   · `crash`         — stack traces embed the user's disk paths.
//   · `documentShape` — structural counts plus font families, which is the one
//                       place a family may legitimately appear (font
//                       substitution is exactly the bug where you need it),
//                       with the user looking at the preview when they decide.

import type { JournalEntry } from "./entry";
import {
  KNOWN_BLIND_SPOTS,
  type BlindSpot,
  type UncapturedLedger,
} from "./uncaptured";

export const JOURNAL_BUNDLE_VERSION = 1;

export interface BundleApp {
  editorVersion: string;
  /** Engine wire protocol the editor is pinned to. */
  protocol: number;
  canvasWasm?: string;
  pluginApi?: string;
}

export interface BundleEnv {
  /** ALREADY REDUCED by `reduceUserAgent` — browser family + major, platform
   *  family. Never the raw UA string, which is a fingerprint. */
  ua: string;
  cores?: number;
  gpuActive?: boolean;
  sab?: boolean;
  crossOriginIsolated?: boolean;
  dpr?: number;
  /** Rounded to 10 px by `buildJournalBundle`. */
  viewport?: { w: number; h: number };
}

export interface BundlePlugin {
  id: string;
  version: string;
  active: boolean;
}

export interface BundleClocks {
  shellEpochMs: number;
  workerEpochMs?: number;
  /** Says plainly that worker timestamps were rebased and are approximate, so
   *  a reader can un-merge rather than over-trust the interleaving. */
  skewNote?: string;
}

/** OPT-IN, default OFF. */
export interface BundleCrash {
  stacks: string[];
}

/** OPT-IN, default OFF. Structural counts + font families; never content.
 *
 *  The counts mirror the engine's `DocumentStats`, which is already a
 *  pure-count struct — no story text, no frame names, no URIs. Fonts and links
 *  are the two places a NAME may legitimately appear, because font
 *  substitution and a broken link are precisely the bugs where you need it —
 *  and the user is looking at the preview when they decide. */
export interface BundleDocumentShape {
  spreads?: number;
  pages?: number;
  frames?: number;
  stories?: number;
  paragraphs?: number;
  lines?: number;
  glyphs?: number;
  oversetStories?: number;
  fonts?: { family: string; style?: string; substituted?: boolean }[];
  links?: { status: string }[];
}

export interface JournalBundle {
  bundle: number;
  kind: "paged.journal";
  /** Wall time ROUNDED TO THE HOUR. The only wall clock in the file. */
  generatedAtHour: string;
  app: BundleApp;
  env: BundleEnv;
  plugins: BundlePlugin[];
  clocks: BundleClocks;
  counters: {
    recorded: number;
    errors: number;
    warnings: number;
  };
  uncaptured: UncapturedLedger;
  blindSpots: readonly BlindSpot[];
  entries: JournalEntry[];
  documentShape?: BundleDocumentShape;
  crash?: BundleCrash;
}

export interface BuildBundleOptions {
  entries: JournalEntry[];
  uncaptured: UncapturedLedger;
  app: BundleApp;
  env: BundleEnv;
  plugins?: BundlePlugin[];
  clocks: BundleClocks;
  /** Wall ms. Injected so the golden test is deterministic. */
  generatedAtMs: number;
  /** Opt-in sections. Absent unless the user ticked the box. */
  includeCrash?: BundleCrash;
  includeDocumentShape?: BundleDocumentShape;
}

/** Round a wall-clock ms value down to the hour, ISO, no minutes/seconds. */
export function roundToHour(ms: number): string {
  const d = new Date(ms);
  d.setUTCMinutes(0, 0, 0);
  return `${d.toISOString().slice(0, 13)}:00Z`;
}

/**
 * Reduce a raw user-agent string to a browser family + major version and a
 * platform family. The raw UA is a fingerprint; this keeps the two facts that
 * actually help triage (which engine, which OS) and discards the rest.
 */
export function reduceUserAgent(ua: string): string {
  const family =
    /\bEdg\/(\d+)/.exec(ua) ??
    /\bOPR\/(\d+)/.exec(ua) ??
    /\bFirefox\/(\d+)/.exec(ua) ??
    /\bChrome\/(\d+)/.exec(ua) ??
    /\bVersion\/(\d+).*\bSafari\b/.exec(ua);
  let name = "unknown";
  if (family) {
    const token = family[0];
    if (token.startsWith("Edg")) name = "edge";
    else if (token.startsWith("OPR")) name = "opera";
    else if (token.startsWith("Firefox")) name = "firefox";
    else if (token.startsWith("Chrome")) name = "chrome";
    else name = "safari";
  }
  const major = family?.[1] ?? "0";
  let platform = "unknown";
  if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) platform = "macos";
  else if (/\bWindows\b/.test(ua)) platform = "windows";
  else if (/\bAndroid\b/.test(ua)) platform = "android";
  else if (/\biPhone\b|\biPad\b/.test(ua)) platform = "ios";
  else if (/\bLinux\b|\bX11\b/.test(ua)) platform = "linux";
  return `${name}.${major}.${platform}`;
}

/** Round to the nearest 10 px so a viewport is not a fingerprint. */
function round10(n: number): number {
  return Math.round(n / 10) * 10;
}

/**
 * Build the bundle. Pure — same inputs, byte-identical output, which is what
 * the golden test pins.
 */
export function buildJournalBundle(
  options: BuildBundleOptions,
): JournalBundle {
  let errors = 0;
  let warnings = 0;
  for (const e of options.entries) {
    if (e.severity === "error") errors += 1;
    else if (e.severity === "warn") warnings += 1;
  }

  const env: BundleEnv = { ...options.env };
  if (env.viewport) {
    env.viewport = {
      w: round10(env.viewport.w),
      h: round10(env.viewport.h),
    };
  }

  const bundle: JournalBundle = {
    bundle: JOURNAL_BUNDLE_VERSION,
    kind: "paged.journal",
    generatedAtHour: roundToHour(options.generatedAtMs),
    app: options.app,
    env,
    plugins: options.plugins ?? [],
    clocks: options.clocks,
    counters: { recorded: options.entries.length, errors, warnings },
    uncaptured: options.uncaptured,
    blindSpots: KNOWN_BLIND_SPOTS,
    entries: options.entries,
  };

  if (options.includeDocumentShape) {
    bundle.documentShape = options.includeDocumentShape;
  }
  if (options.includeCrash) {
    bundle.crash = options.includeCrash;
  }
  return bundle;
}

/** The exact text the export writes — and the exact text the dialog previews.
 *  One function, so the preview cannot drift from the file. */
export function serializeJournalBundle(bundle: JournalBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

/** `paged-journal-20260822-1400-k3f9a2.json` */
export function journalBundleFilename(
  generatedAtMs: number,
  suffix: string,
): string {
  const d = new Date(generatedAtMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}00`;
  return `paged-journal-${stamp}-${suffix}.json`;
}
