(function (root) {
  'use strict';
  var DDZ = typeof module !== 'undefined' && module.exports ? require('./logic.js') : root.DDZ;
  var SJ = DDZ.SJ, BJ = DDZ.BJ;

  function cloneCnt(c) { var o = {}; for (var k in c) if (c[k] > 0) o[k] = c[k]; return o; }
  function take(cnt, r, n) { cnt[r] -= n; if (cnt[r] <= 0) delete cnt[r]; }
  function rep(r, n) { var a = []; for (var i = 0; i < n; i++) a.push(r); return a; }

  function longestRun(cnt, minCount, minLen) {
    var best = null;
    for (var s = 3; s <= 14; s++) {
      var e = s;
      while (e <= 14 && (cnt[e] || 0) >= minCount) e++;
      var len = e - s;
      if (len >= minLen && (!best || len > best.len)) best = { s: s, len: len };
    }
    return best;
  }

  function decompose(cntIn, opts) {
    var cnt = cloneCnt(cntIn), groups = [];
    if (cnt[SJ] && cnt[BJ]) { groups.push({ ranks: [SJ, BJ] }); take(cnt, SJ, 1); take(cnt, BJ, 1); }
    Object.keys(cnt).map(Number).forEach(function (r) {
      if (cnt[r] === 4) { groups.push({ ranks: rep(r, 4) }); take(cnt, r, 4); }
    });
    var planes = [], run;
    while ((run = longestRun(cnt, 3, 2))) {
      var pr = [];
      for (var r = run.s; r < run.s + run.len; r++) { pr.push(r, r, r); take(cnt, r, 3); }
      planes.push(pr);
    }
    if (opts.straights) {
      var guard = 0;
      while (guard++ < 6) {
        var st = null;
        for (var s = 3; s <= 10 && !st; s++) {
          var ok = true;
          for (var q = s; q < s + 5; q++) if (!cnt[q]) { ok = false; break; }
          if (ok) st = s;
        }
        if (st == null) break;
        var e = st + 5;
        while (e <= 14 && cnt[e] && (opts.greedyStraight || cnt[e] === 1)) e++;
        var sr = [];
        for (var x = st; x < e; x++) { sr.push(x); take(cnt, x, 1); }
        groups.push({ ranks: sr });
      }
      for (var gi = 0; gi < groups.length; gi++) {
        var g = groups[gi];
        if (g.ranks.length >= 5 && g.ranks[0] !== g.ranks[1] && g.ranks[0] !== SJ) {
          var lo = g.ranks[0], hi = g.ranks[g.ranks.length - 1];
          while (hi + 1 <= 14 && cnt[hi + 1] === 1 && g.ranks.length < 12) { hi++; g.ranks.push(hi); take(cnt, hi, 1); }
          while (lo > 3 && cnt[lo - 1] === 1) { lo--; g.ranks.unshift(lo); take(cnt, lo, 1); }
        }
      }
    }
    if (opts.pairStraights) {
      while ((run = longestRun(cnt, 2, 3))) {
        var ps = [];
        for (var y = run.s; y < run.s + run.len; y++) { ps.push(y, y); take(cnt, y, 2); }
        groups.push({ ranks: ps });
      }
    }
    var triples = [], pairs = [], singles = [];
    Object.keys(cnt).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
      if (cnt[r] === 3) triples.push(r);
      else if (cnt[r] === 2) pairs.push(r);
      else if (cnt[r] === 1) singles.push(r);
    });
    var lowSingles = singles.filter(function (r) { return r < 15; });
    var lowPairs = pairs.filter(function (r) { return r < 14; });
    planes.forEach(function (p) {
      var k = p.length / 3;
      if (lowSingles.length >= k) {
        var w = lowSingles.splice(0, k);
        w.forEach(function (x) { singles.splice(singles.indexOf(x), 1); });
        groups.push({ ranks: p.concat(w) });
      } else if (lowPairs.length >= k) {
        var wp = lowPairs.splice(0, k);
        var arr = p.slice();
        wp.forEach(function (x) { pairs.splice(pairs.indexOf(x), 1); arr.push(x, x); });
        groups.push({ ranks: arr });
      } else groups.push({ ranks: p });
    });
    triples.forEach(function (t) {
      if (lowSingles.length) {
        var w = lowSingles.shift(); singles.splice(singles.indexOf(w), 1);
        groups.push({ ranks: [t, t, t, w] });
      } else if (lowPairs.length) {
        var wp = lowPairs.shift(); pairs.splice(pairs.indexOf(wp), 1);
        groups.push({ ranks: [t, t, t, wp, wp] });
      } else groups.push({ ranks: [t, t, t] });
    });
    pairs.forEach(function (p) { groups.push({ ranks: [p, p] }); });
    singles.forEach(function (s) { groups.push({ ranks: [s] }); });
    groups.forEach(function (g) {
      g.ranks.sort(function (a, b) { return a - b; });
      g.combo = DDZ.classifyCombo(g.ranks);
    });
    return groups.filter(function (g) { return g.combo; });
  }

  function planCost(plan) {
    var c = 0;
    plan.forEach(function (g) {
      var t = g.combo.type;
      if (t === 'bomb' || t === 'rocket') c += 0.2;
      else if (t === 'single' && g.combo.mainRank < 14) c += 1.15;
      else c += 1;
    });
    return c;
  }

  function bestPlan(cnt) {
    var variants = [
      { straights: true, pairStraights: true },
      { straights: true, pairStraights: true, greedyStraight: true },
      { straights: false, pairStraights: true },
      { straights: true, pairStraights: false },
      { straights: false, pairStraights: false }
    ];
    var best = null, bestC = Infinity;
    variants.forEach(function (v) {
      var p = decompose(cnt, v), c = planCost(p);
      if (c < bestC) { bestC = c; best = p; }
    });
    return best;
  }

  function cntOf(hand) { return DDZ.countRanks(DDZ.toRanks(hand)); }

  function planFor(hand) { return hand.length ? bestPlan(cntOf(hand)) : []; }

  function costAfter(hand, ranks) {
    var cnt = cntOf(hand);
    ranks.forEach(function (r) { take(cnt, r, 1); });
    var n = 0; for (var k in cnt) n += cnt[k];
    return n ? planCost(bestPlan(cnt)) : 0;
  }

  function isBombish(c) { return c.type === 'bomb' || c.type === 'rocket'; }

  function bidDecision(hand, highest) {
    var cnt = cntOf(hand), s = 0;
    if (cnt[BJ]) s += 4;
    if (cnt[SJ]) s += 3;
    s += (cnt[15] || 0) * 2;
    s += (cnt[14] || 0) * 1;
    s += (cnt[13] || 0) * 0.4;
    for (var r = 3; r <= 15; r++) if (cnt[r] === 4) s += 4;
    var turns = planCost(bestPlan(cnt));
    s += Math.max(0, 10 - turns) * 0.6;
    var want = s >= 14 ? 3 : s >= 11 ? 2 : s >= 8 ? 1 : 0;
    return want > highest ? want : 0;
  }

  function toMove(hand, ranks, cur) {
    var cards = DDZ.pickCards(hand, ranks);
    var combo = cards && DDZ.comboFor(ranks, cur);
    return cards && combo ? { cards: cards, ranks: ranks, combo: combo } : null;
  }

  // ctx: {seat, landlord, counts:[3], lastSeat}
  function enemiesOf(ctx) {
    var res = [];
    for (var s = 0; s < 3; s++) if (s !== ctx.seat && (ctx.seat === ctx.landlord || s === ctx.landlord)) res.push(s);
    return res;
  }
  function minEnemyCount(ctx) {
    return Math.min.apply(null, enemiesOf(ctx).map(function (s) { return ctx.counts[s]; }));
  }

  function chooseLead(hand, ctx) {
    var whole = DDZ.classifyCombo(hand);
    if (whole) return toMove(hand, DDZ.toRanks(hand).sort(function (a, b) { return a - b; }), null);
    var plan = planFor(hand);
    var normal = plan.filter(function (g) { return !isBombish(g.combo); });
    var bombs = plan.filter(function (g) { return isBombish(g.combo); });
    if (!normal.length || (normal.length === 1 && bombs.length)) {
      var b = bombs.sort(function (x, y) { return x.combo.mainRank - y.combo.mainRank; })[0];
      if (b) return toMove(hand, b.ranks, null);
    }
    var danger = ctx ? minEnemyCount(ctx) : 20;
    var teammate = ctx && ctx.seat !== ctx.landlord ? [0, 1, 2].filter(function (s) { return s !== ctx.seat && s !== ctx.landlord; })[0] : -1;
    if (teammate >= 0 && ctx.counts[teammate] === 1) {
      var lowest = normal.filter(function (g) { return g.combo.type === 'single'; }).sort(function (a, b) { return a.combo.mainRank - b.combo.mainRank; })[0];
      if (lowest) return toMove(hand, lowest.ranks, null);
      var lr = DDZ.toRanks(hand).sort(function (a, b) { return a - b; })[0];
      return toMove(hand, [lr], null);
    }
    var scored = normal.map(function (g) {
      var c = g.combo, sc = c.mainRank - g.ranks.length * 0.7;
      if (danger <= 2 && c.length <= danger) sc += 40 - c.mainRank * 2;
      if (normal.length === 2 && c.mainRank >= 15) sc -= 30;
      return { g: g, sc: sc };
    }).sort(function (a, b) { return a.sc - b.sc; });
    return toMove(hand, scored[0].g.ranks, null);
  }

  function chooseFollow(hand, cur, ctx, forced) {
    var moves = DDZ.enumerateLegalMoves(hand, cur);
    if (!moves.length) return null;
    var win = moves.filter(function (m) { return m.cards.length === hand.length; })[0];
    if (win) return win;
    var ownerIsEnemy = !ctx || ctx.lastSeat == null || enemiesOf(ctx).indexOf(ctx.lastSeat) >= 0;
    var danger = ctx ? minEnemyCount(ctx) : 20;
    var baseCost = planCost(planFor(hand));
    var evald = moves.map(function (m) {
      var after = costAfter(hand, m.ranks);
      return { m: m, extra: after - (baseCost - 1), bomb: isBombish(m.combo) };
    });
    var normal = evald.filter(function (e) { return !e.bomb; }).sort(function (a, b) {
      return (a.extra - b.extra) || (a.m.combo.mainRank - b.m.combo.mainRank);
    });
    var bombs = evald.filter(function (e) { return e.bomb; }).sort(function (a, b) {
      return (a.m.combo.type === 'rocket') - (b.m.combo.type === 'rocket') || a.m.combo.mainRank - b.m.combo.mainRank;
    });

    if (!ownerIsEnemy && !forced) {
      var tm = normal[0];
      var lastCnt = ctx.counts[ctx.lastSeat];
      if (tm && tm.extra <= 0 && cur.mainRank < 11 && tm.m.combo.mainRank < 14 && lastCnt > 3 && danger > 2) return tm.m;
      return null;
    }

    var urgent = danger <= 3 || (ctx && ctx.counts[ctx.lastSeat] <= 4);
    var threshold = danger <= 2 ? 99 : urgent ? 2 : danger <= 6 ? 1 : 0.3;
    var pick = normal.filter(function (e) { return e.extra <= threshold; })[0];
    if (pick) {
      var hi = pick.m.combo.mainRank >= 15 && cur.mainRank <= 11 && hand.length > 8 && !urgent && cur.type !== 'single';
      if (!hi) return pick.m;
    }
    if (bombs.length) {
      var b = bombs[0];
      var restCost = costAfter(hand, b.m.ranks);
      if (urgent || restCost <= 1.5 || forced) return b.m;
    }
    if (forced) return (normal[0] || bombs[0]).m;
    return null;
  }

  function chooseMove(hand, cur, ctx) {
    return cur ? chooseFollow(hand, cur, ctx, false) : chooseLead(hand, ctx);
  }

  function hint(hand, cur, ctx) {
    if (!cur) return chooseLead(hand, ctx);
    var m = chooseFollow(hand, cur, ctx, false);
    if (m) return m;
    return chooseFollow(hand, cur, ctx, true);
  }

  var AI = { decompose: decompose, bestPlan: bestPlan, planFor: planFor, bidDecision: bidDecision, chooseMove: chooseMove, chooseLead: chooseLead, chooseFollow: chooseFollow, hint: hint };
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
  else root.DDZAI = AI;
})(typeof self !== 'undefined' ? self : this);
