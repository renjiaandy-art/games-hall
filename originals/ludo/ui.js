(function () {
  'use strict';
  var L = window.Ludo;
  var $ = function (id) { return document.getElementById(id); };
  var STORE = 'rj-ludo-record-v1';
  var COLOR_HEX = { R: '#e94b4b', Y: '#f2c230', B: '#3f8de0', G: '#3fbf6f' };
  var COLOR_DARK = { R: '#9c2727', Y: '#a67c0f', B: '#20527f', G: '#1f7a44' };
  var DICE_FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  var BS = 400, MARGIN = BS * 0.16, PER = BS - MARGIN * 2, CENTER = { x: BS / 2, y: BS / 2 };

  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function save(v) { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) {} }
  function recKey(seats) { return seats.filter(function (s) { return s.human; }).length <= 1 ? 'solo' : 'local'; }
  function recText(key) {
    var r = load()[key];
    var label = key === 'solo' ? '单人 vs 电脑' : '同屏多人';
    if (!r || !r.games) return label + '战绩：尚无战绩';
    var pct = Math.round((r.wins / r.games) * 100);
    return label + '战绩：' + r.games + ' 局，玩家胜 ' + r.wins + ' 局（' + pct + '%）';
  }

  // ---------------------------------------------------------------- geometry
  function ringPoint(i) {
    var t = (i / L.LOOP_LEN) * (PER * 4);
    if (t < PER) return { x: MARGIN + t, y: MARGIN };
    if (t < 2 * PER) return { x: MARGIN + PER, y: MARGIN + (t - PER) };
    if (t < 3 * PER) return { x: MARGIN + PER - (t - 2 * PER), y: MARGIN + PER };
    return { x: MARGIN, y: MARGIN + PER - (t - 3 * PER) };
  }
  function hangarCenter(color) {
    var o = MARGIN * 0.5;
    if (color === 'R') return { x: o, y: o };
    if (color === 'Y') return { x: BS - o, y: o };
    if (color === 'B') return { x: BS - o, y: BS - o };
    return { x: o, y: BS - o };
  }
  var HANGAR_SLOTS = [{ dx: -14, dy: -14 }, { dx: 14, dy: -14 }, { dx: -14, dy: 14 }, { dx: 14, dy: 14 }];
  function hangarSlot(color, pieceIdx) {
    var c = hangarCenter(color), s = HANGAR_SLOTS[pieceIdx];
    return { x: c.x + s.dx, y: c.y + s.dy };
  }
  function spokePoint(color, k) {
    var p0 = ringPoint(L.OFFSET[color]);
    var t = k / 6;
    return { x: p0.x + (CENTER.x - p0.x) * t, y: p0.y + (CENTER.y - p0.y) * t };
  }
  var JITTER8 = [{ dx: 0, dy: 0 }, { dx: 5, dy: -5 }, { dx: -5, dy: 5 }, { dx: 5, dy: 5 }, { dx: -5, dy: -5 }, { dx: 5, dy: 0 }, { dx: -5, dy: 0 }, { dx: 0, dy: 5 }];
  function jitter(pos, playerIdx, pieceIdx) {
    var j = JITTER8[(playerIdx * 4 + pieceIdx) % 8];
    return { x: pos.x + j.dx, y: pos.y + j.dy };
  }
  function pixelForPiece(game, playerIdx, pieceIdx, relOverride) {
    var player = game.players[playerIdx], piece = player.pieces[pieceIdx];
    var state = piece.state, rel = relOverride != null ? relOverride : piece.rel;
    if (relOverride == null && state === 'home') return hangarSlot(player.color, pieceIdx);
    if (rel <= 50) return jitter(ringPoint(L.absOfRel(player.color, rel)), playerIdx, pieceIdx);
    var k = rel >= L.FINISH ? 6 : rel - L.HOME_ENTER + 1;
    return jitter(spokePoint(player.color, k), playerIdx, pieceIdx);
  }

  // ---------------------------------------------------------------- canvas setup
  var canvas = $('board'), ctx = canvas.getContext('2d');
  function fitCanvas() {
    var wrap = document.querySelector('.boardwrap');
    var r = wrap.getBoundingClientRect();
    var s = Math.max(200, Math.min(r.width - 4, r.height - 4, 560));
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = s + 'px'; canvas.style.height = s + 'px';
    canvas.width = Math.round(s * dpr); canvas.height = Math.round(s * dpr);
    ctx.setTransform(s / BS * dpr, 0, 0, s / BS * dpr, 0, 0);
    render();
  }
  window.addEventListener('resize', fitCanvas);

  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function drawBoard(game, highlightSet) {
    ctx.clearRect(0, 0, BS, BS);
    ctx.fillStyle = '#f3ecd8'; rr(0, 0, BS, BS, 18); ctx.fill();
    // ring path outline
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = PER * 0.14;
    rr(MARGIN, MARGIN, PER, PER, 6); ctx.stroke();
    // spokes
    L.COLORS.forEach(function (c) {
      if (!colorActive(game, c)) return;
      var p0 = ringPoint(L.OFFSET[c]);
      ctx.strokeStyle = COLOR_HEX[c] + '55'; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(CENTER.x, CENTER.y); ctx.stroke();
    });
    // center hub
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(CENTER.x, CENTER.y, 20, 0, 7); ctx.fill();
    ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🏁', CENTER.x, CENTER.y + 1);
    // ring cells
    var cell = 11;
    for (var i = 0; i < L.LOOP_LEN; i++) {
      var p = ringPoint(i);
      var col = null;
      L.COLORS.forEach(function (c) { if (L.OFFSET[c] === i) col = c; });
      ctx.fillStyle = col ? COLOR_HEX[col] : '#fffdf5';
      ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1;
      rr(p.x - cell / 2, p.y - cell / 2, cell, cell, 3); ctx.fill(); ctx.stroke();
      var mark = markerAt(i);
      if (mark) {
        ctx.fillStyle = COLOR_HEX[mark.color];
        ctx.font = (mark.type === 'shortcut' ? '13px' : '9px') + ' sans-serif';
        ctx.fillText(mark.type === 'shortcut' ? '✈' : '★', p.x, p.y + 0.5);
      }
    }
    // home-stretch cells
    L.COLORS.forEach(function (c) {
      if (!colorActive(game, c)) return;
      for (var k = 1; k <= 5; k++) {
        var sp = spokePoint(c, k);
        ctx.fillStyle = COLOR_HEX[c]; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, cell * 0.42, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
    // hangars
    L.COLORS.forEach(function (c) {
      if (!colorActive(game, c)) return;
      var hc = hangarCenter(c);
      ctx.fillStyle = COLOR_HEX[c] + '33';
      rr(hc.x - 34, hc.y - 34, 68, 68, 14); ctx.fill();
      ctx.strokeStyle = COLOR_HEX[c]; ctx.lineWidth = 2;
      rr(hc.x - 34, hc.y - 34, 68, 68, 14); ctx.stroke();
      for (var s = 0; s < 4; s++) {
        var sl = hangarSlot(c, s);
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.beginPath(); ctx.arc(sl.x, sl.y, 9, 0, 7); ctx.fill();
      }
    });
    // pieces
    game.players.forEach(function (player, pIdx) {
      player.pieces.forEach(function (piece, pcIdx) {
        var override = (animState && animState.playerIdx === pIdx && animState.pieceIdx === pcIdx) ? animState.rel : null;
        var pos = override != null ? pixelForPiece(game, pIdx, pcIdx, override) : pixelForPiece(game, pIdx, pcIdx);
        var isHome = piece.state === 'home' && override == null;
        var r = 10;
        var hl = highlightSet && pIdx === game.turn && highlightSet.indexOf(pcIdx) !== -1;
        if (hl) {
          ctx.strokeStyle = '#ffd65a'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(pos.x, pos.y, r + 5, 0, 7); ctx.stroke();
        }
        ctx.fillStyle = COLOR_HEX[player.color];
        ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, 7); ctx.fill();
        ctx.strokeStyle = piece.state === 'done' ? '#fff' : COLOR_DARK[player.color];
        ctx.lineWidth = 2; ctx.stroke();
        if (piece.state === 'done' && override == null) {
          ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.fillText('✓', pos.x, pos.y + 0.5);
        }
      });
    });
  }
  function markerAt(absIdx) {
    for (var ci = 0; ci < L.COLORS.length; ci++) {
      var c = L.COLORS[ci], rel = ((absIdx - L.OFFSET[c]) % L.LOOP_LEN + L.LOOP_LEN) % L.LOOP_LEN;
      if (rel > 50) continue;
      if (L.SMALL_JUMPS.indexOf(rel) !== -1) return { type: 'small', color: c };
      if (rel === L.SHORTCUT) return { type: 'shortcut', color: c };
    }
    return null;
  }
  function colorActive(game, c) { return game.players.some(function (p) { return p.color === c; }); }

  // ---------------------------------------------------------------- state & flow
  var game = null, seats = [{ human: true }, { human: false }, { human: false }, { human: false }];
  var pendingDie = null, pendingMoves = null, uiBusy = false, sixCount = 0, animState = null;

  var toastT;
  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, ms || 1300); }

  function buildHud() {
    var hud = $('hud'); hud.innerHTML = '';
    game.players.forEach(function (p, i) {
      var chip = document.createElement('div'); chip.className = 'chip'; chip.dataset.p = i;
      chip.style.color = COLOR_HEX[p.color];
      chip.innerHTML = L.COLOR_NAME[p.color] + (p.human ? '（你）' : '（电脑）') + '<div class="n" data-home></div>';
      hud.appendChild(chip);
    });
    updateHud();
  }
  function updateHud() {
    var chips = $('hud').children;
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('turn', i === game.turn && !game.over);
      var p = game.players[i];
      var done = p.pieces.filter(function (x) { return x.state === 'done'; }).length;
      chips[i].querySelector('[data-home]').textContent = '抵达 ' + done + '/4';
    }
  }

  function render() { drawBoard(game, pendingMoves); updateHud(); }

  function initGame(newSeats) {
    seats = newSeats;
    game = L.newGame(seats);
    sixCount = 0; pendingDie = null; pendingMoves = null; uiBusy = false; animState = null;
    $('startOv').classList.add('hidden'); $('endOv').classList.add('hidden');
    buildHud();
    render();
    updateStatusForTurn();
    maybeAutoRollAI();
  }

  function updateStatusForTurn() {
    var p = game.players[game.turn];
    $('rollBtn').disabled = !p.human || uiBusy;
    $('status').textContent = p.human ? ('轮到你（' + L.COLOR_NAME[p.color] + '），点击掷骰') : (L.COLOR_NAME[p.color] + ' 电脑思考中…');
  }

  function animateDiceRoll(cb) {
    var n = 0, iv = setInterval(function () {
      $('rollBtn').textContent = DICE_FACE[1 + Math.floor(Math.random() * 6)] + ' 掷骰中';
      n++;
      if (n > 6) { clearInterval(iv); var d = L.rollDie(); $('rollBtn').textContent = DICE_FACE[d] + ' ' + d; cb(d); }
    }, 70);
  }

  function performRoll() {
    if (uiBusy || game.over) return;
    var playerIdx = game.turn;
    uiBusy = true; $('rollBtn').disabled = true;
    animateDiceRoll(function (die) {
      if (die === 6) sixCount++; else sixCount = 0;
      if (sixCount >= 3) {
        toast('连续三个 6，作废本轮！', 1200); sixCount = 0;
        finishTurnStep(false, true);
        return;
      }
      var moves = L.legalPieceMoves(game, playerIdx, die);
      if (!moves.length) {
        toast('没有可走的棋子', 1000);
        finishTurnStep(die === 6, false);
        return;
      }
      if (game.players[playerIdx].human) {
        pendingDie = die; pendingMoves = moves;
        render();
        $('status').textContent = '点击一枚高亮棋子移动（骰子 ' + die + '）';
        uiBusy = false;
      } else {
        var choice = L.chooseAIMove(game, playerIdx, die);
        setTimeout(function () { executeMove(choice, die); }, 380);
      }
    });
  }

  function executeMove(pieceIdx, die) {
    uiBusy = true;
    var playerIdx = game.turn;
    var piece = game.players[playerIdx].pieces[pieceIdx];
    var fromState = piece.state, fromRel = piece.rel;
    var result = L.applyMove(game, playerIdx, pieceIdx, die);
    var toRel = piece.rel;
    animateVisual(playerIdx, pieceIdx, fromState, fromRel, toRel, function () {
      animState = null;
      if (result.captured && result.captured.length) toast('撞飞了 ' + result.captured.length + ' 枚对方棋子！', 1100);
      else if (result.finished) toast(L.COLOR_NAME[game.players[playerIdx].color] + ' 一枚棋子抵达终点！', 1100);
      finishTurnStep(die === 6 && !game.over, false);
    });
  }

  function animateVisual(playerIdx, pieceIdx, fromState, fromRel, toRel, done) {
    pendingDie = null; pendingMoves = null;
    if (fromState === 'home') { render(); setTimeout(done, 120); return; }
    var start = Math.max(0, fromRel), end = Math.min(toRel, 57);
    var steps = Math.max(1, Math.min(end - start, 14));
    var t0 = performance.now(), dur = 90 * steps + 120;
    function frame(now) {
      var t = Math.min(1, (now - t0) / dur);
      var rel = start + (end - start) * t;
      animState = { playerIdx: playerIdx, pieceIdx: pieceIdx, rel: rel };
      render();
      if (t < 1) requestAnimationFrame(frame); else done();
    }
    requestAnimationFrame(frame);
  }

  function advanceTurn() { game.turn = (game.turn + 1) % game.players.length; sixCount = 0; }

  function finishTurnStep(extraRoll, forcedAdvance) {
    render();
    if (game.over) { uiBusy = false; showEnd(); return; }
    if (forcedAdvance || !extraRoll) advanceTurn();
    uiBusy = false;
    updateStatusForTurn();
    maybeAutoRollAI();
  }
  function maybeAutoRollAI() {
    if (!game.over && !game.players[game.turn].human) setTimeout(performRoll, 500);
  }

  function showEnd() {
    var rec = load(); var key = recKey(seats); var r = rec[key] || { games: 0, wins: 0 };
    r.games++;
    var winner = game.players[game.winner];
    if (winner.human) r.wins++;
    rec[key] = r; save(rec);
    $('endTitle').textContent = winner.human ? '🎉 你赢了！' : (L.COLOR_NAME[winner.color] + ' 电脑获胜');
    $('endSub').textContent = L.COLOR_NAME[winner.color] + ' 方最先集齐 4 枚棋子抵达终点';
    $('endRecord').textContent = recText(key);
    setTimeout(function () { $('endOv').classList.remove('hidden'); }, 500);
  }

  // ---------------------------------------------------------------- input
  function pointFromEvent(e) {
    var r = canvas.getBoundingClientRect();
    var t = e.touches ? e.touches[0] || e.changedTouches[0] : e;
    return { x: (t.clientX - r.left) / r.width * BS, y: (t.clientY - r.top) / r.height * BS };
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (!pendingMoves || !pendingMoves.length) return;
    var pt = pointFromEvent(e);
    var playerIdx = game.turn;
    var best = null, bestD = 28;
    pendingMoves.forEach(function (pcIdx) {
      var pos = pixelForPiece(game, playerIdx, pcIdx);
      var d = Math.hypot(pos.x - pt.x, pos.y - pt.y);
      if (d < bestD) { bestD = d; best = pcIdx; }
    });
    if (best != null) {
      var die = pendingDie; pendingDie = null; var mv = pendingMoves; pendingMoves = null;
      render();
      executeMove(best, die);
    }
  });
  $('rollBtn').addEventListener('click', performRoll);

  // ---------------------------------------------------------------- setup overlay
  var seatCount = 4;
  function renderSeatList() {
    var wrap = $('seatList'); wrap.innerHTML = '';
    var colors = L.presetColors(seatCount);
    var newSeats = [];
    for (var i = 0; i < seatCount; i++) {
      var prevHuman = seats[i] ? seats[i].human : (i === 0);
      newSeats.push({ human: prevHuman });
      (function (i, color) {
        var row = document.createElement('div'); row.className = 'seatrow';
        row.innerHTML = '<div class="dot" style="background:' + COLOR_HEX[color] + '"></div>' +
          '<div class="lbl">' + L.COLOR_NAME[color] + '</div>' +
          '<div class="tgl"><button data-v="1">玩家</button><button data-v="0">电脑</button></div>';
        wrap.appendChild(row);
        var btns = row.querySelectorAll('.tgl button');
        function sync() { btns[0].classList.toggle('sel', newSeats[i].human); btns[1].classList.toggle('sel', !newSeats[i].human); }
        btns[0].onclick = function () { newSeats[i].human = true; sync(); };
        btns[1].onclick = function () { newSeats[i].human = false; sync(); };
        sync();
      })(i, colors[i]);
    }
    seats = newSeats;
    $('record').textContent = recText(recKey(seats));
  }
  $('countSeg').addEventListener('click', function (e) {
    var n = e.target.dataset && e.target.dataset.n; if (!n) return;
    seatCount = +n;
    Array.prototype.forEach.call($('countSeg').children, function (b) { b.classList.toggle('sel', b.dataset.n === n); });
    renderSeatList();
  });
  $('startBtn').addEventListener('click', function () { initGame(seats.slice(0, seatCount)); });
  $('againBtn').addEventListener('click', function () { initGame(seats); });
  $('toMenuBtn').addEventListener('click', showMenu);
  $('menuBtn').addEventListener('click', showMenu);
  function showMenu() { $('endOv').classList.add('hidden'); $('startOv').classList.remove('hidden'); $('record').textContent = recText(recKey(seats)); }

  document.addEventListener('touchmove', function (e) { if (!e.target.closest('.overlay')) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  Array.prototype.forEach.call($('countSeg').children, function (b) { b.classList.toggle('sel', b.dataset.n === '4'); });
  renderSeatList();
  game = L.newGame(seats);
  fitCanvas();
})();
