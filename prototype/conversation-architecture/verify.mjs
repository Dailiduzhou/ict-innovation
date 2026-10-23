import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { edgeContract, chapters, MAIN_COUNT } from './story.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const output = path.join(root, 'prototype/conversation-architecture.html');
const html = await fs.readFile(output, 'utf8');
const arch = JSON.parse(await fs.readFile(path.join(here, 'system.architecture.json'), 'utf8'));
const svg = html.match(/<svg class="c-architecture"[\s\S]*?<\/svg>/)[0];
const template = await fs.readFile(path.join(root, '.agents/skills/dynamic-archify/assets/template.html'), 'utf8');
const scripts = text => [...text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts(html).forEach((script, i) => new vm.Script(script, { filename: `architecture-inline-${i}.js` }));
assert.deepEqual(scripts(html).slice(0, -1), scripts(template), 'stock export/theme scripts changed');
assert.equal(html.match(/<style>([\s\S]*?)<\/style>/)[1], template.match(/<style>([\s\S]*?)<\/style>/)[1]);
assert.ok(html.includes(template.match(/  <div class="toolbar"[\s\S]*?(?=\n\n  <div class="container">)/)[0]));
assert.doesNotMatch(html, /<script[^>]+src=|\bfetch\s*\(|getUserMedia\s*\(/);
assert.doesNotMatch(svg, /(?:fill|stroke)="(?:#|rgb)/);
console.log('PASS embedded JS syntax, self-contained script, stock toolbar/theme/export preservation');

assert.equal(MAIN_COUNT, 9);
assert.equal(chapters.length, 11);
assert.equal(new Set(chapters.map(c => c.id)).size, chapters.length);
for (const [name, [index, from, to]] of Object.entries(edgeContract)) {
  assert.equal(arch.connections[index].from, from, name);
  assert.equal(arch.connections[index].to, to, name);
}
assert.equal(arch.connections.length, Object.keys(edgeContract).length);
for (const chapter of chapters) {
  assert.ok(chapter.edges.every(edge => !!edgeContract[edge]));
  assert.ok(chapter.nodes.every(id => arch.components.some(node => node.id === id)));
}
assert.ok(!arch.connections.some(edge => ['family', 'portal'].includes(edge.from) && edge.to === 'memory'));
assert.ok(!chapters.find(c => c.id === 'deny').edges.some(edge => ['share', 'shareRead', 'collaboration', 'familyView', 'familySubmit'].includes(edge)));
assert.ok(!chapters.find(c => c.id === 'failure').edges.includes('reminderSave'));
console.log('PASS 4 actor roles, 18 information paths, 9 chapters + 2 boundary branches');

const firstComponent = svg.indexOf('<!-- Components -->');
const arrows = [...svg.matchAll(/<path[^>]+marker-end=/g)];
assert.equal(arrows.length, arch.connections.length);
assert.ok(arrows.every(match => match.index < firstComponent), 'arrows must be behind boxes');
const paths = [...svg.matchAll(/<path d="([^"]+)"[^>]+marker-end=/g)].map(m => m[1]);
const motions = [...svg.matchAll(/<animateMotion[^>]+path="([^"]+)"/g)].map(m => m[1]);
assert.deepEqual(motions, paths, 'dots must flow from source to destination arrow');
const styled = [...svg.matchAll(/<rect\s+([^>]+)class="c-(?:external|frontend|backend|security|database|cloud|messagebus)"[^>]*>/g)];
for (const rect of styled) {
  const mask = svg.slice(0, rect.index).match(/<rect\s+([^>]+)class="c-mask"\/>\s*$/);
  assert.ok(mask, 'missing opaque mask');
  assert.equal(mask[1], rect[1], 'mask geometry differs');
}
assert.equal([...svg.matchAll(/class="c-flow-node"/g)].length, arch.components.length);
console.log('PASS arrow direction, two-rect masks (including legend), z-order and node/edge bindings');

if (process.argv.includes('--browser') || process.argv.includes('--exports')) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const outDir = process.env.DEMO_CHECK_OUTPUT || path.join(os.tmpdir(), 'ageguard-architecture-validation');
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BINARY || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, timeout: 10000
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1560, height: 1100 }, acceptDownloads: true, colorScheme: 'dark' });
    context.setDefaultTimeout(5000);
    await context.route('https://**', route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(pathToFileURL(output).href, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForFunction(() => !!window.AgeGuardArchitecture);
    await page.locator('#arch-auto').uncheck();
    if (process.argv.includes('--exports')) {
      await page.locator('#arch-overview').click();
      for (const format of ['svg', 'png', 'jpeg', 'webp', 'gif', 'webm']) {
        const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
        await page.locator('#btn-export').click();
        await page.locator(`[data-format="${format}"]`).click();
        if (['gif', 'webm'].includes(format)) {
          await page.locator('#gif-scale').selectOption('1');
          await page.locator('#gif-fps').selectOption('10');
          await page.locator('#gif-duration').selectOption('2');
          await page.locator('#gif-confirm').click();
        }
        const download = await downloadPromise;
        const target = path.join(outDir, `architecture.${format}`);
        await download.saveAs(target);
        const bytes = await fs.readFile(target);
        assert.ok(bytes.length > 2000);
        if (format === 'svg') {
          assert.match(bytes.toString(), /prefers-color-scheme: light/);
          assert.match(bytes.toString(), /c-flow-edge\.is-active/);
          assert.match(bytes.toString(), /四角色 \/ 双向信息闭环/);
        }
        if (format === 'png') {
          // 4x would exceed the template's 16Mpx safety cap, so 3x is expected.
          assert.equal(bytes.readUInt32BE(16), 4560);
          assert.equal(bytes.readUInt32BE(20), 2850);
        }
        if (format === 'gif') assert.equal(bytes.subarray(0, 6).toString(), 'GIF89a');
        if (format === 'webm') {
          assert.equal(bytes.subarray(0, 4).toString('hex'), '1a45dfa3');
          const decoded = await page.evaluate(async base64 => {
            const video = document.createElement('video');
            video.muted = true; video.preload = 'auto';
            video.src = 'data:video/webm;base64,' + base64;
            const wait = name => new Promise((resolve, reject) => {
              const timer = setTimeout(() => reject(new Error('video decode timed out: ' + name)), 5000);
              video.addEventListener(name, () => { clearTimeout(timer); resolve(); }, { once: true });
              video.addEventListener('error', () => { clearTimeout(timer); reject(new Error('video decode error')); }, { once: true });
            });
            await wait('loadeddata');
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            const frames = [];
            for (const time of [.3, 1.2]) {
              const ready = wait('seeked'); video.currentTime = time; await ready;
              ctx.drawImage(video, 0, 0);
              const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
              let nonBlack = 0, hash = 5381;
              for (let i = 0; i < rgba.length; i += 4) {
                if (rgba[i] + rgba[i + 1] + rgba[i + 2] > 40) nonBlack++;
                hash = ((hash * 33) ^ (rgba[i] + (rgba[i + 1] << 8) + (rgba[i + 2] << 16))) >>> 0;
              }
              frames.push({ nonBlack, hash });
            }
            return { frames, png: canvas.toDataURL('image/png') };
          }, bytes.toString('base64'));
          assert.ok(decoded.frames.every(frame => frame.nonBlack > 10000), 'WebM has black/empty frames');
          assert.notEqual(decoded.frames[0].hash, decoded.frames[1].hash, 'WebM frames do not change');
          await fs.writeFile(path.join(outDir, 'webm-decoded-frame.png'), Buffer.from(decoded.png.split(',')[1], 'base64'));
          console.log('PASS WebM decoded frames are non-black and show changing animation');
        }
        console.log(`PASS ${format} architecture export (${bytes.length} bytes)`);
      }
    } else {
      for (const chapter of chapters) {
        await page.locator(`[data-chapter="${chapter.id}"]`).click();
        assert.equal(await page.locator('#arch-now-title').innerText(), chapter.title);
        assert.equal(await page.locator('.c-flow-edge.is-active').count(), chapter.edges.length);
        const clipping = await page.locator('.diagram-container svg').evaluate(svg => {
          const canvas = svg.viewBox.baseVal;
          return [...svg.querySelectorAll('text')].flatMap(text => {
            if (!text.textContent.trim()) return [];
            const b = text.getBBox();
            return b.x < 0 || b.y < 0 || b.x + b.width > canvas.width - 20 || b.y + b.height > canvas.height - 20 ? [text.textContent] : [];
          });
        });
        assert.deepEqual(clipping, [], `clipped SVG text in ${chapter.id}`);
      }
      await page.locator('[data-chapter="deny"]').click();
      assert.equal(await page.locator('[data-node="projection"]').getAttribute('class'), 'c-flow-node is-blocked');
      assert.equal(await page.locator('.c-flow-edge[data-edge="11"].is-active').count(), 0);
      await page.locator('[data-chapter="failure"]').click();
      assert.equal(await page.locator('.c-flow-edge[data-edge="9"].is-active').count(), 0);
      await page.locator('#arch-flow').uncheck();
      assert.equal(await page.locator('svg.c-flow-paused').count(), 1);
      assert.equal(await page.locator('.diagram-container svg').evaluate(svg => svg.animationsPaused()), true);
      await page.locator('#arch-flow').check();
      assert.equal(await page.locator('.diagram-container svg').evaluate(svg => svg.animationsPaused()), false);
      await page.locator('#arch-overview').click();
      assert.equal(await page.locator('.c-flow-edge.is-active').count(), arch.connections.length);
      await page.screenshot({ path: path.join(outDir, 'overview-dark.png'), fullPage: true, animations: 'disabled' });
      await page.locator('#btn-theme').click();
      await page.screenshot({ path: path.join(outDir, 'overview-light.png'), fullPage: true, animations: 'disabled' });
      await page.locator('[data-chapter="remember"]').click();
      await page.screenshot({ path: path.join(outDir, 'memory-chapter.png'), fullPage: true, animations: 'disabled' });
      const styled = await page.locator('.c-flow-node').evaluateAll(nodes => nodes.flatMap(node => {
        const rect = node.querySelector('rect').getBBox();
        return [...node.querySelectorAll('text:not([data-badge])')].flatMap(text => {
          const b = text.getBBox();
          return b.x < rect.x + 3 || b.x + b.width > rect.x + rect.width - 3 ? [text.textContent] : [];
        });
      }));
      assert.deepEqual(styled, [], 'component title/sublabel spills outside box');
      await page.locator('#arch-fullscreen').click();
      assert.ok(await page.evaluate(() => !!document.fullscreenElement));
      await page.evaluate(() => document.exitFullscreen());
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'page horizontal overflow');
      assert.ok(await page.locator('.diagram-container').evaluate(el => el.scrollWidth > el.clientWidth), 'mobile diagram should scroll, not shrink unreadably');
      await page.locator('#arch-zoom').selectOption('150');
      await page.screenshot({ path: path.join(outDir, 'mobile.png'), fullPage: true, animations: 'disabled' });
      await page.setViewportSize({ width: 1560, height: 1100 });
      await page.locator('#arch-auto').check();
      await page.locator('#btn-export').click();
      assert.equal(await page.locator('#arch-auto').isChecked(), false, 'export must freeze chapter changes');
      await page.keyboard.press('Escape');
      // Separate context: virtual clock checks never affect screenshot rendering.
      const reduced = await browser.newContext({ reducedMotion: 'reduce' });
      const reducedPage = await reduced.newPage();
      await reducedPage.route('https://**', route => route.abort());
      await reducedPage.goto(pathToFileURL(output).href, { waitUntil: 'domcontentloaded', timeout: 10000 });
      const reducedState = await reducedPage.evaluate(() => window.AgeGuardArchitecture.inspect());
      assert.equal(reducedState.automatic, false);
      assert.equal(reducedState.flowing, false);
      await reducedPage.clock.install();
      await reducedPage.locator('#arch-auto').check();
      await reducedPage.locator('#arch-period').selectOption('6000');
      await reducedPage.clock.runFor(6500);
      assert.equal(await reducedPage.evaluate(() => window.AgeGuardArchitecture.inspect().current), 'recall');
      await reduced.close();
      console.log('PASS 11 chapters, label bounds, overview, flow pause, fullscreen, responsive scroll, reduced motion and automatic progression');
    }
    assert.deepEqual(errors, [], 'uncaught browser exceptions');
    console.log(`Evidence: ${outDir}`);
  } finally { await browser.close(); }
}
