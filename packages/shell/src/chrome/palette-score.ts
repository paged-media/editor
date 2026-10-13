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

// The command palette's ranking (cmdk `filter`). cmdk's default scorer
// matches the query as a scattered subsequence of the whole value — the
// palette's value was "<category> <title> <id>" — so "export" ranked
// "Blend: Expand" first (e·x·p from the title, o·r·t from the id) and a
// long plugin id matched almost any word. Ranking here is by what the
// command is CALLED: every word of the query must start a word of the
// title, the category or the id, or sit inside the title; the title
// counts most and the id least. No scattered-letter matching.

/** Split into lowercase words: spaces, punctuation, dots and camelCase
 *  humps are all boundaries (`blendExpand` → blend, expand). */
function words(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** How well one query word matches. 0 = not at all. */
function tokenScore(
  token: string,
  title: string,
  titleWords: string[],
  categoryWords: string[],
  idWords: string[],
): number {
  if (titleWords.includes(token)) return 1;
  if (titleWords.some((w) => w.startsWith(token))) return 0.85;
  if (token.length >= 3 && title.includes(token)) return 0.6;
  if (categoryWords.some((w) => w.startsWith(token))) return 0.4;
  if (idWords.some((w) => w.startsWith(token))) return 0.25;
  return 0;
}

/**
 * cmdk filter: `value` is the command id, `keywords` are
 * `[title, category]`. Returns 0 (hidden) to 1 (best).
 */
export function paletteScore(
  value: string,
  search: string,
  keywords?: readonly string[],
): number {
  const tokens = words(search);
  if (tokens.length === 0) return 1;
  const title = (keywords?.[0] ?? "").toLowerCase();
  const titleWords = words(keywords?.[0] ?? "");
  const categoryWords = words(keywords?.[1] ?? "");
  const idWords = words(value);
  let sum = 0;
  for (const token of tokens) {
    const s = tokenScore(token, title, titleWords, categoryWords, idWords);
    if (s === 0) return 0;
    sum += s;
  }
  let score = sum / tokens.length;
  // The whole query opening the title ("export" → "Export PDF…") is the
  // strongest single signal there is.
  if (title.startsWith(search.trim().toLowerCase())) score += 0.1;
  // Fewer words in the title = a more specific hit, a hair ahead.
  score -= Math.min(titleWords.length, 10) * 0.002;
  return Math.max(0.0001, Math.min(1, score));
}
