// Usage: NODE_PATH=/opt/node22/lib/node_modules node smoke-test.js [url] [easy|hard]
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const url = process.argv[2] || 'file://' + path.resolve(__dirname, 'index.html');
  const diff = process.argv[3] || 'easy';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(url);
  await page.click(`#diffSeg button[data-d="${diff}"]`);
  await page.click('#startBtn');
  await page.click('#hintBtn');

  let moves = 0, sawPass = false, maxAiMs = 0;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (await page.isVisible('#endOv:not(.hidden)')) break;
    const status = await page.textContent('#status');
    if (status.includes('自动跳过')) sawPass = true;
    const hints = await page.$$('.cell.hint');
    if (hints.length && !status.includes('思考')) {
      const before = await page.textContent('#numB');
      await hints[Math.floor(Math.random() * hints.length)].click();
      moves++;
      const t0 = Date.now();
      await page.waitForFunction(() => {
        const s = document.getElementById('status').textContent;
        return document.querySelector('.cell.hint') || !document.getElementById('endOv').classList.contains('hidden') || s.includes('跳过');
      }, null, { timeout: 15000 });
      maxAiMs = Math.max(maxAiMs, Date.now() - t0);
      if (moves === 1) await page.screenshot({ path: path.join(process.env.SHOT_DIR || __dirname, `smoke-${diff}.png`) });
    } else {
      await page.waitForTimeout(150);
    }
  }
  const ended = await page.isVisible('#endOv:not(.hidden)');
  const endText = ended ? (await page.textContent('#endOv .card')).replace(/\s+/g, ' ') : '';
  const record = await page.evaluate(() => localStorage.getItem('rj-reversi-record-v1'));
  if (ended) {
    await page.click('#againBtn');
    await page.waitForSelector('.cell.hint');
  }
  console.log(JSON.stringify({ diff, moves, sawPass, ended, endText, maxAiRoundTripMs: maxAiMs, record, errors }, null, 1));
  await browser.close();
  process.exit(errors.length || !ended ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
