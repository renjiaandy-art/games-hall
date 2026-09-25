(function (root, factory) {
  var R = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = R;
  else root.Reversi = R;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var EMPTY = 0, BLACK = 1, WHITE = 2, N = 8;
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  var WEIGHTS = [
    100, -20, 10, 5, 5, 10, -20, 100,
    -20, -50, -2, -2, -2, -2, -50, -20,
    10, -2, 1, 1, 1, 1, -2, 10,
    5, -2, 1, 0, 0, 1, -2, 5,
    5, -2, 1, 0, 0, 1, -2, 5,
    10, -2, 1, 1, 1, 1, -2, 10,
    -20, -50, -2, -2, -2, -2, -50, -20,
    100, -20, 10, 5, 5, 10, -20, 100
  ];
  var CORNERS = [0, 7, 56, 63];
  // For each corner: the X-square and the two C-squares that are dangerous while it is empty.
  var CORNER_ADJ = { 0: [9, 1, 8], 7: [14, 6, 15], 56: [49, 57, 48], 63: [54, 62, 55] };
  var DANGER = {};
  CORNERS.forEach(function (c) { CORNER_ADJ[c].forEach(function (i) { DANGER[i] = c; }); });

  function opp(c) { return 3 - c; }
  function idx(x, y) { return y * N + x; }
  function inside(x, y) { return x >= 0 && x < N && y >= 0 && y < N; }

  function initBoard() {
    var b = new Array(64).fill(EMPTY);
    b[idx(3, 3)] = WHITE; b[idx(4, 4)] = WHITE;
    b[idx(3, 4)] = BLACK; b[idx(4, 3)] = BLACK;
    return b;
  }

  function flipsFor(board, color, x, y) {
    if (!inside(x, y) || board[idx(x, y)] !== EMPTY) return [];
    var o = opp(color), out = [];
    for (var d = 0; d < 8; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1], cx = x + dx, cy = y + dy, run = [];
      while (inside(cx, cy) && board[idx(cx, cy)] === o) { run.push([cx, cy]); cx += dx; cy += dy; }
      if (run.length && inside(cx, cy) && board[idx(cx, cy)] === color) out.push.apply(out, run);
    }
    return out;
  }

  function canPlay(board, color, x, y) {
    if (board[idx(x, y)] !== EMPTY) return false;
    var o = opp(color);
    for (var d = 0; d < 8; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1], cx = x + dx, cy = y + dy, n = 0;
      while (inside(cx, cy) && board[idx(cx, cy)] === o) { n++; cx += dx; cy += dy; }
      if (n && inside(cx, cy) && board[idx(cx, cy)] === color) return true;
    }
    return false;
  }

  function legalMoves(board, color) {
    var out = [];
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) if (canPlay(board, color, x, y)) out.push([x, y]);
    return out;
  }

  function countMoves(board, color) {
    var n = 0;
    for (var i = 0; i < 64; i++) if (board[i] === EMPTY && canPlay(board, color, i & 7, i >> 3)) n++;
    return n;
  }

  function applyMove(board, color, x, y) {
    var flipped = flipsFor(board, color, x, y);
    if (!flipped.length) return null;
    var nb = board.slice();
    nb[idx(x, y)] = color;
    for (var i = 0; i < flipped.length; i++) nb[idx(flipped[i][0], flipped[i][1])] = color;
    return { board: nb, flipped: flipped };
  }

  function hasAnyMove(board, color) {
    for (var i = 0; i < 64; i++) if (board[i] === EMPTY && canPlay(board, color, i & 7, i >> 3)) return true;
    return false;
  }

  function isGameOver(board) { return !hasAnyMove(board, BLACK) && !hasAnyMove(board, WHITE); }

  function score(board) {
    var s = { black: 0, white: 0 };
    for (var i = 0; i < 64; i++) { if (board[i] === BLACK) s.black++; else if (board[i] === WHITE) s.white++; }
    return s;
  }

  function winner(board) {
    var s = score(board);
    return s.black > s.white ? BLACK : s.white > s.black ? WHITE : EMPTY;
  }

  function evaluate(board, color) {
    var o = opp(color), pos = 0, mine = 0, theirs = 0, empties = 0, i;
    for (i = 0; i < 64; i++) {
      var v = board[i];
      if (v === EMPTY) { empties++; continue; }
      var w = WEIGHTS[i];
      if (DANGER[i] !== undefined && board[DANGER[i]] !== EMPTY) w = 5;
      if (v === color) { pos += w; mine++; } else { pos -= w; theirs++; }
    }
    if (mine === 0) return -100000;
    if (theirs === 0) return 100000;
    var myMob = countMoves(board, color), opMob = countMoves(board, o);
    if (myMob === 0 && opMob === 0) {
      var diff = mine - theirs;
      return diff > 0 ? 50000 + diff : diff < 0 ? -50000 + diff : 0;
    }
    var mob = 100 * (myMob - opMob) / (myMob + opMob + 2);
    var corners = 0;
    for (i = 0; i < 4; i++) { var c = board[CORNERS[i]]; if (c === color) corners++; else if (c === o) corners--; }
    var discW = empties > 40 ? -1 : empties > 20 ? 1 : empties > 10 ? 4 : 10;
    return pos + mob * 1.2 + corners * 40 + (mine - theirs) * discW;
  }

  function orderedMoves(board, color) {
    var ms = [];
    for (var i = 0; i < 64; i++) {
      if (board[i] !== EMPTY || !canPlay(board, color, i & 7, i >> 3)) continue;
      var w = WEIGHTS[i];
      if (DANGER[i] !== undefined && board[DANGER[i]] !== EMPTY) w = 5;
      ms.push({ i: i, w: w });
    }
    ms.sort(function (a, b) { return b.w - a.w; });
    return ms;
  }

  function Timeout() {}

  // Negamax with alpha-beta. Children are ordered by the static positional table (corners first,
  // X/C squares last) so the likely-best reply is searched first and cutoffs happen early.
  function search(board, color, depth, alpha, beta, ctx, passed) {
    if ((++ctx.nodes & 1023) === 0 && Date.now() > ctx.deadline) throw new Timeout();
    if (depth === 0) return evaluate(board, color);
    var ms = orderedMoves(board, color);
    if (!ms.length) {
      if (passed) return evaluate(board, color);
      return -search(board, opp(color), depth, -beta, -alpha, ctx, true);
    }
    var best = -Infinity;
    for (var k = 0; k < ms.length; k++) {
      var i = ms[k].i, r = applyMove(board, color, i & 7, i >> 3);
      var v = -search(r.board, opp(color), depth - 1, -beta, -alpha, ctx, false);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  function searchRoot(board, color, depth, rootOrder, ctx) {
    var alpha = -Infinity, beta = Infinity, best = null, scores = {};
    for (var k = 0; k < rootOrder.length; k++) {
      var i = rootOrder[k], r = applyMove(board, color, i & 7, i >> 3);
      var v = -search(r.board, opp(color), depth - 1, -beta, -alpha, ctx, false);
      scores[i] = v;
      if (best === null || v > alpha) { alpha = v; best = i; }
    }
    return { move: best, value: alpha, scores: scores };
  }

  function emptiesCount(board) { var n = 0; for (var i = 0; i < 64; i++) if (board[i] === EMPTY) n++; return n; }

  function hardSearch(board, color, timeBudgetMs, maxDepth) {
    var ms = orderedMoves(board, color);
    if (!ms.length) return null;
    var order = ms.map(function (m) { return m.i; });
    if (order.length === 1) return { move: [order[0] & 7, order[0] >> 3], depth: 0, value: 0, nodes: 0 };
    var budget = timeBudgetMs || 1000;
    var ctx = { nodes: 0, deadline: Date.now() + budget };
    var empties = emptiesCount(board), limit = maxDepth || empties;
    var bestMove = order[0], bestVal = 0, reached = 0;
    for (var depth = 1; depth <= Math.min(limit, empties); depth++) {
      try {
        var res = searchRoot(board, color, depth, order, ctx);
        bestMove = res.move; bestVal = res.value; reached = depth;
        order.sort(function (a, b) { return res.scores[b] - res.scores[a]; });
      } catch (e) {
        if (e instanceof Timeout) break;
        throw e;
      }
      if (Math.abs(bestVal) >= 50000) break;
      if (Date.now() > ctx.deadline - budget * 0.55 && depth < empties) break;
    }
    return { move: [bestMove & 7, bestMove >> 3], depth: reached, value: bestVal, nodes: ctx.nodes };
  }

  function easyMove(board, color, rnd) {
    rnd = rnd || Math.random;
    var ms = legalMoves(board, color);
    if (!ms.length) return null;
    var safe = ms.filter(function (m) { var i = idx(m[0], m[1]); return DANGER[i] === undefined || board[DANGER[i]] !== EMPTY; });
    var pool = safe.length && rnd() < 0.6 ? safe : ms;
    return pool[Math.floor(rnd() * pool.length)];
  }

  function chooseMove(board, color, difficulty, timeBudgetMs) {
    if (difficulty === 'easy') return easyMove(board, color);
    var r = hardSearch(board, color, timeBudgetMs || 1000);
    return r ? r.move : null;
  }

  return {
    EMPTY: EMPTY, BLACK: BLACK, WHITE: WHITE, WEIGHTS: WEIGHTS,
    opp: opp, initBoard: initBoard, legalMoves: legalMoves, applyMove: applyMove, flipsFor: flipsFor,
    hasAnyMove: hasAnyMove, isGameOver: isGameOver, score: score, winner: winner, evaluate: evaluate,
    hardSearch: hardSearch, easyMove: easyMove, chooseMove: chooseMove
  };
});
