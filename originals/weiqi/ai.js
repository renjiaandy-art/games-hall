(function (root, factory) {
  var A = factory();
  A.__factory = factory;
  if (typeof module !== 'undefined' && module.exports) module.exports = A;
  else root.WeiqiAI = A;
})(typeof self !== 'undefined' ? self : this, function WeiqiAIFactory() {
  var EMPTY = 0, BLACK = 1, WHITE = 2, EDGE = 3;
  var now = (typeof performance !== 'undefined' && performance.now) ? function () { return performance.now(); } : function () { return Date.now(); };

  function Pos(size) {
    var S = size + 2;
    this.N = size; this.S = S;
    this.c = new Int8Array(S * S);
    this.ko = -1;
    this.mark = new Int32Array(S * S);
    this.stamp = 1;
    this.stack = new Int32Array(S * S);
    this.dirs = [1, -1, S, -S];
    this.diags = [S + 1, S - 1, -S + 1, -S - 1];
    for (var i = 0; i < S * S; i++) {
      var x = i % S, y = (i / S) | 0;
      this.c[i] = (x === 0 || y === 0 || x === S - 1 || y === S - 1) ? EDGE : EMPTY;
    }
  }
  Pos.prototype.copyFrom = function (o) { this.c.set(o.c); this.ko = o.ko; };
  Pos.prototype.clone = function () { var p = new Pos(this.N); p.copyFrom(this); return p; };
  Pos.prototype.pt = function (x, y) { return (y + 1) * this.S + x + 1; };

  // Counts liberties of the group at p, stopping early once `limit` are found.
  Pos.prototype.libs = function (p, limit) {
    var c = this.c, col = c[p], mark = this.mark, st = this.stack, d = this.dirs;
    var s = ++this.stamp, sp = 0, n = 0;
    mark[p] = s; st[sp++] = p;
    while (sp) {
      var q = st[--sp];
      for (var k = 0; k < 4; k++) {
        var r = q + d[k];
        if (mark[r] === s) continue;
        var v = c[r];
        if (v === EMPTY) { mark[r] = s; if (++n >= limit) return n; }
        else if (v === col) { mark[r] = s; st[sp++] = r; }
      }
    }
    return n;
  };

  Pos.prototype.info = function (p) {
    var c = this.c, col = c[p], mark = this.mark, st = this.stack, d = this.dirs;
    var s = ++this.stamp, sp = 0, libs = 0, size = 0, lib1 = -1;
    mark[p] = s; st[sp++] = p;
    while (sp) {
      var q = st[--sp]; size++;
      for (var k = 0; k < 4; k++) {
        var r = q + d[k];
        if (mark[r] === s) continue;
        var v = c[r];
        if (v === EMPTY) { mark[r] = s; libs++; lib1 = r; }
        else if (v === col) { mark[r] = s; st[sp++] = r; }
      }
    }
    return { size: size, libs: libs, lib: lib1 };
  };

  Pos.prototype.remove = function (p, out) {
    var c = this.c, col = c[p], st = this.stack, d = this.dirs, sp = 0, n = 0;
    c[p] = EMPTY; st[sp++] = p;
    while (sp) {
      var q = st[--sp]; n++;
      if (out) out.push(q);
      for (var k = 0; k < 4; k++) { var r = q + d[k]; if (c[r] === col) { c[r] = EMPTY; st[sp++] = r; } }
    }
    return n;
  };

  Pos.prototype.legal = function (p, col) {
    var c = this.c;
    if (c[p] !== EMPTY || p === this.ko) return false;
    var opp = 3 - col, d = this.dirs;
    c[p] = col;
    var ok = false;
    for (var k = 0; k < 4 && !ok; k++) {
      var r = p + d[k], v = c[r];
      if (v === EMPTY) ok = true;
      else if (v === opp && this.libs(r, 1) === 0) ok = true;
    }
    if (!ok && this.libs(p, 1) > 0) ok = true;
    c[p] = EMPTY;
    return ok;
  };

  // Assumes legality was checked. Returns number captured.
  Pos.prototype.play = function (p, col, out) {
    var c = this.c, opp = 3 - col, d = this.dirs, cap = 0, capAt = -1;
    c[p] = col;
    for (var k = 0; k < 4; k++) {
      var r = p + d[k];
      if (c[r] === opp && this.libs(r, 1) === 0) { capAt = r; cap += this.remove(r, out); }
    }
    this.ko = -1;
    if (cap === 1) {
      var single = true;
      for (k = 0; k < 4; k++) if (c[p + d[k]] === col) single = false;
      if (single && this.libs(p, 2) === 1) this.ko = capAt;
    }
    return cap;
  };

  Pos.prototype.isEye = function (p, col) {
    var c = this.c, d = this.dirs, dg = this.diags;
    for (var k = 0; k < 4; k++) { var v = c[p + d[k]]; if (v !== col && v !== EDGE) return false; }
    var bad = 0, edge = 0, opp = 3 - col;
    for (k = 0; k < 4; k++) { var w = c[p + dg[k]]; if (w === EDGE) edge = 1; else if (w === opp) bad++; }
    return bad + edge < 2;
  };

  Pos.prototype.area = function (own) {
    var c = this.c, S = this.S, N = this.N, d = this.dirs, b = 0, w = 0;
    for (var y = 1; y <= N; y++) for (var x = 1; x <= N; x++) {
      var p = y * S + x, v = c[p], o = 0;
      if (v === BLACK || v === WHITE) o = v;
      else {
        var t = 0;
        for (var k = 0; k < 4; k++) { var u = c[p + d[k]]; if (u === BLACK || u === WHITE) t |= u; }
        if (t === BLACK || t === WHITE) o = t;
      }
      if (o === BLACK) b++; else if (o === WHITE) w++;
      if (own && o) own[p] += o === BLACK ? 1 : -1;
    }
    return b - w;
  };

  function playout(pos, toPlay, maxMoves, rnd) {
    var S = pos.S, N = pos.N, c = pos.c, empties = [], passes = 0, col = toPlay, caps = [];
    for (var y = 1; y <= N; y++) for (var x = 1; x <= N; x++) if (c[y * S + x] === EMPTY) empties.push(y * S + x);
    for (var m = 0; m < maxMoves && passes < 2; m++) {
      var n = empties.length, played = false;
      for (var j = n; j > 0; j--) {
        var r = (rnd() * j) | 0, p = empties[r];
        if (!pos.isEye(p, col) && pos.legal(p, col)) {
          empties[r] = empties[n - 1]; empties.pop();
          caps.length = 0;
          pos.play(p, col, caps);
          for (var k = 0; k < caps.length; k++) empties.push(caps[k]);
          played = true;
          break;
        }
        var t = empties[r]; empties[r] = empties[j - 1]; empties[j - 1] = t;
      }
      if (played) passes = 0; else { passes++; pos.ko = -1; }
      col = 3 - col;
    }
  }

  function makeRng(seed) {
    var s = seed >>> 0 || 88172645;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  function fromMsg(msg) {
    var pos = new Pos(msg.size), N = msg.size;
    for (var i = 0; i < N * N; i++) pos.c[pos.pt(i % N, (i / N) | 0)] = msg.cells[i];
    if (msg.ko && msg.ko.point >= 0 && msg.ko.color === msg.toPlay) pos.ko = pos.pt(msg.ko.point % N, (msg.ko.point / N) | 0);
    return pos;
  }

  function regionMap(pos) {
    var S = pos.S, N = pos.N, c = pos.c, d = pos.dirs, owner = new Int8Array(S * S), rsize = new Int32Array(S * S), seen = new Uint8Array(S * S);
    for (var y = 1; y <= N; y++) for (var x = 1; x <= N; x++) {
      var p = y * S + x;
      if (c[p] !== EMPTY || seen[p]) continue;
      var list = [p], touch = 0; seen[p] = 1;
      for (var i = 0; i < list.length; i++) {
        var q = list[i];
        for (var k = 0; k < 4; k++) {
          var r = q + d[k], v = c[r];
          if (v === EMPTY) { if (!seen[r]) { seen[r] = 1; list.push(r); } }
          else if (v !== EDGE) touch |= v;
        }
      }
      var o = (touch === BLACK || touch === WHITE) ? touch : 0;
      for (i = 0; i < list.length; i++) { owner[list[i]] = o; rsize[list[i]] = list.length; }
    }
    return { owner: owner, size: rsize };
  }

  function heuristic(pos, p, me, ctx, rnd) {
    var opp = 3 - me, c = pos.c, d = pos.dirs, N = pos.N, S = pos.S;
    if (pos.isEye(p, me)) return null;
    var h = 0, ownAtari = 0, seenG = [];
    for (var k = 0; k < 4; k++) {
      var r = p + d[k];
      if (c[r] === me) {
        var inf = pos.info(r);
        if (inf.libs === 1) ownAtari += inf.size;
      }
    }
    var t = ctx.tmp; t.copyFrom(pos);
    var cap = t.play(p, me, null);
    var own = t.info(p);
    if (cap) h += 60 + 25 * cap;
    if (ownAtari) {
      if (own.libs >= 3) h += 50 + 20 * ownAtari;
      else if (own.libs === 2) h += 15 + 6 * ownAtari;
    }
    if (own.libs === 1) {
      if (!cap) h -= 80 + 20 * own.size;
      else h -= 5;
    } else if (own.libs === 2 && !cap) h -= 6;
    for (k = 0; k < 4; k++) {
      r = p + d[k];
      if (t.c[r] !== opp) continue;
      var dup = false;
      for (var s = 0; s < seenG.length; s++) if (seenG[s] === r) dup = true;
      if (dup) continue;
      var g = t.info(r);
      seenG.push(r);
      if (g.libs === 1) {
        var esc = t.clone();
        var escOk = esc.legal(g.lib, opp);
        var escLibs = 0;
        if (escOk) { esc.play(g.lib, opp, null); escLibs = esc.info(g.lib).libs; }
        h += escLibs >= 3 ? 8 + 2 * g.size : 30 + 10 * g.size;
      } else if (g.libs === 2) h += 5;
    }
    var x = p % S - 1, y = ((p / S) | 0) - 1;
    var line = Math.min(x, y, N - 1 - x, N - 1 - y);
    var early = ctx.stones < N * N * 0.22;
    if (line === 0) h -= early ? 30 : 10;
    else if (line === 1) h -= early ? 10 : 1;
    else if (early && (line === 2 || (N >= 13 && line === 3))) h += 8;
    if (early && ctx.star[p]) h += 6;
    if (ctx.stones > 0) {
      var dist = ctx.dist[p];
      if (dist <= 2) h += 6; else if (dist === 3) h += 3; else if (dist > 4 && !early) h -= 3;
    }
    var o = ctx.region.owner[p], rs = ctx.region.size[p];
    if (o === me && !cap && !ownAtari) h -= 60;
    if (o === opp && !cap) {
      if (rs <= 6) h -= 60; else h -= 12;
    }
    return h + rnd() * 3;
  }

  function distMap(pos) {
    var S = pos.S, N = pos.N, c = pos.c, d = pos.dirs, dist = new Int32Array(S * S).fill(99), q = [];
    for (var y = 1; y <= N; y++) for (var x = 1; x <= N; x++) { var p = y * S + x; if (c[p] === BLACK || c[p] === WHITE) { dist[p] = 0; q.push(p); } }
    for (var i = 0; i < q.length; i++) {
      for (var k = 0; k < 4; k++) { var r = q[i] + d[k]; if (c[r] !== EDGE && dist[r] > dist[q[i]] + 1) { dist[r] = dist[q[i]] + 1; q.push(r); } }
    }
    return dist;
  }

  function chooseMove(msg) {
    var t0 = now(), N = msg.size, me = msg.toPlay, opp = 3 - me, komi = msg.komi == null ? 3.75 : msg.komi;
    var budget = msg.budget || (N >= 13 ? 900 : 600);
    var rnd = makeRng((msg.seed || (Date.now() & 0xffffff)) + 1);
    var pos = fromMsg(msg), S = pos.S;
    var stones = 0;
    for (var i = 0; i < N * N; i++) if (msg.cells[i]) stones++;
    var star = {};
    var sp = N === 9 ? [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]] : N === 13 ? [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]] : [];
    sp.forEach(function (a) { star[pos.pt(a[0], a[1])] = 1; });
    var ctx = { tmp: new Pos(N), stones: stones, star: star, dist: distMap(pos), region: regionMap(pos) };

    var cands = [];
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var p = pos.pt(x, y);
      if (!pos.legal(p, me)) continue;
      var h = heuristic(pos, p, me, ctx, rnd);
      if (h === null || h < -40) continue;
      cands.push({ p: p, x: x, y: y, h: h, wins: 0, n: 0 });
    }
    var raw = pos.area(null);
    var rawLead = me === BLACK ? raw - komi : komi - raw;
    if (!cands.length) return { pass: true, reason: 'nomoves' };
    if (msg.oppPassed && rawLead > 0 && stones > N * N * 0.3) return { pass: true, reason: 'ahead' };
    cands.sort(function (a, b) { return b.h - a.h; });
    var K = N >= 13 ? 10 : 8;
    var top = cands.slice(0, K);
    if (top[0].h >= 120 && (top.length < 2 || top[0].h - top[1].h > 60)) return { x: top[0].x, y: top[0].y, reason: 'tactic', ms: now() - t0 };

    var sim = new Pos(N), maxMoves = N * N * 2, total = 0;
    while (now() - t0 < budget) {
      for (var ci = 0; ci < top.length; ci++) {
        var cd = top[ci];
        sim.copyFrom(pos);
        sim.play(cd.p, me, null);
        playout(sim, opp, maxMoves, rnd);
        var diff = sim.area(null) - komi;
        if ((me === BLACK) === (diff > 0)) cd.wins++;
        cd.n++; total++;
      }
    }
    var best = null;
    for (ci = 0; ci < top.length; ci++) {
      cd = top[ci];
      cd.wr = cd.n ? cd.wins / cd.n : 0.5;
      cd.score = cd.wr * 100 + cd.h * 0.35;
      if (!best || cd.score > best.score) best = cd;
    }
    if (best.wr < 0.04 && stones > N * N * 0.55) return { pass: true, reason: 'hopeless', sims: total };
    return { x: best.x, y: best.y, wr: best.wr, sims: total, ms: now() - t0 };
  }

  function estimateDead(msg) {
    var t0 = now(), N = msg.size, budget = msg.budget || 500, komi = 0;
    var pos = fromMsg({ size: N, cells: msg.cells, toPlay: BLACK, ko: null });
    var S = pos.S, own = new Float64Array(S * S), sim = new Pos(N), rnd = makeRng(12345), n = 0;
    while (now() - t0 < budget || n < 20) {
      sim.copyFrom(pos);
      playout(sim, n % 2 ? WHITE : BLACK, N * N * 2, rnd);
      sim.area(own);
      n++;
      if (n > 4000) break;
    }
    var dead = [];
    for (var i = 0; i < N * N; i++) {
      var col = msg.cells[i];
      if (!col) continue;
      var p = pos.pt(i % N, (i / N) | 0), avg = own[p] / n;
      if ((col === BLACK && avg < -0.35) || (col === WHITE && avg > 0.35)) dead.push(i);
    }
    return { dead: dead, sims: n };
  }

  function handle(msg) {
    if (msg.type === 'think') {
      var r = chooseMove(msg);
      return { type: 'move', id: msg.id, pass: !!r.pass, x: r.pass ? -1 : r.x, y: r.pass ? -1 : r.y, info: r };
    }
    if (msg.type === 'dead') {
      var d = estimateDead(msg);
      return { type: 'dead', id: msg.id, dead: d.dead, sims: d.sims };
    }
    return { type: 'error', id: msg.id };
  }

  return { handle: handle, chooseMove: chooseMove, estimateDead: estimateDead, Pos: Pos };
});
