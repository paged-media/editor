#!/usr/bin/env python3
# annual-report.docx — the Paged Annual's Word chapter input: a three-to-four
# page circulation report exercising EVERY tier paged.doc lowers.
#
# stdlib only (zipfile + zlib + hand-authored WordprocessingML), fixed zip
# member order + the fixed 1980 timestamp, so re-running is byte-stable:
#
#     python3 gen-annual-report-docx.py
#
# One of everything the importer reads (plugin-doc docs/status.md):
#   - styles.xml with docDefaults + Normal/Heading1/Heading2/Caption
#   - direct run formatting (bold, italic, a coloured run)
#   - numbering.xml lists: a 2-level BULLET list (numId 1) and a 2-level
#     DECIMAL list (numId 2)
#   - a table with a gridSpan title cell AND a vMerge'd region cell
#   - one embedded PNG (a real, decodable PNG built below — no third-party
#     bytes) placed via wp:inline
#   - external hyperlinks in BOTH Word forms: w:hyperlink r:id (rels,
#     TargetMode=External) and a HYPERLINK field via w:fldSimple
#   - two footnotes (word/footnotes.xml, separator pseudo-notes included)
#   - tab stops (a dot-leader ledger line) and keepNext on the headings
#
# Conformance: plugin-doc docx-conformance/tests/annual_report.rs lowers a
# verbatim copy of the output and asserts every tier above lands with zero
# error-severity diagnostics.
#
# All prose is self-authored for the Paged Annual; the image is generated
# below. No third-party material.

import os
import struct
import zipfile
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
FIXED_DATE = (1980, 1, 1, 0, 0, 0)

NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
NS_PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture"

XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'


# --- the embedded PNG (a real, decodable image) ------------------------------

def make_png():
    """A 120x80 RGB PNG of the annual's plate mark: a deep-blue field with an
    orange bar and a paper-white rule. Deterministic pixels, stored-block zlib
    (level 0) so the bytes never depend on a compressor's choices."""
    w, h = 120, 80
    blue, orange, paper = (28, 63, 148), (217, 79, 43), (244, 241, 234)
    rows = bytearray()
    for y in range(h):
        rows.append(0)  # filter: None
        for x in range(w):
            if 56 <= y < 64:
                px = paper
            elif 16 <= x < 40 and 12 <= y < 52:
                px = orange
            else:
                px = blue
            rows.extend(px)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    idat = zlib.compress(bytes(rows), 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", idat)
        + chunk(b"IEND", b"")
    )


# --- WordprocessingML parts ---------------------------------------------------

CONTENT_TYPES = XML_DECL + """<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
</Types>"""

ROOT_RELS = XML_DECL + f"""<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="{NS_R}/officeDocument" Target="word/document.xml"/>
</Relationships>"""

DOC_RELS = XML_DECL + f"""<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="{NS_R}/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="{NS_R}/numbering" Target="numbering.xml"/>
  <Relationship Id="rId3" Type="{NS_R}/footnotes" Target="footnotes.xml"/>
  <Relationship Id="rId50" Type="{NS_R}/hyperlink" Target="https://paged.media/annual" TargetMode="External"/>
  <Relationship Id="rId100" Type="{NS_R}/image" Target="media/plate-mark.png"/>
</Relationships>"""

# docDefaults + the four named styles the report applies. Sizes are half-points.
STYLES = XML_DECL + f"""<w:styles xmlns:w="{NS_W}">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia"/><w:sz w:val="21"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:before="240" w:after="180"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="56"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:before="200" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Caption">
    <w:name w:val="caption"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:i/><w:sz w:val="18"/></w:rPr>
  </w:style>
</w:styles>"""

# A 2-level bullet list (abstractNum 0) and a 2-level decimal list
# (abstractNum 1). Level-0 bullet is Wingdings F0B7 (the importer normalizes
# it to U+2022); level 1 is a plain en dash.
NUMBERING = XML_DECL + f"""<w:numbering xmlns:w="{NS_W}">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="&#61623;"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8211;"/>
      <w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="1"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2."/>
      <w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>"""

FOOTNOTES = XML_DECL + f"""<w:footnotes xmlns:w="{NS_W}">
  <w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
  <w:footnote w:id="2"><w:p><w:r><w:t xml:space="preserve">Counted at the loading dock, not at the press: a copy that never leaves the building is not circulation, whatever the counter on the folder says.</w:t></w:r></w:p></w:footnote>
  <w:footnote w:id="3"><w:p><w:r><w:t xml:space="preserve">Digital editions are tallied on the first open, once per subscriber per issue. Repeat opens are a compliment, not a copy.</w:t></w:r></w:p></w:footnote>
</w:footnotes>"""


def p(text, style=None):
    """A plain one-run paragraph, optionally styled."""
    ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
    return f'<w:p>{ppr}<w:r><w:t xml:space="preserve">{text}</w:t></w:r></w:p>'


def li(text, num_id, ilvl):
    return (
        f'<w:p><w:pPr><w:numPr><w:ilvl w:val="{ilvl}"/><w:numId w:val="{num_id}"/>'
        f"</w:numPr></w:pPr><w:r><w:t xml:space=\"preserve\">{text}</w:t></w:r></w:p>"
    )


def tc(text, props=""):
    tcpr = f"<w:tcPr>{props}</w:tcPr>" if props else ""
    body = f'<w:p><w:r><w:t xml:space="preserve">{text}</w:t></w:r></w:p>' if text else "<w:p/>"
    return f"<w:tc>{tcpr}{body}</w:tc>"


def document():
    b = []
    b.append(p("Circulation Report", "Heading1"))
    b.append(
        '<w:p><w:r><w:t xml:space="preserve">This is the year as the press room '
        "counted it: every copy that left the dock, every edition that opened on "
        "a screen, and the honest arithmetic between the two. The figures below "
        "are the same ones the ledgers carry — nothing is rounded upward, and "
        "nothing that stayed in the building is counted."
        "</w:t></w:r><w:r><w:footnoteReference w:id=\"2\"/></w:r></w:p>"
    )

    b.append(p("The year in print", "Heading2"))
    b.append(
        '<w:p><w:r><w:t xml:space="preserve">Print circulation rose in every '
        "quarter but the third, when the coastal routes flooded and two "
        "deliveries ran a week late. The full-year total came to "
        "</w:t></w:r>"
        '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">8,315 copies</w:t></w:r>'
        '<w:r><w:t xml:space="preserve">, up eleven percent on the year before. '
        "The digital editions grew faster still — "
        "</w:t></w:r>"
        '<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">4,295 first opens</w:t></w:r>'
        '<w:r><w:t xml:space="preserve"> against 2,700 — though the press '
        "would like it noted that a screen has never once smelled of ink. The "
        "one number the board watched all year is printed here in the house "
        "colour: </w:t></w:r>"
        '<w:r><w:rPr><w:b/><w:color w:val="1C3F94"/></w:rPr>'
        '<w:t xml:space="preserve">spoilage held under four percent</w:t></w:r>'
        '<w:r><w:t xml:space="preserve"> for the first time since the rebuild.'
        "</w:t></w:r></w:p>"
    )
    b.append(
        p(
            "The fourth quarter deserves its own sentence. A 2,390-copy run is "
            "the largest this house has set since the two-press years, and it "
            "went to bed on schedule, on the first attempt, with the plates "
            "still warm from the proofing pass. The crew has asked that this be "
            "recorded plainly and without adjectives; it is, except for that one."
        )
    )

    b.append(p("How the counts are taken", "Heading2"))
    b.append(p(
        "Three rules govern every number in this report. They are old rules, "
        "and they have outlasted four presses and two buildings:"
    ))
    b.append(li("A copy is counted when it leaves the dock, not when it is printed.", 1, 0))
    b.append(li("Bundles broken for waste return to stock, uncounted.", 1, 1))
    b.append(li("Water-damaged bundles are waste, whatever the driver says.", 1, 1))
    b.append(li("A digital edition is counted on its first open, once per subscriber.", 1, 0))
    b.append(li("Nothing is ever counted twice, even when counting twice would look better.", 1, 0))

    b.append(p("Press operations", "Heading2"))
    b.append(p(
        "The operations calendar ran in the same order it always has, and the "
        "order is the point — each step gates the next:"
    ))
    b.append(li("Plates are proofed against the signed-off layout.", 2, 0))
    b.append(li("Registration is checked on the first fifty sheets.", 2, 1))
    b.append(li("Colour bars are read, not eyeballed.", 2, 1))
    b.append(li("The run is released to the folder.", 2, 0))
    b.append(li("The dock tally is reconciled against the run counter.", 2, 0))

    b.append(p("Circulation by region", "Heading2"))
    # The table: a gridSpan title row, a header row, and a vMerge'd region
    # cell spanning its two channel rows.
    b.append(
        "<w:tbl>"
        '<w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid>'
        "<w:tr>" + tc("Twelve months of counted copies", '<w:gridSpan w:val="3"/>') + "</w:tr>"
        "<w:tr>" + tc("Region") + tc("Channel") + tc("Copies") + "</w:tr>"
        "<w:tr>" + tc("Alpine", '<w:vMerge w:val="restart"/>') + tc("Print") + tc("3,410") + "</w:tr>"
        "<w:tr>" + tc("", "<w:vMerge/>") + tc("Digital") + tc("1,240") + "</w:tr>"
        "<w:tr>" + tc("Harbour") + tc("Print") + tc("2,905") + "</w:tr>"
        "<w:tr>" + tc("Harbour") + tc("Digital") + tc("1,470") + "</w:tr>"
        "<w:tr>" + tc("Plateau") + tc("Print") + tc("2,000") + "</w:tr>"
        "<w:tr>" + tc("Plateau") + tc("Digital") + tc("1,585") + "</w:tr>"
        "</w:tbl>"
    )
    b.append(p(
        "The Alpine routes remain the house's backbone, and the plateau's "
        "digital growth is the story of the year: a region that took its first "
        "print delivery only six years ago now opens more editions on screens "
        "than it receives on paper."
    ))

    # The embedded image: the plate mark, 120 x 80 pt (EMU = pt * 12700).
    b.append(
        "<w:p><w:r><w:drawing>"
        '<wp:inline distT="0" distB="0" distL="0" distR="0">'
        '<wp:extent cx="1524000" cy="1016000"/>'
        '<wp:docPr id="1" name="Plate mark"/>'
        "<a:graphic>"
        f'<a:graphicData uri="{NS_PIC}">'
        "<pic:pic>"
        '<pic:nvPicPr><pic:cNvPr id="0" name="plate-mark.png"/><pic:cNvPicPr/></pic:nvPicPr>'
        '<pic:blipFill><a:blip r:embed="rId100"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1524000" cy="1016000"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
        "</pic:pic></a:graphicData></a:graphic></wp:inline>"
        "</w:drawing></w:r></w:p>"
    )
    b.append(p(
        "The plate mark, as it appears on every signature this house folds.",
        "Caption",
    ))

    b.append(p("Digital editions", "Heading2"))
    b.append(
        '<w:p><w:r><w:t xml:space="preserve">The full tables, the route maps, '
        "and the month-by-month tallies live in the online annual at "
        "</w:t></w:r>"
        '<w:hyperlink r:id="rId50"><w:r><w:t>paged.media/annual</w:t></w:r></w:hyperlink>'
        '<w:r><w:t xml:space="preserve">, and the counting rules themselves are '
        "documented, in more words than they deserve, at "
        "</w:t></w:r>"
        '<w:fldSimple w:instr="HYPERLINK &quot;https://docs.paged.media/&quot;">'
        "<w:r><w:t>docs.paged.media</w:t></w:r></w:fldSimple>"
        '<w:r><w:t xml:space="preserve">. Subscribers moved between the two '
        "channels all year without ceremony"
        "</w:t></w:r>"
        '<w:r><w:footnoteReference w:id="3"/></w:r>'
        '<w:r><w:t xml:space="preserve"> and the report treats them as one '
        "readership with two doors."
        "</w:t></w:r></w:p>"
    )

    # The ledger lines: right tab at 4320 twips with a dot leader.
    for label, figure in (
        ("Largest single run (Q4)", "2,390 copies"),
        ("Spoilage, full year", "3.7 percent"),
        ("Editions gone to a second printing", "3"),
    ):
        b.append(
            "<w:p><w:pPr><w:tabs>"
            '<w:tab w:val="right" w:leader="dot" w:pos="4320"/>'
            "</w:tabs></w:pPr>"
            f'<w:r><w:t xml:space="preserve">{label}</w:t></w:r>'
            "<w:r><w:tab/></w:r>"
            f'<w:r><w:t xml:space="preserve">{figure}</w:t></w:r></w:p>'
        )

    b.append(p(
        "Next year's targets are set the way this house has always set them: "
        "one more route, one fewer excuse, and a spoilage figure that keeps its "
        "head below four. The presses are ready. So is the dock."
    ))

    # Page geometry: the annual's 540 x 720 pt page (10800 x 14400 twips),
    # 54 pt (1080 twip) margins.
    sect = (
        "<w:sectPr>"
        '<w:pgSz w:w="10800" w:h="14400"/>'
        '<w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/>'
        "</w:sectPr>"
    )
    return (
        XML_DECL
        + f'<w:document xmlns:w="{NS_W}" xmlns:r="{NS_R}" xmlns:wp="{NS_WP}" '
        + f'xmlns:a="{NS_A}" xmlns:pic="{NS_PIC}">'
        + "<w:body>"
        + "".join(b)
        + sect
        + "</w:body></w:document>"
    )


def main():
    members = [
        ("[Content_Types].xml", CONTENT_TYPES.encode("utf-8")),
        ("_rels/.rels", ROOT_RELS.encode("utf-8")),
        ("word/_rels/document.xml.rels", DOC_RELS.encode("utf-8")),
        ("word/document.xml", document().encode("utf-8")),
        ("word/styles.xml", STYLES.encode("utf-8")),
        ("word/numbering.xml", NUMBERING.encode("utf-8")),
        ("word/footnotes.xml", FOOTNOTES.encode("utf-8")),
        ("word/media/plate-mark.png", make_png()),
    ]
    out = os.path.join(HERE, "annual-report.docx")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name, body in members:
            info = zipfile.ZipInfo(name, date_time=FIXED_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, body)
    print("wrote annual-report.docx")


if __name__ == "__main__":
    main()
