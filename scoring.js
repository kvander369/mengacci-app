/* Mengacci $$ — the money rules, as plain functions.
 *
 * Source of truth is docs/RULES.md. If this file and that file disagree, this
 * file is wrong. Nothing here touches a screen, storage or the network, and
 * nothing here depends on AI (CLAUDE.md rule 3). test/scoring.test.js proves
 * each rule; run it before every commit.
 *
 * Works in the browser (window.Scoring) and in node (require).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Scoring = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Country Club of Waterbury, white tees. RULES.md. */
  var PAR = [4,4,3,4,4,4,4,3,5, 4,4,3,4,3,4,4,4,4];          // 35 / 34, total 69
  var SI  = [7,3,15,11,1,13,5,17,9, 6,10,18,8,16,2,12,14,4];  // stroke index
  var PAR_TOTAL = PAR.reduce(function (a, b) { return a + b; }, 0);

  /* Strokes received on hole i (0-based) at course handicap hcp. Full handicap,
     no cap: a player with two strokes on a hole uses both. RULES.md "Strokes". */
  function dots(hcp, i) {
    hcp = Number(hcp) || 0;
    if (hcp <= 0) return 0;
    var base = Math.floor(hcp / 18), extra = hcp % 18;
    return base + (SI[i] <= extra ? 1 : 0);
  }

  /* Net scores for 18 holes. A hole with no score (null) stays null: it is not
     a number and never competes. RULES.md "A player who cannot finish". */
  function netScores(gross, hcp) {
    var out = [];
    for (var i = 0; i < 18; i++) {
      var g = gross[i];
      out.push(g == null ? null : g - dots(hcp, i));
    }
    return out;
  }

  /* Skins for one pot, one hole at a time.
     players: [{id, scores:[18 gross|null], hcp}]
     useGross: true for the gross pot (gross score under par), false for net.
     Returns 18 entries: {hole, kind:"skin"|"dead"|"none", holder, score, tied:[ids]}.
     A skin needs BIRDIE OR BETTER (strictly under par) and must be OUTRIGHT
     lowest in the pot. Any tie kills the hole. No carryover. RULES.md "Skins". */
  function skins(players, useGross) {
    var rows = [];
    var scored = players.map(function (p) {
      return { id: p.id, s: useGross ? p.scores.slice(0, 18) : netScores(p.scores, p.hcp) };
    });
    for (var i = 0; i < 18; i++) {
      var best = null, who = [];
      scored.forEach(function (p) {
        var v = p.s[i];
        if (v == null) return;
        if (best === null || v < best) { best = v; who = [p.id]; }
        else if (v === best) who.push(p.id);
      });
      if (best === null || best >= PAR[i]) rows.push({ hole: i + 1, kind: "none", holder: null, score: null, tied: [] });
      else if (who.length === 1) rows.push({ hole: i + 1, kind: "skin", holder: who[0], score: best, tied: [] });
      else rows.push({ hole: i + 1, kind: "dead", holder: null, score: best, tied: who });
    }
    return rows;
  }

  /* Pot membership is DERIVED from handicap and cutoff every time, never stored.
     cutoff null: one net pot, everyone in. Otherwise at-or-under -> gross pot,
     over -> net pot. A player is in exactly one pot. RULES.md "The two pots". */
  function pots(players, cutoff) {
    if (cutoff == null) return { net: players.slice(), gross: null };
    return {
      gross: players.filter(function (p) { return Number(p.hcp) <= cutoff; }),
      net:   players.filter(function (p) { return Number(p.hcp) >  cutoff; })
    };
  }

  /* Payout per skin: pot ÷ number of skins. Nobody wins one -> null. RULES.md. */
  function payout(potAmount, skinRows) {
    var n = skinRows.filter(function (r) { return r.kind === "skin"; }).length;
    return n ? Number(potAmount) / n : null;
  }

  /* 2-man best ball, net, hole by hole. Where one partner has no score the
     other's ball counts alone; where neither has one the hole is null and the
     team cannot place. RULES.md "The tournament", "A player who cannot finish". */
  function bestBall(netA, netB) {
    var out = [];
    for (var i = 0; i < 18; i++) {
      var a = netA[i], b = netB[i];
      if (a == null && b == null) out.push(null);
      else if (a == null) out.push(b);
      else if (b == null) out.push(a);
      else out.push(Math.min(a, b));
    }
    return out;
  }

  function sum(a, from, to) { var t = 0; for (var i = from; i < to; i++) t += a[i]; return t; }
  function complete(bb) { return bb.every(function (v) { return v != null; }); }

  /* USGA match of cards on net best ball: total, then back 9, then last 6
     (13-18), then last 3 (16-18), then the 18th. Negative means a is better.
     Both cards must be complete. RULES.md "The tournament". */
  function matchOfCards(a, b) {
    var t = sum(a, 0, 18) - sum(b, 0, 18); if (t) return { d: t, how: "" };
    var b9 = sum(a, 9, 18) - sum(b, 9, 18); if (b9) return { d: b9, how: "back 9", av: sum(a, 9, 18), bv: sum(b, 9, 18) };
    var l6 = sum(a, 12, 18) - sum(b, 12, 18); if (l6) return { d: l6, how: "last 6", av: sum(a, 12, 18), bv: sum(b, 12, 18) };
    var l3 = sum(a, 15, 18) - sum(b, 15, 18); if (l3) return { d: l3, how: "last 3", av: sum(a, 15, 18), bv: sum(b, 15, 18) };
    var h18 = a[17] - b[17]; if (h18) return { d: h18, how: "18th", av: a[17], bv: b[17] };
    return { d: 0, how: "tied" };
  }

  /* Team standings.
     teams: [{id, players:[pid, pid]}]   byId: {pid: {id, scores, hcp}} for verified players only
     withdrawn: [teamId]  (a team that never played; out of everything)
     Returns {done:[{team, bb, total}] sorted best first, waiting:[team], withdrawn:[team]}.
     A team is "done" when both players are verified and the best ball is
     complete. */
  function standings(teams, byId, withdrawn) {
    withdrawn = withdrawn || [];
    var done = [], waiting = [], out = [];
    teams.forEach(function (t) {
      if (withdrawn.indexOf(t.id) >= 0) { out.push(t); return; }
      var a = byId[t.players[0]], b = byId[t.players[1]];
      if (!a || !b) { waiting.push(t); return; }
      var bb = bestBall(netScores(a.scores, a.hcp), netScores(b.scores, b.hcp));
      if (!complete(bb)) { waiting.push(t); return; }
      done.push({ team: t, bb: bb, total: sum(bb, 0, 18) });
    });
    done.sort(function (x, y) { return matchOfCards(x.bb, y.bb).d; });
    return { done: done, waiting: waiting, withdrawn: out };
  }

  /* Ties, for the "How ties were decided" screen: consecutive pairs on the
     same total and the step that separated them. */
  function ties(done) {
    var out = [];
    for (var i = 1; i < done.length; i++) {
      var a = done[i - 1], b = done[i];
      if (a.total !== b.total) continue;
      out.push({ above: a.team, below: b.team, total: a.total, by: matchOfCards(a.bb, b.bb) });
    }
    return out;
  }

  /* "−12", "E", "+3" for a net best-ball total against par 69. */
  function toPar(total) {
    var d = total - PAR_TOTAL;
    return d === 0 ? "E" : (d < 0 ? "−" + (-d) : "+" + d);
  }

  /* Board status. FINAL only when there is at least one team, every team not
     withdrawn is in, and no card is provisional. Otherwise TENTATIVE, or "none"
     with no teams at all. DESIGN.md "The live board". */
  function boardStatus(teamsTotal, teamsIn, provisionalCards) {
    if (!teamsTotal) return "none";
    return (teamsIn === teamsTotal && !provisionalCards) ? "final" : "tentative";
  }

  return {
    PAR: PAR, SI: SI, PAR_TOTAL: PAR_TOTAL,
    dots: dots, netScores: netScores, skins: skins, pots: pots, payout: payout,
    bestBall: bestBall, matchOfCards: matchOfCards, standings: standings, ties: ties,
    toPar: toPar, boardStatus: boardStatus, sum: sum
  };
});
