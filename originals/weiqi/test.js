const assert = require('assert');
const W = require('./board.js');
const { BLACK: B, WHITE: Wh, EMPTY: E } = W;

function setup(size, stones) {
  let b = W.createBoard(size);
  for (const [x, y, c] of stones) {
    const r = W.applyMove(b, x, y, c, null);
    assert.ok(!r.illegal, `setup move ${x},${y} illegal: ${r.illegalReason}`);
    b = r.board;
  }
  return b;
}
const at = (b, x, y) => b.cells[y * b.size + x];
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok -', name); }

test('capture single surrounded stone', () => {
  const b = setup(9, [[4, 4, Wh], [3, 4, B], [5, 4, B], [4, 3, B]]);
  assert.strictEqual(W.libertiesOf(b, 4, 4), 1);
  const r = W.applyMove(b, 4, 5, B, null);
  assert.ok(!r.illegal);
  assert.deepStrictEqual(r.captured, [4 * 9 + 4]);
  assert.strictEqual(at(r.board, 4, 4), E);
  assert.strictEqual(at(b, 4, 4), Wh, 'original board must be unchanged');
});

test('capture single stone in corner', () => {
  const b = setup(9, [[0, 0, Wh], [1, 0, B]]);
  const r = W.applyMove(b, 0, 1, B, null);
  assert.strictEqual(r.captured.length, 1);
  assert.strictEqual(at(r.board, 0, 0), E);
});

test('capture multi-stone group', () => {
  const b = setup(9, [[0, 0, Wh], [1, 0, Wh], [0, 1, Wh], [2, 0, B], [1, 1, B]]);
  const g = W.groupAt(b, 0, 0);
  assert.strictEqual(g.stones.length, 3);
  assert.strictEqual(g.liberties.length, 1);
  const r = W.applyMove(b, 0, 2, B, null);
  assert.strictEqual(r.captured.length, 3);
  for (const [x, y] of [[0, 0], [1, 0], [0, 1]]) assert.strictEqual(at(r.board, x, y), E);
  assert.strictEqual(W.libertiesOf(r.board, 1, 1), 4);
});

test('suicide rejected', () => {
  const b = setup(9, [[1, 0, Wh], [0, 1, Wh]]);
  const r = W.applyMove(b, 0, 0, B, null);
  assert.ok(r.illegal);
  assert.strictEqual(r.illegalReason, 'suicide');
  const b2 = setup(9, [[3, 4, Wh], [5, 4, Wh], [4, 3, Wh], [4, 5, Wh]]);
  assert.strictEqual(W.applyMove(b2, 4, 4, B, null).illegalReason, 'suicide');
  const b3 = setup(9, [[1, 0, B], [2, 0, Wh], [1, 1, Wh], [0, 1, Wh]]);
  const r3 = W.applyMove(b3, 0, 0, B, null);
  assert.ok(r3.illegal, 'multi-stone suicide should be illegal');
});

test('occupied point rejected', () => {
  const b = setup(9, [[2, 2, B]]);
  assert.strictEqual(W.applyMove(b, 2, 2, Wh, null).illegalReason, 'occupied');
});

test('self-fill connected to a liberty is legal', () => {
  const b = setup(9, [[1, 0, B], [0, 1, B]]);
  const r = W.applyMove(b, 0, 0, B, null);
  assert.ok(!r.illegal);
  assert.strictEqual(W.groupAt(r.board, 0, 0).stones.length, 3);
  const b2 = setup(9, [[1, 0, Wh], [0, 1, B], [1, 1, B]]);
  const r2 = W.applyMove(b2, 0, 0, B, null);
  assert.ok(!r2.illegal, 'filling point with only friendly-group liberty is legal');
});

test('move that looks suicidal but captures is legal', () => {
  const b = setup(9, [[1, 0, Wh], [0, 1, Wh], [2, 0, B], [1, 1, B]]);
  const r = W.applyMove(b, 0, 0, B, null);
  assert.ok(!r.illegal);
  assert.deepStrictEqual(r.captured, [1]);
});

test('simple ko: immediate recapture illegal, allowed after a move elsewhere', () => {
  const b = setup(9, [[1, 0, B], [0, 1, B], [1, 2, B], [2, 0, Wh], [3, 1, Wh], [2, 2, Wh], [1, 1, Wh]]);
  const r1 = W.applyMove(b, 2, 1, B, null);
  assert.ok(!r1.illegal);
  assert.deepStrictEqual(r1.captured, [1 * 9 + 1]);
  assert.deepStrictEqual(r1.newKoState, { point: 10, color: Wh });
  const r2 = W.applyMove(r1.board, 1, 1, Wh, r1.newKoState);
  assert.ok(r2.illegal);
  assert.strictEqual(r2.illegalReason, 'ko');
  assert.ok(!W.applyMove(r1.board, 1, 1, B, r1.newKoState).illegal, 'ko only binds the other colour');
  const w = W.applyMove(r1.board, 7, 7, Wh, r1.newKoState);
  const bl = W.applyMove(w.board, 7, 1, B, w.newKoState);
  const r3 = W.applyMove(bl.board, 1, 1, Wh, bl.newKoState);
  assert.ok(!r3.illegal);
  assert.deepStrictEqual(r3.captured, [1 * 9 + 2]);
  assert.ok(r3.newKoState && r3.newKoState.color === B);
});

test('capturing two stones does not create ko', () => {
  const b = setup(9, [[0, 0, Wh], [0, 1, Wh], [1, 0, B], [1, 1, B], [0, 3, B], [1, 2, Wh]]);
  const r = W.applyMove(b, 0, 2, B, null);
  assert.strictEqual(r.captured.length, 2);
  assert.strictEqual(r.newKoState, null);
});

test('pass returns no ko', () => {
  const b = W.createBoard(9);
  const r = W.applyMove(b, -1, -1, B, { point: 3, color: B });
  assert.ok(r.pass && !r.illegal && r.newKoState === null);
});

test('scoreArea: empty board is all dame', () => {
  const s = W.scoreArea(W.createBoard(9), 3.75);
  assert.strictEqual(s.black, 0);
  assert.strictEqual(s.white, 3.75);
  assert.strictEqual(s.dame, 81);
});

test('scoreArea: split board with dame column', () => {
  const stones = [];
  for (let y = 0; y < 9; y++) { stones.push([3, y, B]); stones.push([5, y, Wh]); }
  const b = setup(9, stones);
  const s = W.scoreArea(b, 3.75);
  assert.strictEqual(s.blackStones, 9);
  assert.strictEqual(s.whiteStones, 9);
  assert.strictEqual(s.blackTerritory, 27);
  assert.strictEqual(s.whiteTerritory, 27);
  assert.strictEqual(s.dame, 9);
  assert.strictEqual(s.black, 36);
  assert.strictEqual(s.white, 39.75);
  assert.strictEqual(s.winner, Wh);
  assert.strictEqual(s.margin, 3.75);
});

test('scoreArea: adjacent walls, black wins by 5.25; dead stone removal', () => {
  const stones = [];
  for (let y = 0; y < 9; y++) { stones.push([4, y, B]); stones.push([5, y, Wh]); }
  stones.push([1, 1, Wh]);
  const b = setup(9, stones);
  const s = W.scoreArea(b, 3.75);
  assert.strictEqual(s.blackStones, 9);
  assert.strictEqual(s.whiteStones, 10);
  assert.strictEqual(s.blackTerritory, 0, 'white stone inside spoils black area');
  assert.strictEqual(s.whiteTerritory, 27);
  const s2 = W.scoreArea(b, 3.75, [1 * 9 + 1]);
  assert.strictEqual(s2.blackTerritory, 36);
  assert.strictEqual(s2.whiteStones, 9);
  assert.strictEqual(s2.black, 45);
  assert.strictEqual(s2.white, 39.75);
  assert.strictEqual(s2.winner, B);
  assert.strictEqual(s2.margin, 5.25);
  assert.strictEqual(s2.black + s2.white - s2.komi + s2.dame, 81);
});

test('legalMoves excludes suicide and ko', () => {
  const b = setup(9, [[1, 0, Wh], [0, 1, Wh]]);
  const moves = W.legalMoves(b, B, null);
  assert.strictEqual(moves.length, 81 - 2 - 1);
});

console.log(`\nall ${passed} tests passed`);
