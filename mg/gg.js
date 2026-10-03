/* Golf Genius → Vanderpool. Reads a tournament's team standings off Golf
 * Genius and lines its teams up with the ones on Kyle's phone.
 *
 * Kyle, 2026-10-02: "can you read off the points for round 1 and enter them in
 * somehow?", then, once a seat had read the wrong page twice, a Setup box for
 * the tournament's Golf Genius link and a button on Scores. Hand entry stays
 * exactly as it was; this only fills a match he then looks over and saves.
 *
 * WHICH PAGE. Golf Genius shows the same points three ways:
 *   - "Total Points" (/v2tournaments/total_points): each PLAYER gets half his
 *     team's points, so 6.5 reads as 3.25. Never read. Seats read it twice.
 *   - the round's match page: team against team, or player against player in
 *     singles — a team's singles points would have to be added up.
 *   - the TEAM STANDINGS (this file): one row a team, "Last, First + Last,
 *     First", a column group a round (SC BB CHAP ALT SNGLS for the 2026
 *     Member-Member), the team's points under each round, the total at the
 *     right. Singles come already added up as the team's.
 * Golf Genius sends Access-Control-Allow-Origin: * on all of these (checked
 * 2026-10-02), so the phone reads them itself — no seat, no Drive file.
 *
 * THE READING CHECK is structural, never a points rule (Kyle, 2026-09-13:
 * "don't ever create any check that relies on points"): each team's rounds
 * must add up to the total Golf Genius prints beside them. A column read out
 * of line fails it.
 *
 * Pure functions on the page's text, so the same code runs on the phone and
 * under node (test/gg.test.js). No DOM.
 */
(function (root) {
  'use strict';

  var BASE = 'https://www.golfgenius.com';

  function decode(s) {
    return String(s || '')
      .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); })
      .replace(/&amp;/g, '&');
  }
  function text(html) { return decode(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }

  /* what Kyle pasted → an absolute golfgenius.com address, or null */
  function cleanLink(raw) {
    var m = /(?:https?:\/\/)?(?:www\.)?golfgenius\.com(\/[^\s"'<>]*)/i.exec(String(raw || ''));
    return m ? BASE + m[1] : null;
  }
  /* the league id, from a link or from the page it led to (its results iframe) */
  function league(s) {
    var m = /\/leagues\/(\d+)|[?&]league_id=(\d+)/.exec(String(s || ''));
    return m ? (m[1] || m[2]) : null;
  }
  function widget(id) { return BASE + '/leagues/' + id + '/widgets/tournament_results?shared=false'; }
  /* every results page the widget links to, the per-player Total Points page left out */
  function candidates(html) {
    var out = [], seen = {}, re = /\/v2tournaments\/(\d+)\?[^"']*/g, m;
    while ((m = re.exec(String(html || '')))) {
      if (seen[m[1]]) continue;
      seen[m[1]] = true;
      out.push(BASE + '/v2tournaments/' + m[1] + '?player_stats_for_portal=true');
    }
    return out;
  }

  function cells(tr) {
    var out = [], re = /<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/g, m;
    while ((m = re.exec(tr))) out.push({ attrs: m[2], html: m[3], text: text(m[3]) });
    return out;
  }
  function num(s) {
    var t = String(s || '').replace(/\s+/g, '');
    return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
  }
  function players(name) {
    return decode(name).split('+').map(function (p) {
      var bits = p.split(',');
      return [bits[0].trim(), (bits.slice(1).join(',')).trim()];
    });
  }

  /* THE TEAM STANDINGS, read. Returns null when the page is not one.
     { event, rounds:["SC",...], flights, teams:[{ name, players:[[last,first],[last,first]],
       pts:[n|null per round], live:[true when still on the course], total }] } */
  function standings(html) {
    html = String(html || '');
    var trs = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || [];
    var layout = null, labels = null, rounds = null, flights = 0, teams = [], pending = null;
    for (var i = 0; i < trs.length; i++) {
      var tr = trs[i], head = /^<tr\b[^>]*class=['"][^'"]*\bheader\b/.test(tr);
      if (head && /scope_name/.test(tr)) { flights++; continue; }
      if (head && /<th\b[^>]*class=['"]name['"]/.test(tr)) {
        /* first header row: Pos., Team, one cell per round (colspan), Points */
        var ths = cells(tr), groups = [];
        ths.forEach(function (c) {
          if (/class=['"](pos|name|points)['"]/.test(c.attrs)) return;
          var span = /colspan=['"]?(\d+)/.exec(c.attrs);
          groups.push({ label: c.text, span: span ? +span[1] : 1 });
        });
        pending = groups;
        continue;
      }
      if (head && pending) {
        /* second header row: what each column under a round holds */
        var subs = (tr.match(/data-format-text=['"]([a-z_]+)['"]/g) || []).map(function (s) { return /=['"]([a-z_]+)/.exec(s)[1]; });
        var at = 0;
        layout = pending.map(function (g) { var part = subs.slice(at, at + g.span); at += g.span; return { label: g.label, cols: part }; });
        if (at !== subs.length) return null;
        var labs = layout.map(function (g) { return g.label; }).join('|');
        if (labels !== null && labs !== labels) return null;   /* flights must agree on the rounds */
        labels = labs; rounds = layout.map(function (g) { return g.label; });
        pending = null;
        continue;
      }
      var nm = /data-aggregate-name=['"]([^'"]*)['"]/.exec(tr);
      if (!nm || !/aggregate-row/.test(tr) || !layout) continue;
      var cs = cells(tr);
      var want = 2 + layout.reduce(function (s, g) { return s + g.cols.length; }, 0) + 1;
      if (cs.length !== want) return null;
      var at2 = 2, pts = [], live = [];
      layout.forEach(function (g) {
        var part = cs.slice(at2, at2 + g.cols.length); at2 += g.cols.length;
        var pi = g.cols.indexOf('points'), si = g.cols.indexOf('status');
        var status = si >= 0 ? part[si].text : '';
        pts.push(pi >= 0 ? num(part[pi].text) : null);
        live.push(status !== '' && status !== '-');
      });
      teams.push({ name: decode(nm[1]).replace(/\s+/g, ' ').trim(), players: players(nm[1]), pts: pts, live: live, total: num(cs[cs.length - 1].text) });
    }
    if (!rounds || !teams.length) return null;
    if (!teams.every(function (t) { return t.players.length === 2 && t.players[0][0] && t.players[1][0]; })) return null;
    var title = /<title>([\s\S]*?)<\/title>/.exec(html);
    return { event: title ? text(title[1]).replace(/^Golf Genius ::\s*/, '') : '', rounds: rounds, flights: flights, teams: teams };
  }

  /* each team's rounds against the total Golf Genius prints: the teams that do not add up */
  function unbalanced(st) {
    return st.teams.filter(function (t) {
      var sum = t.pts.reduce(function (s, v) { return s + (v === null ? 0 : v); }, 0);
      var tot = t.total === null ? 0 : t.total;
      return Math.abs(sum - tot) > 0.001;
    });
  }

  /* ---------- matching Kyle's teams to Golf Genius's ---------- */
  var SUFFIX = /^(jr|sr|ii|iii|iv)$/;
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  }
  /* "Kyle Vanderlick" → { last:"vanderlick", init:"k" } */
  function mine(name) {
    var w = String(name || '').trim().split(/\s+/).filter(function (x) { return x && !SUFFIX.test(norm(x)); });
    return { last: norm(w.length > 1 ? w.slice(1).join('') : w[0] || ''), init: norm(w.length > 1 ? w[0] : '').charAt(0) };
  }
  function theirs(p) {
    var last = p[0].split(/\s+/).filter(function (x) { return !SUFFIX.test(norm(x)); }).join('');
    return { last: norm(last), init: norm(p[1]).charAt(0) };
  }
  function lev(a, b) {
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) d[i] = [i];
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  /* how far apart two last names are: 0 the same, 2–3 a misspelling (Golf
     Genius has Kyle as "Vandrelick"), 9 different people. A first name is only
     a tiebreak — Bob on Golf Genius is Robert on the phone. */
  function gap(a, b) {
    if (a.last === b.last) return 0;
    if (a.init && b.init && a.init !== b.init) return 9;
    var d = lev(a.last, b.last);
    return (a.last.length >= 5 && d <= 2) ? d + 1 : 9;
  }
  function pairGap(A, B) {
    return Math.min(gap(A[0], B[0]) + gap(A[1], B[1]), gap(A[0], B[1]) + gap(A[1], B[0]));
  }
  /* the first initials as a tiebreak between teams with the same last names
     (two Bedard teams in 2026): 0 when they agree */
  function initGap(A, B) {
    function d(x, y) { return (x.init && y.init && x.init !== y.init) ? 1 : 0; }
    return Math.min(d(A[0], B[0]) + d(A[1], B[1]), d(A[0], B[1]) + d(A[1], B[0]));
  }
  function exact(A, B) {
    return [A[0].last, A[1].last].sort().join('/') === [B[0].last, B[1].last].sort().join('/');
  }
  /* for each of Kyle's teams: { g: index into st.teams or -1, how: "same" |
     "spelled differently" | "not found" | "more than one" } — a Golf Genius team
     claimed by two of Kyle's is given to neither */
  function match(teams, st) {
    var G = st.teams.map(function (t) { return t.players.map(theirs); });
    var out = teams.map(function (pair) {
      var A = [mine(pair[0]), mine(pair[1])];
      var hit = [];
      G.forEach(function (B, gi) { if (exact(A, B)) hit.push(gi); });
      if (hit.length > 1) hit = hit.filter(function (gi) { return initGap(A, G[gi]) === 0; });
      if (hit.length === 1) return { g: hit[0], how: 'same' };
      if (hit.length > 1) return { g: -1, how: 'more than one' };
      var best = 99, at = [];
      G.forEach(function (B, gi) { var d = pairGap(A, B); if (d < best) { best = d; at = [gi]; } else if (d === best) at.push(gi); });
      if (best <= 3 && at.length === 1) return { g: at[0], how: 'spelled differently' };
      return { g: -1, how: best <= 3 ? 'more than one' : 'not found' };
    });
    var claims = {};
    out.forEach(function (m) { if (m.g >= 0) claims[m.g] = (claims[m.g] || 0) + 1; });
    out.forEach(function (m) { if (m.g >= 0 && claims[m.g] > 1) { m.g = -1; m.how = 'more than one'; } });
    return out;
  }

  /* WHAT ONE MATCH WOULD DO to the phone: a row per team.
     kind: "new" (phone empty, Golf Genius has it) · "same" · "differs" ·
     "playing" (on the course now) · "none" (no points posted) · "missing" (not matched) */
  function plan(teams, points, r, st) {
    var m = match(teams, st);
    return teams.map(function (pair, i) {
      var mm = m[i], mineV = (points[i] || [])[r];
      mineV = (mineV === undefined) ? null : mineV;
      var row = { i: i, mine: mineV, gg: null, how: mm.how, name: mm.g >= 0 ? st.teams[mm.g].name : '' };
      if (mm.g < 0) { row.kind = 'missing'; return row; }
      var t = st.teams[mm.g];
      if (r >= t.pts.length) { row.kind = 'none'; return row; }
      if (t.live[r]) { row.kind = 'playing'; return row; }
      row.gg = t.pts[r];
      if (row.gg === null) row.kind = 'none';
      else if (mineV === null) row.kind = 'new';
      else row.kind = Math.abs(mineV - row.gg) < 0.001 ? 'same' : 'differs';
      return row;
    });
  }

  var GG = { cleanLink: cleanLink, league: league, widget: widget, candidates: candidates,
    standings: standings, unbalanced: unbalanced, match: match, plan: plan };
  if (typeof module !== 'undefined' && module.exports) module.exports = GG;
  root.GG = GG;
})(typeof window !== 'undefined' ? window : this);
