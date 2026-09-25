(function (root) {
  'use strict';

  var SJ = 16, BJ = 17;
  var RANK_LABEL = { 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王' };
  var SUITS = ['♠', '♥', '♣', '♦'];
  var TYPE_NAME = {
    single: '单张', pair: '对子', triple: '三张', triple1: '三带一', triple2: '三带对',
    straight: '顺子', pairStraight: '连对', airplane: '飞机', airplane1: '飞机带单', airplane2: '飞机带对',
    four2: '四带二', four2pairs: '四带两对', bomb: '炸弹', rocket: '王炸'
  };

  function makeDeck() {
    var d = [];
    for (var r = 3; r <= 15; r++) for (var s = 0; s < 4; s++) d.push({ id: (r - 3) * 4 + s, rank: r, suit: s });
    d.push({ id: 52, rank: SJ, suit: 4 });
    d.push({ id: 53, rank: BJ, suit: 4 });
    return d;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function sortHand(cards) {
    return cards.slice().sort(function (a, b) { return b.rank - a.rank || b.suit - a.suit; });
  }

  function deal(seedOrRng) {
    var rng = typeof seedOrRng === 'function' ? seedOrRng : (seedOrRng == null ? Math.random : mulberry32(seedOrRng));
    var deck = shuffle(makeDeck(), rng);
    return {
      hands: [sortHand(deck.slice(0, 17)), sortHand(deck.slice(17, 34)), sortHand(deck.slice(34, 51))],
      bottom: sortHand(deck.slice(51))
    };
  }

  function toRanks(cards) {
    return cards.map(function (c) { return typeof c === 'number' ? c : c.rank; });
  }

  function countRanks(ranks) {
    var cnt = {};
    for (var i = 0; i < ranks.length; i++) cnt[ranks[i]] = (cnt[ranks[i]] || 0) + 1;
    return cnt;
  }

  function isChain(ranks, minLen) {
    if (ranks.length < minLen) return false;
    if (ranks[ranks.length - 1] > 14) return false;
    for (var i = 1; i < ranks.length; i++) if (ranks[i] !== ranks[i - 1] + 1) return false;
    return true;
  }

  function ranksWith(cnt, pred) {
    return Object.keys(cnt).map(Number).filter(function (r) { return pred(cnt[r]); }).sort(function (a, b) { return a - b; });
  }

  function mk(type, mainRank, length, extra) {
    var o = { type: type, mainRank: mainRank, length: length };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }

  function airplaneWithWings(cnt, n, wingSize) {
    var k = n / (3 + wingSize);
    if (k !== Math.floor(k) || k < 2) return null;
    var cands = ranksWith(cnt, function (c) { return c === 3; }).filter(function (r) { return r <= 14; });
    var best = null;
    for (var i = 0; i + k <= cands.length; i++) {
      var chain = cands.slice(i, i + k);
      if (!isChain(chain, 2)) continue;
      var rest = {};
      for (var r in cnt) rest[r] = cnt[r];
      chain.forEach(function (c) { delete rest[c]; });
      var ok = true, wings = 0;
      if (wingSize === 1) {
        if (rest[SJ] && rest[BJ]) ok = false;
        for (var r1 in rest) wings += rest[r1];
      } else {
        for (var r2 in rest) {
          if (rest[r2] % 2 !== 0 || Number(r2) >= SJ) ok = false;
          wings += rest[r2] / 2;
        }
      }
      if (ok && wings === k && (!best || chain[k - 1] > best.mainRank)) best = mk(wingSize === 1 ? 'airplane1' : 'airplane2', chain[k - 1], n, { chain: k });
    }
    return best;
  }

  function classifyAll(cards) {
    var ranks = toRanks(cards).sort(function (a, b) { return a - b; });
    var n = ranks.length, out = [];
    if (!n) return out;
    var cnt = countRanks(ranks);
    var keys = ranksWith(cnt, function () { return true; });
    var counts = keys.map(function (r) { return cnt[r]; });
    var allCount = function (c) { return counts.every(function (x) { return x === c; }); };

    if (n === 1) out.push(mk('single', ranks[0], 1));
    if (n === 2 && cnt[SJ] && cnt[BJ]) out.push(mk('rocket', BJ, 2));
    if (n === 2 && keys.length === 1 && keys[0] < SJ) out.push(mk('pair', keys[0], 2));
    if (n === 3 && keys.length === 1) out.push(mk('triple', keys[0], 3));
    if (n === 4 && keys.length === 1) out.push(mk('bomb', keys[0], 4));
    if (n === 4 && keys.length === 2) {
      var t = keys.filter(function (r) { return cnt[r] === 3; });
      if (t.length) out.push(mk('triple1', t[0], 4));
    }
    if (n === 5 && keys.length === 2) {
      var t3 = keys.filter(function (r) { return cnt[r] === 3; });
      var p2 = keys.filter(function (r) { return cnt[r] === 2 && r < SJ; });
      if (t3.length && p2.length) out.push(mk('triple2', t3[0], 5));
    }
    if (n >= 5 && allCount(1) && isChain(keys, 5)) out.push(mk('straight', keys[keys.length - 1], n, { chain: n }));
    if (n >= 6 && allCount(2) && isChain(keys, 3)) out.push(mk('pairStraight', keys[keys.length - 1], n, { chain: n / 2 }));
    if (n >= 6 && allCount(3) && isChain(keys, 2)) out.push(mk('airplane', keys[keys.length - 1], n, { chain: n / 3 }));
    if (n >= 8 && n % 4 === 0) { var a1 = airplaneWithWings(cnt, n, 1); if (a1) out.push(a1); }
    if (n >= 10 && n % 5 === 0) { var a2 = airplaneWithWings(cnt, n, 2); if (a2) out.push(a2); }
    if (n === 6) {
      var f = keys.filter(function (r) { return cnt[r] === 4; });
      if (f.length && !(cnt[SJ] && cnt[BJ])) out.push(mk('four2', f[0], 6));
    }
    if (n === 8) {
      var fours = keys.filter(function (r) { return cnt[r] === 4; });
      if (fours.length && keys.every(function (r) { return cnt[r] % 2 === 0 && r < SJ; })) {
        out.push(mk('four2pairs', fours[fours.length - 1], 8));
      }
    }
    return out;
  }

  function classifyCombo(cards) {
    var all = classifyAll(cards);
    return all.length ? all[0] : null;
  }

  function canBeat(cur, cand) {
    if (!cand) return false;
    if (!cur) return true;
    if (cur.type === 'rocket') return false;
    if (cand.type === 'rocket') return true;
    if (cand.type === 'bomb') return cur.type !== 'bomb' || cand.mainRank > cur.mainRank;
    if (cur.type === 'bomb') return false;
    return cand.type === cur.type && cand.length === cur.length && cand.mainRank > cur.mainRank;
  }

  function comboFor(cards, cur) {
    var all = classifyAll(cards);
    if (!cur) return all.length ? all[0] : null;
    for (var i = 0; i < all.length; i++) if (canBeat(cur, all[i])) return all[i];
    return null;
  }

  function pickCards(hand, ranks) {
    var used = {}, out = [];
    for (var i = 0; i < ranks.length; i++) {
      var r = ranks[i], found = null;
      for (var j = hand.length - 1; j >= 0; j--) {
        if (hand[j].rank === r && !used[hand[j].id]) { found = hand[j]; break; }
      }
      if (!found) return null;
      used[found.id] = 1;
      out.push(found);
    }
    return out;
  }

  function multisetCombos(avail, k) {
    var ranks = Object.keys(avail).map(Number).sort(function (a, b) { return a - b; });
    var res = [];
    (function rec(idx, left, acc) {
      if (left === 0) { res.push(acc.slice()); return; }
      if (idx >= ranks.length) return;
      var r = ranks[idx];
      for (var c = Math.min(avail[r], left); c >= 0; c--) {
        for (var q = 0; q < c; q++) acc.push(r);
        rec(idx + 1, left - c, acc);
        acc.length -= c;
      }
    })(0, k, []);
    return res;
  }

  function rep(r, c) { var a = []; for (var i = 0; i < c; i++) a.push(r); return a; }

  function chains(cnt, minCount, minLen) {
    var res = [];
    for (var s = 3; s <= 14; s++) {
      for (var e = s; e <= 14 && (cnt[e] || 0) >= minCount; e++) {
        if (e - s + 1 >= minLen) {
          var ch = [];
          for (var r = s; r <= e; r++) ch.push(r);
          res.push(ch);
        }
      }
    }
    return res;
  }

  function generateRankMoves(cnt, wantType) {
    var want = function (t) { return !wantType || wantType === t; };
    var keys = Object.keys(cnt).map(Number).filter(function (r) { return cnt[r] > 0; }).sort(function (a, b) { return a - b; });
    var moves = [];
    keys.forEach(function (r) {
      if (want('single')) moves.push([r]);
      if (cnt[r] >= 2 && r < SJ && want('pair')) moves.push([r, r]);
      if (cnt[r] >= 3) {
        if (want('triple')) moves.push([r, r, r]);
        keys.forEach(function (s) {
          if (s === r) return;
          if (want('triple1')) moves.push([r, r, r, s]);
          if (want('triple2') && cnt[s] >= 2 && s < SJ) moves.push([r, r, r, s, s]);
        });
      }
      if (cnt[r] === 4) {
        moves.push([r, r, r, r]);
        var others = {};
        keys.forEach(function (s) { if (s !== r) others[s] = cnt[s]; });
        if (want('four2')) multisetCombos(others, 2).forEach(function (w) {
          if (!(w[0] === SJ && w[1] === BJ)) moves.push(rep(r, 4).concat(w));
        });
        if (want('four2pairs')) {
          var pairAvail = {};
          keys.forEach(function (s) { if (s !== r && s < SJ && cnt[s] >= 2) pairAvail[s] = Math.floor(cnt[s] / 2); });
          multisetCombos(pairAvail, 2).forEach(function (w) {
            if (w[0] !== w[1]) moves.push(rep(r, 4).concat([w[0], w[0], w[1], w[1]]));
          });
        }
      }
    });
    if (cnt[SJ] && cnt[BJ]) moves.push([SJ, BJ]);
    if (want('straight')) chains(cnt, 1, 5).forEach(function (ch) { moves.push(ch); });
    if (want('pairStraight')) chains(cnt, 2, 3).forEach(function (ch) {
      var m = []; ch.forEach(function (r) { m.push(r, r); }); moves.push(m);
    });
    if (want('airplane') || want('airplane1') || want('airplane2')) {
      chains(cnt, 3, 2).forEach(function (ch) {
        var base = []; ch.forEach(function (r) { base.push(r, r, r); });
        if (want('airplane')) moves.push(base);
        var rest = {};
        keys.forEach(function (s) { if (ch.indexOf(s) < 0) rest[s] = cnt[s]; });
        if (want('airplane1')) multisetCombos(rest, ch.length).forEach(function (w) {
          if (w.indexOf(SJ) >= 0 && w.indexOf(BJ) >= 0) return;
          moves.push(base.concat(w));
        });
        if (want('airplane2')) {
          var pr = {};
          for (var s in rest) if (Number(s) < SJ && rest[s] >= 2) pr[s] = Math.floor(rest[s] / 2);
          multisetCombos(pr, ch.length).forEach(function (w) {
            var m = base.slice(); w.forEach(function (x) { m.push(x, x); }); moves.push(m);
          });
        }
      });
    }
    return moves;
  }

  function enumerateLegalMoves(hand, cur) {
    var cnt = countRanks(toRanks(hand));
    var wantType = cur ? (cur.type === 'bomb' || cur.type === 'rocket' ? 'bomb' : cur.type) : null;
    var raw = generateRankMoves(cnt, wantType);
    var seen = {}, out = [];
    raw.forEach(function (rs) {
      rs = rs.slice().sort(function (a, b) { return a - b; });
      var key = rs.join(',');
      if (seen[key]) return;
      seen[key] = 1;
      var combo = comboFor(rs, cur);
      if (!combo) return;
      if (cur && !canBeat(cur, combo)) return;
      var cards = pickCards(hand, rs);
      if (cards) out.push({ cards: cards, ranks: rs, combo: combo });
    });
    return out;
  }

  function scoreRound(o) {
    var mult = 1;
    for (var i = 0; i < (o.bombs || 0); i++) mult *= 2;
    if (o.rocket) mult *= 2;
    if (o.spring) mult *= 2;
    if (o.antiSpring) mult *= 2;
    var score = (o.bid || 1) * mult;
    return { multiplier: mult, score: score };
  }

  function settle(landlord, landlordWon, score) {
    var d = [0, 0, 0];
    for (var s = 0; s < 3; s++) d[s] = s === landlord ? (landlordWon ? 2 : -2) * score : (landlordWon ? -1 : 1) * score;
    return d;
  }

  function newBidding(firstSeat) {
    return { turn: firstSeat, highest: 0, highestSeat: -1, passed: [false, false, false], done: false, redeal: false, history: [] };
  }

  function applyBid(st, seat, value) {
    if (st.done || seat !== st.turn) throw new Error('not your bid turn');
    if (value && (value <= st.highest || value > 3)) throw new Error('illegal bid');
    st.history.push({ seat: seat, value: value || 0 });
    if (value) { st.highest = value; st.highestSeat = seat; } else st.passed[seat] = true;
    if (st.highest === 3) { st.done = true; return st; }
    var next = -1;
    for (var i = 1; i <= 3; i++) {
      var s = (seat + i) % 3;
      if (!st.passed[s] && s !== st.highestSeat) { next = s; break; }
    }
    if (next < 0) {
      st.done = true;
      if (st.highestSeat < 0) st.redeal = true;
    } else st.turn = next;
    return st;
  }

  function removeCards(hand, cards) {
    var ids = {};
    cards.forEach(function (c) { ids[c.id] = 1; });
    return hand.filter(function (c) { return !ids[c.id]; });
  }

  function label(r) { return RANK_LABEL[r]; }

  function createRound(seedOrRng, firstBidder) {
    var d = deal(seedOrRng);
    return {
      phase: 'bid', hands: d.hands, bottom: d.bottom, bidding: newBidding(firstBidder || 0),
      landlord: -1, bid: 0, turn: firstBidder || 0, lastPlay: null, passes: 0,
      bombs: 0, rocket: false, playsBySeat: [0, 0, 0], log: [], result: null
    };
  }

  function roundBid(st, seat, value) {
    if (st.phase !== 'bid') throw new Error('not bidding');
    applyBid(st.bidding, seat, value);
    st.log.push({ seat: seat, bid: value || 0 });
    if (!st.bidding.done) { st.turn = st.bidding.turn; return st; }
    if (st.bidding.redeal) { st.phase = 'redeal'; return st; }
    st.landlord = st.bidding.highestSeat;
    st.bid = st.bidding.highest;
    st.hands[st.landlord] = sortHand(st.hands[st.landlord].concat(st.bottom));
    st.turn = st.landlord;
    st.phase = 'play';
    return st;
  }

  function currentCombo(st) { return st.lastPlay ? st.lastPlay.combo : null; }

  function roundPlay(st, seat, cards) {
    if (st.phase !== 'play' || seat !== st.turn) throw new Error('not your turn');
    var hand = st.hands[seat];
    var ids = {};
    for (var i = 0; i < cards.length; i++) {
      if (ids[cards[i].id] || !hand.some(function (c) { return c.id === cards[i].id; })) throw new Error('card not in hand');
      ids[cards[i].id] = 1;
    }
    var combo = comboFor(cards, currentCombo(st));
    if (!combo || !canBeat(currentCombo(st), combo)) throw new Error('illegal play');
    st.hands[seat] = removeCards(hand, cards);
    st.lastPlay = { seat: seat, combo: combo, cards: sortHand(cards) };
    st.passes = 0;
    st.playsBySeat[seat]++;
    if (combo.type === 'bomb') st.bombs++;
    if (combo.type === 'rocket') st.rocket = true;
    st.log.push({ seat: seat, play: combo });
    if (!st.hands[seat].length) finishRound(st, seat);
    else st.turn = (seat + 1) % 3;
    return combo;
  }

  function roundPass(st, seat) {
    if (st.phase !== 'play' || seat !== st.turn) throw new Error('not your turn');
    if (!st.lastPlay || st.lastPlay.seat === seat) throw new Error('must lead');
    st.log.push({ seat: seat, pass: true });
    st.passes++;
    st.turn = (seat + 1) % 3;
    if (st.passes >= 2) { st.lastPlay = null; st.passes = 0; }
    return st;
  }

  function finishRound(st, winner) {
    var L = st.landlord, landlordWon = winner === L;
    var farmers = [0, 1, 2].filter(function (s) { return s !== L; });
    var spring = landlordWon && farmers.every(function (s) { return st.playsBySeat[s] === 0; });
    var antiSpring = !landlordWon && st.playsBySeat[L] === 1;
    var sc = scoreRound({ bid: st.bid, bombs: st.bombs, rocket: st.rocket, spring: spring, antiSpring: antiSpring });
    st.phase = 'over';
    st.result = {
      winner: winner, landlordWon: landlordWon, spring: spring, antiSpring: antiSpring,
      bombs: st.bombs, rocket: st.rocket, bid: st.bid, multiplier: sc.multiplier, score: sc.score,
      deltas: settle(L, landlordWon, sc.score)
    };
    return st.result;
  }

  var DDZ = {
    SJ: SJ, BJ: BJ, SUITS: SUITS, RANK_LABEL: RANK_LABEL, TYPE_NAME: TYPE_NAME,
    makeDeck: makeDeck, mulberry32: mulberry32, shuffle: shuffle, deal: deal, sortHand: sortHand,
    countRanks: countRanks, toRanks: toRanks, classifyAll: classifyAll, classifyCombo: classifyCombo,
    canBeat: canBeat, comboFor: comboFor, pickCards: pickCards, enumerateLegalMoves: enumerateLegalMoves,
    generateRankMoves: generateRankMoves, scoreRound: scoreRound, settle: settle,
    newBidding: newBidding, applyBid: applyBid, removeCards: removeCards, label: label,
    createRound: createRound, roundBid: roundBid, roundPlay: roundPlay, roundPass: roundPass, currentCombo: currentCombo
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DDZ;
  else root.DDZ = DDZ;
})(typeof self !== 'undefined' ? self : this);
