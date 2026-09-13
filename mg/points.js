/* Vander-Total-Points Pot — the arithmetic, and nothing else.
 *
 * Loaded by mg/index.html (the board and the entry screen), by mg/record.js
 * (the saved record of an event) and by test/mg.test.js. One copy everywhere,
 * so the TV, the phone and the spreadsheet cannot disagree.
 *
 * THE RULES, as Kyle has ruled them:
 *
 *   Every event is set up on the phone (Kyle, 2026-09-13):
 *   - 5 or 7 matches. The 3-Day and the Member-Member are 5; the 4-Day is 7.
 *   - Any number of teams; plan for 40.
 *   - The MAIN POT pays 1, 2 or 3 places, an amount for each. Usually 1.
 *   - A SECOND POT, usually "Sunday money", on or off, one amount. It is
 *     always the LAST TWO matches: "Yes Sunday is the last two matches. I can
 *     be creative (like putting in zeros if one is cancelled)".
 *   - "no winners to the main pot can win Sunday money ever": every team paid
 *     anything in the main pot, ties included, is out of the second pot. On
 *     2026-09-12, with one place: "Folks who win the total points pot are not
 *     eligible for the Sunday money. And ties split both pots."
 *
 *   TIES (Kyle, 2026-09-13). A group of tied teams takes up as many places as
 *   it has teams, starting at its place, and splits the money for whichever of
 *   those places are paid — evenly, rounded down ("Round down if change"). No
 *   team below it moves up. His examples, each a test in test/mg.test.js:
 *   - 1 place, three tie for 1st          -> they split 1st
 *   - 2 places, one winner, two tie for 2nd -> they split 2nd
 *   - 3 places, two tie at the top -> they split 1st + 2nd;
 *     two tie for 3rd -> they split 3rd
 *   - 3 places, four tie at the top        -> they split all three
 *   - 3 places, one winner, four tie for 2nd -> they split 2nd + 3rd, and
 *     none of the five get Sunday money
 *   The second pot splits evenly among every eligible team tied at its top.
 *
 *   Mid-event all of this is provisional: who is paid is not settled until the
 *   last card, so the board shows it as it stands.
 *
 * How a point is earned is decided on paper, at the club. This file never
 * knows and never needs to.
 */
(function (root) {
  'use strict';

  /* ---------- the shape of an event ---------- */
  var ROUNDS = 5, ROUND_CHOICES = [5, 7], MAXROUNDS = 7;
  var SUNDAY = [3, 4];          /* zero-based: the second pot of a 5-match event */
  function rounds(v) { v = parseInt(v, 10); return ROUND_CHOICES.indexOf(v) >= 0 ? v : ROUNDS; }
  function secondMatches(r) { r = rounds(r); return [r - 2, r - 1]; }

  var PLACES = 1, PLACE_CHOICES = [1, 2, 3];
  function places(v) { v = parseInt(v, 10); return PLACE_CHOICES.indexOf(v) >= 0 ? v : PLACES; }

  var SECOND_NAME = 'Sunday money';
  function secondName(v) { v = String(v === null || v === undefined ? '' : v).trim(); return v || SECOND_NAME; }

  /* The scale a match score can land on. From the 3-Day's rules sheet, read
     2026-09-12: nine-hole matches, 1 point a hole won, 1/2 a hole halved, a
     bonus point to the winner, a tied match 5 each, and "the maximum point
     threshold during any one match will be restricted to 8 points". Halves,
     0 to 8. Both are settings, because the next event has its own sheet. A
     score is one of these values and nothing else, which is why the phone
     needs no keyboard and a typo is not possible. */
  /* A SCORE IS WHATEVER NUMBER IS TYPED. Kyle, 2026-09-13: "some tournaments
     have adhoc rules about the total number of points you can win in a round.
     So don't ever create any check that relies on points because it can be
     screwy." And: "sometimes the points are set up for negative numbers".
     So there is no cap, no floor and no step — only "is it a number". (Until
     that ruling the phone offered 0 to 8 in halves, from the 3-Day's sheet.) */
  function score(v) {
    if (v === null || v === undefined || typeof v === 'boolean') return null;
    var s = String(v).trim().replace(/−/g, '-');
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? Math.round(n * 1000) / 1000 : null;
  }

  /* How the board rotates. Kyle, 2026-09-12: "make that a setting I can do".
     100 means "all": with 40 teams that is every team on one page. */
  var ROWS_DEFAULT = 9, SECS_DEFAULT = 10;
  var ROWS_CHOICES = [6, 9, 13, 100];
  var SECS_CHOICES = [5, 10, 15, 20, 30];
  function rows(v) { v = parseInt(v, 10); return (v >= 4 && v <= 100) ? v : ROWS_DEFAULT; }
  function secs(v) { v = parseInt(v, 10); return (v >= 3 && v <= 120) ? v : SECS_DEFAULT; }

  /* ---------- names ---------- */
  /* "Wessendorf & Grieder", but "Gary & Carl Valimont" when a team shares a
     surname — "Valimont & Valimont" tells nobody who is playing. A team with
     one name typed so far shows that name whole. */
  function teamName(pair) {
    pair = pair || [];
    var a = String(pair[0] || '').trim(), b = String(pair[1] || '').trim();
    if (!a || !b) return a || b;
    var al = a.split(/\s+/), bl = b.split(/\s+/);
    var alast = al[al.length - 1], blast = bl[bl.length - 1];
    if (alast === blast && al.length > 1) return al.slice(0, -1).join(' ') + ' & ' + b;
    return alast + ' & ' + blast;
  }
  /* a roster as typed: pairs of trimmed strings, nothing else */
  function cleanTeams(list) {
    return (Array.isArray(list) ? list : []).map(function (p) {
      p = Array.isArray(p) ? p : [];
      return [String(p[0] || '').trim(), String(p[1] || '').trim()];
    });
  }
  /* any player typed twice — a sheet read wrong, or a name entered on two teams */
  function duplicates(list) {
    var seen = {}, dup = [];
    cleanTeams(list).forEach(function (p) {
      p.forEach(function (n) {
        var k = n.toLowerCase().replace(/\s+/g, ' ');
        if (!k) return;
        if (seen[k] && dup.indexOf(n) < 0) dup.push(n);
        seen[k] = true;
      });
    });
    return dup;
  }

  /* ---------- money ---------- */
  /* Whole dollars only; anything that is not a positive amount is no amount,
     and no amount shows nothing. Kyle, 2026-09-13: "Round down if change". */
  function money(v) {
    v = Math.floor(Number(v));
    return (isFinite(v) && v > 0 && v <= 1000000) ? v : 0;
  }
  function share(total, n) {
    total = money(total); n = parseInt(n, 10);
    return (total && n > 0) ? Math.floor(total / n) : 0;
  }
  function dollars(v) { return '$' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function placeName(p) { return ['', '1st', '2nd', '3rd'][p] || (p + 'th'); }

  /* THE MONEY MUST ADD UP. Kyle, 2026-09-13: "Teams are always $100 per team.
     So the total payouts better match the math!" teams: how many are in.
     S: from setup(). Only the places actually paid count, and the second pot
     only when it is on. diff > 0 is more typed than came in; < 0 is short. */
  var ENTRY = 100;
  function purse(teams, S) {
    S = S || {};
    var n = Math.max(0, parseInt(teams, 10) || 0), N = places(S.places), typed = 0;
    for (var p = 0; p < N; p++) typed += money((S.prizes || [])[p]);
    if (S.second && S.second.on !== false) typed += money(S.second.amount);
    return { teams: n, entries: n * ENTRY, typed: typed, diff: typed - n * ENTRY };
  }
  /* The money is shown only when Final was sent AND it adds up. Kyle,
     2026-09-13: "If the money doesnt match don't let me even show it on the
     tv!" The phone will not send Final, and the board and the record check
     again, in case the money was changed after Final. */
  function moneyReady(teams, S) {
    S = S || {};
    return S.final === true && moneyProblems(teams, S).length === 0;
  }
  /* Everything wrong with the money, in plain words; empty when it is right.
     Kyle, 2026-09-13: "Teams are always $100 per team", "there will never be
     zero money for a place", and "the Sunday money will always be less than
     or equal to any payout for the big pot". These are checks on MONEY, never
     on points. */
  function moneyProblems(teams, S) {
    S = S || {};
    var c = purse(teams, S), N = places(S.places), out = [], smallest = null;
    for (var p = 1; p <= N; p++) {
      var m = money((S.prizes || [])[p - 1]);
      if (!m) out.push(placeName(p) + ' place has no money');
      else if (smallest === null || m < smallest.m) smallest = { p: p, m: m };
    }
    var s2 = S.second || {};
    if (s2.on !== false && smallest && money(s2.amount) > smallest.m)
      out.push(secondName(s2.name) + ' (' + dollars(money(s2.amount)) + ') is more than ' + placeName(smallest.p) + ' place (' + dollars(smallest.m) + ')');
    if (c.diff !== 0)
      out.push(c.teams + (c.teams === 1 ? ' team' : ' teams') + ' × ' + dollars(ENTRY) + ' = ' + dollars(c.entries) + ', but ' + dollars(c.typed) + ' is typed — ' +
        dollars(Math.abs(c.diff)) + (c.diff < 0 ? ' short' : ' too much'));
    return out;
  }

  /* ---------- the standings ---------- */
  function num(v) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  /* an unentered match is not a zero, it is absent — but for a running total
     the two come to the same number. The difference shows in `played`. */
  /* rounded to 3 places, so 0.1 + 0.2 ties 0.3 — unrounded it came out
     0.30000000000000004 and one team took money two teams should split */
  function sum(r, which) {
    var t = 0;
    for (var k = 0; k < which.length; k++) { var v = num(r[which[k]]); if (v !== null) t += v; }
    return Math.round(t * 1000) / 1000;
  }
  function counted(r, which) {
    var n = 0;
    for (var k = 0; k < which.length; k++) if (num(r[which[k]]) !== null) n++;
    return n;
  }

  /* standard competition ranking: 1, 2, 2, 4. Ties split the money, so they
     must show as ties on the board, not as an arbitrary order. */
  function rankBy(list, field) {
    var order = list.slice().sort(function (a, b) { return b[field] - a[field]; });
    var rank = 0, seen = 0, last = null;
    order.forEach(function (r) {
      seen++;
      if (last === null || r[field] !== last) { rank = seen; last = r[field]; }
      r[field === 'total' ? 'rank' : 'sunRank'] = rank;
    });
    return order;
  }

  /* teams: [[name, name], ...]; points: one row per team, null = not in yet.
     opts: { rounds: 5|7, places: 1|2|3, second: true|false } — all optional,
     and a 5-match, 1-place event with a second pot when left out. */
  function standings(teams, points, opts) {
    opts = opts || {};
    var R = rounds(opts.rounds), N = places(opts.places), second = opts.second !== false;
    var all = [];
    for (var k = 0; k < R; k++) all.push(k);
    var SUN = secondMatches(R);
    var list = (teams || []).map(function (pair, i) {
      var src = (points && points[i]) || [];
      var r = [];
      for (var k = 0; k < R; k++) r.push(num(src[k]));
      return {
        i: i, name: teamName(pair), players: pair,
        rounds: r,
        total: sum(r, all), played: counted(r, all),
        sunday: sum(r, SUN), sundayPlayed: counted(r, SUN)
      };
    });
    var byTotal = rankBy(list, 'total');

    /* Anyone standing in a paid place of the main pot — ties included, because
       a tie that reaches a paid place is paid — is out of the second pot. They
       keep their second-pot points, which are a fact, but get no rank there,
       so nothing can show them in line for money they cannot win. */
    /* "no winners to the main pot can win Sunday money ever" — a winner is a
       team that gets money. When the prizes are known, a place typed as $0
       pays nothing, so its team is not a winner; without prizes, standing in a
       paid place is enough. */
    var prizes = Array.isArray(opts.prizes) ? opts.prizes.map(money) : null;
    var sizes = {};
    list.forEach(function (r) { sizes[r.total] = (sizes[r.total] || 0) + 1; });
    list.forEach(function (r) {
      var paid = r.rank <= N;
      if (paid && prizes) {
        var got = 0;
        for (var p = r.rank; p <= Math.min(N, r.rank + sizes[r.total] - 1); p++) got += prizes[p - 1] || 0;
        paid = got > 0;
      }
      r.paidPlace = paid;
      r.potWinner = r.paidPlace;
      r.sunEligible = second && !r.paidPlace;
    });
    rankBy(list.filter(function (r) { return r.sunEligible; }), 'sunday');
    list.forEach(function (r) { if (!r.sunEligible) r.sunRank = null; });

    return byTotal;                     /* in total order */
  }

  /* everyone tied at the top of a pot. For 'sunday' this is already the
     eligible set, because an ineligible team has no sunRank. */
  function leaders(list, field) {
    var key = field === 'sunday' ? 'sunRank' : 'rank';
    return list.filter(function (r) { return r[key] === 1; });
  }

  /* Who is paid what. rows: from standings(), with the same opts.
     cfg: { places, prizes: [1st, 2nd, 3rd], second: { on, amount } }.
     Returns { main: [group...], second: {teams, each, amount} | null, byTeam }
     where a group is { start, end, places: [paid places], teams, total, each }. */
  function payout(list, cfg) {
    cfg = cfg || {};
    var N = places(cfg.places), prizes = (cfg.prizes || []).map(money);
    var order = list.slice().sort(function (a, b) { return b.total - a.total; });
    var main = [], byTeam = {}, i = 0;
    while (i < order.length) {
      var j = i;
      while (j < order.length && order[j].total === order[i].total) j++;
      var start = i + 1, end = j;
      if (start > N) break;
      var paid = [], total = 0;
      for (var p = start; p <= Math.min(N, end); p++) { paid.push(p); total += prizes[p - 1] || 0; }
      var g = order.slice(i, j), each = Math.floor(total / g.length);
      main.push({ start: start, end: end, places: paid, teams: g, total: total, each: each });
      g.forEach(function (r) { byTeam[r.i] = (byTeam[r.i] || 0) + each; });
      i = j;
    }
    var second = null, s2 = cfg.second || {};
    if (s2.on !== false && cfg.second) {
      var played = list.some(function (r) { return r.sunEligible && r.sundayPlayed > 0; });
      var top = played ? leaders(list, 'sunday') : [];
      var e2 = share(s2.amount, top.length);
      second = { teams: top, each: e2, amount: money(s2.amount) };
      top.forEach(function (r) { byTeam[r.i] = (byTeam[r.i] || 0) + e2; });
    }
    return { main: main, second: second, byTeam: byTeam };
  }

  /* the highest match number anybody has a score for: "after match 3" */
  function roundsIn(points, R) {
    R = R ? rounds(R) : MAXROUNDS;
    var n = 0;
    (points || []).forEach(function (r) {
      for (var k = 0; k < R; k++) if (num((r || [])[k]) !== null && k + 1 > n) n = k + 1;
    });
    return n;
  }
  /* how many teams have a score for one match — the entry screen's counter */
  function entered(points, round0) {
    var n = 0;
    (points || []).forEach(function (r) { if (num((r || [])[round0]) !== null) n++; });
    return n;
  }

  /* Everything an event is set up with, read from what the phone sent. A
     payload from before 7 matches and paid places (pot, sun) still reads right:
     5 matches, 1 place, the pot as 1st, Sunday money on. */
  function setup(j) {
    j = j || {};
    var prizes = Array.isArray(j.prizes) ? j.prizes : [j.pot];
    var s = j.second && typeof j.second === 'object' ? j.second : { on: true, amount: j.sun };
    return {
      rounds: rounds(j.rounds),
      places: places(j.places),
      prizes: [money(prizes[0]), money(prizes[1]), money(prizes[2])],
      second: { on: s.on !== false, name: secondName(s.name), amount: money(s.amount) },
      final: j.final === true
    };
  }

  /* WIDTHS ARE SHARES, NOT PIXELS, and they add to 100 (2026-09-12: fixed
     pixel columns left the team column nothing on a phone and on the TV, and
     every name disappeared). With 7 matches the match columns get narrower,
     never the team column, which keeps at least 30 on a television. */
  function shares(R, second, phone) {
    R = rounds(R); second = second !== false;
    var w = phone
      ? (R === 7 ? { pos: 7, r: 5, tot: 12, sun: 10 } : { pos: 8, r: 6, tot: 13, sun: 11 })
      : (R === 7 ? { pos: 5, r: 5.5, tot: 12, sun: 12 } : { pos: 6, r: 7, tot: 14, sun: 13 });
    if (!second) w.sun = 0;
    w.team = Math.round((100 - w.pos - w.r * R - w.tot - w.sun) * 10) / 10;
    return w;
  }

  var API = {
    ROUNDS: ROUNDS, ROUND_CHOICES: ROUND_CHOICES, MAXROUNDS: MAXROUNDS, SUNDAY: SUNDAY,
    rounds: rounds, secondMatches: secondMatches,
    PLACES: PLACES, PLACE_CHOICES: PLACE_CHOICES, places: places,
    SECOND_NAME: SECOND_NAME, secondName: secondName,
    score: score, moneyReady: moneyReady, moneyProblems: moneyProblems,
    ROWS_DEFAULT: ROWS_DEFAULT, SECS_DEFAULT: SECS_DEFAULT,
    ROWS_CHOICES: ROWS_CHOICES, SECS_CHOICES: SECS_CHOICES, rows: rows, secs: secs,
    teamName: teamName, cleanTeams: cleanTeams, duplicates: duplicates,
    money: money, share: share, dollars: dollars, placeName: placeName, ENTRY: ENTRY, purse: purse,
    standings: standings, leaders: leaders, payout: payout,
    roundsIn: roundsIn, entered: entered, setup: setup, shares: shares
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Points = API;
})(typeof window !== 'undefined' ? window : this);
