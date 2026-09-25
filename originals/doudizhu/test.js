'use strict';
const assert = require('assert');
const D = require('./logic.js');
const AI = require('./ai.js');

const R = { J: 11, Q: 12, K: 13, A: 14, '2': 15, sj: 16, bj: 17 };
const rk = (s) => s.trim().split(/\s+/).filter(Boolean).map((t) => R[t] || Number(t));
const cls = (s) => D.classifyCombo(rk(s));
const typeOf = (s) => { const c = cls(s); return c && c.type; };
const types = (s) => D.classifyAll(rk(s)).map((c) => c.type);
let passed = 0;
function t(name, fn) { fn(); passed++; }

function makeHand(s) {
  const used = {};
  return rk(s).map((r) => {
    if (r >= 16) return { id: r === 16 ? 52 : 53, rank: r, suit: 4 };
    const n = used[r] = (used[r] || 0);
    used[r]++;
    return { id: (r - 3) * 4 + n, rank: r, suit: n };
  });
}

t('single', () => assert.deepStrictEqual(cls('7'), { type: 'single', mainRank: 7, length: 1 }));
t('single joker', () => assert.strictEqual(cls('bj').mainRank, 17));
t('pair', () => assert.deepStrictEqual(cls('K K'), { type: 'pair', mainRank: 13, length: 2 }));
t('jokers never pair, they are rocket', () => assert.strictEqual(typeOf('sj bj'), 'rocket'));
t('mismatched pair', () => assert.strictEqual(cls('3 4'), null));
t('triple', () => assert.strictEqual(typeOf('9 9 9'), 'triple'));
t('triple1', () => { const c = cls('9 9 9 3'); assert.strictEqual(c.type, 'triple1'); assert.strictEqual(c.mainRank, 9); });
t('triple1 with joker kicker', () => assert.strictEqual(typeOf('5 5 5 bj'), 'triple1'));
t('triple2', () => { const c = cls('4 4 4 K K'); assert.strictEqual(c.type, 'triple2'); assert.strictEqual(c.mainRank, 4); });
t('triple + two different singles invalid', () => assert.strictEqual(cls('4 4 4 K Q'), null));
t('bomb', () => assert.deepStrictEqual(cls('8 8 8 8'), { type: 'bomb', mainRank: 8, length: 4 }));
t('straight 5', () => { const c = cls('3 4 5 6 7'); assert.strictEqual(c.type, 'straight'); assert.strictEqual(c.mainRank, 7); });
t('straight 10-A', () => assert.strictEqual(typeOf('10 J Q K A'), 'straight'));
t('straight 3-A (12)', () => assert.strictEqual(cls('3 4 5 6 7 8 9 10 J Q K A').length, 12));
t('straight cannot include 2', () => assert.strictEqual(cls('J Q K A 2'), null));
t('straight cannot include joker', () => assert.strictEqual(cls('Q K A 2 sj'), null));
t('4-card run is not straight', () => assert.strictEqual(cls('3 4 5 6'), null));
t('gap straight invalid', () => assert.strictEqual(cls('3 4 5 6 8'), null));
t('pair straight', () => { const c = cls('5 5 6 6 7 7'); assert.strictEqual(c.type, 'pairStraight'); assert.strictEqual(c.mainRank, 7); });
t('two pairs not pair straight', () => assert.strictEqual(cls('5 5 6 6'), null));
t('pair straight no 2', () => assert.strictEqual(cls('K K A A 2 2'), null));
t('airplane', () => { const c = cls('3 3 3 4 4 4'); assert.strictEqual(c.type, 'airplane'); assert.strictEqual(c.mainRank, 4); });
t('airplane no 2', () => assert.strictEqual(cls('A A A 2 2 2'), null));
t('non-consecutive triples', () => assert.strictEqual(cls('3 3 3 5 5 5'), null));
t('airplane with singles', () => { const c = cls('7 7 7 8 8 8 3 J'); assert.strictEqual(c.type, 'airplane1'); assert.strictEqual(c.mainRank, 8); });
t('airplane with pair-as-two-singles', () => assert.strictEqual(typeOf('7 7 7 8 8 8 3 3'), 'airplane1'));
t('airplane with pairs', () => { const c = cls('7 7 7 8 8 8 3 3 J J'); assert.strictEqual(c.type, 'airplane2'); });
t('airplane wing cannot share triple rank', () => assert.strictEqual(cls('7 7 7 8 8 8 7 3'), null));
t('airplane wrong wing count', () => assert.strictEqual(cls('7 7 7 8 8 8 3'), null));
t('airplane mixed wings invalid', () => assert.strictEqual(cls('7 7 7 8 8 8 3 J J'), null));
t('airplane both jokers as wings invalid', () => assert.strictEqual(cls('7 7 7 8 8 8 sj bj'), null));
t('3 triples + 3 singles', () => assert.strictEqual(cls('3 3 3 4 4 4 5 5 5 9 J K').type, 'airplane1'));
t('4 triples plain vs 3+wings both recognized', () => {
  const ts = types('3 3 3 4 4 4 5 5 5 6 6 6');
  assert.ok(ts.includes('airplane') && ts.includes('airplane1'));
});
t('four with two singles', () => { const c = cls('9 9 9 9 3 5'); assert.strictEqual(c.type, 'four2'); assert.strictEqual(c.mainRank, 9); });
t('four with two pairs', () => { const c = cls('9 9 9 9 3 3 5 5'); assert.strictEqual(c.type, 'four2pairs'); });
t('four with rocket invalid', () => assert.strictEqual(cls('9 9 9 9 sj bj'), null));
t('four + pair + single invalid', () => assert.strictEqual(cls('9 9 9 9 3 3 5'), null));
t('empty', () => assert.strictEqual(cls(''), null));

t('rocket beats bomb', () => assert.ok(D.canBeat(cls('2 2 2 2'), cls('sj bj'))));
t('bomb cannot beat rocket', () => assert.ok(!D.canBeat(cls('sj bj'), cls('2 2 2 2'))));
t('higher bomb beats lower', () => { assert.ok(D.canBeat(cls('5 5 5 5'), cls('6 6 6 6'))); assert.ok(!D.canBeat(cls('6 6 6 6'), cls('5 5 5 5'))); });
t('bomb beats straight', () => assert.ok(D.canBeat(cls('10 J Q K A'), cls('3 3 3 3'))));
t('non-bomb cannot beat bomb', () => assert.ok(!D.canBeat(cls('3 3 3 3'), cls('2 2'))));
t('same type higher', () => assert.ok(D.canBeat(cls('K'), cls('A'))));
t('same type equal fails', () => assert.ok(!D.canBeat(cls('K K'), cls('K K'))));
t('2 beats A, joker beats 2', () => { assert.ok(D.canBeat(cls('A'), cls('2'))); assert.ok(D.canBeat(cls('2'), cls('sj'))); assert.ok(D.canBeat(cls('sj'), cls('bj'))); });
t('different length straight fails', () => assert.ok(!D.canBeat(cls('3 4 5 6 7'), cls('4 5 6 7 8 9'))));
t('same length straight higher', () => assert.ok(D.canBeat(cls('3 4 5 6 7'), cls('4 5 6 7 8'))));
t('type mismatch', () => assert.ok(!D.canBeat(cls('3 3'), cls('4 4 4'))));
t('triple1 vs triple2 mismatch', () => assert.ok(!D.canBeat(cls('3 3 3 4'), cls('5 5 5 6 6'))));
t('triple1 compares triple rank only', () => assert.ok(D.canBeat(cls('3 3 3 2'), cls('4 4 4 5'))));
t('four2 shapes do not cross', () => assert.ok(!D.canBeat(cls('3 3 3 3 4 5'), cls('9 9 9 9 5 5 6 6'))));
t('four2 same shape', () => assert.ok(D.canBeat(cls('3 3 3 3 4 5'), cls('9 9 9 9 5 6'))));
t('airplane1 compare', () => assert.ok(D.canBeat(cls('3 3 3 4 4 4 9 J'), cls('5 5 5 6 6 6 3 7'))));
t('free lead anything', () => assert.ok(D.canBeat(null, cls('5'))));
t('comboFor picks interpretation that beats', () => {
  const cur = cls('3 3 3 4 4 4 5 5 5 7 8 9');
  const c = D.comboFor(rk('4 4 4 5 5 5 6 6 6 7 7 7'), cur);
  assert.ok(c && c.type === 'airplane1' && c.mainRank >= 6);
});

t('enumerate free lead sample hand', () => {
  const hand = makeHand('3 3 4 4 5 5 6 7 8 9 9 9 K K 2 sj bj');
  const moves = D.enumerateLegalMoves(hand, null);
  const tp = new Set(moves.map((m) => m.combo.type));
  ['single', 'pair', 'triple', 'triple1', 'triple2', 'straight', 'pairStraight', 'rocket'].forEach((x) => assert.ok(tp.has(x), x));
  assert.ok(!tp.has('bomb'));
  moves.forEach((m) => {
    assert.ok(D.classifyAll(m.cards).some((c) => c.type === m.combo.type));
    assert.strictEqual(new Set(m.cards.map((c) => c.id)).size, m.cards.length);
  });
  const straights = moves.filter((m) => m.combo.type === 'straight');
  assert.strictEqual(straights.length, 6);
});
t('enumerate follow single', () => {
  const hand = makeHand('3 5 5 9 9 9 9 A 2');
  const moves = D.enumerateLegalMoves(hand, cls('K'));
  const keys = moves.map((m) => m.combo.type + m.combo.mainRank).sort();
  assert.deepStrictEqual(keys, ['bomb9', 'single14', 'single15']);
});
t('enumerate follow pair straight / none but bomb', () => {
  const hand = makeHand('6 6 7 7 8 8 9 9 4 4 4 4');
  const moves = D.enumerateLegalMoves(hand, cls('5 5 6 6 7 7'));
  const keys = moves.map((m) => m.combo.type + m.combo.mainRank).sort();
  assert.deepStrictEqual(keys, ['bomb4', 'pairStraight8', 'pairStraight9']);
});
t('enumerate vs rocket is empty', () => {
  assert.strictEqual(D.enumerateLegalMoves(makeHand('2 2 2 2 A'), cls('sj bj')).length, 0);
});
t('enumerate vs bomb only bigger bombs/rocket', () => {
  const moves = D.enumerateLegalMoves(makeHand('3 3 3 3 J J J J sj bj K'), cls('8 8 8 8'));
  assert.deepStrictEqual(moves.map((m) => m.combo.type + m.combo.mainRank).sort(), ['bomb11', 'rocket17']);
});
t('enumerate airplane wings', () => {
  const hand = makeHand('5 5 5 6 6 6 3 4 9 9');
  const moves = D.enumerateLegalMoves(hand, cls('3 3 3 4 4 4 8 9'));
  assert.ok(moves.length > 0 && moves.every((m) => m.combo.type === 'airplane1' && m.combo.mainRank === 6));
  const m2 = D.enumerateLegalMoves(hand, cls('3 3 3 4 4 4 8 8 9 9'));
  assert.deepStrictEqual(m2.map((m) => m.combo.type), []);
});

t('bidding: 3 ends immediately', () => {
  const b = D.newBidding(1); D.applyBid(b, 1, 3); assert.ok(b.done && b.highestSeat === 1);
});
t('bidding: all pass -> redeal', () => {
  const b = D.newBidding(0); D.applyBid(b, 0, 0); D.applyBid(b, 1, 0); D.applyBid(b, 2, 0);
  assert.ok(b.done && b.redeal);
});
t('bidding: outbid then original bidder may respond', () => {
  const b = D.newBidding(0);
  D.applyBid(b, 0, 1); D.applyBid(b, 1, 0); D.applyBid(b, 2, 2);
  assert.ok(!b.done && b.turn === 0);
  D.applyBid(b, 0, 0);
  assert.ok(b.done && b.highestSeat === 2 && b.highest === 2);
});
t('bidding: must exceed', () => { const b = D.newBidding(0); D.applyBid(b, 0, 2); assert.throws(() => D.applyBid(b, 1, 2)); });

t('scoring', () => {
  assert.deepStrictEqual(D.scoreRound({ bid: 3, bombs: 2, rocket: true, spring: true }), { multiplier: 16, score: 48 });
  assert.deepStrictEqual(D.scoreRound({ bid: 1 }), { multiplier: 1, score: 1 });
  assert.deepStrictEqual(D.settle(1, true, 5), [-5, 10, -5]);
  assert.deepStrictEqual(D.settle(1, false, 5), [5, -10, 5]);
});

t('deterministic deal', () => {
  const a = D.deal(42), b = D.deal(42);
  assert.deepStrictEqual(a, b);
  const all = a.hands.flat().concat(a.bottom).map((c) => c.id).sort((x, y) => x - y);
  assert.strictEqual(all.length, 54);
  assert.strictEqual(new Set(all).size, 54);
  assert.ok(a.hands.every((h) => h.length === 17) && a.bottom.length === 3);
});

t('AI decomposition keeps structures', () => {
  const plan = AI.planFor(makeHand('3 4 5 6 7 9 9 J J J Q Q 2 2 sj bj 8 8 8 8'));
  const tp = plan.map((g) => g.combo.type);
  assert.ok(tp.includes('rocket') && tp.includes('bomb') && tp.includes('straight'));
});
t('AI does not bomb a low single early', () => {
  const hand = makeHand('4 4 4 4 6 8 9 J Q K K 5 5 7 7 10 10');
  const ctx = { seat: 1, landlord: 0, counts: [18, 17, 17], lastSeat: 0 };
  const m = AI.chooseMove(hand, cls('3'), ctx);
  assert.ok(!m || m.combo.type !== 'bomb');
});
t('AI bombs when opponent about to win', () => {
  const hand = makeHand('4 4 4 4 6 8');
  const ctx = { seat: 1, landlord: 0, counts: [1, 6, 10], lastSeat: 0 };
  const m = AI.chooseMove(hand, cls('2 2'), ctx);
  assert.ok(m && m.combo.type === 'bomb');
});
t('hint says pass when nothing beats', () => {
  assert.strictEqual(AI.hint(makeHand('3 4 5'), cls('2'), { seat: 0, landlord: 1, counts: [3, 5, 5], lastSeat: 1 }), null);
});

t('simulate many AI-only rounds', () => {
  let finished = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rng = D.mulberry32(seed);
    let st;
    for (let tries = 0; tries < 20; tries++) {
      st = D.createRound(rng, seed % 3);
      while (st.phase === 'bid') D.roundBid(st, st.turn, AI.bidDecision(st.hands[st.turn], st.bidding.highest));
      if (st.phase === 'play') break;
    }
    if (st.phase !== 'play') continue;
    assert.strictEqual(st.hands[st.landlord].length, 20);
    let steps = 0;
    while (st.phase === 'play') {
      assert.ok(steps++ < 500, 'round too long');
      const s = st.turn, cur = D.currentCombo(st);
      const ctx = { seat: s, landlord: st.landlord, counts: st.hands.map((h) => h.length), lastSeat: st.lastPlay ? st.lastPlay.seat : null };
      const m = AI.chooseMove(st.hands[s], cur, ctx);
      if (!cur) assert.ok(m, 'must lead');
      if (m) D.roundPlay(st, s, m.cards); else D.roundPass(st, s);
    }
    const r = st.result;
    assert.strictEqual(r.deltas.reduce((a, b) => a + b, 0), 0);
    assert.strictEqual(r.score, r.bid * r.multiplier);
    finished++;
  }
  assert.ok(finished > 250);
});

console.log(`All ${passed} tests passed.`);
