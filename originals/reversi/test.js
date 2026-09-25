const assert = require('assert');
const R = require('./logic.js');
const { EMPTY: _, BLACK: B, WHITE: W } = R;

function parse(rows) {
  const b = new Array(64).fill(_);
  rows.forEach((row, y) => [...row.replace(/\s/g, '')].forEach((ch, x) => {
    b[y * 8 + x] = ch === 'B' ? B : ch === 'W' ? W : _;
  }));
  return b;
}
const key = (ms) => ms.map(([x, y]) => `${x},${y}`).sort();
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok -', name); }

test('initial board setup', () => {
  const b = R.initBoard();
  assert.deepStrictEqual(R.score(b), { black: 2, white: 2 });
  assert.strictEqual(b[3 * 8 + 3], W); assert.strictEqual(b[4 * 8 + 4], W);
  assert.strictEqual(b[3 * 8 + 4], B); assert.strictEqual(b[4 * 8 + 3], B);
});

test('initial legal moves are the 4 standard openings', () => {
  const b = R.initBoard();
  assert.deepStrictEqual(key(R.legalMoves(b, B)), key([[3, 2], [2, 3], [5, 4], [4, 5]]));
  assert.deepStrictEqual(key(R.legalMoves(b, W)), key([[4, 2], [5, 3], [2, 4], [3, 5]]));
});

test('applyMove flips lines in multiple directions', () => {
  const b = parse([
    'B...B...',
    '.W..W...',
    '..W.W.B.',
    '...WWW..',
    'BWWW.WWB',
    '...WWW..',
    '..W.W.W.',
    '.B..B..B',
  ]);
  const r = R.applyMove(b, B, 4, 4);
  assert.ok(r);
  const exp = key([[3, 3], [2, 2], [1, 1], [4, 3], [4, 2], [4, 1], [5, 3], [3, 4], [2, 4], [1, 4],
    [5, 4], [6, 4], [3, 5], [2, 6], [4, 5], [4, 6], [5, 5], [6, 6]]);
  assert.deepStrictEqual(key(r.flipped), exp);
  for (const [x, y] of r.flipped) assert.strictEqual(r.board[y * 8 + x], B);
  assert.strictEqual(r.board[4 * 8 + 4], B);
  assert.strictEqual(b[4 * 8 + 4], _, 'original board not mutated');
  assert.deepStrictEqual(R.score(r.board), { black: 8 + 18 + 1, white: 0 });
});

test('a move flipping zero discs is illegal', () => {
  const b = R.initBoard();
  assert.strictEqual(R.applyMove(b, B, 0, 0), null);
  assert.strictEqual(R.applyMove(b, B, 2, 2), null, 'diagonal-adjacent but no bracket');
  assert.strictEqual(R.applyMove(b, B, 3, 3), null, 'occupied cell');
  assert.ok(!key(R.legalMoves(b, B)).includes('2,2'));
  const b2 = parse(['.WW.....', '........', '........', '........', '........', '........', '........', '.......B']);
  assert.strictEqual(R.applyMove(b2, B, 0, 0), null, 'run not closed by own disc');
  assert.strictEqual(R.applyMove(b2, B, 3, 0), null, 'run not closed by own disc');
  assert.deepStrictEqual(R.legalMoves(b2, B), []);
  assert.deepStrictEqual(R.legalMoves(b2, W), []);
  assert.strictEqual(R.isGameOver(b2), true);
});

test('hasAnyMove / auto-pass when one side is blocked', () => {
  const b = parse(['BBW.....', '........', '........', '........', '........', '........', '........', '........']);
  assert.strictEqual(R.hasAnyMove(b, W), false);
  assert.strictEqual(R.hasAnyMove(b, B), true);
  assert.strictEqual(R.isGameOver(b), false);
  assert.strictEqual(R.chooseMove(b, W, 'hard', 200), null);
  assert.strictEqual(R.chooseMove(b, W, 'easy'), null);
  assert.deepStrictEqual(R.legalMoves(b, B), [[3, 0]]);
  assert.deepStrictEqual(R.chooseMove(b, B, 'hard', 200), [3, 0]);
  const after = R.applyMove(b, B, 3, 0).board;
  assert.strictEqual(R.isGameOver(after), true);
  assert.strictEqual(R.winner(after), B);
});

test('isGameOver on full and on blocked boards', () => {
  const full = new Array(64).fill(B).map((v, i) => (i % 3 ? B : W));
  assert.strictEqual(R.isGameOver(full), true);
  const blocked = parse(['B.......', '........', '........', '........', '........', '........', '........', '.......B']);
  assert.strictEqual(R.isGameOver(blocked), true);
  assert.strictEqual(R.isGameOver(R.initBoard()), false);
});

test('score and winner', () => {
  const full = new Array(64).fill(B).map((v, i) => (i % 3 ? B : W));
  assert.deepStrictEqual(R.score(full), { black: 42, white: 22 });
  assert.strictEqual(R.winner(full), B);
  const draw = new Array(64).fill(0).map((v, i) => (i < 32 ? B : W));
  assert.strictEqual(R.winner(draw), R.EMPTY);
});

test('evaluate prefers owning a corner over its X-square', () => {
  const base = R.initBoard();
  const withCorner = base.slice(); withCorner[0] = W;
  const withX = base.slice(); withX[9] = W;
  assert.ok(R.evaluate(withCorner, W) > R.evaluate(withX, W));
});

// White to move. (7,7) corner is free (flips 1). (1,1) is the X-square next to the empty a1 corner
// and flips far more discs, so a greedy player would take it -- Hard must not.
const cornerFixture = parse([
  '........',
  '.BBBBB..',
  '.BBBBW..',
  '.BBBW...',
  '.BBW....',
  '.BW..WBB',
  '.W....B.',
  '........',
]);

test('corner fixture: greedy would pick the trap, both moves legal', () => {
  const ms = R.legalMoves(cornerFixture, W);
  const k = key(ms);
  assert.ok(k.includes('7,7'), 'corner is legal');
  const flips = (x, y) => R.flipsFor(cornerFixture, W, x, y).length;
  let greedy = ms.reduce((a, m) => (flips(m[0], m[1]) > flips(a[0], a[1]) ? m : a));
  assert.ok(flips(7, 7) < flips(greedy[0], greedy[1]));
  const gi = greedy[1] * 8 + greedy[0];
  assert.ok([1, 8, 9].includes(gi) || [6, 14, 15].includes(gi) || [48, 49, 57].includes(gi), 'greedy move is a corner-adjacent trap: ' + greedy);
});

test('Hard AI takes the free corner instead of the trap (regression)', () => {
  for (const budget of [50, 300, 1000]) {
    const mv = R.chooseMove(cornerFixture, W, 'hard', budget);
    assert.deepStrictEqual(mv, [7, 7], `budget ${budget}ms chose ${mv}`);
  }
  for (let d = 1; d <= 5; d++) {
    const r = R.hardSearch(cornerFixture, W, 5000, d);
    assert.deepStrictEqual(r.move, [7, 7], `depth ${d} chose ${r.move}`);
  }
});

test('Hard AI finds exact endgame and stays within time budget', () => {
  let b = R.initBoard(), c = B;
  let maxMs = 0, rnd = 12345;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
  while (!R.isGameOver(b)) {
    if (!R.hasAnyMove(b, c)) { c = R.opp(c); continue; }
    let mv;
    if (c === W) {
      const t = Date.now(); mv = R.chooseMove(b, W, 'hard', 400); maxMs = Math.max(maxMs, Date.now() - t);
    } else mv = R.easyMove(b, B, rand);
    b = R.applyMove(b, c, mv[0], mv[1]).board; c = R.opp(c);
  }
  const s = R.score(b);
  assert.ok(maxMs < 1200, 'hard move took ' + maxMs + 'ms');
  assert.ok(s.white > s.black, `hard should beat easy: ${JSON.stringify(s)}`);
  console.log('   hard vs easy final', s, 'max move time', maxMs + 'ms');
});

test('easy AI returns legal moves', () => {
  const b = R.initBoard();
  for (let i = 0; i < 50; i++) {
    const m = R.chooseMove(b, B, 'easy');
    assert.ok(R.applyMove(b, B, m[0], m[1]));
  }
});

console.log(`\nAll ${passed} tests passed.`);
