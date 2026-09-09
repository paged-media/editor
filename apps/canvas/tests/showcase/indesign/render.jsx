// render.jsx — export one JPEG per page of an IDML from Adobe InDesign.
// Run by tests/showcase/indesign/render.ts, which prepends:
//   var __SRC = "/abs/path.idml"; var __OUT_DIR = "/abs/dir";
//   var __DPI = 163.2; var __PAGES = [59,60];   // 1-based ABSOLUTE, [] = all
//   var __CMYK_PROFILE = "Coated FOGRA39 (ISO 12647-2:2004)";
// Return protocol: <json>\n@@ERRORS@@\n<one line per step that failed>
// ExtendScript (ES3): no JSON, no let/const, no arrow functions.
//
// Why this exists: poppler rasterises InDesign's exported PDF wrongly
// wherever the page carries a knockout transparency group — the annual's
// bevelled moon and feathered veil come out WHITE — so a pixel compare
// against that raster scores our renderer against an artefact. InDesign
// rendering its own document is the only honest reference we can get.

app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
app.scriptPreferences.enableRedraw = false;

var __errors = [];
function noteErr(section, e) { __errors.push(section + ": " + String(e)); }

// ---------- tiny JSON serializer (ExtendScript has no JSON) ----------
function jstr(s) {
  s = String(s);
  var out = '"';
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i), code = s.charCodeAt(i);
    if (c == '"') out += '\\"';
    else if (c == '\\') out += '\\\\';
    else if (c == '\t') out += '\\t';
    else if (c == '\n') out += '\\n';
    else if (c == '\r') out += '\\r';
    else if (code < 32 || code > 126) { var h = code.toString(16); while (h.length < 4) h = '0' + h; out += '\\u' + h; }
    else out += c;
  }
  return out + '"';
}
function jval(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return jstr(v);
  if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(jval(v[i])); return '[' + a.join(',') + ']'; }
  var o = []; for (var k in v) { if (v.hasOwnProperty(k)) o.push(jstr(k) + ':' + jval(v[k])); }
  return '{' + o.join(',') + '}';
}
function pad3(n) { n = String(n); while (n.length < 3) n = '0' + n; return n; }

var R = {
  app_version: null,
  source: __SRC,
  dpi: __DPI,
  cmyk_profile: null,
  rgb_profile: null,
  open_seconds: null,
  open_error: null,
  page_count: null,
  pages: []
};
try { R.app_version = String(app.version); } catch (e) { noteErr('version', e); }

// always leave InDesign with no documents open
try { while (app.documents.length > 0) app.documents[0].close(SaveOptions.NO); } catch (e) { noteErr('close-before', e); }

var doc = null;
try {
  var t0 = new Date().getTime();
  doc = app.open(File(__SRC), false);
  R.open_seconds = (new Date().getTime() - t0) / 1000;
} catch (e) {
  R.open_error = String(e);
  noteErr('open', e);
}

if (doc !== null) {
  // Align the colour intent with the canvas, which converts CMYK through
  // FOGRA39 via the CMM. InDesign converts with the DOCUMENT's profile,
  // so a mismatch here shows up as a uniform ΔE offset on every CMYK fill.
  try { doc.cmykProfile = __CMYK_PROFILE; } catch (e) { noteErr('cmykProfile', e); }
  try { R.cmyk_profile = String(doc.cmykProfile); } catch (e) {}
  try { doc.rgbProfile = "sRGB IEC61966-2.1"; } catch (e) { noteErr('rgbProfile', e); }
  try { R.rgb_profile = String(doc.rgbProfile); } catch (e) {}

  try { R.page_count = doc.pages.length; } catch (e) { noteErr('page_count', e); }

  try {
    var jp = app.jpegExportPreferences;
    jp.exportResolution = __DPI;
    jp.jpegQuality = JPEGOptionsQuality.MAXIMUM;
    jp.exportingSpread = false;
    jp.jpegColorSpace = JpegColorSpaceEnum.RGB;
    jp.antiAlias = true;
    jp.useDocumentBleeds = false;
    jp.simulateOverprint = false;
    jp.embedColorProfile = false;
    jp.jpegExportRange = ExportRangeOrAllPages.EXPORT_RANGE;
  } catch (e) { noteErr('prefs', e); }

  var wanted = [];
  if (__PAGES && __PAGES.length > 0) {
    for (var w = 0; w < __PAGES.length; w++) wanted.push(__PAGES[w]);
  } else {
    for (var a = 1; a <= doc.pages.length; a++) wanted.push(a);
  }

  for (var i = 0; i < wanted.length; i++) {
    var n = wanted[i];                    // 1-based ABSOLUTE page index
    var rec = { index: n, name: null, file: null, ms: null, range: null, error: null };
    try {
      var page = doc.pages[n - 1];
      rec.name = String(page.name);
      // The annual runs sections (front matter lower-roman, body arabic,
      // appendix "A·n"), so page NAMES are not 1..N. "+n" is InDesign's
      // absolute-numbering form; fall back to the name when it is refused.
      var range = "+" + n;
      try { app.jpegExportPreferences.pageString = range; }
      catch (e1) { range = rec.name; app.jpegExportPreferences.pageString = range; }
      rec.range = range;
      var out = File(__OUT_DIR + "/page-" + pad3(n) + ".jpg");
      var t1 = new Date().getTime();
      doc.exportFile(ExportFormat.JPG, out);
      rec.ms = new Date().getTime() - t1;
      rec.file = out.fsName;
      if (!out.exists) { rec.error = "no file written"; noteErr('page ' + n, 'no file written'); }
    } catch (e) {
      rec.error = String(e);
      noteErr('page ' + n, e);
    }
    R.pages.push(rec);
  }

  try { doc.close(SaveOptions.NO); } catch (e) { noteErr('close', e); }
}
try { while (app.documents.length > 0) app.documents[0].close(SaveOptions.NO); } catch (e) { noteErr('close-all', e); }

jval(R) + "\n@@ERRORS@@\n" + __errors.join("\n");
