(function () {
  'use strict';
  var D = window.DDZ, AI = window.DDZAI;
  var $ = function (id) { return document.getElementById(id); };
  var NAMES = ['你', '电脑·右', '电脑·左'];
  var STORE_KEY = 'rj-doudizhu-v1';
  var AI_DELAY = 750;

  var st = null, selected = {}, hintList = null, hintIdx = 0, timer = null, nextFirstBidder = 0, roundNo = 0;
  var rec = loadRec();

  function loadRec() {
    var base = { total: 0, rounds: 0, wins: 0, best: 0 };
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) { var o = JSON.parse(raw); for (var k in base) if (typeof o[k] === 'number') base[k] = o[k]; }
    } catch (e) { }
    return base;
  }
  function saveRec() { try { localStorage.setItem(STORE_KEY, JSON.stringify(rec)); } catch (e) { } }

  var toastT = null;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, ms || 1300);
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function cardEl(c, mini) {
    var e = el('div', 'card' + (mini ? ' mini' : ''));
    if (c.rank >= D.SJ) {
      var big = c.rank === D.BJ;
      e.classList.add('joker', big ? 'big' : 'small');
      e.innerHTML = '<div class="corner"><span>' + (big ? '大' : '小') + '</span><span>王</span></div><div class="pip">' + (big ? '★' : '☆') + '</div>';
    } else {
      var suit = D.SUITS[c.suit];
      if (c.suit === 1 || c.suit === 3) e.classList.add('red');
      if (c.rank === 10) e.classList.add('ten');
      e.innerHTML = '<div class="corner">' + D.label(c.rank) + '<span class="s">' + suit + '</span></div><div class="pip">' + suit + '</div>';
    }
    e.dataset.id = c.id;
    return e;
  }

  function layout() {
    var W = window.innerWidth, H = window.innerHeight;
    var cw = Math.round(Math.max(40, Math.min(84, W * 0.155, H * 0.12)));
    var ch = Math.round(cw * 1.4);
    var mw = Math.round(Math.max(26, Math.min(46, cw * 0.62)));
    var r = document.documentElement.style;
    r.setProperty('--cw', cw + 'px'); r.setProperty('--ch', ch + 'px');
    r.setProperty('--mw', mw + 'px'); r.setProperty('--mh', Math.round(mw * 1.4) + 'px');
    positionHand();
  }

  function positionHand() {
    var wrap = $('hand'), cards = wrap.children, n = cards.length;
    if (!n) return;
    var W = wrap.clientWidth, cw = cards[0].offsetWidth;
    var avail = W - 20 - cw;
    var step = n > 1 ? Math.min(cw * 0.58, avail / (n - 1)) : 0;
    var total = cw + step * (n - 1);
    var x0 = (W - total) / 2;
    for (var i = 0; i < n; i++) { cards[i].style.left = (x0 + i * step) + 'px'; cards[i].style.zIndex = i; }
  }

  function renderHand(freshIds) {
    var wrap = $('hand');
    wrap.innerHTML = '';
    if (!st) return;
    st.hands[0].forEach(function (c) {
      var e = cardEl(c, false);
      if (selected[c.id]) e.classList.add('sel');
      if (freshIds && freshIds[c.id]) e.classList.add('fresh');
      wrap.appendChild(e);
    });
    positionHand();
  }

  function syncSelection() {
    var cards = $('hand').children;
    for (var i = 0; i < cards.length; i++) cards[i].classList.toggle('sel', !!selected[cards[i].dataset.id]);
    updateActionState();
  }

  function renderBottom(reveal) {
    var b = $('bottom');
    b.innerHTML = '';
    if (!st) return;
    st.bottom.forEach(function (c) { b.appendChild(reveal ? cardEl(c, true) : el('div', 'back')); });
  }

  function renderSeats() {
    [1, 2].forEach(function (s) {
      var n = st ? st.hands[s].length : 17;
      var cEl = $('count' + s);
      cEl.textContent = n;
      cEl.classList.toggle('warn', !!st && st.phase === 'play' && n <= 2);
      var role = $('role' + s);
      if (!st || st.landlord < 0) { role.textContent = '待定'; role.className = 'badge'; }
      else if (st.landlord === s) { role.textContent = '地主'; role.className = 'badge lord'; }
      else { role.textContent = '农民'; role.className = 'badge farmer'; }
      $('seat' + s).classList.toggle('active', !!st && (st.phase === 'bid' || st.phase === 'play') && st.turn === s);
    });
  }

  function curMult() {
    if (!st) return 1;
    var m = Math.pow(2, st.bombs);
    if (st.rocket) m *= 2;
    return m;
  }

  function renderHud() {
    $('hudBase').innerHTML = '底分 <b>' + (st && st.phase === 'bid' ? (st.bidding.highest || '-') : st && st.bid ? st.bid : '-') + '</b>';
    $('hudMult').innerHTML = '倍数 <b>×' + curMult() + '</b>';
    $('hudTotal').innerHTML = '积分 <b>' + rec.total + '</b>';
    var info = '';
    if (st) {
      if (st.phase === 'bid') {
        info = st.bidding.highest ? '当前最高：' + NAMES[st.bidding.highestSeat] + ' ' + st.bidding.highest + '分' : '叫地主中…';
      } else if (st.phase === 'play') {
        var role = st.landlord === 0 ? '你是地主' : '你是农民（队友：' + NAMES[[1, 2].filter(function (s) { return s !== st.landlord; })[0]] + '）';
        info = role;
      }
    }
    $('info').textContent = info;
    renderSeats();
  }

  function setSlot(seat, content) {
    var s = $('slot' + seat);
    s.innerHTML = '';
    if (!content) return;
    if (typeof content === 'string') {
      var w = el('div', 'word pop', content);
      if (/分/.test(content)) w.classList.add('bid');
      s.appendChild(w);
      return;
    }
    var row = el('div', 'mini-row pop');
    content.cards.forEach(function (c) { row.appendChild(cardEl(c, true)); });
    var tag = content.combo && ['bomb', 'rocket', 'airplane', 'airplane1', 'airplane2', 'four2', 'four2pairs', 'straight', 'pairStraight'].indexOf(content.combo.type) >= 0
      ? el('div', 'tag pop', D.TYPE_NAME[content.combo.type]) : null;
    if (tag && seat === 1) s.appendChild(tag);
    s.appendChild(row);
    if (tag && seat !== 1) s.appendChild(tag);
    fitRow(s, row, tag);
  }

  function fitRow(slot, row, tag) {
    var cards = row.children, n = cards.length;
    if (n < 2) return;
    var mw = cards[0].offsetWidth || 34;
    var avail = slot.clientWidth - (tag ? tag.offsetWidth + 12 : 0);
    var step = Math.min(mw * 0.5, (avail - mw) / (n - 1));
    for (var i = 1; i < n; i++) cards[i].style.marginLeft = (step - mw) + 'px';
  }

  function clearSlots() { [0, 1, 2].forEach(function (s) { setSlot(s, null); }); }

  function btn(label, cls, fn, disabled) {
    var b = el('button', 'btn ' + (cls || ''), label);
    b.addEventListener('click', fn);
    if (disabled) b.disabled = true;
    return b;
  }

  function renderActions() {
    var a = $('actions');
    a.innerHTML = '';
    if (!st) return;
    if (st.phase === 'bid' && st.turn === 0) {
      a.appendChild(btn('不叫', '', function () { humanBid(0); }));
      for (var v = 1; v <= 3; v++) {
        (function (v) {
          if (v > st.bidding.highest) a.appendChild(btn(v + '分', v === 3 ? 'gold' : 'primary', function () { humanBid(v); }));
        })(v);
      }
    } else if (st.phase === 'play' && st.turn === 0) {
      var lead = !st.lastPlay;
      a.appendChild(btn('不出', '', humanPass, lead));
      a.appendChild(btn('提示', '', humanHint));
      var play = btn('出牌', 'primary', humanPlay);
      play.id = 'playBtn';
      a.appendChild(play);
      updateActionState();
    } else if (st.phase === 'over') {
      a.appendChild(btn('查看结果', '', showEnd));
      a.appendChild(btn('再来一局', 'primary', newRound));
    }
  }

  function selectedCards() {
    return st.hands[0].filter(function (c) { return selected[c.id]; });
  }

  function updateActionState() {
    var p = $('playBtn');
    if (!p || !st || st.phase !== 'play') return;
    var cards = selectedCards();
    var cur = D.currentCombo(st);
    var ok = cards.length && D.comboFor(cards, cur) && D.canBeat(cur, D.comboFor(cards, cur));
    p.disabled = !cards.length;
    p.classList.toggle('primary', !!ok);
  }

  function humanBid(v) {
    if (!st || st.phase !== 'bid' || st.turn !== 0) return;
    D.roundBid(st, 0, v);
    setSlot(0, v ? v + '分' : '不叫');
    afterAction();
  }

  function humanPlay() {
    if (!st || st.phase !== 'play' || st.turn !== 0) return;
    var cards = selectedCards();
    if (!cards.length) { toast('请先选择要出的牌'); return; }
    var cur = D.currentCombo(st);
    var combo = D.comboFor(cards, cur);
    if (!D.classifyCombo(cards)) { shake(); toast('不是有效的牌型'); return; }
    if (!combo) { shake(); toast(cur ? '管不上，换一手或选择不出' : '不是有效的牌型'); return; }
    D.roundPlay(st, 0, cards);
    selected = {};
    setSlot(0, st.lastPlay || { cards: cards, combo: combo });
    announce(combo);
    renderHand();
    afterAction();
  }

  function humanPass() {
    if (!st || st.phase !== 'play' || st.turn !== 0 || !st.lastPlay) return;
    D.roundPass(st, 0);
    selected = {};
    setSlot(0, '不出');
    renderHand();
    afterAction();
  }

  function humanHint() {
    if (!st || st.phase !== 'play' || st.turn !== 0) return;
    var cur = D.currentCombo(st);
    if (!hintList) {
      var first = AI.hint(st.hands[0], cur, ctxFor(0));
      var all = D.enumerateLegalMoves(st.hands[0], cur).sort(function (a, b) {
        var ab = /bomb|rocket/.test(a.combo.type), bb = /bomb|rocket/.test(b.combo.type);
        return (ab - bb) || (a.combo.mainRank - b.combo.mainRank) || (b.cards.length - a.cards.length);
      });
      hintList = [];
      var seen = {};
      if (first) { hintList.push(first); seen[first.ranks.join(',')] = 1; }
      all.forEach(function (m) { if (!seen[m.ranks.join(',')]) { seen[m.ranks.join(',')] = 1; hintList.push(m); } });
      hintIdx = 0;
    }
    if (!hintList.length) { toast('没有能管上的牌，只能过牌'); selected = {}; syncSelection(); return; }
    var m = hintList[hintIdx % hintList.length];
    hintIdx++;
    selected = {};
    m.cards.forEach(function (c) { selected[c.id] = true; });
    syncSelection();
  }

  function shake() {
    var h = $('hand');
    h.classList.remove('shake'); void h.offsetWidth; h.classList.add('shake');
  }

  function announce(combo) {
    if (combo.type === 'rocket') toast('王炸！倍数 ×2', 1100);
    else if (combo.type === 'bomb') toast('炸弹！倍数 ×2', 1100);
  }

  function ctxFor(seat) {
    return { seat: seat, landlord: st.landlord, counts: st.hands.map(function (h) { return h.length; }), lastSeat: st.lastPlay ? st.lastPlay.seat : null };
  }

  function afterAction() {
    hintList = null;
    clearTimeout(timer);
    if (st.phase === 'redeal') {
      renderHud(); renderActions();
      toast('无人叫地主，重新发牌', 1400);
      timer = setTimeout(function () { startDeal(); }, 1500);
      return;
    }
    if (st.phase === 'play' && st.log.length && st.log[st.log.length - 1].bid !== undefined) {
      landlordDecided();
      return;
    }
    if (st.phase === 'over') { onOver(); return; }
    beginTurn();
  }

  function landlordDecided() {
    renderBottom(true);
    renderHud();
    var fresh = {};
    if (st.landlord === 0) st.bottom.forEach(function (c) { fresh[c.id] = 1; });
    renderHand(fresh);
    toast(NAMES[st.landlord] + ' 成为地主（' + st.bid + '分）', 1300);
    $('actions').innerHTML = '';
    timer = setTimeout(function () { clearSlots(); beginTurn(); }, 1100);
  }

  function beginTurn() {
    renderHud();
    if (st.phase === 'play') {
      setSlot(st.turn, null);
    }
    renderActions();
    if (st.turn !== 0) timer = setTimeout(aiStep, AI_DELAY);
    else if (st.phase === 'play' && st.lastPlay && !D.enumerateLegalMoves(st.hands[0], D.currentCombo(st)).length) {
      $('info').textContent = '没有牌能管上，请点「不出」';
    }
  }

  function aiStep() {
    if (!st) return;
    var s = st.turn;
    if (s === 0) return;
    if (st.phase === 'bid') {
      var v = AI.bidDecision(st.hands[s], st.bidding.highest);
      D.roundBid(st, s, v);
      setSlot(s, v ? v + '分' : '不叫');
    } else if (st.phase === 'play') {
      var cur = D.currentCombo(st);
      var m = AI.chooseMove(st.hands[s], cur, ctxFor(s));
      if (m) {
        D.roundPlay(st, s, m.cards);
        setSlot(s, st.lastPlay || { cards: m.cards, combo: m.combo });
        announce(m.combo);
      } else {
        D.roundPass(st, s);
        setSlot(s, '不出');
      }
    }
    renderSeats();
    afterAction();
  }

  function onOver() {
    var r = st.result;
    renderHud();
    renderActions();
    [1, 2].forEach(function (s) {
      if (st.hands[s].length) setSlot(s, { cards: st.hands[s], combo: null });
    });
    var mine = r.deltas[0];
    rec.total += mine;
    rec.rounds += 1;
    if (mine > 0) rec.wins += 1;
    if (mine > rec.best) rec.best = mine;
    saveRec();
    renderHud();
    nextFirstBidder = r.winner;
    timer = setTimeout(showEnd, 1200);
  }

  function showEnd() {
    if (!st || !st.result) return;
    var r = st.result, won = r.deltas[0] > 0;
    $('endEmoji').textContent = won ? '🎉' : '😵';
    $('endTitle').textContent = won ? '你赢了！' : '你输了';
    var who = r.landlordWon ? '地主（' + NAMES[st.landlord] + '）获胜' : '农民获胜';
    var extra = [];
    if (r.spring) extra.push('春天');
    if (r.antiSpring) extra.push('反春天');
    $('endSub').textContent = who + (extra.length ? ' · ' + extra.join('、') + '！' : '');
    var parts = ['底分 ' + r.bid];
    if (r.bombs) parts.push('炸弹 ×' + Math.pow(2, r.bombs));
    if (r.rocket) parts.push('王炸 ×2');
    if (r.spring) parts.push('春天 ×2');
    if (r.antiSpring) parts.push('反春天 ×2');
    $('endBreak').textContent = parts.join(' · ') + ' ＝ 本局 ' + r.score + ' 分';
    var rows = '';
    [0, 1, 2].forEach(function (s) {
      var d = r.deltas[s];
      rows += '<tr><td>' + NAMES[s] + (s === st.landlord ? '（地主）' : '（农民）') + '</td><td class="' + (d > 0 ? 'plus' : 'minus') + '">' + (d > 0 ? '+' : '') + d + '</td></tr>';
    });
    $('endTable').innerHTML = rows;
    $('endRec').textContent = '累计积分 ' + rec.total + ' · 共 ' + rec.rounds + ' 局，胜 ' + rec.wins + ' 局 · 单局最高 +' + rec.best;
    $('endOv').hidden = false;
  }

  function startDeal() {
    clearTimeout(timer);
    st = D.createRound(Math.random, nextFirstBidder);
    selected = {}; hintList = null;
    clearSlots();
    renderBottom(false);
    renderHand();
    renderHud();
    toast('第 ' + roundNo + ' 局 · ' + NAMES[st.turn] + ' 先叫分', 1100);
    beginTurn();
  }

  function newRound() {
    $('endOv').hidden = true;
    $('startOv').hidden = true;
    roundNo++;
    startDeal();
  }

  function renderStartRec() {
    $('startRec').textContent = rec.rounds ? '战绩：累计积分 ' + rec.total + ' · ' + rec.rounds + ' 局胜 ' + rec.wins + ' 局 · 单局最高 +' + rec.best : '';
  }

  function initHandInput() {
    var wrap = $('hand'), dragging = false, touched = {}, mode = true;
    function cardAt(x, y) {
      var e = document.elementFromPoint(x, y);
      while (e && e !== wrap && !(e.classList && e.classList.contains('card'))) e = e.parentNode;
      return e && e !== wrap ? e : null;
    }
    function apply(c) {
      if (!c || touched[c.dataset.id]) return;
      touched[c.dataset.id] = 1;
      if (mode) selected[c.dataset.id] = true; else delete selected[c.dataset.id];
      c.classList.toggle('sel', mode);
    }
    wrap.addEventListener('pointerdown', function (e) {
      if (!st || st.phase === 'over') return;
      var c = cardAt(e.clientX, e.clientY);
      if (!c) { if (!e.target.classList.contains('card')) { selected = {}; syncSelection(); } return; }
      dragging = true; touched = {};
      mode = !selected[c.dataset.id];
      apply(c);
      e.preventDefault();
    });
    window.addEventListener('pointermove', function (e) {
      if (dragging) apply(cardAt(e.clientX, e.clientY));
    });
    var end = function () { if (dragging) { dragging = false; updateActionState(); } };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  $('startBtn').addEventListener('click', newRound);
  $('againBtn').addEventListener('click', newRound);
  $('viewBtn').addEventListener('click', function () { $('endOv').hidden = true; });
  $('resetBtn').addEventListener('click', function () {
    rec = { total: 0, rounds: 0, wins: 0, best: 0 };
    saveRec(); renderStartRec(); renderHud(); toast('战绩已清零');
  });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });
  document.addEventListener('touchmove', function (e) { if (!e.target.closest || !e.target.closest('.panel')) e.preventDefault(); }, { passive: false });
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 200); });

  initHandInput();
  renderStartRec();
  layout();
  renderHud();
})();
