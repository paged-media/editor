# License

The **paged editor** (<https://paged.media>) is **dual-licensed**. You may use,
modify, and distribute it under the terms of **either**:

- the **GNU Affero General Public License, version 3** (AGPL-3.0) — the
  open-source option; the full text is in [`LICENSE`](./LICENSE); or
- the **Paged Media Enterprise License** (PMEL) — a commercial option
  available from **And The Next GmbH**.

`SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-PMEL`

Source files carry the license notice in their header; new files must include
it (copy it from any existing source file, or see [`CONTRIBUTING.md`](./CONTRIBUTING.md)).

## Why AGPL for the editor (and MPL for the engine)

The editor is an end-user application, typically delivered over a network, so it
uses the **AGPL** — whose §13 network clause requires anyone running a *modified*
version as a hosted service to offer that service's complete source to its users.
The render **engine** (`paged-media/core`) and the public viewer/SDK are instead
**MPL-2.0**, deliberately more permissive so they can be embedded broadly. Both
are available under the commercial **PMEL** for users who need terms the
open-source licenses don't provide.

## GNU Affero General Public License v3 (open source)

The standard, **unmodified** AGPL-3.0 governs — see [`LICENSE`](./LICENSE), or
obtain a copy at <https://www.gnu.org/licenses/agpl-3.0.html>. The AGPL's
copyleft is strong and whole-work: a work that combines or links these files is
itself subject to the AGPL, and §13 extends that to use over a network.

## Paged Media Enterprise License (commercial)

A commercial license is available from **And The Next GmbH** for users who need
terms AGPL-3.0 does not provide — for example the right to build closed-source or
hosted derivatives **without** the AGPL's reciprocity and network-source
obligations, plus warranty, indemnification, liability cover, support SLAs, and
patent assurances. Contact And The Next GmbH for terms.

## Bundled third-party data

This repository redistributes some unmodified third-party colour libraries under
their own licenses (e.g. CC BY-ND 4.0). Those terms govern those files; see
[`NOTICE`](./NOTICE).

## Contributions

Contributions are accepted under the project's Contributor License Agreement,
which lets And The Next GmbH distribute them under **both** the AGPL-3.0 and the
Paged Media Enterprise License. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) and
[`CLA.md`](./CLA.md).

## Trademarks

`paged`, `paged.media`, and the paged logo are trademarks of And The Next GmbH.
The open-source license grants copyright permissions, not trademark permissions:
you may use and modify the editor, but you may not ship a derivative *called*
paged without permission.

© And The Next GmbH. All rights reserved except as expressly granted above.
