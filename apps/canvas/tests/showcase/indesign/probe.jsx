// probe.jsx — open ONE IDML in Adobe InDesign, walk it, return a JSON string.
// Run by tests/showcase/indesign/probe.ts, which prepends:
//   var __SRC = "/abs/path.idml"; var __ID = "…"; var __ORIG = "…";
// Return protocol: <json>\n@@ERRORS@@\n<one line per section that failed>\n@@DIAG@@\n…
// ExtendScript (ES3): no JSON, no let/const, no arrow functions.

app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
app.scriptPreferences.enableRedraw = false;

var __errors = [];
var __diag = [];
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
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function iso(d) {
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) + 'T' +
    pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds()) + 'Z';
}
function enumName(val, enumObj, names) {
  for (var i = 0; i < names.length; i++) { try { if (val == enumObj[names[i]]) return names[i]; } catch (e) {} }
  return String(val);
}
function fontName(f) {
  if (f === null || f === undefined) return null;
  if (typeof f === 'string') return f;
  try { if (f.hasOwnProperty('name') || f.name !== undefined) return String(f.name); } catch (e) {}
  return String(f);
}
function addDistinct(arr, v) { if (v === null || v === undefined || v === '') return; for (var i = 0; i < arr.length; i++) if (arr[i] === v) return; arr.push(v); }

function emptyItems() { return { textFrame: 0, rectangle: 0, oval: 0, polygon: 0, graphicLine: 0, group: 0, image: 0, other: 0 }; }
var IMAGE_CLASSES = { Image: 1, PDF: 1, EPS: 1, ImportedPage: 1, PICT: 1, WMF: 1, Graphic: 1, EPSText: 1 };
function classify(item, counts, otherClasses) {
  var cn = 'Unknown';
  try { cn = item.constructor.name; } catch (e) {}
  switch (cn) {
    case 'TextFrame': counts.textFrame++; return;
    case 'Rectangle': counts.rectangle++; return;
    case 'Oval': counts.oval++; return;
    case 'Polygon': counts.polygon++; return;
    case 'GraphicLine': counts.graphicLine++; return;
    case 'Group': counts.group++; return;
  }
  if (IMAGE_CLASSES[cn]) { counts.image++; return; }
  if (cn == 'SplineItem') { var hasG = false; try { hasG = item.graphics.length > 0; } catch (e) {} if (hasG) { counts.image++; return; } }
  counts.other++; addDistinct(otherClasses, cn);
}
function countItems(containers, counts, otherClasses) {
  for (var s = 0; s < containers.length; s++) {
    var items = containers[s].allPageItems;
    for (var i = 0; i < items.length; i++) classify(items[i], counts, otherClasses);
  }
}

var R = {
  id: __ID, source: __ORIG, opened_at: null, open_seconds: null, open_error: null,
  pages: null, spreads: null, master_spreads: null, stories: null, paragraphs: null,
  items: null, other_classes: [], master_items: null,
  swatches: null, swatch_names: [], tint_swatches: [],
  paragraph_styles: null, character_styles: null, object_styles: null, table_styles: null, cell_styles: null,
  layers: null, layer_names: [],
  sections: null, conditions: null, condition_names: [], hyperlinks: null, guides: null,
  tables: null, fonts: [], style_fonts: [], text_fonts_sample: [],
  overset_stories: null, links: null
};

var doc = null;
var t0 = new Date();
R.opened_at = iso(t0);
try {
  doc = app.open(File(__SRC));
  R.open_seconds = Math.round((new Date() - t0)) / 1000;
} catch (e) {
  R.open_error = String(e);
  doc = null;
}

if (doc !== null) {
  try { R.pages = doc.pages.length; } catch (e) { noteErr('pages', e); }
  try { R.spreads = doc.spreads.length; } catch (e) { noteErr('spreads', e); }
  try { R.master_spreads = doc.masterSpreads.length; } catch (e) { noteErr('master_spreads', e); }

  // stories / paragraphs / tables / overset
  try {
    var stories = doc.stories;
    R.stories = stories.length;
    var paras = 0, tables = 0, overset = 0;
    for (var i = 0; i < stories.length; i++) {
      var st = stories[i];
      try { paras += st.paragraphs.length; } catch (e) { noteErr('paragraphs[' + i + ']', e); }
      try { tables += st.tables.length; } catch (e) { noteErr('tables[' + i + ']', e); }
      try { if (st.overflows) overset++; } catch (e) { noteErr('overflows[' + i + ']', e); }
    }
    R.paragraphs = paras; R.tables = tables; R.overset_stories = overset;
  } catch (e) { noteErr('stories', e); }

  // page items on spreads (incl. nested) and on master spreads
  try {
    var counts = emptyItems(), oc = [];
    var spreads = doc.spreads, arr = [];
    for (var s = 0; s < spreads.length; s++) arr.push(spreads[s]);
    countItems(arr, counts, oc);
    R.items = counts; R.other_classes = oc;
  } catch (e) { noteErr('items', e); }
  try {
    var mcounts = emptyItems(), moc = [];
    var ms = doc.masterSpreads, marr = [];
    for (var m = 0; m < ms.length; m++) marr.push(ms[m]);
    countItems(marr, mcounts, moc);
    R.master_items = mcounts;
    for (var q = 0; q < moc.length; q++) addDistinct(R.other_classes, moc[q]);
  } catch (e) { noteErr('master_items', e); }

  // swatches + tints (doc.tints IS the set of swatches whose class is Tint)
  var __swatchClass = {};
  try {
    var sw = doc.swatches;
    R.swatches = sw.length;
    var names = [];
    for (var i = 0; i < sw.length; i++) { var nm = null; try { nm = String(sw[i].name); } catch (e) {} names.push(nm); }
    R.swatch_names = names;
  } catch (e) { noteErr('swatches', e); }
  try {
    var tints = [], tc = doc.tints;
    for (var i = 0; i < tc.length; i++) {
      var one = tc[i], nm = null, base = null, tv = null;
      try { nm = String(one.name); } catch (e) {}
      try { base = String(one.baseColor.name); } catch (e) { noteErr('tint.baseColor[' + nm + ']', e); }
      try { tv = Number(one.tintValue); } catch (e) { noteErr('tint.tintValue[' + nm + ']', e); }
      tints.push({ name: nm, base: base, tint: tv });
      __swatchClass[nm] = 'Tint';
    }
    R.tint_swatches = tints;
  } catch (e) { noteErr('tints', e); }
  // diag: which class each swatch resolves to
  try {
    var colls = [['Color', doc.colors], ['Gradient', doc.gradients], ['MixedInk', doc.mixedInks], ['MixedInkGroup', doc.mixedInkGroups]];
    for (var c = 0; c < colls.length; c++) { var cl = colls[c][1]; for (var i = 0; i < cl.length; i++) { try { var n2 = String(cl[i].name); if (!__swatchClass[n2]) __swatchClass[n2] = colls[c][0]; } catch (e) {} } }
    for (var i = 0; i < R.swatch_names.length; i++) { var n3 = R.swatch_names[i]; var cls = __swatchClass[n3] || 'Swatch'; var extra = '';
      if (cls == 'Color') { try { var co = doc.colors.itemByName(n3); extra = ' model=' + enumName(co.model, ColorModel, ['PROCESS','SPOT','REGISTRATION','MIXEDINKMODEL']) + ' space=' + enumName(co.space, ColorSpace, ['CMYK','RGB','LAB','MIXEDINK']) + ' value=[' + co.colorValue.join(',') + ']'; } catch (e) {} }
      __diag.push('swatch\t' + n3 + '\t' + cls + extra); }
  } catch (e) { noteErr('swatch-diag', e); }

  // styles (incl. built-ins, incl. groups)
  try { R.paragraph_styles = doc.allParagraphStyles.length; } catch (e) { noteErr('paragraph_styles', e); }
  try { R.character_styles = doc.allCharacterStyles.length; } catch (e) { noteErr('character_styles', e); }
  try { R.object_styles = doc.allObjectStyles.length; } catch (e) { noteErr('object_styles', e); }
  try { R.table_styles = doc.allTableStyles.length; } catch (e) { noteErr('table_styles', e); }
  try { R.cell_styles = doc.allCellStyles.length; } catch (e) { noteErr('cell_styles', e); }

  // layers / sections / conditions / hyperlinks / guides
  try { R.layers = doc.layers.length; var ln = []; for (var i = 0; i < doc.layers.length; i++) ln.push(String(doc.layers[i].name)); R.layer_names = ln; } catch (e) { noteErr('layers', e); }
  try { R.sections = doc.sections.length; } catch (e) { noteErr('sections', e); }
  try { R.conditions = doc.conditions.length; var cnn = []; for (var i = 0; i < doc.conditions.length; i++) cnn.push(String(doc.conditions[i].name)); R.condition_names = cnn; } catch (e) { noteErr('conditions', e); }
  try { R.hyperlinks = doc.hyperlinks.length; } catch (e) { noteErr('hyperlinks', e); }
  try {
    var g = 0;
    for (var s = 0; s < doc.spreads.length; s++) g += doc.spreads[s].guides.length;
    for (var m = 0; m < doc.masterSpreads.length; m++) g += doc.masterSpreads[m].guides.length;
    R.guides = g;
  } catch (e) { noteErr('guides', e); }

  // fonts
  var FONT_STATUS = ['INSTALLED', 'NOT_AVAILABLE', 'SUBSTITUTED', 'FAUXED', 'UNKNOWN'];
  try {
    var fl = [];
    for (var i = 0; i < doc.fonts.length; i++) {
      var f = doc.fonts[i], fn = null, fs = null;
      try { fn = String(f.name); } catch (e) {}
      try { fs = enumName(f.status, FontStatus, FONT_STATUS); } catch (e) { fs = null; }
      fl.push({ name: fn, status: fs });
      try { __diag.push('font\t' + fn + '\tstatus=' + fs + '\tfamily=' + f.fontFamily + '\tstyle=' + f.fontStyleName + '\tps=' + f.postscriptName + '\tfullName=' + f.fullName); } catch (e) { __diag.push('font\t' + fn + '\tdetail-error=' + e); }
    }
    R.fonts = fl;
  } catch (e) { noteErr('fonts', e); }

  // fonts asked for by paragraph styles
  try {
    var sf = [], ps = doc.allParagraphStyles;
    for (var i = 0; i < ps.length; i++) {
      var pst = ps[i];
      try { if (String(pst.name) == '[No Paragraph Style]') continue; } catch (e) {}
      try { addDistinct(sf, fontName(pst.appliedFont)); } catch (e) { noteErr('style_fonts[' + i + ']', e); }
    }
    R.style_fonts = sf;
  } catch (e) { noteErr('style_fonts', e); }

  // fonts asked for by the text itself, sampled on every 11th page (1, 12, 23, ...)
  try {
    var tfs = [], np = doc.pages.length;
    for (var p = 0; p < np; p += 11) {
      try {
        var frames = doc.pages[p].textFrames;
        for (var k = 0; k < frames.length; k++) {
          var vals = null;
          try { vals = frames[k].parentStory.textStyleRanges.everyItem().appliedFont; } catch (e) { vals = null; }
          if (vals === null) {
            try {
              var rs = frames[k].parentStory.textStyleRanges;
              for (var r = 0; r < rs.length; r++) addDistinct(tfs, fontName(rs[r].appliedFont));
            } catch (e2) { noteErr('text_fonts_sample p' + (p + 1) + ' tf' + k, e2); }
          } else {
            if (!(vals instanceof Array)) vals = [vals];
            for (var v = 0; v < vals.length; v++) addDistinct(tfs, fontName(vals[v]));
          }
        }
      } catch (e) { noteErr('text_fonts_sample p' + (p + 1), e); }
    }
    R.text_fonts_sample = tfs;
  } catch (e) { noteErr('text_fonts_sample', e); }

  // links
  try {
    var lk = doc.links, missing = 0;
    for (var i = 0; i < lk.length; i++) { try { if (lk[i].status == LinkStatus.LINK_MISSING) missing++; } catch (e) {} }
    R.links = { total: lk.length, missing: missing };
  } catch (e) { noteErr('links', e); }

  try { __diag.push('app\tversion=' + app.version + '\tdocName=' + doc.name); } catch (e) {}
  try { doc.close(SaveOptions.NO); } catch (e) { noteErr('close', e); }
}
// always leave InDesign with no documents open
try { while (app.documents.length > 0) app.documents[0].close(SaveOptions.NO); } catch (e) { noteErr('close-all', e); }

jval(R) + "\n@@ERRORS@@\n" + __errors.join("\n") + "\n@@DIAG@@\n" + __diag.join("\n");
