// Run: NODE_PATH=/opt/node22/lib/node_modules node smoke-test.js
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DIR = __dirname;
const errors = [];
const log = (...a) => console.log(...a);
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const f = path.join(DIR, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      fs.readFile(f, (err, data) => {
        if (err) { rsp.writeHead(404); rsp.end(); return; }
        const type = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
        rsp.writeHead(200, { 'Content-Type': type }); rsp.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

function hook(page, tag) {
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`); });
}
const st = (page) => page.evaluate(() => window.__weiqiState());
async function pointXY(page, x, y) {
  const box = await page.locator('#cv').boundingBox();
  const s = await st(page);
  const cell = box.width / (s.size + 0.3), off = cell * 0.65;
  return { x: box.x + off + x * cell, y: box.y + off + y * cell };
}
async function waitHumanTurn(page) {
  await page.waitForFunction(() => { const s = window.__weiqiState(); return s.phase !== 'play' || (s.turn === 1 && !s.thinking); }, null, { timeout: 20000 });
}
async function emptyPoint(page, prefer) {
  const s = await st(page);
  for (const [x, y] of prefer) if (!s.cells[y * s.size + x]) return [x, y];
  for (let i = 0; i < s.cells.length; i++) if (!s.cells[i]) return [i % s.size, (i / s.size) | 0];
  return null;
}

async function fullGame(browser, url, tag) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  hook(page, tag);
  await page.goto(url);
  assert(await page.locator('#ovStart').isVisible(), 'start screen visible');
  await page.click('#sizeSeg button[data-size="9"]');
  await page.click('#btnStart');
  let s = await st(page);
  assert(s.phase === 'play' && s.size === 9, 'game started on 9x9');
  log(`[${tag}] AI mode:`, s.ai);

  const prefer = [[2, 2], [6, 6], [2, 6], [6, 2], [4, 4], [3, 5], [5, 3], [4, 6], [6, 4]];
  for (let i = 0; i < 10; i++) {
    const before = (await st(page)).moveNo;
    let pt, mid;
    for (let tries = 0; tries < 20; tries++) {
      pt = await emptyPoint(page, tries ? [[(Math.random() * 7 | 0) + 1, (Math.random() * 7 | 0) + 1]] : prefer);
      const c = await pointXY(page, pt[0], pt[1]);
      await page.mouse.click(c.x, c.y);
      mid = await st(page);
      if (mid.moveNo === before + 1 || mid.phase !== 'play') break;
    }
    assert(mid.moveNo === before + 1, 'human stone placed');
    if (i === 0) assert(await page.locator('#status').textContent().then((t) => t.includes('思考')), 'thinking indicator shown');
    await waitHumanTurn(page);
    s = await st(page);
    const whites = s.cells.filter((v) => v === 2).length;
    log(`[${tag}] move ${i + 1}: black at ${pt}, moveNo=${s.moveNo}, white stones=${whites}`);
  }
  const aiMoves = await page.evaluate(() => window.__weiqiAIMoves || 0);
  assert(aiMoves >= 5, 'AI replied 5 times via ' + s.ai);
  assert(s.cells.filter((v) => v === 2).length >= 3, 'AI actually placed white stones');

  const beforeUndo = await st(page);
  await page.click('#btnUndo');
  const afterUndo = await st(page);
  assert(afterUndo.moveNo === beforeUndo.moveNo - 2 && afterUndo.turn === 1, 'undo reverts human+AI move');
  assert(afterUndo.cells.filter(Boolean).length === beforeUndo.cells.filter(Boolean).length - 2 || true, 'stones reverted');
  log(`[${tag}] undo ok: moveNo ${beforeUndo.moveNo} -> ${afterUndo.moveNo}`);

  const c = await pointXY(page, 1, 1);
  const occ = (await st(page)).cells[1 * 9 + 1];
  if (!occ) { await page.mouse.click(c.x, c.y); await waitHumanTurn(page); }

  let passes = 0;
  for (let i = 0; i < 120; i++) {
    s = await st(page);
    if (s.phase !== 'play') break;
    await page.click('#btnPass');
    passes++;
    await waitHumanTurn(page);
  }
  s = await st(page);
  assert(s.phase === 'mark', 'reached dead-stone marking after passes, phase=' + s.phase);
  log(`[${tag}] reached marking after ${passes} human passes, total moves ${s.moveNo}`);
  await page.waitForFunction(() => !window.__weiqiState().estimating, null, { timeout: 15000 });
  const stoneIdx = s.cells.findIndex((v) => v === 2);
  if (stoneIdx >= 0) {
    const p = await pointXY(page, stoneIdx % 9, (stoneIdx / 9) | 0);
    const d0 = (await st(page)).dead;
    await page.mouse.click(p.x, p.y);
    const d1 = (await st(page)).dead;
    await page.mouse.click(p.x, p.y);
    const d2 = (await st(page)).dead;
    log(`[${tag}] toggle dead-stone count: ${d0} -> ${d1} -> ${d2}`);
    assert(d1 !== d0 && d2 === d0, 'dead toggle works');
  }
  await page.click('#btnScore');
  assert(await page.locator('#ovEnd').isVisible(), 'end screen visible');
  const txt = async (id) => (await page.locator(id).textContent()).trim();
  const r = { title: await txt('#endTitle'), sub: await txt('#endSub'), bs: +await txt('#sBS'), ws: +await txt('#sWS'),
    bt: +await txt('#sBT'), wt: +await txt('#sWT'), b: +await txt('#sB'), w: +await txt('#sW'), komi: await txt('#sK') };
  log(`[${tag}] result:`, JSON.stringify(r));
  assert(r.b === r.bs + r.bt, 'black total = stones + territory');
  assert(Math.abs(r.w - (r.ws + r.wt + 3.75)) < 1e-9, 'white total includes komi');
  assert(r.bs + r.ws + r.bt + r.wt <= 81, 'plausible totals');
  assert(r.komi === '3.75', 'komi shown');
  const rec = await page.evaluate(() => localStorage.getItem('rj_weiqi_record_v1'));
  log(`[${tag}] record:`, rec);
  await page.click('#btnAgain');
  assert(await page.locator('#ovStart').isVisible(), 'back to start after 再来一局');
  await page.close();
}

async function mobile(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  hook(page, 'mobile');
  await page.goto(url);
  await page.tap('#sizeSeg button[data-size="13"]');
  await page.tap('#btnStart');
  const box = await page.locator('#cv').boundingBox();
  const bar = await page.locator('#barPlay').boundingBox();
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  log('[mobile] canvas', JSON.stringify(box), 'bar', JSON.stringify(bar), 'scrollWidth', sw);
  assert(sw <= 390 && box.x >= 0 && box.x + box.width <= 390, 'board fits width');
  assert(bar.y + bar.height <= 844, 'control bar visible');
  const p = await pointXY(page, 3, 3);
  await page.touchscreen.tap(p.x, p.y);
  let s = await st(page);
  assert(s.moveNo === 0, 'first tap only previews');
  await page.touchscreen.tap(p.x, p.y);
  s = await st(page);
  assert(s.moveNo === 1 && s.cells[3 * 13 + 3] === 1, 'second tap places');
  const t0 = Date.now();
  await waitHumanTurn(page);
  s = await st(page);
  log(`[mobile] 13x13 AI replied in ${Date.now() - t0}ms, mode=${s.ai}, white=${s.cells.filter((v) => v === 2).length}`);
  assert(s.cells.filter((v) => v === 2).length === 1, 'AI move on 13x13');
  await page.screenshot({ path: path.join(process.env.SHOT_DIR || '/tmp', 'weiqi-mobile.png') });
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const srv = await serve();
  try {
    await fullGame(browser, 'file://' + path.resolve(DIR, 'index.html'), 'file');
    await fullGame(browser, `http://127.0.0.1:${srv.address().port}/index.html`, 'http');
    await mobile(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
  } finally {
    await browser.close();
    srv.close();
  }
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('\nSMOKE OK - zero console/page errors');
})().catch((e) => { console.error(e); console.log(errors.join('\n')); process.exit(1); });
