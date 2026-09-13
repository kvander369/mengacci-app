/* Vander-Total-Points Pot — the arithmetic, and nothing else.
 *
 * Loaded by mg/index.html (the board and the entry screen) and by
 * test/mg.test.js. One copy, both ends, so the TV cannot disagree with the
 * phone — the same arrangement Mengacci uses for ../app/scoring.js.
 *
 * The rules, in full:
 *   - 25 teams, 5 matches. Kyle types the points each team's card came in with.
 *   - The pot goes to the most points over all 5. Ties split.
 *   - "Sunday money" goes to the most points over matches 4 and 5. Ties split.
 *   - A team that wins the total points pot is NOT eligible for Sunday money.
 *     Kyle, 2026-09-12: "Folks who win the total points pot are not eligible
 *     for the Sunday money. And ties split both pots." So if two teams tie for
 *     the pot, both are out of Sunday money, and Sunday goes to the best score
 *     over matches 4 and 5 among everyone else — ties there splitting it.
 *     Mid-round this is provisional, because who wins the pot is not settled
 *     until the last card is in; the board shows it as it stands.
 * How a point is earned is decided on paper, at the club. This file never
 * knows and never needs to.
 */
(function (root) {
  'use strict';

  var ROUNDS = 5;
  var SUNDAY = [3, 4];          /* zero-based: matches 4 and 5 */

  /* The scale a match score can land on. From the event's own rules sheet,
     read 2026-09-12:

       five 9-hole matches, each match worth 10 points in total
       1 point a hole won, 1/2 a hole halved, 0 a hole lost
       1 bonus point to the winning team
       a tied match is 5 points each
       "the maximum point threshold during any one match will be
        restricted to 8 points"

     Nine holes at a half each is why every score is a half, and the 8-point
     cap is why the panel stops there — 9 holes won plus the bonus would be
     10 without it. Both are settings and not baked in, because Kyle runs a
     points pool at every club event and the next one will have its own sheet.
     A score is one of these values and nothing else, which is why the phone
     needs no keyboard and a typo is not possible. */
  var STEPS = [0.25, 0.5, 1];
  var STEP = 0.5, MAX = 8;
  function step(s) { s = Number(s); return STEPS.indexOf(s) >= 0 ? s : STEP; }
  function max(m) { m = Number(m); return (isFinite(m) && m > 0 && m <= 100) ? m : MAX; }
  function scale(s, m) {
    s = step(s); m = max(m);
    var a = [], n = Math.floor(m / s + 1e-9);
    for (var i = 0; i <= n; i++) a.push(Math.round(i * s * 100) / 100);
    return a;
  }
  /* How the board rotates. Kyle, 2026-09-12: "next version of app, make that
     a setting I can do" — a setting he can only reach by typing ?secs=15 on a
     Fire TV remote is not a setting he has. Validated here so the phone, the
     board and the gate all agree what a legal value is. */
  var ROWS_DEFAULT = 9, SECS_DEFAULT = 10;
  var ROWS_CHOICES = [6, 9, 13, 25];
  var SECS_CHOICES = [5, 10, 15, 20, 30];
  function rows(v) {
    v = parseInt(v, 10);
    return (v >= 4 && v <= 25) ? v : ROWS_DEFAULT;
  }
  function secs(v) {
    v = parseInt(v, 10);
    return (v >= 3 && v <= 120) ? v : SECS_DEFAULT;
  }

  function onScale(v, s, m) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return false;
    s = step(s);
    v = Number(v);
    if (!isFinite(v) || v < 0 || v > max(m)) return false;
    var units = v / s;
    return Math.abs(units - Math.round(units)) < 1e-9;
  }

  /* "Wessendorf & Grieder", but "Gary & Carl Valimont" when a team shares a
     surname — five of the 25 do, and "Valimont & Valimont" tells nobody who
     is playing. */
  function teamName(pair) {
    var a = String(pair[0] || '').trim(), b = String(pair[1] || '').trim();
    var al = a.split(/\s+/), bl = b.split(/\s+/);
    var alast = al[al.length - 1], blast = bl[bl.length - 1];
    if (alast && alast === blast) return al.slice(0, -1).join(' ') + ' & ' + b;
    return alast + ' & ' + blast;
  }

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  /* sum of the entered rounds; an unentered round is not a zero, it is absent,
     but for a running total the two come to the same number. The difference
     shows in `played`, which is what the board reports. */
  function sum(rounds, which) {
    var t = 0;
    for (var k = 0; k < which.length; k++) {
      var v = num(rounds[which[k]]);
      if (v !== null) t += v;
    }
    return t;
  }

  function counted(rounds, which) {
    var n = 0;
    for (var k = 0; k < which.length; k++) if (num(rounds[which[k]]) !== null) n++;
    return n;
  }

  /* standard competition ranking: 1, 2, 2, 4. Ties split the money, so they
     must show as ties on the board, not as an arbitrary order. */
  function rankBy(rows, field) {
    var order = rows.slice().sort(function (a, b) { return b[field] - a[field]; });
    var rank = 0, seen = 0, last = null;
    order.forEach(function (r) {
      seen++;
      if (last === null || r[field] !== last) { rank = seen; last = r[field]; }
      r[field === 'total' ? 'rank' : 'sunRank'] = rank;
    });
    return order;
  }

  /* points: array of arrays, one row per team, ROUNDS long, null = not in yet */
  function standings(teams, points) {
    var all = [0, 1, 2, 3, 4];
    var rows = teams.map(function (pair, i) {
      var rounds = (points && points[i]) || [];
      var r = [];
      for (var k = 0; k < ROUNDS; k++) r.push(num(rounds[k]));
      return {
        i: i,
        name: teamName(pair),
        players: pair,
        rounds: r,
        total: sum(r, all),
        played: counted(r, all),
        sunday: sum(r, SUNDAY),
        sundayPlayed: counted(r, SUNDAY)
      };
    });
    var byTotal = rankBy(rows, 'total');

    /* Sunday money is ranked among the teams still eligible for it: everyone
       except whoever is winning the pot. An excluded team keeps its sunday
       points — they are a fact — but has no sunday rank, so nothing on the
       board can show it as being in line for money it cannot win. */
    rows.forEach(function (r) { r.potWinner = (r.rank === 1); r.sunEligible = !r.potWinner; });
    var eligible = rows.filter(function (r) { return r.sunEligible; });
    rankBy(eligible, 'sunday');
    rows.forEach(function (r) { if (!r.sunEligible) r.sunRank = null; });

    return byTotal;                     /* returned in total order */
  }

  /* the highest match number anybody has a score for: "after Round 3" */
  function roundsIn(points) {
    var n = 0;
    (points || []).forEach(function (rounds) {
      for (var k = 0; k < ROUNDS; k++) if (num((rounds || [])[k]) !== null && k + 1 > n) n = k + 1;
    });
    return n;
  }

  /* how many of the 25 have a score for one match — the entry screen's counter */
  function entered(points, round0) {
    var n = 0;
    (points || []).forEach(function (rounds) { if (num((rounds || [])[round0]) !== null) n++; });
    return n;
  }

  /* everyone tied at the top, which is who splits the pot. For 'sunday' this
     is already the eligible set, because an excluded team has no sunRank. */
  function leaders(rows, field) {
    var key = field === 'sunday' ? 'sunRank' : 'rank';
    return rows.filter(function (r) { return r[key] === 1; });
  }

  /* Prize money, shown once Kyle marks the event final. Kyle, 2026-09-13:
     "In this case i would input 2000 for total  500 for Sunday", and on a
     split that does not come out even, "Round down if change" — so $500
     among six teams is $83 each and the $2 is his to hand out. Whole dollars
     only; anything that is not a positive amount is no amount, and no amount
     shows nothing. */
  function money(v) {
    v = Math.floor(Number(v));
    return (isFinite(v) && v > 0 && v <= 1000000) ? v : 0;
  }
  function share(total, n) {
    total = money(total); n = parseInt(n, 10);
    return (total && n > 0) ? Math.floor(total / n) : 0;
  }
  function dollars(v) { return '$' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  var API = {
    money: money, share: share, dollars: dollars,
    ROUNDS: ROUNDS, SUNDAY: SUNDAY, STEPS: STEPS, STEP: STEP, MAX: MAX,
    step: step, max: max, scale: scale, onScale: onScale,
    ROWS_DEFAULT: ROWS_DEFAULT, SECS_DEFAULT: SECS_DEFAULT,
    ROWS_CHOICES: ROWS_CHOICES, SECS_CHOICES: SECS_CHOICES, rows: rows, secs: secs,
    teamName: teamName, standings: standings, roundsIn: roundsIn,
    entered: entered, leaders: leaders
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Points = API;
})(typeof window !== 'undefined' ? window : this);
