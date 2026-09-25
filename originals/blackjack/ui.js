(function () {
  'use strict';
  var B = window.Blackjack;
  var $ = function (id) { return document.getElementById(id); };
  var STORE = 'rj-blackjack-record-v1';
  var START_CHIPS = 1000;

  function load() {
    try { var v = JSON.parse(localStorage.getItem(STORE)); return v || {}; } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ chips: chips, rounds: stats.rounds, wins: stats.wins, losses: stats.losses, pushes: stats.pushes, blackjacks: stats.blackjacks, resets: stats.resets })); } catch (e) {}
  }
  function recText() {
    if (!stats.rounds) return '尚无战绩 · 初始筹码 ' + START_CHIPS;
    var pct = Math.round((stats.wins / stats.rounds) * 100);
    var t = '已玩 ' + stats.rounds + ' 局，胜 ' + stats.wins + ' 负 ' + stats.losses + ' 平 ' + stats.pushes + '（胜率 ' + pct + '%）';
    if (stats.blackjacks) t += ' · 21点 ' + stats.blackjacks + ' 次';
    if (stats.resets) t += ' · 已免费重置 ' + stats.resets + ' 次';
    return t;
  }

  var saved = load();
  var chips = saved.chips != null ? saved.chips : START_CHIPS;
  var stats = { rounds: saved.rounds || 0, wins: saved.wins || 0, losses: saved.losses || 0, pushes: saved.pushes || 0, blackjacks: saved.blackjacks || 0, resets: saved.resets || 0 };

  var bet = 0, round = null;

  var toastT;
  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, ms || 1300); }

  function updateHud() {
    $('hudChips').textContent = chips;
    $('hudRounds').textContent = stats.rounds;
    $('hudWinRate').textContent = stats.rounds ? Math.round((stats.wins / stats.rounds) * 100) + '%' : '0%';
  }

  function cardEl(id, faceUp) {
    var d = document.createElement('div');
    if (!faceUp) { d.className = 'pcard back'; return d; }
    var r = B.rankOf(id), red = B.isRed(id);
    d.className = 'pcard' + (red ? ' red' : '');
    var lbl = B.RANK_CH[r] + B.SUIT_CH[B.suitOf(id)];
    d.innerHTML = '<span>' + lbl + '</span><span class="mid">' + B.SUIT_CH[B.suitOf(id)] + '</span><span></span>';
    return d;
  }

  function handTotalText(cards) {
    var v = B.handValue(cards);
    return v.total + (v.soft ? '（软）' : '');
  }

  function outcomeLabel(o) { return { win: '胜', lose: '负', push: '平', blackjack: '21点!' }[o] || ''; }

  function render() {
    updateHud();
    $('betNum').textContent = bet;
    $('dealBtn').disabled = !(bet > 0 && bet <= chips);
    var chipEls = $('chipRow').children;
    for (var i = 0; i < chipEls.length; i++) { chipEls[i].style.opacity = (+chipEls[i].dataset.v > chips - bet) ? '.35' : '1'; }

    var dz = $('dealerZone'); dz.innerHTML = '';
    var pz = $('playerZone'); pz.innerHTML = '';
    if (!round) return;
    var revealed = round.stage === 'done';
    var dh = document.createElement('div'); dh.className = 'hand';
    var drow = document.createElement('div'); drow.className = 'cardsrow';
    round.dealer.cards.forEach(function (id, i) { drow.appendChild(cardEl(id, revealed || i === 0)); });
    dh.appendChild(drow);
    var dtotal = document.createElement('div'); dtotal.className = 'htotal';
    dtotal.textContent = revealed ? handTotalText(round.dealer.cards) : (B.cardValue(round.dealer.cards[0]) + ' + ?');
    dh.appendChild(dtotal);
    dz.appendChild(dh);

    round.playerHands.forEach(function (h, idx) {
      var hd = document.createElement('div'); hd.className = 'hand' + (idx === round.activeHandIdx && round.stage === 'player' ? ' active' : '');
      var row = document.createElement('div'); row.className = 'cardsrow';
      h.cards.forEach(function (id) { row.appendChild(cardEl(id, true)); });
      hd.appendChild(row);
      var tot = document.createElement('div'); tot.className = 'htotal';
      tot.textContent = handTotalText(h.cards) + (h.doubled ? ' ×2' : '') + '（' + h.bet + '）';
      hd.appendChild(tot);
      if (revealed && h.outcome) {
        var res = document.createElement('div'); res.className = 'hresult ' + h.outcome;
        var delta = h.payout - h.bet;
        res.textContent = outcomeLabel(h.outcome) + (delta > 0 ? ' +' + delta : delta < 0 ? ' ' + delta : ' ±0');
        hd.appendChild(res);
      }
      pz.appendChild(hd);
    });
  }

  function activeHand() { return round.playerHands[round.activeHandIdx]; }

  function updateActionButtons() {
    var h = activeHand();
    var canDouble = h.cards.length === 2 && chips >= h.bet;
    var canSplit = B.canSplit(h) && chips >= h.bet && round.playerHands.length < 4;
    $('hitBtn').disabled = false; $('hitBtn').style.display = '';
    $('standBtn').disabled = false; $('standBtn').style.display = '';
    $('doubleBtn').disabled = !canDouble; $('doubleBtn').style.display = '';
    $('splitBtn').style.display = canSplit ? '' : 'none';
    $('nextBtn').style.display = 'none';
  }
  function showRoundOverButtons() {
    ['hitBtn', 'standBtn', 'doubleBtn', 'splitBtn'].forEach(function (id) { $(id).style.display = 'none'; });
    $('nextBtn').style.display = '';
  }

  function startRoundFlow() {
    chips -= bet;
    var deck = B.newShoe(2);
    round = B.startRound(deck, bet);
    $('betZone').style.display = 'none';
    $('actionRow').style.display = 'flex';
    render();
    if (round.stage === 'dealer') { finishRound(); return; }
    updateActionButtons();
    $('status').textContent = '你的回合：要牌 / 停牌 / 加倍' + (B.canSplit(activeHand()) ? ' / 分牌' : '');
  }

  function afterPlayerAction() {
    render();
    if (round.stage === 'dealer') { finishRound(); return; }
    updateActionButtons();
    var idx = round.activeHandIdx;
    $('status').textContent = round.playerHands.length > 1 ? ('第 ' + (idx + 1) + ' 手：要牌 / 停牌') : '你的回合：要牌 / 停牌';
  }

  function finishRound() {
    B.playDealer(round);
    var settled = B.settleRound(round);
    chips += settled.totalReturn;
    round.playerHands.forEach(function (h) {
      stats.rounds++;
      if (h.outcome === 'win') stats.wins++;
      else if (h.outcome === 'blackjack') { stats.wins++; stats.blackjacks++; }
      else if (h.outcome === 'lose') stats.losses++;
      else stats.pushes++;
    });
    save();
    render();
    showRoundOverButtons();
    var net = settled.net;
    $('status').textContent = net > 0 ? ('回合结束，你赢得 ' + net + ' 筹码') : net < 0 ? ('回合结束，你输掉 ' + (-net) + ' 筹码') : '回合结束，平局不输不赢';
  }

  function goToBetting() {
    round = null; bet = 0;
    $('actionRow').style.display = 'none';
    if (chips < 10) {
      $('resetRecord').textContent = recText();
      $('resetOv').classList.remove('hidden');
      return;
    }
    $('betZone').style.display = 'flex';
    render();
    $('status').textContent = '请下注';
  }

  // ------------------------------------------------------------ wiring
  $('chipRow').addEventListener('click', function (e) {
    var el = e.target.closest('.chip'); if (!el) return;
    var v = +el.dataset.v;
    if (bet + v <= chips) { bet += v; render(); }
    else toast('筹码不足', 800);
  });
  $('clearBetBtn').addEventListener('click', function () { bet = 0; render(); });
  $('dealBtn').addEventListener('click', function () { if (bet > 0 && bet <= chips) startRoundFlow(); });

  $('hitBtn').addEventListener('click', function () { B.hit(round); afterPlayerAction(); });
  $('standBtn').addEventListener('click', function () { B.stand(round); afterPlayerAction(); });
  $('doubleBtn').addEventListener('click', function () {
    var h = activeHand();
    if (chips < h.bet) { toast('筹码不足以加倍', 900); return; }
    chips -= h.bet;
    B.double(round);
    afterPlayerAction();
  });
  $('splitBtn').addEventListener('click', function () {
    var h = activeHand();
    if (chips < h.bet) { toast('筹码不足以分牌', 900); return; }
    chips -= h.bet;
    B.split(round);
    afterPlayerAction();
  });
  $('nextBtn').addEventListener('click', goToBetting);

  $('startBtn').addEventListener('click', function () {
    $('startOv').classList.add('hidden');
    goToBetting();
  });
  $('menuBtn').addEventListener('click', function () {
    $('record').textContent = recText();
    $('startOv').classList.remove('hidden');
  });
  $('resetBtn').addEventListener('click', function () {
    chips = START_CHIPS; stats.resets++; save();
    $('resetOv').classList.add('hidden');
    toast('已领取 ' + START_CHIPS + ' 免费筹码', 1200);
    goToBetting();
  });

  document.addEventListener('touchmove', function (e) { if (!e.target.closest('.overlay')) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  $('record').textContent = recText();
  updateHud();
  render();
})();
