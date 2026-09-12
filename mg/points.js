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
 * How a point is earned is decided on paper, at the club. This file never
 * knows and never needs to.
 */
(function (root) {
  'use strict';

  var ROUNDS = 5;
  var SUNDAY = [3, 4];          /* zero-based: matches 4 and 5 */

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
    rankBy(rows, 'sunday');
    return rankBy(rows, 'total');       /* returned in total order */
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

  /* everyone tied at the top, which is who splits the pot */
  function leaders(rows, field) {
    var key = field === 'sunday' ? 'sunRank' : 'rank';
    return rows.filter(function (r) { return r[key] === 1; });
  }

  var API = {
    ROUNDS: ROUNDS, SUNDAY: SUNDAY,
    teamName: teamName, standings: standings, roundsIn: roundsIn,
    entered: entered, leaders: leaders
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Points = API;
})(typeof window !== 'undefined' ? window : this);
