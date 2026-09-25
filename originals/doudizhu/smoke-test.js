'use strict';
const path = require('path');
const { chromium, devices } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith('file://')) errors.push('external request: ' + r.url()); });
  await page.goto('file://' + path.resolve(__dirname, 'index.html'));
  await page.click('text=开始游戏');

  let hints = 0, passes = 0, plays = 0, bids = 0, rounds = 0;
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline && rounds < 2) {
    if (await page.isVisible('#endOv:not([hidden])')) {
      rounds++;
      console.log('round over:', (await page.textContent('#endTitle')), '|', (await page.textContent('#endBreak')));
      if (rounds === 1 && process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, 'smoke-end.png') });
      if (rounds < 2) await page.click('#againBtn');
      continue;
    }
    const btns = await page.$$eval('#actions button', (bs) => bs.map((b) => ({ t: b.textContent, d: b.disabled })));
    const labels = btns.map((b) => b.t);
    if (labels.includes('不叫')) {
      const choice = labels.includes('3分') && bids % 2 === 0 ? '3分' : labels.includes('1分') ? '1分' : '不叫';
      await page.click(`#actions button:has-text("${choice}")`);
      bids++;
    } else if (labels.includes('出牌')) {
      if (process.env.SHOT_DIR && plays % 4 === 2) await page.screenshot({ path: path.join(process.env.SHOT_DIR, 'smoke-play' + plays + '.png') });
      const passOk = btns.find((b) => b.t === '不出' && !b.d);
      if (passOk && passes < 3 && plays % 3 === 1) { await page.click('#actions button:has-text("不出")'); passes++; plays++; }
      else {
        await page.click('#actions button:has-text("提示")'); hints++;
        const sel = await page.$$eval('#hand .card.sel', (c) => c.length);
        if (sel) await page.click('#playBtn');
        else { await page.click('#actions button:has-text("不出")'); passes++; }
        plays++;
      }
    }
    await page.waitForTimeout(150);
  }
  const hud = await page.textContent('.topbar');
  console.log({ rounds, bids, hints, passes, plays, hud: hud.replace(/\s+/g, ' ') });
  await browser.close();
  if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  if (rounds < 2) { console.error('did not finish 2 rounds'); process.exit(1); }
  console.log('SMOKE OK');
})();
