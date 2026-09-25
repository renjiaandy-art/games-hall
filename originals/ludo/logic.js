/* logic.js — 飞行棋 (4-color Ludo-style flying chess) pure game logic. No DOM. MIT.
 * Shared loop of 52 cells. Each seat's color owns a 13-cell offset on the loop.
 * Per-piece relative position: -1 = in hangar; 0..50 = on the shared loop
 * (0 is that color's own launch cell); 51..56 = that color's private home
 * stretch (6 cells); 57 = arrived home (finished). */
(function (root) {
  'use strict';
  const LOOP_LEN = 52;
  const COLORS = ['R', 'Y', 'B', 'G'];
  const COLOR_NAME = { R: '红', Y: '黄', B: '蓝', G: '绿' };
  const OFFSET = { R: 0, Y: 13, B: 26, G: 39 };
  const FINISH = 57;
  const HOME_ENTER = 51; // first home-stretch relative index
  const SMALL_JUMPS = [7, 20, 33]; // 同色格跳跃: land exactly here -> +4
  const SMALL_JUMP_ADD = 4;
  const SHORTCUT = 44; // 飞行捷径: land exactly here -> +6
  const SHORTCUT_ADD = 6;
  const SAFE_OFFSETS = Object.values(OFFSET); // each color's own launch cell is safe for everyone

  function presetColors(n) {
    if (n === 2) return ['R', 'B'];
    if (n === 3) return ['R', 'Y', 'B'];
    return ['R', 'Y', 'B', 'G'];
  }

  function newGame(seats) {
    // seats: [{human:boolean}, ...] length 2-4
    const colors = presetColors(seats.length);
    const players = seats.map((s, i) => ({
      color: colors[i],
      human: !!s.human,
      pieces: [0, 1, 2, 3].map(() => ({ state: 'home', rel: -1 })),
    }));
    return { players, turn: 0, sixStreak: 0, over: false, winner: -1 };
  }

  function rollDie() { return 1 + Math.floor(Math.random() * 6); }

  function absOfRel(color, rel) {
    if (rel < 0 || rel > 50) return -1;
    return (OFFSET[color] + rel) % LOOP_LEN;
  }

  function isSafeAbs(abs) { return SAFE_OFFSETS.indexOf(abs) !== -1; }

  function legalPieceMoves(state, playerIdx, die) {
    const player = state.players[playerIdx];
    const out = [];
    player.pieces.forEach((p, idx) => {
      if (p.state === 'home') { if (die === 6) out.push(idx); return; }
      if (p.state === 'done') return;
      const nr = p.rel + die;
      if (nr <= FINISH) out.push(idx);
    });
    return out;
  }

  function applyJumps(rel) {
    let jumped = null;
    if (SMALL_JUMPS.indexOf(rel) !== -1) { rel += SMALL_JUMP_ADD; jumped = 'small'; }
    else if (rel === SHORTCUT) { rel += SHORTCUT_ADD; jumped = 'shortcut'; }
    return { rel, jumped };
  }

  function applyMove(state, playerIdx, pieceIdx, die) {
    const player = state.players[playerIdx];
    const piece = player.pieces[pieceIdx];
    const result = { captured: [], jumped: null, finished: false, launched: false };
    if (piece.state === 'home') {
      if (die !== 6) return null;
      piece.state = 'track'; piece.rel = 0; result.launched = true;
    } else {
      let nr = piece.rel + die;
      if (nr > FINISH) return null;
      if (nr === FINISH) {
        piece.state = 'done'; piece.rel = FINISH; result.finished = true;
        state.players[playerIdx] = player;
        checkGameOver(state, playerIdx);
        return result;
      }
      if (nr <= 50) {
        const j = applyJumps(nr);
        nr = j.rel; result.jumped = j.jumped;
        if (nr >= FINISH) { nr = FINISH; piece.state = 'done'; result.finished = true; }
        else if (nr >= HOME_ENTER) piece.state = 'final';
        else piece.state = 'track';
      } else {
        piece.state = nr >= FINISH ? 'done' : 'final';
        if (nr >= FINISH) { nr = FINISH; result.finished = true; }
      }
      piece.rel = nr;
    }
    // capture check (only meaningful while piece ends up on the shared loop)
    if (piece.state === 'track') {
      const abs = absOfRel(player.color, piece.rel);
      if (!isSafeAbs(abs)) {
        state.players.forEach((op, opIdx) => {
          if (opIdx === playerIdx) return;
          op.pieces.forEach((op2, opPieceIdx) => {
            if (op2.state === 'track' && absOfRel(op.color, op2.rel) === abs) {
              op2.state = 'home'; op2.rel = -1;
              result.captured.push({ player: opIdx, piece: opPieceIdx });
            }
          });
        });
      }
    }
    if (result.finished) checkGameOver(state, playerIdx);
    return result;
  }

  function checkGameOver(state, playerIdx) {
    const player = state.players[playerIdx];
    if (player.pieces.every((p) => p.state === 'done')) { state.over = true; state.winner = playerIdx; }
  }

  function chooseAIMove(state, playerIdx, die) {
    const moves = legalPieceMoves(state, playerIdx, die);
    if (!moves.length) return null;
    const player = state.players[playerIdx];
    function simulate(pieceIdx) {
      const clone = JSON.parse(JSON.stringify(state));
      const r = applyMove(clone, playerIdx, pieceIdx, die);
      return { r, clone };
    }
    // 1) prefer a capture
    for (const idx of moves) { const { r } = simulate(idx); if (r && r.captured.length) return idx; }
    // 2) prefer finishing a piece
    for (const idx of moves) { const { r } = simulate(idx); if (r && r.finished) return idx; }
    // 3) prefer landing on a jump/shortcut cell
    for (const idx of moves) { const { r } = simulate(idx); if (r && r.jumped) return idx; }
    // 4) prefer launching from hangar
    const launch = moves.find((idx) => player.pieces[idx].state === 'home');
    if (launch != null) return launch;
    // 5) push the piece furthest along
    let best = moves[0], bestRel = -2;
    moves.forEach((idx) => { if (player.pieces[idx].rel > bestRel) { bestRel = player.pieces[idx].rel; best = idx; } });
    return best;
  }

  const Ludo = {
    LOOP_LEN, COLORS, COLOR_NAME, OFFSET, FINISH, HOME_ENTER, SMALL_JUMPS, SHORTCUT, SAFE_OFFSETS,
    presetColors, newGame, rollDie, absOfRel, isSafeAbs, legalPieceMoves, applyMove, chooseAIMove, checkGameOver,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Ludo;
  else root.Ludo = Ludo;
})(typeof window !== 'undefined' ? window : globalThis);
