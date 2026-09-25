/* rj-game.js — tiny shared kit for the hall's original games (MIT).
 * Start screen, game-over screen, HUD, best score, HiDPI letterboxed canvas,
 * pointer → logical coordinates, synthesized sound effects, main loop. No assets. */
(function () {
  'use strict';
  const RJ = {};
  const $ = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  const css = `
  html,body{margin:0;height:100%;background:#15182f;color:#fff;overflow:hidden;touch-action:none;
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
  #rj-hud{position:fixed;top:0;left:0;right:0;z-index:20;display:flex;align-items:center;gap:10px;
    padding:calc(env(safe-area-inset-top) + 8px) 12px 8px;font-size:14px;font-weight:600;pointer-events:none}
  #rj-hud a{pointer-events:auto;color:#fff;text-decoration:none;opacity:.85;font-weight:500}
  #rj-hud .sp{flex:1} #rj-hud .pill{padding:4px 10px;border-radius:12px;background:rgba(255,255,255,.14);
    border:1px solid rgba(255,255,255,.22);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font-variant-numeric:tabular-nums}
  #rj-hud button{pointer-events:auto;border:0;border-radius:12px;padding:5px 10px;background:rgba(255,255,255,.18);color:#fff;font-size:13px;font-weight:600}
  #rj-stage{position:fixed;left:0;right:0;bottom:0;top:calc(env(safe-area-inset-top) + 44px);display:flex;align-items:center;justify-content:center}
  #rj-stage canvas{display:block;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.35)}
  .rj-ov{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:rgba(10,12,30,.55);padding:20px}
  .rj-ov.on{display:flex}
  .rj-card{width:min(360px,100%);border-radius:26px;padding:22px 20px 18px;text-align:center;
    background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.35);-webkit-backdrop-filter:blur(24px) saturate(170%);backdrop-filter:blur(24px) saturate(170%);
    box-shadow:0 20px 60px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.5)}
  .rj-card h1{margin:0 0 4px;font-size:28px} .rj-card .sub{opacity:.8;font-size:14px;margin-bottom:12px}
  .rj-card .how{text-align:left;font-size:13.5px;line-height:1.65;opacity:.92;background:rgba(0,0,0,.18);border-radius:14px;padding:10px 12px;margin:10px 0 14px}
  .rj-card .big{font-size:44px;font-weight:800;margin:6px 0} .rj-card .best{opacity:.75;font-size:13px}
  .rj-btn{display:block;width:100%;height:50px;margin-top:10px;border:0;border-radius:16px;font-size:17px;font-weight:700;color:#fff;
    background:linear-gradient(180deg,#3aa0ff,#0a6cff);box-shadow:0 8px 20px rgba(10,108,255,.4),inset 0 1px 0 rgba(255,255,255,.4)}
  .rj-btn.alt{background:rgba(255,255,255,.18);box-shadow:none}
  .rj-card .credit{margin-top:12px;font-size:11.5px;opacity:.55;line-height:1.5}
  .rj-card .credit a{color:#fff}
  #rj-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 56px);transform:translateX(-50%);z-index:30;padding:8px 16px;border-radius:18px;
    background:rgba(0,0,0,.55);font-size:15px;font-weight:700;opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap}
  #rj-toast.on{opacity:1}`;

  RJ.init = function (opt) {
    RJ.opt = opt;
    document.title = opt.title;
    const st = $('style'); st.textContent = css; document.head.appendChild(st);
    RJ.hud = $('div'); RJ.hud.id = 'rj-hud';
    RJ.hud.innerHTML = '<a href="../">‹ 大厅</a><span class="sp"></span>';
    document.body.appendChild(RJ.hud);
    RJ.stage = $('div'); RJ.stage.id = 'rj-stage'; document.body.appendChild(RJ.stage);
    RJ.toastEl = $('div'); RJ.toastEl.id = 'rj-toast'; document.body.appendChild(RJ.toastEl);
    RJ.bestKey = 'rj-best-' + opt.id;
    // start screen
    RJ.startOv = $('div', 'rj-ov on');
    RJ.startOv.innerHTML = `<div class="rj-card"><h1>${opt.icon || ''} ${opt.title}</h1><div class="sub">${opt.subtitle || ''}</div>
      <div class="how">${opt.howto || ''}</div><div class="best" data-best></div>
      <button class="rj-btn" data-start>开始游戏</button>
      <div class="credit">原创实现 · 代码 MIT 开源${opt.credit ? '<br>' + opt.credit : ''}</div></div>`;
    document.body.appendChild(RJ.startOv);
    RJ.endOv = $('div', 'rj-ov');
    RJ.endOv.innerHTML = `<div class="rj-card"><h1 data-etitle></h1><div class="sub" data-esub></div><div class="big" data-escore></div>
      <div class="best" data-ebest></div><button class="rj-btn" data-again>再来一局</button>
      <button class="rj-btn alt" data-next style="display:none">下一关</button><a href="../"><button class="rj-btn alt">返回大厅</button></a></div>`;
    document.body.appendChild(RJ.endOv);
    RJ.showBest();
    RJ.startOv.querySelector('[data-start]').onclick = () => { RJ.unlockAudio(); RJ.startOv.classList.remove('on'); opt.onStart && opt.onStart(); };
    RJ.endOv.querySelector('[data-again]').onclick = () => { RJ.unlockAudio(); RJ.endOv.classList.remove('on'); opt.onRestart ? opt.onRestart() : opt.onStart(); };
    RJ.endOv.querySelector('[data-next]').onclick = () => { RJ.endOv.classList.remove('on'); RJ._next && RJ._next(); };
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (RJ.startOv.classList.contains('on')) { e.preventDefault(); RJ.startOv.querySelector('[data-start]').click(); }
      else if (RJ.endOv.classList.contains('on')) { e.preventDefault(); (RJ._next ? RJ.endOv.querySelector('[data-next]') : RJ.endOv.querySelector('[data-again]')).click(); }
    });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  };
  RJ.showBest = function () {
    const b = +store.get(RJ.bestKey) || 0;
    RJ.startOv.querySelector('[data-best]').textContent = b ? `最高分：${b}` : '';
  };
  RJ.pills = function (names) { // create HUD pills, returns setter
    const els = {};
    names.forEach((n) => { const p = $('span', 'pill'); RJ.hud.appendChild(p); els[n] = p; });
    return (n, v) => { els[n].textContent = v; };
  };
  RJ.hudButton = function (label, fn) { const b = $('button', null, label); b.onclick = fn; RJ.hud.appendChild(b); return b; };
  RJ.over = function ({ title = '游戏结束', sub = '', score = 0, win = false, next = null }) {
    const best = Math.max(+store.get(RJ.bestKey) || 0, score);
    store.set(RJ.bestKey, best);
    RJ.endOv.querySelector('[data-etitle]').textContent = title;
    RJ.endOv.querySelector('[data-esub]').textContent = sub;
    RJ.endOv.querySelector('[data-escore]').textContent = score;
    RJ.endOv.querySelector('[data-ebest]').textContent = `最高分：${best}`;
    RJ._next = next;
    RJ.endOv.querySelector('[data-next]').style.display = next ? 'block' : 'none';
    RJ.endOv.classList.add('on');
    RJ.sfx(win ? 'win' : 'lose');
    RJ.showBest();
  };
  RJ.toast = function (t, ms = 1200) {
    RJ.toastEl.textContent = t; RJ.toastEl.classList.add('on');
    clearTimeout(RJ._tt); RJ._tt = setTimeout(() => RJ.toastEl.classList.remove('on'), ms);
  };

  // letterboxed HiDPI canvas with a fixed logical size
  RJ.canvas = function (W, H) {
    const c = $('canvas'); RJ.stage.appendChild(c);
    const ctx = c.getContext('2d');
    const view = { W, H, scale: 1, c, ctx };
    function fit() {
      const r = RJ.stage.getBoundingClientRect();
      const s = Math.min((r.width - 16) / W, (r.height - 16) / H);
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      c.style.width = Math.floor(W * s) + 'px'; c.style.height = Math.floor(H * s) + 'px';
      c.width = Math.floor(W * s * dpr); c.height = Math.floor(H * s * dpr);
      ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
      view.scale = s;
    }
    fit(); addEventListener('resize', fit);
    view.toGame = (e) => { const r = c.getBoundingClientRect(); const p = e.touches ? e.touches[0] || e.changedTouches[0] : e; return { x: (p.clientX - r.left) / r.width * W, y: (p.clientY - r.top) / r.height * H }; };
    view.onPointer = (down, move, up) => {
      c.addEventListener('pointerdown', (e) => { c.setPointerCapture && c.setPointerCapture(e.pointerId); down && down(view.toGame(e), e); });
      c.addEventListener('pointermove', (e) => move && move(view.toGame(e), e));
      addEventListener('pointerup', (e) => up && up(view.toGame(e), e));
    };
    return view;
  };

  RJ.loop = function (update, draw) {
    let last = performance.now(), run = true;
    function f(t) { if (!run) return; const dt = Math.min(0.05, (t - last) / 1000); last = t; update(dt); draw(); requestAnimationFrame(f); }
    requestAnimationFrame(f);
    return { stop() { run = false; } };
  };

  // synthesized sound effects (WebAudio, no files)
  let ac = null;
  RJ.unlockAudio = function () { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} };
  const tones = {
    hit: [[520, 0.06, 'square', 0.08]], pop: [[880, 0.05, 'sine', 0.12], [1320, 0.05, 'sine', 0.08]],
    coin: [[988, 0.06, 'square', 0.07], [1319, 0.12, 'square', 0.07]], shoot: [[700, 0.04, 'sawtooth', 0.04]],
    boom: [[120, 0.25, 'sawtooth', 0.12]], bad: [[200, 0.18, 'square', 0.1]], move: [[440, 0.03, 'triangle', 0.08]],
    win: [[523, 0.1, 'triangle', 0.12], [659, 0.1, 'triangle', 0.12], [784, 0.22, 'triangle', 0.12]],
    lose: [[392, 0.14, 'triangle', 0.12], [311, 0.14, 'triangle', 0.12], [247, 0.3, 'triangle', 0.12]],
  };
  RJ.sfx = function (name) {
    if (!ac || !tones[name]) return;
    let t = ac.currentTime;
    for (const [f, d, type, v] of tones[name]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (name === 'boom') o.frequency.exponentialRampToValueAtTime(40, t + d);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d + 0.02); t += d * 0.9;
    }
  };

  // drawing helpers
  RJ.rr = function (ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  RJ.rand = (a, b) => a + Math.random() * (b - a);
  RJ.randi = (a, b) => Math.floor(RJ.rand(a, b + 1));
  RJ.shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  RJ.keys = {};
  addEventListener('keydown', (e) => { RJ.keys[e.key] = true; if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault(); });
  addEventListener('keyup', (e) => { RJ.keys[e.key] = false; });
  window.RJ = RJ;
})();
