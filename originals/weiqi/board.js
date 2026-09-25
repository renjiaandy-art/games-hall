(function (root, factory) {
  var W = factory();
  W.__factory = factory;
  if (typeof module !== 'undefined' && module.exports) module.exports = W;
  else root.Weiqi = W;
})(typeof self !== 'undefined' ? self : this, function WeiqiFactory() {
  var EMPTY = 0, BLACK = 1, WHITE = 2;
  var nbCache = {};

  function neighbors(size) {
    if (nbCache[size]) return nbCache[size];
    var list = [];
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      var n = [];
      if (x > 0) n.push(y * size + x - 1);
      if (x < size - 1) n.push(y * size + x + 1);
      if (y > 0) n.push((y - 1) * size + x);
      if (y < size - 1) n.push((y + 1) * size + x);
      list.push(n);
    }
    nbCache[size] = list;
    return list;
  }

  function other(c) { return c === BLACK ? WHITE : BLACK; }

  function createBoard(size) {
    var cells = [];
    for (var i = 0; i < size * size; i++) cells.push(EMPTY);
    return { size: size, cells: cells };
  }

  function cloneBoard(b) { return { size: b.size, cells: b.cells.slice() }; }

  function idx(b, x, y) { return y * b.size + x; }

  function groupFrom(b, start) {
    var color = b.cells[start];
    if (color === EMPTY) return null;
    var nb = neighbors(b.size), seen = {}, libSeen = {};
    var stones = [], libs = [], stack = [start];
    seen[start] = true;
    while (stack.length) {
      var p = stack.pop();
      stones.push(p);
      var ns = nb[p];
      for (var i = 0; i < ns.length; i++) {
        var q = ns[i], c = b.cells[q];
        if (c === color && !seen[q]) { seen[q] = true; stack.push(q); }
        else if (c === EMPTY && !libSeen[q]) { libSeen[q] = true; libs.push(q); }
      }
    }
    return { color: color, stones: stones, liberties: libs };
  }

  function groupAt(b, x, y) { return groupFrom(b, idx(b, x, y)); }

  function libertiesOf(b, x, y) {
    var g = (x && typeof x === 'object') ? x : groupAt(b, x, y);
    return g ? g.liberties.length : 0;
  }

  // koState = { point: index, color: the colour forbidden from playing there } or null.
  // A simple ko arises only when a single stone captures exactly one stone and the capturing
  // stone is itself left alone with exactly one liberty (the point just emptied). Retaking
  // at once would recreate the previous position, so that point is banned for one turn.
  function applyMove(b, x, y, color, koState) {
    if (x == null || x < 0) return { board: cloneBoard(b), captured: [], illegal: false, illegalReason: null, newKoState: null, pass: true };
    var size = b.size;
    if (x >= size || y >= size) return fail('outside');
    var p = idx(b, x, y);
    if (b.cells[p] !== EMPTY) return fail('occupied');
    if (koState && koState.point === p && koState.color === color) return fail('ko');
    var nb = neighbors(size), opp = other(color);
    var nbd = cloneBoard(b);
    nbd.cells[p] = color;
    var captured = [], done = {};
    var ns = nb[p];
    for (var i = 0; i < ns.length; i++) {
      var q = ns[i];
      if (nbd.cells[q] !== opp || done[q]) continue;
      var g = groupFrom(nbd, q);
      for (var k = 0; k < g.stones.length; k++) done[g.stones[k]] = true;
      if (g.liberties.length === 0) {
        for (k = 0; k < g.stones.length; k++) { nbd.cells[g.stones[k]] = EMPTY; captured.push(g.stones[k]); }
      }
    }
    var own = groupFrom(nbd, p);
    if (own.liberties.length === 0) return fail('suicide');
    var newKo = null;
    if (captured.length === 1 && own.stones.length === 1 && own.liberties.length === 1 && own.liberties[0] === captured[0]) {
      newKo = { point: captured[0], color: opp };
    }
    return { board: nbd, captured: captured, illegal: false, illegalReason: null, newKoState: newKo, pass: false };

    function fail(reason) { return { board: b, captured: [], illegal: true, illegalReason: reason, newKoState: koState || null, pass: false }; }
  }

  function isLegal(b, x, y, color, koState) { return !applyMove(b, x, y, color, koState).illegal; }

  function legalMoves(b, color, koState) {
    var out = [];
    for (var y = 0; y < b.size; y++) for (var x = 0; x < b.size; x++) {
      if (b.cells[y * b.size + x] === EMPTY && isLegal(b, x, y, color, koState)) out.push([x, y]);
    }
    return out;
  }

  function removeStones(b, list) {
    var nbd = cloneBoard(b);
    for (var i = 0; i < list.length; i++) nbd.cells[list[i]] = EMPTY;
    return nbd;
  }

  function territory(b) {
    var nb = neighbors(b.size), n = b.cells.length, owner = new Array(n), seen = {};
    for (var i = 0; i < n; i++) owner[i] = b.cells[i] === EMPTY ? 0 : -1;
    for (i = 0; i < n; i++) {
      if (b.cells[i] !== EMPTY || seen[i]) continue;
      var region = [], stack = [i], touch = 0;
      seen[i] = true;
      while (stack.length) {
        var p = stack.pop();
        region.push(p);
        for (var k = 0; k < nb[p].length; k++) {
          var q = nb[p][k], c = b.cells[q];
          if (c === EMPTY) { if (!seen[q]) { seen[q] = true; stack.push(q); } }
          else touch |= c;
        }
      }
      var who = touch === BLACK ? BLACK : touch === WHITE ? WHITE : 0;
      for (k = 0; k < region.length; k++) owner[region[k]] = who;
    }
    return owner;
  }

  function scoreArea(b, komi, dead) {
    if (komi == null) komi = 3.75;
    var bd = dead && dead.length ? removeStones(b, dead) : b;
    var owner = territory(bd);
    var bs = 0, ws = 0, bt = 0, wt = 0, dame = 0;
    for (var i = 0; i < bd.cells.length; i++) {
      var c = bd.cells[i];
      if (c === BLACK) bs++;
      else if (c === WHITE) ws++;
      else if (owner[i] === BLACK) bt++;
      else if (owner[i] === WHITE) wt++;
      else dame++;
    }
    var black = bs + bt, white = ws + wt + komi;
    return {
      black: black, white: white, blackStones: bs, whiteStones: ws, blackTerritory: bt, whiteTerritory: wt,
      dame: dame, komi: komi, winner: black > white ? BLACK : WHITE, margin: Math.abs(black - white), owner: owner
    };
  }

  function starPoints(size) {
    if (size === 9) return [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
    if (size === 13) return [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]];
    if (size === 19) { var o = []; [3, 9, 15].forEach(function (a) { [3, 9, 15].forEach(function (c) { o.push([a, c]); }); }); return o; }
    return [];
  }

  return {
    EMPTY: EMPTY, BLACK: BLACK, WHITE: WHITE, other: other, neighbors: neighbors,
    createBoard: createBoard, cloneBoard: cloneBoard, applyMove: applyMove, isLegal: isLegal, legalMoves: legalMoves,
    groupAt: groupAt, groupFrom: groupFrom, libertiesOf: libertiesOf, removeStones: removeStones,
    territory: territory, scoreArea: scoreArea, starPoints: starPoints
  };
});
