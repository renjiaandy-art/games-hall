/* logic.js — Solitaire (Klondike + FreeCell) pure game logic. No DOM. MIT.
 * Card id: 0-51. rank = id%13+1 (1=A..13=K). suit = floor(id/13): 0=S 1=H 2=D 3=C.
 * color: suit 0 or 3 => black ('B'); suit 1 or 2 => red ('R'). */
(function (root) {
  'use strict';
  const RANK_CH = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUIT_CH = ['♠', '♥', '♦', '♣'];
  const rankOf = (id) => (id % 13) + 1;
  const suitOf = (id) => Math.floor(id / 13);
  const colorOf = (id) => { const s = suitOf(id); return (s === 0 || s === 3) ? 'B' : 'R'; };
  const label = (id) => RANK_CH[rankOf(id)] + SUIT_CH[suitOf(id)];

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  function newDeck() { const d = []; for (let i = 0; i < 52; i++) d.push(i); return d; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------------------------------------------------------------- Klondike
  const K = {};
  K.deal = function (drawCount) {
    const deck = shuffle(newDeck());
    const tableau = [[], [], [], [], [], [], []];
    let p = 0;
    for (let c = 0; c < 7; c++) {
      for (let r = 0; r <= c; r++) {
        tableau[c].push({ id: deck[p++], up: r === c });
      }
    }
    const stock = deck.slice(p);
    return {
      mode: 'klondike', drawCount: drawCount === 3 ? 3 : 1,
      tableau, stock, waste: [],
      foundation: [[], [], [], []],
      moves: 0, win: false,
    };
  };
  K.clone = clone;

  K.canLift = function (col, index) {
    if (index < 0 || index >= col.length) return false;
    if (!col[index].up) return false;
    for (let k = index; k < col.length - 1; k++) {
      const a = col[k], b = col[k + 1];
      if (!b.up) return false;
      if (rankOf(b.id) !== rankOf(a.id) - 1) return false;
      if (colorOf(b.id) === colorOf(a.id)) return false;
    }
    return true;
  };
  K.canDropOnTableau = function (col, id) {
    if (col.length === 0) return rankOf(id) === 13;
    const top = col[col.length - 1];
    if (!top.up) return false;
    return rankOf(id) === rankOf(top.id) - 1 && colorOf(id) !== colorOf(top.id);
  };
  K.canDropOnFoundation = function (state, id) {
    const s = suitOf(id), pile = state.foundation[s];
    const need = pile.length + 1;
    return rankOf(id) === need;
  };
  K.draw = function (state) {
    if (state.stock.length === 0) {
      if (state.waste.length === 0) return false;
      state.stock = state.waste.reverse();
      state.waste = [];
      state.moves++;
      return true;
    }
    const n = Math.min(state.drawCount, state.stock.length);
    for (let i = 0; i < n; i++) state.waste.push(state.stock.pop());
    state.moves++;
    return true;
  };
  K.wasteToFoundation = function (state) {
    if (!state.waste.length) return false;
    const id = state.waste[state.waste.length - 1];
    if (!K.canDropOnFoundation(state, id)) return false;
    state.waste.pop(); state.foundation[suitOf(id)].push(id); state.moves++;
    return true;
  };
  K.wasteToTableau = function (state, toCol) {
    if (!state.waste.length) return false;
    const id = state.waste[state.waste.length - 1];
    if (!K.canDropOnTableau(state.tableau[toCol], id)) return false;
    state.waste.pop(); state.tableau[toCol].push({ id, up: true }); state.moves++;
    return true;
  };
  K.tableauToFoundation = function (state, col) {
    const c = state.tableau[col];
    if (!c.length) return false;
    const id = c[c.length - 1].id;
    if (!c[c.length - 1].up || !K.canDropOnFoundation(state, id)) return false;
    c.pop(); state.foundation[suitOf(id)].push(id);
    if (c.length && !c[c.length - 1].up) c[c.length - 1].up = true;
    state.moves++;
    return true;
  };
  K.tableauToTableau = function (state, fromCol, index, toCol) {
    if (fromCol === toCol) return false;
    const from = state.tableau[fromCol];
    if (!K.canLift(from, index)) return false;
    const moving = from[index];
    if (!K.canDropOnTableau(state.tableau[toCol], moving.id)) return false;
    const seq = from.splice(index);
    state.tableau[toCol].push(...seq);
    if (from.length && !from[from.length - 1].up) from[from.length - 1].up = true;
    state.moves++;
    return true;
  };
  K.autoPlay = function (state) {
    let any = false, moved = true;
    while (moved) {
      moved = false;
      for (let c = 0; c < 7; c++) { if (K.tableauToFoundation(state, c)) { moved = true; any = true; } }
      if (K.wasteToFoundation(state)) { moved = true; any = true; }
    }
    return any;
  };
  K.isWin = function (state) { return state.foundation.every((p) => p.length === 13); };

  // ---------------------------------------------------------------- FreeCell
  const F = {};
  F.freeCount = function (state) { return state.free.filter((x) => x == null).length; };
  F.emptyCols = function (state, excludeCol) {
    let n = 0;
    for (let i = 0; i < state.tableau.length; i++) if (i !== excludeCol && state.tableau[i].length === 0) n++;
    return n;
  };
  F.capacity = function (state, toCol) {
    const destEmpty = state.tableau[toCol].length === 0;
    return (F.freeCount(state) + 1) * Math.pow(2, F.emptyCols(state, destEmpty ? toCol : -1));
  };
  F.canLift = function (col, index) {
    if (index < 0 || index >= col.length) return false;
    for (let k = index; k < col.length - 1; k++) {
      if (rankOf(col[k + 1]) !== rankOf(col[k]) - 1) return false;
      if (colorOf(col[k + 1]) === colorOf(col[k])) return false;
    }
    return true;
  };
  F.canDropOnTableau = function (col, id) {
    if (col.length === 0) return true;
    const top = col[col.length - 1];
    return rankOf(id) === rankOf(top) - 1 && colorOf(id) !== colorOf(top);
  };
  F.canDropOnFoundation = function (state, id) {
    const s = suitOf(id);
    return rankOf(id) === state.foundation[s].length + 1;
  };
  F.tableauToTableau = function (state, fromCol, index, toCol) {
    if (fromCol === toCol) return false;
    const from = state.tableau[fromCol];
    if (!F.canLift(from, index)) return false;
    const len = from.length - index;
    if (len > F.capacity(state, toCol)) return false;
    const topId = from[index];
    if (!F.canDropOnTableau(state.tableau[toCol], topId)) return false;
    const seq = from.splice(index);
    state.tableau[toCol].push(...seq);
    state.moves++;
    return true;
  };
  F.tableauToFree = function (state, col) {
    const c = state.tableau[col];
    if (!c.length) return false;
    const fi = state.free.indexOf(null);
    if (fi === -1) return false;
    state.free[fi] = c.pop(); state.moves++;
    return true;
  };
  F.freeToTableau = function (state, fi, toCol) {
    const id = state.free[fi];
    if (id == null) return false;
    if (!F.canDropOnTableau(state.tableau[toCol], id)) return false;
    state.free[fi] = null; state.tableau[toCol].push(id); state.moves++;
    return true;
  };
  F.freeToFoundation = function (state, fi) {
    const id = state.free[fi];
    if (id == null || !F.canDropOnFoundation(state, id)) return false;
    state.free[fi] = null; state.foundation[suitOf(id)].push(id); state.moves++;
    return true;
  };
  F.tableauToFoundation = function (state, col) {
    const c = state.tableau[col];
    if (!c.length) return false;
    const id = c[c.length - 1];
    if (!F.canDropOnFoundation(state, id)) return false;
    c.pop(); state.foundation[suitOf(id)].push(id); state.moves++;
    return true;
  };
  F.autoPlay = function (state) {
    let any = false, moved = true;
    while (moved) {
      moved = false;
      for (let c = 0; c < state.tableau.length; c++) { if (F.tableauToFoundation(state, c)) { moved = true; any = true; } }
      for (let i = 0; i < 4; i++) { if (F.freeToFoundation(state, i)) { moved = true; any = true; } }
    }
    return any;
  };
  F.isWin = function (state) { return state.foundation.every((p) => p.length === 13); };

  // ---- solvability search (single-card-move model; a legal supermove is always
  // decomposable into single-card moves via spare free cells / empty columns, so
  // this model has identical solving power to one that models supermoves directly). ----
  function isBlack(id) { const s = Math.floor(id / 13); return s === 0 || s === 3; }
  function isSafeMove(found, id) {
    const r = rankOf(id), s = suitOf(id);
    if (found[s] !== r - 1) return false;
    if (r <= 2) return true;
    const oppA = isBlack(id) ? found[1] : found[0]; // H,D red idx1,2 ; S,C black idx0,3 — opposite color piles
    const oppB = isBlack(id) ? found[2] : found[3];
    return oppA >= r - 1 && oppB >= r - 1;
  }
  function stateKey(found, free, cols) {
    const f = free.filter((x) => x != null).slice().sort((a, b) => a - b).join(',');
    const c = cols.map((c2) => c2.join('-')).slice().sort().join('|');
    return found.join(',') + '#' + f + '#' + c;
  }
  function autoSafe(found, free, cols) {
    let moved = true;
    while (moved) {
      moved = false;
      for (let i = 0; i < free.length; i++) {
        const id = free[i];
        if (id != null && isSafeMove(found, id)) { found[suitOf(id)]++; free[i] = null; moved = true; }
      }
      for (let c = 0; c < cols.length; c++) {
        const col = cols[c];
        if (col.length) {
          const id = col[col.length - 1];
          if (isSafeMove(found, id)) { found[suitOf(id)]++; col.pop(); moved = true; }
        }
      }
    }
  }
  function solveFreeCell(tableau, budget) {
    const seen = new Set();
    let nodes = 0;
    function dfs(found, free, cols, depth) {
      if (++nodes > budget) return false;
      if (depth > 400) return false;
      autoSafe(found, free, cols);
      if (found.every((x) => x === 13)) return true;
      const key = stateKey(found, free, cols);
      if (seen.has(key)) return false;
      seen.add(key);
      const moves = [];
      // card -> foundation (non-safe but legal)
      for (let i = 0; i < free.length; i++) { const id = free[i]; if (id != null && rankOf(id) === found[suitOf(id)] + 1) moves.push({ t: 'ff', i }); }
      for (let c = 0; c < cols.length; c++) { const col = cols[c]; if (col.length) { const id = col[col.length - 1]; if (rankOf(id) === found[suitOf(id)] + 1) moves.push({ t: 'cf', c }); } }
      // column -> column
      for (let c = 0; c < cols.length; c++) {
        const col = cols[c]; if (!col.length) continue;
        const id = col[col.length - 1];
        for (let d = 0; d < cols.length; d++) {
          if (d === c) continue;
          const dest = cols[d];
          const ok = dest.length === 0 ? true : (rankOf(id) === rankOf(dest[dest.length - 1]) - 1 && colorOf(id) !== colorOf(dest[dest.length - 1]));
          if (ok) moves.push({ t: 'cc', c, d });
        }
      }
      // free -> column
      for (let i = 0; i < free.length; i++) {
        const id = free[i]; if (id == null) continue;
        for (let d = 0; d < cols.length; d++) {
          const dest = cols[d];
          const ok = dest.length === 0 ? true : (rankOf(id) === rankOf(dest[dest.length - 1]) - 1 && colorOf(id) !== colorOf(dest[dest.length - 1]));
          if (ok) moves.push({ t: 'fc', i, d });
        }
      }
      // column -> free
      const freeIdx = free.indexOf(null);
      if (freeIdx !== -1) for (let c = 0; c < cols.length; c++) if (cols[c].length) moves.push({ t: 'cff', c, i: freeIdx });
      shuffle(moves);
      for (const m of moves) {
        const found2 = found.slice(), free2 = free.slice(), cols2 = cols.map((c2) => c2.slice());
        if (m.t === 'ff') { const id = free2[m.i]; free2[m.i] = null; found2[suitOf(id)]++; }
        else if (m.t === 'cf') { const id = cols2[m.c].pop(); found2[suitOf(id)]++; }
        else if (m.t === 'cc') { const id = cols2[m.c].pop(); cols2[m.d].push(id); }
        else if (m.t === 'fc') { const id = free2[m.i]; free2[m.i] = null; cols2[m.d].push(id); }
        else if (m.t === 'cff') { const id = cols2[m.c].pop(); free2[m.i] = id; }
        if (dfs(found2, free2, cols2, depth + 1)) return true;
        if (nodes > budget) return false;
      }
      return false;
    }
    return dfs([0, 0, 0, 0], [null, null, null, null], tableau.map((c) => c.slice()), 0);
  }

  F.deal = function (opts) {
    opts = opts || {};
    const maxAttempts = opts.maxAttempts || 25;
    const budget = opts.budget || 45000;
    let last = null;
    for (let a = 0; a < maxAttempts; a++) {
      const deck = shuffle(newDeck());
      const tableau = [[], [], [], [], [], [], [], []];
      for (let i = 0; i < 52; i++) tableau[i % 8].push(deck[i]);
      last = tableau;
      if (solveFreeCell(tableau, budget)) {
        return { mode: 'freecell', tableau, free: [null, null, null, null], foundation: [[], [], [], []], moves: 0, win: false, verified: true };
      }
    }
    return { mode: 'freecell', tableau: last, free: [null, null, null, null], foundation: [[], [], [], []], moves: 0, win: false, verified: false };
  };
  F.clone = clone;

  const Solitaire = { rankOf, suitOf, colorOf, label, RANK_CH, SUIT_CH, newDeck, shuffle, Klondike: K, FreeCell: F, solveFreeCell };
  if (typeof module !== 'undefined' && module.exports) module.exports = Solitaire;
  else root.Solitaire = Solitaire;
})(typeof window !== 'undefined' ? window : globalThis);
