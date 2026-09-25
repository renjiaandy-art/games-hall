(function () {
  'use strict';
  var S = window.Solitaire;
  var $ = function (id) { return document.getElementById(id); };
  var STORE = 'rj-solitaire-record-v1';
  var board = $('board');

  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function save(v) { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) {} }
  function fmtTime(s) { s = Math.max(0, Math.floor(s)); var m = Math.floor(s / 60), r = s % 60; return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r; }
  function modeLabel(m) { return m === 'k1' ? '经典接龙·翻1张' : m === 'k3' ? '经典接龙·翻3张' : '空当接龙'; }
  function recText(m) {
    var r = load()[m];
    if (!r || !r.games) return '尚无战绩';
    var pct = Math.round((r.wins / r.games) * 100);
    var t = modeLabel(m) + ' 战绩：' + r.games + ' 局 ' + r.wins + ' 胜（胜率 ' + pct + '%）';
    if (r.bestSeconds != null) t += ' · 最佳 ' + fmtTime(r.bestSeconds) + ' / ' + r.bestMoves + ' 步';
    return t;
  }

  var mode = 'k1', state = null, history = [], selection = null, lastTap = null;
  var startTs = 0, timerId = null, frozenElapsed = 0, finished = true;

  function elapsed() { return finished ? frozenElapsed : (Date.now() - startTs) / 1000; }
  function startTimer() { finished = false; startTs = Date.now(); clearInterval(timerId); timerId = setInterval(updateClock, 500); updateClock(); }
  function stopTimer() { finished = true; frozenElapsed = (Date.now() - startTs) / 1000; clearInterval(timerId); updateClock(); }
  function updateClock() { $('hudTime').textContent = fmtTime(elapsed()); }

  var toastT;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, ms || 1100);
  }

  function cloneState() { return mode === 'f' ? S.FreeCell.clone(state) : S.Klondike.clone(state); }
  function pushHistory(snap) { history.push(snap); if (history.length > 300) history.shift(); }

  function cardFace(id, extra) {
    var r = S.rankOf(id), su = S.suitOf(id), red = (su === 1 || su === 2);
    var d = document.createElement('div');
    d.className = 'card' + (red ? ' red' : '') + (extra ? ' ' + extra : '');
    var lbl = S.RANK_CH[r] + S.SUIT_CH[su];
    d.innerHTML = '<span class="cnr tl">' + lbl + '</span><span class="mid">' + S.SUIT_CH[su] + '</span><span class="cnr bl">' + lbl + '</span>';
    d.dataset.id = id;
    return d;
  }
  function cardBack(extra) { var d = document.createElement('div'); d.className = 'card back' + (extra ? ' ' + extra : ''); return d; }

  function stackCards(col, els, faceOf) {
    var w = col.getBoundingClientRect().width || 40;
    var cardH = w * 0.96 * 1.4;
    var top = 0;
    for (var i = 0; i < els.length; i++) {
      els[i].style.top = top + 'px';
      col.appendChild(els[i]);
      top += (faceOf(i) ? cardH * 0.32 : cardH * 0.2);
    }
  }

  function pile(cls, pileType, col, extraAttrs) {
    var d = document.createElement('div'); d.className = cls; d.dataset.pile = pileType;
    if (col != null) d.dataset.col = col;
    if (extraAttrs) for (var k in extraAttrs) d.setAttribute(k, extraAttrs[k]);
    return d;
  }

  function render() {
    board.innerHTML = '';
    $('hudMoves').textContent = state.moves;
    $('modeTitle').textContent = modeLabel(mode);
    var rec = load()[mode];
    $('hudExtra').textContent = rec && rec.games ? ('胜率 ' + Math.round((rec.wins / rec.games) * 100) + '%') : '胜率 0%';
    $('undoBtn').disabled = history.length === 0;
    updateClock();

    var top = document.createElement('div'); top.className = 'row top';
    top.style.gridTemplateColumns = mode === 'f' ? 'repeat(8,1fr)' : 'repeat(7,1fr)';
    var tableauRow = document.createElement('div'); tableauRow.className = 'tableau ' + (mode === 'f' ? 'f' : 'k');

    if (mode === 'f') {
      for (var fi = 0; fi < 4; fi++) {
        var fp = pile('pile free', 'free', fi);
        if (state.free[fi] != null) fp.appendChild(cardFace(state.free[fi]));
        top.appendChild(fp);
      }
    } else {
      var stock = pile('pile stock' + (state.stock.length ? '' : ' empty'), 'stock');
      if (state.stock.length) stock.appendChild(cardBack());
      top.appendChild(stock);
      var waste = pile('pile', 'waste');
      if (state.waste.length) {
        var wtop = state.waste[state.waste.length - 1];
        var wc = cardFace(wtop);
        wc.dataset.idx = 0;
        if (selection && selection.pile === 'waste') wc.classList.add('sel');
        waste.appendChild(wc);
      }
      top.appendChild(waste);
    }
    var suitNames = ['♠', '♥', '♦', '♣'];
    for (var s = 0; s < 4; s++) {
      var fnd = pile('pile foundation', 'foundation', s, { 'data-suit': suitNames[s] });
      var pileArr = state.foundation[s];
      if (pileArr.length) fnd.appendChild(cardFace(pileArr[pileArr.length - 1]));
      top.appendChild(fnd);
    }

    var nCols = mode === 'f' ? 8 : 7;
    for (var c = 0; c < nCols; c++) {
      var colEl = pile('col', 'tableau', c);
      tableauRow.appendChild(colEl);
    }
    board.appendChild(top);
    board.appendChild(tableauRow);
    var colEls = tableauRow.children;
    for (var c2 = 0; c2 < nCols; c2++) {
      var colEl2 = colEls[c2];
      if (mode === 'f') {
        var arr = state.tableau[c2];
        var els = arr.map(function (id, i) {
          var el = cardFace(id);
          el.dataset.idx = i;
          if (selection && selection.pile === 'tableau' && selection.col === c2 && i >= selection.idx) el.classList.add('sel');
          return el;
        });
        stackCards(colEl2, els, function () { return true; });
      } else {
        var arr2 = state.tableau[c2];
        var els2 = arr2.map(function (cd, i) {
          var el = cd.up ? cardFace(cd.id) : cardBack();
          el.dataset.idx = i;
          if (cd.up && selection && selection.pile === 'tableau' && selection.col === c2 && i >= selection.idx) el.classList.add('sel');
          return el;
        });
        stackCards(colEl2, els2, function (i) { return arr2[i].up; });
      }
    }
  }

  // ------------------------------------------------------------ game logic glue
  function pickup(p, col, idx) {
    if (p === 'tableau') {
      var arr = state.tableau[col];
      if (mode === 'f') { if (!S.FreeCell.canLift(arr, idx)) return []; return arr.slice(idx); }
      if (!arr[idx] || !arr[idx].up || !S.Klondike.canLift(arr, idx)) return [];
      return arr.slice(idx).map(function (cd) { return cd.id; });
    }
    if (p === 'waste') { return state.waste.length ? [state.waste[state.waste.length - 1]] : []; }
    if (p === 'free') { return state.free[col] != null ? [state.free[col]] : []; }
    return [];
  }

  function doMoveKlondike(sel, target) {
    if (sel.pile === 'waste') {
      if (target.pile === 'foundation') return S.Klondike.wasteToFoundation(state);
      if (target.pile === 'tableau') return S.Klondike.wasteToTableau(state, target.col);
      return false;
    }
    if (sel.pile === 'tableau') {
      if (target.pile === 'foundation') { if (sel.ids.length !== 1) return false; return S.Klondike.tableauToFoundation(state, sel.col); }
      if (target.pile === 'tableau') return S.Klondike.tableauToTableau(state, sel.col, sel.idx, target.col);
      return false;
    }
    return false;
  }
  function doMoveFreeCell(sel, target) {
    if (sel.pile === 'tableau') {
      if (target.pile === 'tableau') return S.FreeCell.tableauToTableau(state, sel.col, sel.idx, target.col);
      if (target.pile === 'free') { if (sel.ids.length !== 1) return false; return S.FreeCell.tableauToFree(state, sel.col); }
      if (target.pile === 'foundation') { if (sel.ids.length !== 1) return false; return S.FreeCell.tableauToFoundation(state, sel.col); }
      return false;
    }
    if (sel.pile === 'free') {
      if (target.pile === 'tableau') return S.FreeCell.freeToTableau(state, sel.col, target.col);
      if (target.pile === 'foundation') return S.FreeCell.freeToFoundation(state, sel.col);
      return false;
    }
    return false;
  }

  function perform(sel, target) {
    if (!sel || !target) return false;
    var snap = cloneState();
    var ok = mode === 'f' ? doMoveFreeCell(sel, target) : doMoveKlondike(sel, target);
    if (ok) { pushHistory(snap); render(); checkWin(); }
    return ok;
  }

  function doDraw() {
    var ok = mode === 'f' ? false : S.Klondike.draw(state);
    if (ok) render();
  }

  function smartMove(sel) {
    if (sel.ids.length !== 1) return false;
    var id = sel.ids[0];
    var M = mode === 'f' ? S.FreeCell : S.Klondike;
    if (M.canDropOnFoundation(state, id)) return perform(sel, { pile: 'foundation' });
    var nCols = mode === 'f' ? 8 : 7;
    for (var c = 0; c < nCols; c++) {
      if (sel.pile === 'tableau' && c === sel.col) continue;
      var can = mode === 'f' ? S.FreeCell.canDropOnTableau(state.tableau[c], id) : S.Klondike.canDropOnTableau(state.tableau[c], id);
      if (can) return perform(sel, { pile: 'tableau', col: c });
    }
    if (mode === 'f' && sel.pile !== 'free' && state.free.indexOf(null) !== -1) return perform(sel, { pile: 'free' });
    toast('无处可移', 800);
    return false;
  }

  function checkWin() {
    var M = mode === 'f' ? S.FreeCell : S.Klondike;
    if (!M.isWin(state)) return;
    stopTimer();
    var rec = load();
    var r = rec[mode] || { games: 0, wins: 0, bestMoves: null, bestSeconds: null };
    r.games++; r.wins++;
    var secs = Math.round(elapsed());
    if (r.bestSeconds == null || secs < r.bestSeconds) r.bestSeconds = secs;
    if (r.bestMoves == null || state.moves < r.bestMoves) r.bestMoves = state.moves;
    rec[mode] = r; save(rec);
    $('endTitle').textContent = '🎉 胜利！';
    $('endTime').textContent = fmtTime(secs);
    $('endSub').textContent = '用时 ' + fmtTime(secs) + '，共 ' + state.moves + ' 步';
    $('endRecord').textContent = recText(mode);
    setTimeout(function () { $('endOv').classList.remove('hidden'); }, 500);
  }

  function initGame(m) {
    mode = m; history = []; selection = null;
    $('startOv').classList.add('hidden'); $('endOv').classList.add('hidden');
    if (mode === 'f') {
      toast('正在生成可解的牌局…', 900);
      setTimeout(function () { state = S.FreeCell.deal(); startTimer(); render(); }, 30);
    } else {
      state = S.Klondike.deal(mode === 'k3' ? 3 : 1);
      startTimer(); render();
    }
  }

  // ------------------------------------------------------------ pointer / tap / drag
  var dragCand = null, dragging = false, floatEl = null, pressPos = null;

  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function beginDrag(cand, clientX, clientY) {
    dragging = true;
    floatEl = document.createElement('div');
    floatEl.style.position = 'fixed'; floatEl.style.zIndex = 999; floatEl.style.pointerEvents = 'none';
    floatEl.style.left = '0'; floatEl.style.top = '0';
    var rect = cand.el.getBoundingClientRect();
    var w = rect.width;
    cand.offX = clientX - rect.left; cand.offY = clientY - rect.top;
    cand.ids.forEach(function (id, i) {
      var el = cardFace(id, 'drag');
      el.style.position = 'absolute'; el.style.width = w + 'px'; el.style.left = '0';
      el.style.top = (i * w * 0.4) + 'px';
      floatEl.appendChild(el);
    });
    document.body.appendChild(floatEl);
    moveDrag(clientX, clientY);
    var idset = {};
    cand.ids.forEach(function (id) { idset[id] = 1; });
    Array.prototype.forEach.call(board.querySelectorAll('.card'), function (el) {
      if (idset[el.dataset.id]) el.style.opacity = '0';
    });
  }
  function moveDrag(clientX, clientY) {
    if (!floatEl) return;
    floatEl.style.transform = 'translate(' + (clientX - dragCand.offX) + 'px,' + (clientY - dragCand.offY) + 'px)';
  }
  function endDrag() {
    if (floatEl) { floatEl.remove(); floatEl = null; }
    dragging = false;
  }

  function targetFromPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    var p = el && el.closest('[data-pile]');
    if (!p) return null;
    return { pile: p.dataset.pile, col: p.dataset.col != null ? +p.dataset.col : null };
  }

  function handleTapOnCard(cand) {
    var now = Date.now();
    var isDouble = lastTap && lastTap.pile === cand.pile && lastTap.col === cand.col && lastTap.idx === cand.idx && (now - lastTap.t < 350);
    lastTap = { pile: cand.pile, col: cand.col, idx: cand.idx, t: now };
    if (isDouble) { selection = null; smartMove(cand); return; }
    if (selection && selection.pile === cand.pile && selection.col === cand.col && selection.idx === cand.idx) { selection = null; render(); return; }
    if (selection) {
      var ok = perform(selection, { pile: cand.pile, col: cand.col });
      if (ok) { selection = null; return; }
    }
    selection = { pile: cand.pile, col: cand.col, idx: cand.idx, ids: cand.ids };
    render();
  }
  function handleTapOnPile(p, col) {
    if (p === 'stock') { doDraw(); return; }
    if (selection) {
      var ok = perform(selection, { pile: p, col: col });
      selection = null;
      if (!ok) { toast('不能这样移动', 900); render(); }
      return;
    }
  }

  board.addEventListener('pointerdown', function (e) {
    var cardEl = e.target.closest('.card');
    var pileEl = e.target.closest('[data-pile]');
    if (!pileEl) return;
    var p = pileEl.dataset.pile, col = pileEl.dataset.col != null ? +pileEl.dataset.col : null;
    dragCand = null;
    if (cardEl && cardEl.dataset.id != null && cardEl.dataset.idx != null) {
      var idx = +cardEl.dataset.idx;
      var ids = pickup(p, col, idx);
      if (ids.length) dragCand = { pile: p, col: col, idx: idx, ids: ids, el: cardEl };
    }
    pressPos = { x: e.clientX, y: e.clientY };
    dragging = false;
    try { board.setPointerCapture(e.pointerId); } catch (err) {}
    var lastP = { p: p, col: col };
    function onMove(ev) {
      if (!dragCand) return;
      if (!dragging && distance(pressPos, { x: ev.clientX, y: ev.clientY }) > 8) beginDrag(dragCand, ev.clientX, ev.clientY);
      if (dragging) moveDrag(ev.clientX, ev.clientY);
    }
    function onUp(ev) {
      board.removeEventListener('pointermove', onMove);
      board.removeEventListener('pointerup', onUp);
      board.removeEventListener('pointercancel', onUp);
      if (dragCand && dragging) {
        var t = targetFromPoint(ev.clientX, ev.clientY);
        endDrag();
        var ok = t && perform(dragCand, t);
        if (!ok) { render(); }
        dragCand = null; selection = null;
        return;
      }
      endDrag();
      if (dragCand) { handleTapOnCard(dragCand); }
      else { handleTapOnPile(lastP.p, lastP.col); }
      dragCand = null;
    }
    board.addEventListener('pointermove', onMove);
    board.addEventListener('pointerup', onUp);
    board.addEventListener('pointercancel', onUp);
  });

  // ------------------------------------------------------------ menu wiring
  var selMode = 'k1';
  function syncSeg() {
    Array.prototype.forEach.call($('modeSeg').children, function (b) { b.classList.toggle('sel', b.dataset.m === selMode); });
    $('record').textContent = recText(selMode);
  }
  $('modeSeg').addEventListener('click', function (e) {
    var m = e.target.dataset && e.target.dataset.m; if (!m) return;
    selMode = m; syncSeg();
  });
  $('startBtn').addEventListener('click', function () { initGame(selMode); });
  $('againBtn').addEventListener('click', function () { initGame(mode); });
  $('toMenuBtn').addEventListener('click', showMenu);
  $('menuBtn').addEventListener('click', showMenu);
  function showMenu() { selMode = mode; syncSeg(); $('endOv').classList.add('hidden'); $('startOv').classList.remove('hidden'); }
  $('undoBtn').addEventListener('click', function () {
    if (!history.length) return;
    state = history.pop();
    selection = null; render();
  });
  $('autoBtn').addEventListener('click', function () {
    var snap = cloneState();
    var any = mode === 'f' ? S.FreeCell.autoPlay(state) : S.Klondike.autoPlay(state);
    if (any) { pushHistory(snap); render(); checkWin(); } else { toast('没有可自动收的牌', 900); }
  });

  document.addEventListener('touchmove', function (e) { if (!e.target.closest('.overlay')) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  window.addEventListener('resize', function () { if (state) render(); });

  syncSeg();
  state = S.Klondike.deal(1);
  render();
})();
