// A pure-Node minimal IDML builder for E2E specs that must NOT depend
// on the generated corpus (which is gitignored / produced by core's
// paged-gen). Mirrors plugin-draw's conformance fixture builder: a
// store-mimetype-first / deflate-rest ZIP with a one-page spread
// carrying the page items the caller supplies. Deterministic bytes.
//
// Used by draw-schema-panel.spec.ts to load a document with BOTH a
// rectangle (bounds-based, no path anchors) and an open polygon (a
// real path) so the schema panel's binding-driven dash-section
// visibility can be exercised against true element kinds.

import { deflateRawSync } from "node:zlib";

interface Entry {
  name: string;
  data: string;
  store?: boolean;
}

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function buildZip(entries: Entry[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: {
    name: Uint8Array;
    crc: number;
    comp: number;
    raw: number;
    store: boolean;
    offset: number;
  }[] = [];
  let offset = 0;
  for (const e of entries) {
    const data = enc.encode(e.data);
    const crc = crc32(data);
    const store = !!e.store;
    const comp = store ? data : new Uint8Array(deflateRawSync(data));
    const nameBytes = enc.encode(e.name);
    const lfh = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(lfh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(8, store ? 0 : 8, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, comp.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    lfh.set(nameBytes, 30);
    chunks.push(lfh, comp);
    central.push({
      name: nameBytes,
      crc,
      comp: comp.length,
      raw: data.length,
      store,
      offset,
    });
    offset += lfh.length + comp.length;
  }
  const cdStart = offset;
  for (const c of central) {
    const cd = new Uint8Array(46 + c.name.length);
    const dv = new DataView(cd.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(10, c.store ? 0 : 8, true);
    dv.setUint32(16, c.crc, true);
    dv.setUint32(20, c.comp, true);
    dv.setUint32(24, c.raw, true);
    dv.setUint16(28, c.name.length, true);
    dv.setUint32(42, c.offset, true);
    cd.set(c.name, 46);
    chunks.push(cd);
    offset += cd.length;
  }
  const eocd = new Uint8Array(22);
  const dv = new DataView(eocd.buffer);
  dv.setUint32(0, 0x06054b50, true);
  dv.setUint16(8, central.length, true);
  dv.setUint16(10, central.length, true);
  dv.setUint32(12, offset - cdStart, true);
  dv.setUint32(16, cdStart, true);
  chunks.push(eocd);
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

const MIME = "application/vnd.adobe.indesign-idml-package";
const empty = (tag: string): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<idPkg:${tag} xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0"/>`;

const CONTAINER =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">` +
  `<rootfiles><rootfile full-path="designmap.xml" media-type="text/xml"/></rootfiles></container>`;

const GRAPHIC =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<idPkg:Graphic xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0">` +
  `<Color Self="Color/Black" Model="Process" Space="CMYK" ColorValue="0 0 0 100" Name="Black"/>` +
  `<Swatch Self="Swatch/None" Name="None"/></idPkg:Graphic>`;

const MASTER =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<idPkg:MasterSpread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0">` +
  `<MasterSpread Self="um" Name="A">` +
  `<Page Self="ump" Name="A" GeometricBounds="0 0 792 612" ItemTransform="1 0 0 1 0 0"/>` +
  `</MasterSpread></idPkg:MasterSpread>`;

const BACKING =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<idPkg:BackingStory xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0">` +
  `<XmlStory Self="backing"/></idPkg:BackingStory>`;

const DESIGNMAP =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="20.0(32)"?>\n` +
  `<Document xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0" Self="d" StoryList="" Name="schema-panel-e2e.indd">\n` +
  `<idPkg:Graphic src="Resources/Graphic.xml"/>\n` +
  `<idPkg:Fonts src="Resources/Fonts.xml"/>\n` +
  `<idPkg:Styles src="Resources/Styles.xml"/>\n` +
  `<idPkg:Preferences src="Resources/Preferences.xml"/>\n` +
  `<idPkg:MasterSpread src="MasterSpreads/MasterSpread_um.xml"/>\n` +
  `<idPkg:Spread src="Spreads/Spread_us.xml"/>\n` +
  `<idPkg:BackingStory src="XML/BackingStory.xml"/>\n` +
  `</Document>`;

const STYLES_MINIMAL =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<idPkg:Styles xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0">` +
  `<RootCharacterStyleGroup Self="rcs">` +
  `<CharacterStyle Self="CharacterStyle/$ID/[No character style]" Name="$ID/[No character style]"/>` +
  `</RootCharacterStyleGroup>` +
  `<RootParagraphStyleGroup Self="rps">` +
  `<ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[No paragraph style]"/>` +
  `</RootParagraphStyleGroup></idPkg:Styles>`;

/** A `<Rectangle>` (bounds-based, no path-anchor table) + an OPEN
 *  `<Polygon>` (a real 3-anchor path). Mirrors plugin-draw's F1
 *  corpus shape — the rectangle reads dashControlsVisible=false (no
 *  anchors), the polygon true. */
const SPREAD_BODY =
  `<Rectangle Self="urect" GeometricBounds="100 100 300 300" ItemTransform="1 0 0 1 0 0" FillColor="Color/Black" StrokeWeight="1" StrokeColor="Color/Black">` +
  `<Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>` +
  `<PathPointType Anchor="100 100" LeftDirection="100 100" RightDirection="100 100"/>` +
  `<PathPointType Anchor="300 100" LeftDirection="300 100" RightDirection="300 100"/>` +
  `<PathPointType Anchor="300 300" LeftDirection="300 300" RightDirection="300 300"/>` +
  `<PathPointType Anchor="100 300" LeftDirection="100 300" RightDirection="100 300"/>` +
  `</PathPointArray></GeometryPathType></PathGeometry></Properties></Rectangle>` +
  `<Polygon Self="upoly" GeometricBounds="400 100 500 300" ItemTransform="1 0 0 1 0 0" FillColor="Color/Black" StrokeWeight="2" StrokeColor="Color/Black">` +
  `<Properties><PathGeometry><GeometryPathType PathOpen="true"><PathPointArray>` +
  `<PathPointType Anchor="100 400" LeftDirection="100 400" RightDirection="100 400"/>` +
  `<PathPointType Anchor="200 500" LeftDirection="200 500" RightDirection="200 500"/>` +
  `<PathPointType Anchor="300 400" LeftDirection="300 400" RightDirection="300 400"/>` +
  `</PathPointArray></GeometryPathType></PathGeometry></Properties></Polygon>`;

/** Build the minimal rectangle + open-polygon IDML. Returns the raw
 *  bytes; callers base64 them across the page.evaluate boundary. */
export function buildRectAndPolygonIdml(): Uint8Array {
  const spread =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="20.0">\n` +
    `<Spread Self="us" PageCount="1" ItemTransform="1 0 0 1 0 0">\n` +
    `<Page Self="usp" Name="1" GeometricBounds="0 0 792 612" ItemTransform="1 0 0 1 0 0" AppliedMaster="um"/>\n` +
    SPREAD_BODY +
    `\n</Spread>\n</idPkg:Spread>`;
  return buildZip([
    { name: "mimetype", data: MIME, store: true },
    { name: "designmap.xml", data: DESIGNMAP },
    { name: "META-INF/container.xml", data: CONTAINER },
    { name: "Resources/Graphic.xml", data: GRAPHIC },
    { name: "Resources/Fonts.xml", data: empty("Fonts") },
    { name: "Resources/Styles.xml", data: STYLES_MINIMAL },
    { name: "Resources/Preferences.xml", data: empty("Preferences") },
    { name: "MasterSpreads/MasterSpread_um.xml", data: MASTER },
    { name: "Spreads/Spread_us.xml", data: spread },
    { name: "XML/BackingStory.xml", data: BACKING },
  ]);
}

/** Base64 of the minimal IDML — the page.evaluate-friendly form. */
export function buildRectAndPolygonIdmlBase64(): string {
  return Buffer.from(buildRectAndPolygonIdml()).toString("base64");
}
