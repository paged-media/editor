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

// "Powered by Claude" — the attribution every Claude surface carries (the
// Script panel's Ask bar, the AI Assistant card, the palette's assistant
// row, the brief dialog). ADR 221.
//
// PLAIN TEXT, deliberately. Anthropic's Trademark Guidelines
// (anthropic.com/legal/trademark-guidelines) allow its logos only with
// prior approval and forbid any alteration, colour included; a plain-text
// "Powered by Claude" is a form Anthropic itself lists as allowed. Swap in
// the official mark, unaltered and as supplied, only once Anthropic has
// approved its use here (marketing@anthropic.com).

export interface PoweredByClaudeProps {
  /** Font size in px. Default 10. */
  size?: number;
  className?: string;
}

export function PoweredByClaude({ size = 10, className }: PoweredByClaudeProps) {
  return (
    <a
      href="https://www.anthropic.com/claude"
      target="_blank"
      rel="noreferrer noopener"
      data-powered-by-claude
      className={className}
      style={{
        fontSize: size,
        lineHeight: 1,
        color: "var(--pg-muted-fg)",
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      Powered by Claude
    </a>
  );
}
