#!/usr/bin/env node
// 冰火双人闯关 关卡自动验证：抽出 index.html 里的纯逻辑核心，无头运行。
// 1) 静态检查：每关恰好 1 个红/蓝出生点与出口，行等长，踏板与门/升降台配对
// 2) 用搜索求解器（每次只动一个角色的宏动作 BFS）找出通关输入序列，
//    再从头用真实 step() 逐帧回放，确认确实通关。回放才是证明，搜索只是找输入。
// 用法: node verify.js [index.html路径]（默认 ../index.html；环境变量 ONLY=3 只验第 3 关）
var fs = require('fs'), path = require('path');
var file = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : path.join(__dirname, '..', 'index.html');
var html = fs.readFileSync(file, 'utf8');
var core = html.match(/\/\*CORE-BEGIN\*\/([\s\S]*)\/\*CORE-END\*\//)[1];
var G = new Function(core + '; return {LEVELS:LEVELS, parseLevel:parseLevel, newState:newState, step:step, cloneState:cloneState, TILE:TILE, DT:DT};')();
var FR = 6;                      // 每个宏动作持续帧数（0.1 秒）
var NODE_LIMIT = +(process.env.NL || 600000);
var IN = [{l:0,r:0,j:0},{l:1,r:0,j:0},{l:0,r:1,j:0},{l:0,r:0,j:1},{l:1,r:0,j:1},{l:0,r:1,j:1}];
var IDLE = IN[0];
// 每关的“设计解”：一串子目标。[谁, 目标格列, 目标格行] = 该角色走到并站稳在这一格（另一人原地待命，
// 踩着踏板就继续踩着）；可选第4项 {crate:[序号,列,行]} 要求方块也到位。最后 ['exit'] 的含义是双方都到出口。
// 求解器对每个子目标做真实物理的 BFS（走/跳/等待），所以这不是手写路线，而是“证明这条配合顺序在真实物理下可行”。
var PLANS = require('./plans.js');
function applyAct(s, who, input) {
  for (var i = 0; i < FR; i++) {
    G.step(s, who === 'fire' ? input : IDLE, who === 'ice' ? input : IDLE);
    if (s.dead || s.won) break;
  }
}
function cell(e) { return [Math.floor((e.x + e.w / 2) / 32), Math.floor((e.y + e.h - 1) / 32)]; }
function goalMet(s, g) {
  if (g[0] === 'exit') return s.fire.done && s.ice.done;
  var e = s[g[0]], c = cell(e);
  var ok = e.grounded && c[0] === g[1] && c[2 - 1] === g[2] && Math.abs(e.vy) < 40;
  if (ok && g[3] && g[3].crate) { var k = s.crates[g[3].crate[0]]; ok = Math.floor((k.x + k.w / 2) / 32) === g[3].crate[1] && Math.floor((k.y + k.h - 1) / 32) === g[3].crate[2]; }
  if (g[0] !== 'exit' && g[3] && g[3].exit) ok = e.done;
  return ok;
}
function key(s, who) {
  var q = function (v) { return Math.round(v / 3); }, e = s[who];
  var k = [q(e.x), q(e.y), e.grounded ? 1 : 0, Math.round(e.vy / 100), (who === 'fire' ? s.jpF : s.jpI) ? 1 : 0, e.done ? 1 : 0];
  s.crates.forEach(function (c) { k.push(q(c.x), q(c.y)); });
  s.lifts.forEach(function (l) { k.push(Math.round(l.y / 6)); });
  k.push(s.fire.done ? 1 : 0, s.ice.done ? 1 : 0);
  return k.join(',');
}
function solveGoal(s0, g) {
  var who = g[0];
  var seen = new Set([key(s0, who)]), nodes = [{ s: s0, p: -1, a: -1 }], h = 0;
  while (h < nodes.length) {
    var nd = nodes[h], s = nd.s; nd.s = null;
    for (var i = 0; i < IN.length; i++) {
      var n = G.cloneState(s);
      applyAct(n, who, IN[i]);
      if (n.dead) continue;
      if (goalMet(n, g)) {
        var seq = [[who, IN[i]]], p = h;
        while (p > 0) { seq.push([who, IN[nodes[p].a]]); p = nodes[p].p; }
        return { seq: seq.reverse(), state: n, nodes: nodes.length };
      }
      var k = key(n, who);
      if (seen.has(k)) continue;
      seen.add(k);
      nodes.push({ s: n, p: h, a: i });
      if (nodes.length > NODE_LIMIT) return { fail: '超过节点上限' };
    }
    h++;
  }
  return { fail: '搜索空间耗尽，该子目标在物理上不可达' };
}
// 终点：两人都 done。先让 fire 走进出口，再让 ice 走进出口
function exitGoals() { return [['fire', 0, 0, { exit: true }], ['ice', 0, 0, { exit: true }]]; }
function staticCheck(cfg, lv) {
  var errs = [], rows = cfg.rows, cnt = {};
  rows.forEach(function (r, i) {
    if (r.length !== rows[0].length) errs.push('第' + i + '行长度不一致');
    r.split('').forEach(function (ch) { cnt[ch] = (cnt[ch] || 0) + 1; });
  });
  ['r', 'b', 'X', 'Y'].forEach(function (ch) { if (cnt[ch] !== 1) errs.push('字符 ' + ch + ' 应恰好 1 个，实际 ' + (cnt[ch] || 0)); });
  var plateIds = {}; lv.plates.forEach(function (p) { plateIds[p.id] = 1; });
  lv.doorTiles.forEach(function (d) { var id = { D: '1', E: '2', F: '3', G: '4' }[d.ch]; if (!plateIds[id]) errs.push('门 ' + d.ch + ' 没有对应踏板 ' + id); });
  lv.plates.forEach(function (p) {
    var hasDoor = lv.doorTiles.some(function (d) { return { D: '1', E: '2', F: '3', G: '4' }[d.ch] === p.id; });
    var hasLift = lv.lifts.some(function (l) { return l.plate === p.id; });
    if (!hasDoor && !hasLift) errs.push('踏板 ' + p.id + ' 没有控制任何门/升降台');
  });
  return errs;
}
function replay(lv, seq) {
  var s = G.newState(lv), frames = 0;
  for (var i = 0; i < seq.length; i++) {
    for (var f = 0; f < FR; f++) {
      G.step(s, seq[i][0] === 'fire' ? seq[i][1] : IDLE, seq[i][0] === 'ice' ? seq[i][1] : IDLE); frames++;
      if (s.dead) return { ok: false, why: '回放中阵亡' };
      if (s.won) return { ok: true, frames: frames, gems: s.gems };
    }
  }
  return { ok: false, why: '回放未通关' };
}
var allOk = true;
var only = process.env.ONLY ? +process.env.ONLY : 0;
G.LEVELS.forEach(function (cfg, idx) {
  if (only && idx + 1 !== only) return;
  var lv = G.parseLevel(cfg);
  var errs = staticCheck(cfg, lv);
  var line = '第' + (idx + 1) + '关 ' + cfg.name + ' (' + lv.nc + 'x' + lv.nr + ')';
  if (errs.length) { console.log(line + ' 静态检查失败: ' + errs.join('; ')); allOk = false; return; }
  var plan = PLANS[idx];
  if (!plan) { console.log(line + ' 没有设计解(plans.js)，未验证'); allOk = false; return; }
  var t0 = Date.now(), s = G.newState(lv), seq = [], steps = [];
  var goals = plan.concat(exitGoals());
  for (var gi = 0; gi < goals.length; gi++) {
    var g = goals[gi];
    var res = solveGoal(s, g);
    if (res.fail) { console.log(line + ' 子目标 #' + (gi + 1) + ' ' + JSON.stringify(g) + ' 失败: ' + res.fail); allOk = false; return; }
    if (process.env.DBG) console.log('  goal', JSON.stringify(g), 'fire', Math.round(res.state.fire.x), Math.round(res.state.fire.y), 'ice', Math.round(res.state.ice.x), Math.round(res.state.ice.y), 'lifts', res.state.lifts.map(function (l) { return Math.round(l.y); }), 'pressed', JSON.stringify(res.state.pressed));
    seq = seq.concat(res.seq); s = res.state; steps.push(res.seq.length);
  }
  var rp = replay(lv, seq);
  if (!rp.ok) { console.log(line + ' 回放失败: ' + rp.why); allOk = false; return; }
  console.log(line + ' 通过: ' + goals.length + ' 个子目标, 从头回放 ' + rp.frames + ' 帧 (约 ' + (rp.frames * G.DT).toFixed(1) + ' 秒) 双人到达出口, 耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
});
console.log(allOk ? '\n全部关卡验证通过' : '\n存在未通过的关卡');
process.exit(allOk ? 0 : 1);
