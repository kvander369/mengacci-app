/* The saved record of one Vander-Total-Points Pot event, as an Excel file.
 *
 * Used in two places, so they cannot disagree:
 *   - tools/closeout.js on this machine, when Kyle says "close out the
 *     tournament" — it writes tournaments\<date> <event>.xlsx;
 *   - the phone's Share results button, when no seat is there to do it.
 *
 * Kyle, 2026-09-13: "It might be nice to memorialize the end of every
 * tournament", and "in case you go down, I need an option". The standings and
 * the payouts come from points.js, the same arithmetic the board ran.
 *
 * No library. An .xlsx is a zip of XML files; this writes the zip uncompressed
 * (a few kilobytes either way), which needs only a CRC, and works the same in
 * Node and in a phone's browser.
 */
(function (root) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('./points.js') : root.Points;

  /* ---------- zip, stored ---------- */
  var CRC = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t.push(c >>> 0);
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(s) { return new TextEncoder().encode(s); }
  function zip(files) {
    var parts = [], central = [], offset = 0, names = Object.keys(files);
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    names.forEach(function (name) {
      var data = utf8(files[name]), nm = utf8(name), crc = crc32(data);
      var common = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(nm.length), u16(0));
      var local = new Uint8Array([].concat(u32(0x04034b50), common));
      parts.push(local, nm, data);
      central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(offset))), nm);
      offset += local.length + nm.length + data.length;
    });
    var cdSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(names.length), u16(names.length), u32(cdSize), u32(offset), u16(0)));
    var all = parts.concat(central, [end]), size = all.reduce(function (a, b) { return a + b.length; }, 0);
    var out = new Uint8Array(size), at = 0;
    all.forEach(function (b) { out.set(b, at); at += b.length; });
    return out;
  }

  /* ---------- a workbook ---------- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function colName(i) { var s = ''; i++; while (i) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  /* rows: arrays of cells; a cell is a string, a number, null, or {v, bold} */
  function sheetXml(rows, widths) {
    var cols = widths ? '<cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' : '';
    var body = rows.map(function (row, r) {
      return '<row r="' + (r + 1) + '">' + (row || []).map(function (c, ci) {
        if (c === null || c === undefined || c === '') return '';
        var bold = typeof c === 'object' && c.bold, v = typeof c === 'object' ? c.v : c;
        var ref = colName(ci) + (r + 1), s = bold ? ' s="1"' : '';
        return typeof v === 'number'
          ? '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>'
          : '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
      }).join('') + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + cols + '<sheetData>' + body + '</sheetData></worksheet>';
  }
  function workbook(sheets) {
    var files = {};
    files['[Content_Types].xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>';
    files['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    files['xl/workbook.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map(function (s, i) { return '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>';
    files['xl/_rels/workbook.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    files['xl/styles.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>';
    sheets.forEach(function (s, i) { files['xl/worksheets/sheet' + (i + 1) + '.xml'] = sheetXml(s.rows, s.widths); });
    return zip(files);
  }

  /* ---------- the record ---------- */
  /* round: what the phone sends (or the channel holds). opts: { date, note } */
  function build(round, opts) {
    opts = opts || {};
    var j = round || {}, S = P.setup(j), R = S.rounds;
    var teams = P.cleanTeams(j.teams), pts = j.points || [];
    var list = P.standings(teams, pts, { rounds: R, places: S.places, second: S.second.on, prizes: S.prizes });
    var pay = P.payout(list, { places: S.places, prizes: S.prizes, second: S.second });
    var n = teams.length, when = new Date(j.posted);
    function b(v) { return { v: v, bold: true }; }
    function names(g) { return g.map(function (r) { return r.name; }).join(', '); }
    function placeLabel(g) {
      var label = P.placeName(g.start) + ' place';
      if (g.teams.length > 1) label += ' — ' + g.teams.length + ' tied' + (g.places.length > 1 ? ', sharing ' + g.places.map(P.placeName).join(' + ') : '');
      return label;
    }
    /* paid only when Final was sent AND the money adds up to $100 a team */
    /* every team that is in: named, or with a score — the same count as the phone */
    var named = teams.filter(function (t, i) { return t[0] || t[1] || (pts[i] || []).some(function (v) { return v !== null && v !== undefined; }); }).length;
    var ready = P.moneyReady(named, S);
    var problems = P.moneyProblems(named, S);
    var notPaid = S.final ? 'not paid by the board (the money was not right: ' + problems.join('; ') + ')' : 'not paid by the board (Final was not sent)';

    var summary = [
      [b('Event'), j.event || ''],
      [b('Date closed out'), opts.date || ''],
      [b('Club'), 'Country Club of Waterbury'],
      [b('Board title, as last sent'), j.title || ''],
      [b('Last sent to the TV'), isNaN(when) ? '' : when.toLocaleString('en-US', { timeZone: 'America/New_York' })],
      [b('Teams'), n],
      [b('Matches in the event'), R]
    ];
    for (var k = 0; k < R; k++) summary.push([b('Match ' + (k + 1) + ' scores in'), P.entered(pts, k) + ' of ' + n]);
    summary.push([], [b('What happened'), opts.note || ''], []);
    summary.push([b('Main pot pays'), S.places + (S.places === 1 ? ' place' : ' places')]);
    for (var p = 1; p <= S.places; p++) summary.push([b(P.placeName(p) + ' place money (typed)'), S.prizes[p - 1] ? P.dollars(S.prizes[p - 1]) : '']);
    summary.push([b('Second pot'), S.second.on ? S.second.name + ' — matches ' + (R - 1) + ' and ' + R : 'none']);
    if (S.second.on) summary.push([b(S.second.name + ' (typed)'), S.second.amount ? P.dollars(S.second.amount) : '']);
    summary.push([b('Final sent to the TV'), S.final ? 'Yes' : 'No'], []);
    /* Kyle, 2026-09-13: "Teams are always $100 per team. So the total payouts
       better match the math!" */
    var c = P.purse(named, S);
    summary.push([b('Entries'), named + ' teams × ' + P.dollars(P.ENTRY) + ' = ' + P.dollars(c.entries)]);
    summary.push([b('Money typed'), P.dollars(c.typed) + (c.diff === 0 ? ' — matches the entries' : c.diff < 0 ? ' — ' + P.dollars(-c.diff) + ' SHORT of the entries' : ' — ' + P.dollars(c.diff) + ' MORE than the entries')]);
    if (ready) {
      var paid = 0;
      Object.keys(pay.byTeam).forEach(function (k) { paid += pay.byTeam[k]; });
      summary.push([b('Paid out by the board'), P.dollars(paid) + (c.typed - paid ? ' — ' + P.dollars(c.typed - paid) + ' typed but not paid (rounded down, or nobody to pay)' : '')]);
    }
    summary.push([]);
    summary.push([b(ready ? 'Paid, as the board had it' : 'Standing, as the board had it (not paid)')]);
    pay.main.forEach(function (g) {
      summary.push([b(placeLabel(g)), names(g.teams)]);
      summary.push(['   total ' + g.teams[0].total + ' points', ready && g.each ? P.dollars(g.each) + (g.teams.length > 1 ? ' each' : '') : (ready ? '' : notPaid)]);
    });
    if (pay.second) {
      summary.push([b(S.second.name), pay.second.teams.length ? names(pay.second.teams) : 'no scores in matches ' + (R - 1) + ' and ' + R]);
      if (pay.second.teams.length) summary.push(['   ' + pay.second.teams[0].sunday + ' points', ready && pay.second.each ? P.dollars(pay.second.each) + (pay.second.teams.length > 1 ? ' each' : '') : (ready ? '' : notPaid)]);
    }
    summary.push([], ['Standings use mg/points.js, the arithmetic the board ran. No team paid in the main pot can win the second pot. Ties split the money for the paid places they take up, rounded down. A blank score was never entered.']);

    var head = ['Place', 'Team', 'Player', 'Player'];
    for (k = 0; k < R; k++) head.push('Match ' + (k + 1));
    head.push('Total');
    if (S.second.on) head.push(S.second.name + ' (' + (R - 1) + '+' + R + ')', S.second.name + ' eligible');
    if (ready) head.push('Paid');
    var standings = [head.map(b)].concat(list.map(function (r) {
      var row = [r.rank, r.name, r.players[0], r.players[1]].concat(r.rounds.map(function (v) { return v === null ? null : v; }), [r.total]);
      if (S.second.on) row.push(r.sundayPlayed ? r.sunday : null, r.sunEligible ? 'yes' : 'no — paid in the main pot');
      if (ready) row.push(pay.byTeam[r.i] ? P.dollars(pay.byTeam[r.i]) : null);
      return row;
    }));

    var eh = ['#', 'Player', 'Player'];
    for (k = 0; k < R; k++) eh.push('Match ' + (k + 1));
    var entered = [eh.map(b)].concat(teams.map(function (t, i) {
      var row = [i + 1, t[0], t[1]];
      for (var k2 = 0; k2 < R; k2++) { var v = (pts[i] || [])[k2]; row.push(v === null || v === undefined ? null : v); }
      return row;
    }));

    var rw = [];
    for (k = 0; k < R; k++) rw.push(9);
    return workbook([
      { name: 'Summary', rows: summary, widths: [46, 70] },
      { name: 'Standings', rows: standings, widths: [7, 26, 20, 20].concat(rw, [8, 20, 22, 10]) },
      { name: 'Scores as entered', rows: entered, widths: [5, 20, 20].concat(rw) }
    ]);
  }

  /* "2026-09-13 3-Day Member Guest.xlsx" — nothing a file system refuses */
  function fileName(round, date) {
    return (date + ' ' + ((round && round.event) || 'Points pot')).replace(/[\\/:*?"<>|]/g, '-').trim() + '.xlsx';
  }

  var API = { build: build, fileName: fileName, zip: zip, crc32: crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Record = API;
})(typeof window !== 'undefined' ? window : this);
