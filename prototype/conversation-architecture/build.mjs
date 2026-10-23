import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { edgeContract, chapters, MAIN_COUNT } from './story.mjs';
import { DEMO } from '../conversation-demo/scenario.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const arch = JSON.parse(fs.readFileSync(path.join(here, 'system.architecture.json'), 'utf8'));
const nodeIds = arch.components.map(n => n.id);
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const replaceOnce = (text, needle, replacement) => {
  if (text.split(needle).length !== 2) throw new Error(`Expected one integration anchor: ${needle}`);
  return text.replace(needle, () => replacement);
};
function part(text, start, end, transform) {
  const from = text.indexOf(start), to = text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Missing SVG section: ${start}`);
  return text.slice(0, from + start.length) + '\n' + transform(text.slice(from + start.length, to)) + '\n        ' + text.slice(to);
}
for (const [name, [i, from, to]] of Object.entries(edgeContract)) {
  const edge = arch.connections[i];
  if (edge?.from !== from || edge?.to !== to) throw new Error(`Edge contract drift: ${name}`);
}
const resolvedChapters = chapters.map(chapter => {
  for (const key of chapter.edges) if (!edgeContract[key]) throw new Error(`Unknown edge ${key}`);
  for (const id of [...chapter.nodes, ...(chapter.blocked || [])]) if (!nodeIds.includes(id)) throw new Error(`Unknown node ${id}`);
  const quote = DEMO.scenarios[chapter.quoteScenario || 'main'].steps.find(step => step.id === chapter.quoteId);
  if (!quote) throw new Error(`Missing source quote ${chapter.quoteId}`);
  const chars = Array.from(quote.text);
  return { ...chapter, quote: quote.text, quoteSource: `${quote.session}/${quote.id}:rev1`, shortQuote: chars.slice(0, 39).join('') + (chars.length > 39 ? '…' : '') };
});
const data = { chapters: resolvedChapters, mainCount: MAIN_COUNT, nodes: nodeIds, edges: edgeContract };
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ageguard-architecture-'));
try {
  const rendered = path.join(temporary, 'base.html');
  const child = spawnSync(process.execPath, [path.join(root, '.agents/skills/dynamic-archify/renderers/architecture/render-architecture.mjs'), path.join(here, 'system.architecture.json'), rendered], {
    timeout: 15000, encoding: 'utf8', maxBuffer: 1024 * 1024, cwd: root
  });
  if (child.error || child.status !== 0) throw new Error(child.error?.message || child.stderr || 'Architecture renderer failed');
  if (child.stderr) process.stderr.write(child.stderr);
  let html = fs.readFileSync(rendered, 'utf8');
  const svgMatch = html.match(/<svg viewBox=[\s\S]*?<\/svg>/);
  if (!svgMatch) throw new Error('Missing generated SVG');
  let svg = svgMatch[0];
  const PATHS = '<!-- Connection paths (before components for correct z-order) -->';
  const DOTS = '<!-- Animated flowing dots -->';
  const NODES = '<!-- Components -->';
  const LABELS = '<!-- Connection labels -->';
  const LEGEND = '<!-- Legend -->';
  svg = part(svg, PATHS, DOTS, block => {
    let index = 0;
    const result = block.trim().replace(/<path[^>]+marker-end[^>]*\/>/g, path => `<g class="c-flow-edge" data-edge="${index++}">${path}</g>`);
    if (index !== arch.connections.length) throw new Error('Path count mismatch');
    return result;
  });
  svg = part(svg, DOTS, NODES, block => {
    let index = 0;
    const result = block.trim().replace(/<circle[\s\S]*?<\/circle>/g, circle => `<g class="c-flow-dot" data-edge="${index++}">${circle}</g>`);
    if (index !== arch.connections.length) throw new Error('Motion count mismatch');
    return result;
  });
  svg = part(svg, NODES, LABELS, block => {
    const pieces = block.trim().split(/\n\s*\n/);
    if (pieces.length !== arch.components.length) throw new Error('Component count mismatch');
    return pieces.map((markup, i) => {
      const node = arch.components[i];
      return `<g class="c-flow-node" data-node="${node.id}">\n${markup}\n<text x="${node.pos[0] + node.size[0] / 2}" y="${node.pos[1] + node.size[1] + 18}" text-anchor="middle" class="c-flow-badge" data-badge="${node.id}"></text>\n</g>`;
    }).join('\n\n');
  });
  svg = part(svg, LABELS, LEGEND, block => {
    let index = 0;
    const result = block.trim().replace(/<rect[^>]+class="c-mask"\/>\s*<text[\s\S]*?<\/text>/g, label => `<g class="c-flow-label" data-edge="${index++}">${label}</g>`);
    if (index !== arch.connections.length) throw new Error('Label count mismatch');
    return result;
  });
  svg = part(svg, LEGEND, '</svg>', block => block.trim()
    // Keep the legend >=20px inside the viewBox, including its text descent.
    .replace(/\by="([\d.]+)"/g, (_, y) => `y="${Number(y) - 20}"`)
    // Native architecture legend swatches need the same two-rect masks as nodes.
    .replace(/<rect[^>]+class="c-(?:external|frontend|backend|database|security|messagebus|cloud)"[^>]*\/>/g, rect => rect.replace(/class="[^"]+"/, 'class="c-mask"').replace(/ stroke-width="[^"]+"/, '') + '\n' + rect)
    .replace('>Legend<', '>组件类型<').replace('>External<', '>参与者<').replace('>Frontend<', '>交互层<').replace('>Backend<', '>Agent<').replace('>Message bus<', '>事件与请求<').replace('>Security<', '>业务校验<').replace('>Database<', '>记忆与投影<').replace('>Cloud<', '>调度程序<'));
  svg = replaceOnce(svg, '<svg viewBox=', '<svg class="c-architecture" viewBox=');
  svg = replaceOnce(svg, PATHS, `<text x="40" y="60" class="t-primary" font-size="15" font-weight="600" id="arch-svg-title">四角色 / 双向信息闭环</text>\n<text x="40" y="84" class="t-muted" font-size="10" id="arch-svg-quote">设计架构 / 虚构养鱼情景</text>\n${PATHS}`);
  svg = replaceOnce(svg, LEGEND, `<text x="40" y="875" class="t-muted" font-size="9">设计说明：箭头从来源流向接收者；语音交互与后台整理是逻辑分工，不强制两个模型。动画不代表真实调用、持久化或消息送达。</text>\n${LEGEND}`);
  html = replaceOnce(html, svgMatch[0], svg);

  const tabs = resolvedChapters.map((chapter, i) => `<button type="button" data-chapter="${chapter.id}"${i >= MAIN_COUNT ? ' class="arch-branch"' : ''}>${esc(chapter.label)}</button>`).join('\n');
  const before = `<main class="arch-shell" id="arch-view">
    <aside class="arch-evidence"><strong>架构设计 / 情景动画</strong>：沿用陈阿姨养鱼的虚构故事。所有转写、Agent、授权、存储、调度与家属操作均为模拟说明，不是已接通能力。<a href="conversation-demo.html">打开完整对话演示 ↗</a></aside>
    <section class="arch-control-panel" aria-label="架构讲解控制">
      <div class="arch-controls">
        <button type="button" id="arch-prev">← 上一章</button><button type="button" id="arch-next">下一章 →</button>
        <button type="button" id="arch-overview" aria-pressed="false">架构总览</button>
        <label><input type="checkbox" id="arch-auto" checked> 自动讲解</label>
        <label><input type="checkbox" id="arch-flow" checked> 流动动画</label>
        <label>每章 <select id="arch-period"><option value="6000">6 秒</option><option value="9000" selected>9 秒</option><option value="12000">12 秒</option></select></label>
        <span class="arch-space"></span><span id="arch-position" class="arch-clock">01 / 09</span>
        <label>缩放 <select id="arch-zoom"><option value="100">100%</option><option value="125">125%</option><option value="150">150%</option></select></label>
        <button type="button" id="arch-fullscreen">全屏看图</button>
      </div>
      <progress class="arch-progress" id="arch-progress" max="1" value="0" aria-label="当前章节播放进度"></progress>
      <nav class="arch-tabs" id="arch-tabs" aria-label="信息处理章节">${tabs}</nav>
      <p class="arch-help" id="arch-message" role="status">高亮表示当前信息路径，暗线保留整体上下文。自动讲解与流动动画可分别暂停；小屏可在图内横向滚动。空格切换讲解，方向键翻章。</p>
    </section>
    <section class="arch-now" aria-label="当前章节说明">
      <div><span class="arch-kicker">SCENARIO → INFORMATION → ACTION</span><h2 id="arch-now-title"></h2><p id="arch-now-summary"></p></div>
      <blockquote><span id="arch-now-quote"></span><cite id="arch-now-source"></cite></blockquote>
    </section>
    <!-- Main Diagram -->`;
  const after = `<section class="arch-reading" aria-label="当前信息如何处理"><article><h3>01 / 输入是什么</h3><p id="arch-input"></p></article><article><h3>02 / 中间怎样处理</h3><p id="arch-process"></p></article><article><h3>03 / 最终产生什么</h3><p id="arch-output"></p></article></section>
    <aside class="arch-rule"><strong>不能越过的边界</strong><span id="arch-rule"></span></aside>
    <p class="arch-links">右上角 Export 导出当前架构图，含当前章节高亮与图内短标题；可先选“架构总览”。GIF / WebM 只录连接流动，不录完整分章讲解，整段请录屏。<a href="conversation-architecture/README.md">源文件与验证说明</a></p>
    <noscript><p class="arch-evidence">请启用 JavaScript 查看分章动画。下方图形仍是架构设计，不是实际运行证据。</p></noscript>`;
  const css = fs.readFileSync(path.join(here, 'animate.css'), 'utf8');
  const script = fs.readFileSync(path.join(here, 'animate.js'), 'utf8');
  const videoExport = fs.readFileSync(path.join(here, 'video-export.js'), 'utf8');
  const embedded = `const ARCH_STORY = ${JSON.stringify(data).replace(/</g, '\\u003c')};\n${script}\n${videoExport}`;
  if (/<\/script/i.test(embedded)) throw new Error('Unsafe closing script tag');
  html = replaceOnce(html, '<html lang="en"', '<html lang="zh-CN"');
  html = replaceOnce(html, '</head>', `<style id="arch-presentation-style">\n${css}\n</style>\n</head>`);
  html = replaceOnce(html, '    <!-- Main Diagram -->', before);
  html = replaceOnce(html, '    <div class="diagram-container">', '    <div class="diagram-container" aria-label="可横向滚动的架构图"><div class="arch-scale" id="arch-scale">');
  html = replaceOnce(html, '</svg>\n    </div>', `</svg>\n      </div>\n    </div>\n${after}`);
  html = replaceOnce(html, '    <!-- Footer -->', '    </main>\n\n    <!-- Footer -->');
  html = replaceOnce(html, '</body>', `<script id="arch-presentation-script">\n${embedded}\n</script>\n</body>`);
  const output = path.join(root, 'prototype/conversation-architecture.html');
  fs.writeFileSync(output, html);
  console.log(`Built ${path.relative(root, output)} (${Math.round(Buffer.byteLength(html) / 1024)} KiB)`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
