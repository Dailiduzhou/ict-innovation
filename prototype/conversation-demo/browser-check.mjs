// Optional browser checks; install Playwright outside this project if desired.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node .../browser-check.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEMO } from './scenario.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.DEMO_CHECK_OUTPUT || path.join(os.tmpdir(), 'ageguard-demo-validation');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BINARY || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 10000
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
context.setDefaultTimeout(5000);
context.setDefaultNavigationTimeout(10000);
await context.route('https://**', route => route.abort()); // Prove the page works without fonts/network.
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const url = pathToFileURL(path.join(here, '../conversation-demo.html')).href;
const inspect = () => page.evaluate(() => window.AgeGuardDemo.inspect());
const jump = id => page.evaluate(id => window.AgeGuardDemo.jumpToId(id), id);
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.AgeGuardDemo);
  if (process.argv.includes('--exports')) {
    await page.locator('#demo-diagram').evaluate(el => { el.open = true; });
    const clipped = await page.locator('.diagram-container svg').evaluate(svg => [...svg.querySelectorAll('text')].flatMap(el => {
      const b = el.getBBox();
      const canvas = svg.viewBox.baseVal;
      return b.x < 0 || b.y < 0 || b.x + b.width > canvas.width || b.y + b.height > canvas.height - 20 ? [el.textContent] : [];
    }));
    assert.deepEqual(clipped, [], 'SVG labels extend beyond the canvas or bottom margin');
    await page.locator('.diagram-container').screenshot({ path: path.join(outputDir, 'sequence-preview.png'), animations: 'disabled' });
    for (const format of ['svg', 'png', 'jpeg', 'webp']) {
      const downloading = page.waitForEvent('download', { timeout: 10000 });
      await page.locator('#btn-export').click();
      await page.locator(`[data-format="${format}"]`).click();
      const download = await downloading;
      const target = path.join(outputDir, `sequence.${format}`);
      await download.saveAs(target);
      const bytes = await fs.readFile(target);
      assert.ok(bytes.length > 2000);
      if (format === 'svg') {
        const svg = bytes.toString();
        assert.match(svg, /prefers-color-scheme: light/);
        assert.match(svg, /svg\[data-theme="dark"\]/);
      }
      if (format === 'png') {
        assert.equal(bytes.readUInt32BE(16), 3280);
        assert.equal(bytes.readUInt32BE(20), 4640);
      }
      console.log(`PASS ${format} export (${bytes.length} bytes)`);
    }
    for (const format of ['gif', 'webm']) {
      const downloading = page.waitForEvent('download', { timeout: 15000 });
      await page.locator('#btn-export').click();
      await page.locator(`[data-format="${format}"]`).click();
      await page.locator('#gif-scale').selectOption('1');
      await page.locator('#gif-fps').selectOption('10');
      await page.locator('#gif-duration').selectOption('2');
      await page.locator('#gif-confirm').click();
      const download = await downloading;
      const target = path.join(outputDir, `sequence.${format}`);
      await download.saveAs(target);
      const bytes = await fs.readFile(target);
      assert.ok(bytes.length > 2000);
      if (format === 'gif') assert.equal(bytes.subarray(0, 6).toString(), 'GIF89a');
      else assert.equal(bytes.subarray(0, 4).toString('hex'), '1a45dfa3');
      console.log(`PASS ${format} flow-animation export (${bytes.length} bytes)`);
    }
  } else {
    assert.equal((await inspect()).step, 'A00');
    assert.equal(await page.locator('#demo-prev').isDisabled(), true);
    // Walk EVERY visible snapshot, not just the happy-path ending.
    for (const [id, scene] of Object.entries(DEMO.scenarios)) {
      await page.evaluate(id => window.AgeGuardDemo.chooseScenario(id), id);
      for (const step of scene.steps) {
        await jump(step.id);
        assert.match(await page.locator('#demo-source').innerText(), new RegExp(step.id));
      }
    }
    await page.evaluate(() => window.AgeGuardDemo.chooseScenario('main'));
    await jump('A09');
    assert.equal((await inspect()).state.reminders.length, 0);
    await page.locator('#demo-next').click();
    assert.equal((await inspect()).state.reminders.length, 1);
    await jump('B00');
    assert.deepEqual((await inspect()).state.context, []);
    await jump('B06');
    assert.equal((await inspect()).state.memories.find(m => m.id === 'M03').version, 2);
    assert.doesNotMatch(await page.locator('#demo-family-content').innerText(), /换水|整段聊天都发|不一起发/);
    await page.locator('#demo-family-content [data-jump="F03"]').click();
    assert.equal((await inspect()).state.requests[0].status, 'accepted');
    await page.locator('#demo-family-content [data-jump="F04"]').click();
    assert.equal((await inspect()).state.requests[0].status, 'reported_done');
    await page.locator('#demo-family-content [data-jump="C04"]').click();
    assert.equal((await inspect()).state.requests[0].status, 'closed');
    await page.locator('[data-scenario="privacy"]').click();
    assert.equal((await inspect()).step, 'P01');
    assert.deepEqual((await inspect()).family, { projections: [], requests: [], messages: [] });
    assert.doesNotMatch(await page.locator('#demo-family-content').innerText(), /拒绝|隐瞒|不愿|换水|鱼活泼/);
    await page.locator('[data-scenario="failure"]').click();
    assert.equal((await inspect()).step, 'X01');
    assert.equal((await inspect()).state.reminders.length, 0);
    await page.locator('#demo-next').click();
    await page.locator('#demo-next').click();
    assert.equal((await inspect()).state.reminders.length, 1);
    assert.equal((await inspect()).state.receipts.at(-1).result, 'already_applied');
    await page.locator('[data-scenario="main"]').click();
    assert.equal((await inspect()).state.projections.length, 0);
    await page.locator('#demo-next').click();
    const beforePlay = (await inspect()).elapsed;
    await page.locator('#demo-play').click();
    await page.waitForFunction(before => window.AgeGuardDemo.inspect().elapsed > before + .25, beforePlay, { timeout: 3000 });
    const advanced = await inspect();
    assert.equal(advanced.playing, true);
    await page.locator('#demo-play').click();
    const paused = (await inspect()).elapsed;
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 250)));
    assert.equal((await inspect()).elapsed, paused);
    await page.locator('#demo-reset').click();
    assert.equal((await inspect()).elapsed, 0);
    console.log('PASS all 3 scenarios, every cue, branch isolation, pause/seek/reset and family controls');

    // Theme persistence and offline desktop/mobile layout.
    const themeBefore = await page.locator('html').getAttribute('data-theme');
    await page.locator('#btn-theme').click();
    const themeAfter = await page.locator('html').getAttribute('data-theme');
    assert.notEqual(themeAfter, themeBefore);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), themeAfter);
    await jump('B06');
    if (themeAfter !== 'dark') await page.locator('#btn-theme').click();
    await page.screenshot({ path: path.join(outputDir, 'desktop-dark.png'), fullPage: true, animations: 'disabled' });
    await page.locator('#btn-theme').click();
    await page.screenshot({ path: path.join(outputDir, 'desktop-light.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile horizontal overflow');
    await page.screenshot({ path: path.join(outputDir, 'mobile-light.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.locator('.demo-script').evaluate(el => { el.open = true; });
    const scriptDownload = page.waitForEvent('download');
    await page.locator('#demo-download-script').click();
    const script = await scriptDownload;
    await script.saveAs(path.join(outputDir, 'downloaded-script.md'));
    console.log('PASS theme persistence, offline file://, desktop/mobile overflow and script download');
    await page.locator('.demo-script').evaluate(el => { el.open = false; });
    await page.locator('#demo-fullscreen').click();
    assert.ok(await page.evaluate(() => !!document.fullscreenElement));
    await page.evaluate(() => document.exitFullscreen());
    console.log('PASS fullscreen');

    // Browser speech synthesis may have zero installed Chinese voices in headless
    // environments. Exercise deterministic no-voice, error and hanging-voice paths.
    for (const mode of ['empty', 'error', 'hang']) {
      const speechPage = await context.newPage();
      speechPage.on('pageerror', error => errors.push(String(error)));
      await speechPage.addInitScript(mode => {
        Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class { constructor(text) { this.text = text; } } });
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
          getVoices: () => mode === 'empty' ? [] : [{ lang: 'zh-CN', localService: true }],
          cancel: () => {},
          speak: utterance => { if (mode === 'error') queueMicrotask(() => utterance.onerror?.()); }
        } });
      }, mode);
      await speechPage.goto(url, { waitUntil: 'domcontentloaded' });
      await speechPage.evaluate(() => window.AgeGuardDemo.jumpToId('A01'));
      await speechPage.clock.install();
      await speechPage.locator('#demo-voice').check();
      await speechPage.locator('#demo-play').click();
      await speechPage.clock.runFor(mode === 'hang' ? 30000 : 300);
      assert.equal(await speechPage.locator('#demo-voice').isChecked(), false);
      assert.equal(await speechPage.locator('#demo-next').isEnabled(), true);
      await speechPage.close();
    }
    console.log('PASS no Chinese voice, speech error and 30s watchdog fallback (mocked browser speech API)');
  }
  assert.deepEqual(errors, [], 'uncaught browser exceptions');
  console.log(`Evidence: ${outputDir}`);
} finally { await browser.close(); }
